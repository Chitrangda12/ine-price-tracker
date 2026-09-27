import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scrapeAttemptsToCsv } from '../src/services/csv.js';

test('one row per attempt, UTC timestamps, empty price and stock for failures', () => {
  const csv = scrapeAttemptsToCsv([
    { store_product_id: '21', product_name: 'Phone, "X"', option_label: '256 GB', scraped_at: new Date('2026-09-26T10:00:00+05:30'), price: 69999, stock: 12, outcome: 'success' },
    { store_product_id: '21', product_name: 'Phone, "X"', option_label: '256 GB', scraped_at: new Date('2026-09-26T12:00:00Z'), price: null, stock: null, outcome: 'failed' },
  ]);
  assert.equal(
    csv,
    'Product ID,Product Name,Selected Option,Timestamp,Price,Stock,Outcome\r\n' +
      '21,"Phone, ""X""",256 GB,2026-09-26T04:30:00.000Z,69999.00,12,success\r\n' +
      '21,"Phone, ""X""",256 GB,2026-09-26T12:00:00.000Z,,,failed\r\n',
  );
});
