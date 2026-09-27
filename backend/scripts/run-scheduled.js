// Runs the same job the cron endpoint runs: scrape every active product that is due.
//   npm run scrape                 (headless)
//   npm run scrape:headed          (watch the browser)
//   npm run scrape -- --force      (ignore the 2-hour spacing and scrape everything now)
import { parseArgs } from 'node:util';
import { pool } from '../src/db/pool.js';
import { runScheduledScrape } from '../src/services/scrapeService.js';

const { values } = parseArgs({
  options: { headed: { type: 'boolean', default: false }, force: { type: 'boolean', default: false } },
});

try {
  const summary = await runScheduledScrape({ force: values.force, headed: values.headed || undefined });
  console.table(summary.results);
} finally {
  await pool.end();
}
