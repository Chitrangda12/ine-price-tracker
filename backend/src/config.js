import 'dotenv/config';

function numberFromEnv(name, fallback) {
  const raw = process.env[name];

  if (raw === undefined || raw === '') {
    return fallback;
  }

  const value = Number(raw);

  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a number, got "${raw}"`);
  }

  return value;
}

export const config = {
  port: numberFromEnv('PORT', 4000),

  databaseUrl: process.env.DATABASE_URL || '',

  corsOrigins: (
    process.env.CORS_ORIGIN || 'http://localhost:5173'
  )
    .split(',')
    .map((origin) => origin.trim()),

  cronSecret: process.env.CRON_SECRET || '',

  storeUrl: (
    process.env.STORE_URL || 'https://demo.inelabteamdev.com'
  ).replace(/\/+$/, ''),

  headless: process.env.HEADLESS !== 'false',

  scrape: {
    maxTries: numberFromEnv('SCRAPE_MAX_TRIES', 3),

    retryDelaysMs: [3000, 8000],

    navigationTimeoutMs: numberFromEnv(
      'SCRAPE_NAV_TIMEOUT_MS',
      30000,
    ),

    renderTimeoutMs: numberFromEnv(
      'SCRAPE_RENDER_TIMEOUT_MS',
      20000,
    ),

    quoteTimeoutMs: numberFromEnv(
      'SCRAPE_QUOTE_TIMEOUT_MS',
      45000,
    ),

    minIntervalMinutes: numberFromEnv(
      'SCRAPE_MIN_INTERVAL_MINUTES',
      100,
    ),

    debugDir: process.env.SCRAPE_DEBUG_DIR || '',
  },
};