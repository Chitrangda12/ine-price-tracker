export const CSV_COLUMNS = [
  'Product ID',
  'Product Name',
  'Selected Option',
  'Timestamp',
  'Price',
  'Stock',
  'Outcome',
];

function cell(value) {
  if (value === null || value === undefined) return '';

  const text = String(value);

  return /[",\r\n]/.test(text)
    ? `"${text.replace(/"/g, '""')}"`
    : text;
}

export function scrapeAttemptsToCsv(rows) {
  const lines = [CSV_COLUMNS.join(',')];

  for (const row of rows) {
    const failed = row.outcome === 'failed';

    lines.push(
      [
        row.store_product_id,
        row.product_name,
        row.option_label,
        new Date(row.scraped_at).toISOString(),
        failed ? '' : Number(row.price).toFixed(2),
        failed ? '' : row.stock,
        row.outcome,
      ]
        .map(cell)
        .join(','),
    );
  }

  return `${lines.join('\r\n')}\r\n`;
}