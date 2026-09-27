# INE Price Tracker

A small full-stack app that tracks the price and stock of products on INE's mock store (https://demo.inelabteamdev.com).

You search the store, pick a product and the exact option you care about (storage size, kit, pack size and so on), and the app scrapes that option's price and stock every 2 hours. Every scrape is saved, including the ones that fail.

## Features

- Search the store by full or partial product name
- Pick a product and one of its options, then track it
- Scrape price and stock with Playwright, with retries
- Scheduled scraping through an endpoint that an external cron calls every 2 hours
- "Scrape now" button for a single product
- Pause and resume tracking
- Price and stock history (table and a simple price chart)
- Scrape log with every attempt, including failed ones and the reason they failed
- "Price dropped" and "Back in stock" labels in the tracked list
- CSV export of the full scrape history

## Tech stack

- Frontend: React 19, Vite
- Backend: Node.js 20+, Express 5
- Database: PostgreSQL on Supabase (`pg` driver)
- Scraping: `fetch` for the store's JSON API, Playwright (Chromium) for price and stock
- Tests: Node's built-in test runner

## Project structure

```
ine-price-tracker/
├── backend/
│   ├── Dockerfile               # Playwright base image, runs npm start
│   ├── sql/schema.sql           # tables and constraints
│   ├── scripts/
│   │   ├── init-db.js           # creates the tables
│   │   ├── run-scheduled.js     # runs the scheduled scrape from the terminal
│   │   └── scrape-product.js    # scrapes one product option, no database
│   ├── src/
│   │   ├── server.js
│   │   ├── config.js            # reads environment variables
│   │   ├── routes/api.js        # all API endpoints
│   │   ├── db/                  # connection pool and SQL queries
│   │   ├── store/storeClient.js # store JSON API: search and product options
│   │   ├── scraper/             # Playwright steps, parsing, validation, retries
│   │   └── services/            # scrape runs, CSV, HTTP errors
│   └── test/                    # parse, validate and CSV tests
└── frontend/
    ├── vite.config.js           # forwards /api to localhost:4000 in dev
    └── src/
        ├── App.jsx
        ├── components/          # search, tracked table, history and log, chart
        ├── services/api.js      # calls to the backend
        └── format.js
```

## Setup

You need Node.js 20 or newer and a Supabase project.

```bash
git clone https://github.com/Chitrangda12/ine-price-tracker.git
cd ine-price-tracker
```

### Backend

```bash
cd backend
npm install
npx playwright install chromium
cp .env.example .env        # on Windows: copy .env.example .env
# fill in .env (see below)
npm run db:init
npm run dev                 # http://localhost:4000
```

### Frontend

```bash
cd frontend
npm install
npm run dev                 # http://localhost:5173
```

In development Vite forwards `/api` requests to `http://localhost:4000`, so `VITE_API_URL` can stay empty.

## Environment variables

Backend (`backend/.env`, template in `backend/.env.example`):

| Variable | Default | What it's for |
|---|---|---|
| `DATABASE_URL` | required | Supabase Postgres connection string (the "Session pooler" one) |
| `PORT` | `4000` | API port |
| `CORS_ORIGIN` | `http://localhost:5173` | Frontend URL(s) allowed to call the API, comma-separated |
| `CRON_SECRET` | empty | Secret the cron sends in the `X-Cron-Secret` header. The cron endpoint refuses to run while this is empty |
| `STORE_URL` | `https://demo.inelabteamdev.com` | Store base URL |
| `HEADLESS` | `true` | Set to `false` to see the browser while it scrapes |
| `SCRAPE_MAX_TRIES` | `3` | Browser tries per scrape |
| `SCRAPE_NAV_TIMEOUT_MS` | `30000` | Page load timeout |
| `SCRAPE_RENDER_TIMEOUT_MS` | `20000` | Wait for the heading, the option and the price button |
| `SCRAPE_QUOTE_TIMEOUT_MS` | `45000` | Wait for price and stock to appear |
| `SCRAPE_MIN_INTERVAL_MINUTES` | `100` | Scheduled runs skip products scraped more recently than this |
| `SCRAPE_DEBUG_DIR` | empty | If set, a screenshot is saved there whenever a try fails |

Frontend (`frontend/.env`):

| Variable | What it's for |
|---|---|
| `VITE_API_URL` | Backend URL. Leave empty for local development |

`.env` files are in `.gitignore`. Don't commit them.

## Database setup

`backend/sql/schema.sql` creates two tables:

- `tracked_products`: the product and option being tracked, plus `is_active`. A product/option pair can only be tracked once; tracking it again just turns it back on.
- `scrape_attempts`: one row per scrape, whatever the outcome. This one table is both the history and the scrape log.

Create them with `npm run db:init` (safe to run more than once), or paste `schema.sql` into the Supabase SQL editor. Row level security is switched on with no policies, so the tables aren't reachable through Supabase's public REST API. The backend connects directly with `DATABASE_URL`.

## API

| Method | Path | What it does |
|---|---|---|
| GET | `/api/health` | Health check |
| GET | `/api/store/search?q=` | Search the store by name (2+ characters) |
| GET | `/api/store/products/:storeProductId` | Product details and options |
| GET | `/api/tracked` | Tracked products with their latest price and stock |
| POST | `/api/tracked` | Track `{ storeProductId, optionId }` |
| PATCH | `/api/tracked/:id` | Pause or resume `{ isActive }` |
| GET | `/api/tracked/:id/attempts` | Every scrape of one tracked product |
| POST | `/api/tracked/:id/scrape` | Scrape one product now |
| POST | `/api/cron/scrape` | Scheduled run (needs `X-Cron-Secret`) |
| GET | `/api/export.csv` | Download the CSV |

## How scraping works

The store is a React app, so its HTML pages are empty until JavaScript runs.

- Search and product options come straight from the store's JSON API (`/api/v2/listings` and `/api/v2/items/:id`) using `fetch`. The listings endpoint has no search parameter, so the backend loads the whole catalog page by page, keeps it in memory for 10 minutes, and filters it by name.
- Price and stock only show up in the browser after interacting with the page, so they're scraped with Playwright:
  1. Open `/item/<id>` and wait for a heading with the exact product name
  2. Close the consent dialog whenever it shows up
  3. Click the option and check that the page marks it as selected
  4. Move the mouse over the price panel, rest on the "Check today's price" button and click it (again if nothing happens)
  5. Wait while the store shows "Updating…" or "Retrying…"
  6. Read price and stock from visible text only, and accept them only if two reads in a row match

More detail is in `DESIGN.md`.

### Running the scraper on its own

From `backend/`:

```bash
# one product option, nothing saved, browser visible
npm run scrape:product -- --id 2749                           # lists the options
npm run scrape:product -- --id 2749 --option "<label>" --headed

# the same job the cron runs (all active products that are due)
npm run scrape
npm run scrape:headed
npm run scrape -- --force        # ignore the 100-minute spacing
```

## Retry and error handling

- Each scrape gets up to 3 tries, and each try opens a fresh browser.
- It waits 3 s before the second try and 8 s before the third (plus up to 1 s random).
- Outcome is `success` if the first try worked, `retried` if a later try worked, and `failed` if all tries failed.
- Failed scrapes are still saved, with empty price and stock and the reason for each try.
- Calls to the store's JSON API have a 10 s timeout and up to 3 tries.

## Scheduled scraping

There's no timer inside the backend. An external cron service calls this every 2 hours:

```
POST /api/cron/scrape
X-Cron-Secret: <CRON_SECRET>
```

The endpoint replies `202` right away and scrapes in the background, so the cron doesn't time out. It scrapes each active product that hasn't had a scheduled scrape in the last 100 minutes, one at a time. If a run is already going, it replies `409`.

For testing, `?wait=1` waits for the run and returns the results, and `?force=1` ignores the 100-minute rule:

```bash
curl -X POST "http://localhost:4000/api/cron/scrape?wait=1" -H "X-Cron-Secret: <your secret>"
```

The dashboard refreshes the tracked list every minute, so new results show up without reloading.

## CSV export

The "Export CSV" button (or `GET /api/export.csv`) downloads every scrape as `scrape-history-YYYY-MM-DD.csv`, oldest first, one row per scrape:

```
Product ID,Product Name,Selected Option,Timestamp,Price,Stock,Outcome
```

Timestamps are ISO 8601 in UTC. Failed rows have empty Price and Stock.

## Tests

```bash
cd backend
npm test
```

Covers price and stock parsing, quote validation and the CSV format.

## Deployment

- **Backend:** `backend/Dockerfile` builds from the official Playwright image (`v1.56.0`, matching the `playwright` package), so Chromium is already included. The container runs `npm start`. Set the backend environment variables on the host, with `CORS_ORIGIN` set to the frontend's URL.
- **Frontend:** `npm run build` creates a static build in `frontend/dist`. Set `VITE_API_URL` to the backend URL before building.
- **Database:** Supabase, set up as described above.
- **Cron:** any external cron service that can send a POST with a custom header, set to call `/api/cron/scrape` every 2 hours.
