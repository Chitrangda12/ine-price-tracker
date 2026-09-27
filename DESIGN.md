# Design notes

## Architecture

```
React (Vite)  --->  Express API  --->  Supabase Postgres
                        |
                        +--->  INE store: JSON API (fetch) and product pages (Playwright)

External cron  --POST /api/cron/scrape-->  Express API
```

The frontend only talks to the backend. The backend handles search, tracking, scraping, saving results and the CSV. A scrape only starts when something asks for one: the cron endpoint, the "Scrape now" button, or the npm scripts.

## Scraping approach

The store renders everything in the browser. Its HTML is just an empty `<div id="root">`, so a plain HTTP request plus HTML parsing gets nothing.

- **Search and options:** the store's own frontend loads its data from a JSON API, so I call that directly with `fetch` (`/api/v2/listings` and `/api/v2/items/:id`). Listings has no search parameter, so the backend loads the whole catalog page by page, caches it for 10 minutes and filters by name. Every word typed has to appear in the product name.
- **Price and stock:** these are not in the API. They only appear after interacting with the page. There's a consent dialog, the option has to be chosen, the "Check today's price" button stays disabled until the mouse has moved over the price panel and rested, some clicks do nothing, and the store shows "Updating…" and "Retrying…" states. So this part uses Playwright.

