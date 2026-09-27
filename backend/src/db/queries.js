import { pool } from './pool.js';

export async function listTrackedProducts() {
  const { rows } = await pool.query(`
    select t.*,
           current.price as current_price,
           current.stock as current_stock,
           current.scraped_at as price_updated_at,
           previous.price as previous_price,
           previous.stock as previous_stock,
           last.outcome as last_outcome,
           last.scraped_at as last_scraped_at
      from tracked_products t

      left join lateral (
        select price, stock, scraped_at
          from scrape_attempts a
         where a.tracked_product_id = t.id
           and a.outcome <> 'failed'
         order by scraped_at desc
         limit 1
      ) current on true

      left join lateral (
        select price, stock, scraped_at
          from scrape_attempts a
         where a.tracked_product_id = t.id
           and a.outcome <> 'failed'
         order by scraped_at desc
         offset 1
         limit 1
      ) previous on true

      left join lateral (
        select outcome, scraped_at
          from scrape_attempts a
         where a.tracked_product_id = t.id
         order by scraped_at desc
         limit 1
      ) last on true

     order by t.created_at desc
  `);

  return rows.map((product) => ({
    ...product,
    price_dropped:
      product.current_price !== null &&
      product.previous_price !== null &&
      Number(product.current_price) < Number(product.previous_price),

    back_in_stock:
      product.current_stock !== null &&
      product.previous_stock === 0 &&
      Number(product.current_stock) > 0,
  }));
}

export async function getTrackedProduct(id) {
  const { rows } = await pool.query(
    'select * from tracked_products where id = $1',
    [id],
  );
  return rows[0] ?? null;
}

export async function trackProduct(product) {
  const { rows } = await pool.query(
    `insert into tracked_products
       (store_product_id, product_name, product_url, option_id, option_label, option_axis)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (store_product_id, option_id) do update set is_active = true
     returning *`,
    [
      product.storeProductId,
      product.productName,
      product.productUrl,
      product.optionId,
      product.optionLabel,
      product.optionAxis,
    ],
  );
  return rows[0];
}

export async function setTrackingActive(id, isActive) {
  const { rows } = await pool.query(
    'update tracked_products set is_active = $2 where id = $1 returning *',
    [id, isActive],
  );
  return rows[0] ?? null;
}

export async function listProductsDueForScrape(minMinutes) {
  const { rows } = await pool.query(
    `select t.* from tracked_products t
      where t.is_active
        and not exists (
          select 1 from scrape_attempts a
           where a.tracked_product_id = t.id
             and a.triggered_by = 'scheduled'
             and a.scraped_at > now() - make_interval(mins => $1::int))
      order by t.id`,
    [minMinutes],
  );
  return rows;
}

export async function recordScrapeAttempt(attempt) {
  const { rows } = await pool.query(
    `insert into scrape_attempts
       (tracked_product_id, store_product_id, product_name, option_label,
        price, stock, outcome, attempts, error_message, triggered_by, duration_ms)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     returning *`,
    [
      attempt.trackedProductId,
      attempt.storeProductId,
      attempt.productName,
      attempt.optionLabel,
      attempt.price,
      attempt.stock,
      attempt.outcome,
      attempt.attempts,
      attempt.errorMessage,
      attempt.triggeredBy,
      attempt.durationMs,
    ],
  );
  return rows[0];
}

export async function listScrapeAttempts(trackedProductId, limit = 500) {
  const { rows } = await pool.query(
    `select * from scrape_attempts where tracked_product_id = $1
      order by scraped_at desc, id desc limit $2`,
    [trackedProductId, limit],
  );
  return rows;
}

export async function listAllScrapeAttempts() {
  const { rows } = await pool.query(
    `select store_product_id, product_name, option_label, scraped_at, price, stock, outcome
       from scrape_attempts order by scraped_at, id`,
  );
  return rows;
}