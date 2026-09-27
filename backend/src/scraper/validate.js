import { ScrapeError } from './errors.js';
import { normalizeText } from './parse.js';

const same = (a, b) =>
  normalizeText(a).toLowerCase() === normalizeText(b).toLowerCase();

export function assertValidQuote(target, observed) {
  const problems = [];

  const expectedPath = new URL(target.productUrl).pathname;

  if (
    !observed.url ||
    !new URL(observed.url).pathname.startsWith(expectedPath)
  ) {
    problems.push(
      `page URL "${observed.url}" is not product ${target.storeProductId}`,
    );
  }

  if (!same(observed.productName, target.productName)) {
    problems.push(
      `page shows "${observed.productName}", expected "${target.productName}"`,
    );
  }

  if (!same(observed.optionLabel, target.optionLabel)) {
    problems.push(
      `option "${observed.optionLabel}" selected, expected "${target.optionLabel}"`,
    );
  }

  if (!observed.optionConfirmed) {
    problems.push(
      `could not confirm option "${target.optionLabel}" is selected`,
    );
  }

  if (
    typeof observed.price !== 'number' ||
    !Number.isFinite(observed.price) ||
    observed.price <= 0
  ) {
    problems.push(`price ${observed.price} is not a positive number`);
  }

  if (!Number.isInteger(observed.stock) || observed.stock < 0) {
    problems.push(`stock ${observed.stock} is not a whole number >= 0`);
  }

  if (problems.length) {
    throw new ScrapeError(
      'VALIDATION_FAILED',
      problems.join('; '),
    );
  }

  return {
    price: observed.price,
    stock: observed.stock,
  };
}