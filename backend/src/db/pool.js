import pg from 'pg';

import { config } from '../config.js';

pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value) => Number(value));
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number(value));

if (!config.databaseUrl) {
  throw new Error(
    'DATABASE_URL is not set. Copy backend/.env.example to backend/.env and fill it in.',
  );
}

const isLocalDatabase = /@(localhost|127\.0\.0\.1)[:/]/.test(config.databaseUrl);

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  ssl: isLocalDatabase ? false : { rejectUnauthorized: false },
  max: 5,
});

pool.on('error', (err) => console.error('[db] idle client error:', err.message));