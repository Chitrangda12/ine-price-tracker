import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertValidQuote } from '../src/scraper/validate.js';

const target = {
  storeProductId: '21',
  productName: 'Nimbus Phone X',
  productUrl: 'https://store.example/item/21',
  optionLabel: '256 GB',
};
const good = {
  url: 'https://store.example/item/21',
  productName: 'Nimbus  Phone X',
  optionLabel: '256 gb',
  optionConfirmed: true,
  price: 69999,
  stock: 12,
};

test('accepts a quote for the right product and option', () => {
  assert.deepEqual(assertValidQuote(target, good), { price: 69999, stock: 12 });
});

test('rejects wrong product, wrong option, or bad values', () => {
  const bad = [
    { url: 'https://store.example/item/22' },
    { productName: 'Nimbus Phone X Pro' },
    { optionLabel: '128 GB' },
    { optionConfirmed: false },
    { price: 0 },
    { price: Number.NaN },
    { stock: -1 },
    { stock: 2.5 },
    { stock: null },
  ];
  for (const change of bad) {
    assert.throws(() => assertValidQuote(target, { ...good, ...change }), /VALIDATION|expected|not/, JSON.stringify(change));
  }
});
