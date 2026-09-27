import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { config } from '../config.js';
import { ScrapeError, toScrapeError } from './errors.js';
import {
  clickToReveal,
  confirmOptionStillSelected,
  findRevealButton,
  markProductArea,
  openProductPage,
  selectOption,
  snapshotBeforeReveal,
  waitForProductHeading,
  waitForStableQuote,
} from './productPage.js';
import { assertValidQuote } from './validate.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function scrapeOnce(
  target,
  { headed = !config.headless, log = () => {} } = {},
) {
  const browser = await chromium.launch({
    headless: !headed,
    slowMo: headed ? 100 : 0,
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1366, height: 900 },
      locale: 'en-IN',
    });

    const page = await context.newPage();
    page.setDefaultTimeout(10_000);

    try {
      await openProductPage(page, target.productUrl, log);

      const heading = await waitForProductHeading(
        page,
        target.productName,
        log,
      );

      const optionConfirmedBy = await selectOption(
        page,
        target.optionLabel,
        log,
      );

      const revealButton = await findRevealButton(page);
      await markProductArea(page, heading, revealButton);

      const before = await snapshotBeforeReveal(page);

      await clickToReveal(page, revealButton, before, log);

      const { price, stock } = await waitForStableQuote(page, before, log);

      await confirmOptionStillSelected(
        page,
        target.optionLabel,
        optionConfirmedBy,
      );

      return assertValidQuote(target, {
        url: page.url(),
        productName: (await heading.innerText()).trim(),
        optionLabel: target.optionLabel,
        optionConfirmed: Boolean(optionConfirmedBy),
        price,
        stock,
      });
    } catch (error) {
      await saveDebugScreenshot(page, target, log);
      throw error;
    }
  } catch (error) {
    throw toScrapeError(error);
  } finally {
    await browser.close().catch(() => {});
  }
}

export async function scrapeWithRetries(
  target,
  { headed, log = () => {} } = {},
) {
  const { maxTries, retryDelaysMs } = config.scrape;
  const errors = [];

  for (let attempt = 1; attempt <= maxTries; attempt++) {
    log(`try ${attempt} of ${maxTries}`);

    try {
      const quote = await scrapeOnce(target, { headed, log });

      log(`try ${attempt} succeeded`);

      return {
        ok: true,
        attempts: attempt,
        price: quote.price,
        stock: quote.stock,
        errors,
      };
    } catch (error) {
      const scrapeError = toScrapeError(error);

      errors.push(
        `try ${attempt}: ${scrapeError.code}: ${scrapeError.message}`,
      );

      log(
        `try ${attempt} failed: ${scrapeError.code}: ${scrapeError.message}`,
      );

      if (!scrapeError.retryable || attempt === maxTries) {
        return {
          ok: false,
          attempts: attempt,
          price: null,
          stock: null,
          errors,
        };
      }

      const wait =
        (retryDelaysMs[attempt - 1] ?? retryDelaysMs.at(-1)) +
        Math.round(Math.random() * 1000);

      log(`waiting ${(wait / 1000).toFixed(1)}s before retrying`);

      await sleep(wait);
    }
  }

  throw new ScrapeError(
    'CONFIG',
    'SCRAPE_MAX_TRIES must be at least 1',
    { retryable: false },
  );
}

async function saveDebugScreenshot(page, target, log) {
  if (!config.scrape.debugDir) return;

  try {
    await mkdir(config.scrape.debugDir, { recursive: true });

    const file = path.join(
      config.scrape.debugDir,
      `item-${target.storeProductId}-${Date.now()}.png`,
    );

    await page.screenshot({ path: file, fullPage: true });
    log(`saved screenshot ${file}`);
  } catch {
    // Intentionally ignore screenshot errors.
  }
}