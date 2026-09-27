-- INE Product Price Tracker schema (Supabase PostgreSQL).
-- Run once: paste into the Supabase SQL editor, or `npm run db:init`.

-- One row per product + option the user chose to track.
create table if not exists tracked_products (
  id               bigint generated always as identity primary key,
  store_product_id text        not null,            -- id from the store URL, e.g. /item/21
  product_name     text        not null,
  product_url      text        not null,
  option_id        text        not null,            -- store's option id, e.g. "o2"
  option_label     text        not null,            -- what the store shows, e.g. "256 GB"
  option_axis      text,                            -- e.g. "Storage", "Kit", "Pack"
  is_active        boolean     not null default true,
  created_at       timestamptz not null default now(),
  unique (store_product_id, option_id)
);

-- One row per scrape of a tracked product, whatever the outcome.
-- This single table is both the price/stock history and the scrape log.
create table if not exists scrape_attempts (
  id                 bigint generated always as identity primary key,
  tracked_product_id bigint      not null references tracked_products (id) on delete cascade,
  -- Copied at scrape time so the record stays accurate even if tracking details change.
  store_product_id   text        not null,
  product_name       text        not null,
  option_label       text        not null,
  scraped_at         timestamptz not null default now(),
  price              numeric(12, 2),
  stock              integer,
  outcome            text        not null check (outcome in ('success', 'retried', 'failed')),
  attempts           smallint    not null check (attempts >= 1),  -- browser tries used (1 = no retry)
  error_message      text,                                        -- why each failed try failed
  triggered_by       text        not null default 'scheduled' check (triggered_by in ('scheduled', 'manual')),
  duration_ms        integer,
  -- The database itself refuses a failed row with data, or a successful row without it.
  -- (The "is not null" tests matter: a CHECK treats a NULL comparison as a pass.)
  constraint price_and_stock_match_outcome check (
    (outcome = 'failed' and price is null and stock is null)
    or (outcome <> 'failed' and price is not null and stock is not null and price > 0 and stock >= 0)
  )
);

create index if not exists scrape_attempts_product_time_idx
  on scrape_attempts (tracked_product_id, scraped_at desc);

-- The backend connects as the table owner, which bypasses RLS. Enabling RLS with no
-- policies keeps these tables closed to Supabase's public REST API (anon key).
alter table tracked_products enable row level security;
alter table scrape_attempts enable row level security;