The scraper finds things by role and visible text (the product heading, the option label, the price button's wording), not by CSS class names. It only reads the part of the page that holds the product's heading and its price button, so prices of other products on the page are ignored.

## Price and stock validation

A scrape is saved as a success only if all of this holds:

- A heading with the exact product name is on the page, and the URL is the product's URL.
- The option was clicked by its exact label and the page shows it as selected (or the page doesn't mark a selection at all). This is checked again after the price loads.
- The price comes from visible text only. Hidden elements, `aria-hidden` text, transparent, clipped or off-screen text and struck-through prices (the MRP) are skipped.
- The text has to be just a price, like `₹69,999`, `69.999,00 ₹` or `69,999/-`. "Save ₹2,000" or two prices together don't count. `parse.js` handles full-width digits, invisible characters and the different separators.
- The price is the largest-font price that appeared after clicking the button. If two different prices show at that size, the try fails. A single digit inside a price drawn one character per `<span>` is never taken as the price.
- Stock must match a known wording ("12 units available", "Last few: 3", "Available (8)", "Sold out" counts as 0, and so on). Visible button text is checked for stock too. Two different stock numbers means the try fails.
- The same price and stock have to be read twice in a row, 0.7 s apart, with no loading text on the page.
- A last check in `validate.js`: price above 0, stock a whole number of 0 or more, and name, option and URL matching.

The database backs this up with a check constraint: a `failed` row can't have a price or stock, and a `success` or `retried` row must have both.

## Retry and timeout handling

Inside one try:

- Page load 30 s. Heading, option and price button 20 s each. Price and stock 45 s. Other Playwright actions 10 s.
- The consent dialog gets up to 5 clicks, and Playwright also clears it automatically if it's covering something about to be clicked.
- Hover and click get up to 3 rounds. If the button is still disabled, or the click changes nothing on the page within 5 s, it hovers and clicks again.
- If the store shows its own error ("Couldn't load price…"), the try ends straight away.
- If a price is visible but keeps failing the checks for 10 reads, the try ends.

Between tries: up to 3 tries (`SCRAPE_MAX_TRIES`), a fresh browser each time, and waits of 3 s and then 8 s plus up to 1 s random.

For the store's JSON API: a 10 s timeout and 3 tries. A 404 or a non-JSON reply isn't retried.

## Failed scrape handling

If every try fails, a row is still saved with outcome `failed`, empty price and stock, the number of tries, and one line per try saying what went wrong, for example `try 2: PAGE_NOT_RENDERED: Product page did not render within 20s (slow or dropped load)`.

Unexpected errors, like the browser not starting, are saved as failed scrapes too. In a scheduled run one product failing doesn't stop the others. If saving the row itself fails, it's logged to the console and the run moves on.

With `SCRAPE_DEBUG_DIR` set, a screenshot is saved for every failed try.

## How last successful data is preserved

Scrape rows are only ever inserted, never updated. The tracked list takes the current price and stock from the latest row that isn't `failed`, and the last outcome separately from the latest row of any kind. So a failed scrape never wipes out the last good price. When the latest scrape failed, the dashboard shows the old price with "as of <time>" under it, next to the failed outcome.

The same query also looks at the successful scrape before the latest one. That's how the "Price dropped" and "Back in stock" labels are worked out.

## History and logging

Everything is in one table, `scrape_attempts`. The store product id, product name and option are copied into each row, so old rows stay correct.

- **History:** `success` and `retried` rows, shown as a table and a price chart. If there were failed scrapes, a note says how many were left out and points to the log.
- **Scrape log:** every row, with time, outcome, price, stock, number of tries, who started it (schedule or manual) and the error details.
- **Console:** the backend logs each step of a scrape, prefixed with the product id and option.

## Scheduled scraping

The backend has no timer of its own, since a free-tier server may be asleep. An external cron calls `POST /api/cron/scrape` with the `X-Cron-Secret` header every 2 hours, and that request also wakes the server. The endpoint replies `202` and does the work in the background.

- Only active products are scraped, one after another.
- A product is skipped if it already had a scheduled scrape in the last 100 minutes, so a repeated trigger doesn't scrape it twice in the same slot.
- Only one scrape runs at a time (an in-memory flag). A second cron call or a "Scrape now" during a run gets `409`.

## Main tradeoffs

- **Playwright vs plain HTTP:** Playwright is heavier, so it's only used for price and stock. Search and options use the JSON API.
- **Fresh browser per try:** slower, but a stuck page can't carry over into the next try.
- **Text over CSS classes:** finding elements by text survives class name changes, but breaks if the store changes its wording.
- **Failing instead of guessing:** some scrapes fail that a looser scraper would have "passed", but a wrong price is never saved as a success.
- **One row per scrape:** the CSV has one row per scrape, and retries still show up in the tries count and error details.
- **One table:** using the same table for history and log means there's nothing to keep in sync.
- **In-memory lock and catalog cache:** simple, but they only work with a single backend instance.

## Limitations

- The scraper depends on the store's current wording: the heading matching the product name, the option labels, a "Check today's price"-style button and the known stock phrases. If these change, scrapes come back `failed` (not wrong) until the code is updated.
- The first search after a restart, or after the 10-minute cache runs out, loads the whole catalog page by page, so it can be slow.
- Products are scraped one at a time, so a long list of tracked products means a long run.
- There's no login. Anyone with the dashboard URL can track, pause or scrape. Only the cron endpoint is protected.
- The frontend shows all prices in rupees.
- "Price dropped" and "Back in stock" only compare the last two successful scrapes.
- The chart shows price only. Stock is in the table.

## AI assistance

I used Claude (Anthropic, on claude.ai) to help build the first version of the backend, scraper and frontend, and to track down bugs.

Claude couldn't open the store from its own environment. Its first version was based on public notes about how the store works, and it tested the scraper against a local imitation of the store. Things it got wrong at first, and how they were fixed:

- **Hover:** it kept moving the mouse while "resting" on the price button, so the button never enabled and every test scrape failed. Fixed by holding the pointer still for about a second and then waiting for the button to enable.
- **Prices drawn one character per `<span>`:** each digit was read as a separate price, so tries failed with "two different prices". That also showed a worse case: a single digit, like "5" from "₹500", could have been saved as the price if the full number couldn't be read. Fixed by never treating part of a bigger number in the same element as a price.
- **Database constraint:** the first check constraint let through a `success` row with no stock, because a CHECK passes when the comparison is NULL. Found by trying bad inserts against a real Postgres. Fixed by adding `is not null`.
- **Search:** the catalog loader stopped after page 1 if the response had no `totalPages` field, and it never went past page 100. I found this when searching for "Orbis Kettlebell Aero" (ID 2749) returned nothing. Fixed so it keeps paging until the real end of the catalog.
- **Mobile layout:** the tables made the page wider than a phone screen. Spotted in phone-size screenshots and fixed in the CSS.
