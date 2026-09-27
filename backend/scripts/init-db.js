// Creates the tables from sql/schema.sql. Safe to run more than once.
import { readFile } from 'node:fs/promises';
import { pool } from '../src/db/pool.js';

const sql = await readFile(new URL('../sql/schema.sql', import.meta.url), 'utf8');
try {
  await pool.query(sql);
  console.log('Database schema is ready.');
} finally {
  await pool.end();
}
