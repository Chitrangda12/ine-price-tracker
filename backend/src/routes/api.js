import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { config } from '../config.js';
import {
  listAllScrapeAttempts,
  listScrapeAttempts,
  listTrackedProducts,
  setTrackingActive,
  trackProduct,
} from '../db/queries.js';
import { scrapeAttemptsToCsv } from '../services/csv.js';
import { HttpError } from '../services/httpError.js';
import {
  isScrapeRunning,
  runScheduledScrape,
  scrapeTrackedProductNow,
} from '../services/scrapeService.js';
import { getProduct, searchProducts } from '../store/storeClient.js';

export const apiRouter = Router();

function idParam(req) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new HttpError(400, 'Invalid id');
  }
  return id;
}

apiRouter.get('/health', (req, res) => {
  res.json({ ok: true, scrapeRunning: isScrapeRunning() });
});

apiRouter.get('/store/search', async (req, res) => {
  const q = String(req.query.q ?? '').trim();

  if (q.length < 2) {
    throw new HttpError(400, 'Type at least 2 characters to search');
  }

  res.json({ results: await searchProducts(q) });
});

apiRouter.get('/store/products/:storeProductId', async (req, res) => {
  res.json(await getProduct(req.params.storeProductId));
});

apiRouter.get('/tracked', async (req, res) => {
  res.json({ products: await listTrackedProducts() });
});

apiRouter.post('/tracked', async (req, res) => {
  const { storeProductId, optionId } = req.body ?? {};

  if (!storeProductId || !optionId) {
    throw new HttpError(400, 'storeProductId and optionId are required');
  }

  const product = await getProduct(String(storeProductId));
  const option = product.options.find((item) => item.id === String(optionId));

  if (!option) {
    throw new HttpError(400, `Option ${optionId} does not exist for this product`);
  }

  const tracked = await trackProduct({
    storeProductId: product.id,
    productName: product.name,
    productUrl: product.url,
    optionId: option.id,
    optionLabel: option.label,
    optionAxis: product.optionAxis,
  });

  res.status(201).json(tracked);
});

apiRouter.patch('/tracked/:id', async (req, res) => {
  if (typeof req.body?.isActive !== 'boolean') {
    throw new HttpError(400, 'isActive must be true or false');
  }

  const updated = await setTrackingActive(idParam(req), req.body.isActive);

  if (!updated) {
    throw new HttpError(404, 'Tracked product not found');
  }

  res.json(updated);
});

apiRouter.get('/tracked/:id/attempts', async (req, res) => {
  res.json({ attempts: await listScrapeAttempts(idParam(req)) });
});

apiRouter.post('/tracked/:id/scrape', async (req, res) => {
  res.json(await scrapeTrackedProductNow(idParam(req)));
});

function requireCronSecret(req, res, next) {
  if (!config.cronSecret) {
    throw new HttpError(503, 'CRON_SECRET is not configured on the server');
  }

  const given = Buffer.from(req.get('x-cron-secret') ?? '');
  const expected = Buffer.from(config.cronSecret);

  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw new HttpError(401, 'Invalid cron secret');
  }

  next();
}

apiRouter.post('/cron/scrape', requireCronSecret, async (req, res) => {
  if (isScrapeRunning()) {
    return res.status(409).json({ status: 'already_running' });
  }

  const run = runScheduledScrape({ force: req.query.force === '1' });

  if (req.query.wait === '1') {
    return res.json(await run);
  }

  run.catch((err) => console.error('[scheduled] run failed:', err));

  res.status(202).json({
    status: 'started',
    startedAt: new Date().toISOString(),
  });
});

apiRouter.get('/export.csv', async (req, res) => {
  const csv = scrapeAttemptsToCsv(await listAllScrapeAttempts());
  const date = new Date().toISOString().slice(0, 10);

  res.type('text/csv').attachment(`scrape-history-${date}.csv`).send(csv);
});