// Scrape one product option straight from the store and print the result.
// Nothing is written to the database, so this is the quickest way to check the
// scraper against the live store or to watch it work.
//
//   npm run scrape:product -- --id 21 --option "256 GB" --headed
//   npm run scrape:product -- --id 21          (lists the product's options)
import { parseArgs } from 'node:util';
import { scrapeWithRetries } from '../src/scraper/index.js';
import { getProduct } from '../src/store/storeClient.js';

const { values } = parseArgs({
  options: {
    id: { type: 'string' },
    option: { type: 'string' },
    headed: { type: 'boolean', default: false },
  },
});

if (!values.id) {
  console.error('Usage: npm run scrape:product -- --id <store product id> --option "<option label>" [--headed]');
  process.exit(1);
}

const product = await getProduct(values.id);
console.log(`${product.name} (${product.url})`);
console.log(`${product.optionAxis} options: ${product.options.map((o) => `"${o.label}"`).join(', ')}`);

const option = product.options.find((o) => o.label.toLowerCase() === String(values.option ?? '').toLowerCase());
if (!option) {
  console.error(values.option ? `No option called "${values.option}".` : 'Pass --option to scrape one of them.');
  process.exit(values.option ? 1 : 0);
}

const result = await scrapeWithRetries(
  { storeProductId: product.id, productName: product.name, productUrl: product.url, optionLabel: option.label },
  { headed: values.headed || undefined, log: (m) => console.log(`  ${m}`) },
);
const outcome = !result.ok ? 'failed' : result.attempts === 1 ? 'success' : 'retried';
console.log({ outcome, price: result.price, stock: result.stock, attempts: result.attempts, errors: result.errors });
process.exit(result.ok ? 0 : 2);
