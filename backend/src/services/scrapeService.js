import { config } from '../config.js';
import {
  getTrackedProduct,
  listProductsDueForScrape,
  recordScrapeAttempt,
} from '../db/queries.js';
import { scrapeWithRetries } from '../scraper/index.js';
import { HttpError } from './httpError.js';

let busy = false;

export const isScrapeRunning = () => busy;

async function exclusively(task) {
  if (busy) {
    throw new HttpError(
      409,
      'A scrape is already running. Try again when it finishes.',
    );
  }

  busy = true;

  try {
    return await task();
  } finally {
    busy = false;
  }
}

const defaultLog = (product) => (message) =>
  console.log(
    `[scrape ${product.store_product_id} "${product.option_label}"] ${message}`,
  );

export async function scrapeAndRecord(
  product,
  { triggeredBy, headed, log = defaultLog(product) },
) {
  const startedAt = Date.now();
  let result;

  try {
    result = await scrapeWithRetries(
      {
        storeProductId: product.store_product_id,
        productName: product.product_name,
        productUrl: product.product_url,
        optionLabel: product.option_label,
      },
      { headed, log },
    );
  } catch (error) {
    result = {
      ok: false,
      attempts: 1,
      price: null,
      stock: null,
      errors: [`UNEXPECTED: ${error.message}`],
    };
  }

  const outcome = !result.ok
    ? 'failed'
    : result.attempts === 1
      ? 'success'
      : 'retried';

  log(`recording outcome: ${outcome}`);

  return recordScrapeAttempt({
    trackedProductId: product.id,
    storeProductId: product.store_product_id,
    productName: product.product_name,
    optionLabel: product.option_label,
    price: result.ok ? result.price : null,
    stock: result.ok ? result.stock : null,
    outcome,
    attempts: result.attempts,
    errorMessage: result.errors.length
      ? result.errors.join('\n')
      : null,
    triggeredBy,
    durationMs: Date.now() - startedAt,
  });
}

export function scrapeTrackedProductNow(trackedProductId) {
  return exclusively(async () => {
    const product = await getTrackedProduct(trackedProductId);

    if (!product) {
      throw new HttpError(404, 'Tracked product not found');
    }

    return scrapeAndRecord(product, { triggeredBy: 'manual' });
  });
}

export function runScheduledScrape({
  force = false,
  headed,
  log = console.log,
} = {}) {
  return exclusively(async () => {
    const minMinutes = force
      ? 0
      : config.scrape.minIntervalMinutes;

    const products = await listProductsDueForScrape(minMinutes);

    log(`[scheduled] ${products.length} product(s) due`);

    const results = [];

    for (const product of products) {
      try {
        const row = await scrapeAndRecord(product, {
          triggeredBy: 'scheduled',
          headed,
        });

        results.push({
          trackedProductId: product.id,
          outcome: row.outcome,
          price: row.price,
          stock: row.stock,
        });
      } catch (error) {
        console.error(
          `[scheduled] could not record scrape for tracked product ${product.id}:`,
          error.message,
        );

        results.push({
          trackedProductId: product.id,
          outcome: 'not_recorded',
          error: error.message,
        });
      }
    }

    log(
      `[scheduled] done: ${
        results
          .map((result) => `${result.trackedProductId}=${result.outcome}`)
          .join(', ') || 'nothing due'
      }`,
    );

    return {
      scraped: results.length,
      results,
    };
  });
}