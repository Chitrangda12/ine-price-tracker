import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parsePrice, parseStock } from '../src/scraper/parse.js';

test('reads the price formats the store rotates through', () => {
  const cases = {
    '₹69,999': 69999,
    '₹6,99,999': 699999,
    'Rs. 69,999': 69999,
    '₹ 69 999': 69999,
    '69.999,00 ₹': 69999,
    '69,999/-': 69999,
    'INR 1,299.50': 1299.5,
    '₹６９,９９９': 69999, // full-width digits
    '₹6\u200B9\u200B,\u200B9\u200B9\u200B9': 69999, // split characters with zero-width spaces
    '₹\u00A069,999': 69999, // non-breaking space
    '₹499': 499,
  };
  for (const [text, expected] of Object.entries(cases)) {
    assert.deepEqual(parsePrice(text), { ok: true, value: expected }, text);
  }
});

test('refuses anything that is not exactly one price', () => {
  for (const text of ['', 'Price hidden', '₹ ––,–––', 'Save ₹2,000', '20% off', '₹69,999 ₹79,999', '₹0', '₹6,9999']) {
    assert.equal(parsePrice(text).ok, false, text);
  }
});

test('reads the stock wordings the store rotates through', () => {
  const cases = {
    '12 units available': 12,
    'Last few: 3': 3,
    'Available (8)': 8,
    'Stock: 5 remaining': 5,
    'Ready to ship — 7 available': 7,
    'Only 2 left': 2,
    'Sold out': 0,
    'Out of stock': 0,
    '１２ units available': 12,
  };
  for (const [text, expected] of Object.entries(cases)) {
    assert.deepEqual(parseStock(text), { ok: true, value: expected }, text);
  }
});

test('never guesses stock from unrelated or glued-together text', () => {
  for (const text of ['', 'Check availability', 'Free delivery in 2 days', '₹69,99912 units available']) {
    assert.equal(parseStock(text).ok, false, text);
  }
});
