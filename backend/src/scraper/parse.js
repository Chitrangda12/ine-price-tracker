const FULLWIDTH_DIGITS = /[\uFF10-\uFF19]/g;

const INVISIBLE_CHARS = /[\u200B-\u200D\u2060\uFEFF\u00AD]/g;

const UNUSUAL_SPACES = /[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g;

export function normalizeText(text) {
  return String(text ?? '')
    .replace(FULLWIDTH_DIGITS, (digit) =>
      String.fromCharCode(digit.charCodeAt(0) - 0xff10 + 48),
    )
    .replace(/\uFF0C/g, ',')
    .replace(/\uFF0E/g, '.')
    .replace(INVISIBLE_CHARS, '')
    .replace(UNUSUAL_SPACES, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const PRICE_ONLY =
  /^(?:₹|rs\.?|inr|\$|€|£)?\s*(\d[\d\s.,']*)\s*(?:₹|rs\.?|inr|€|£|\/-)?$/i;

export function parsePrice(raw) {
  const text = normalizeText(raw);
  const match = text.match(PRICE_ONLY);

  if (!match) {
    return { ok: false, reason: `not a price: "${text.slice(0, 40)}"` };
  }

  const value = amountFromDigits(match[1].replace(/[\s']/g, ''));

  if (!Number.isFinite(value)) {
    return { ok: false, reason: `unreadable amount: "${text}"` };
  }

  if (value <= 0) {
    return { ok: false, reason: `price is not positive: "${text}"` };
  }

  if (value >= 10_000_000) {
    return {
      ok: false,
      reason: `price is implausibly large: "${text}"`,
    };
  }

  return { ok: true, value: Math.round(value * 100) / 100 };
}

function amountFromDigits(digits) {
  const text = digits.replace(/[.,]+$/, '');
  const lastSeparator = Math.max(
    text.lastIndexOf(','),
    text.lastIndexOf('.'),
  );

  if (lastSeparator === -1) {
    return Number(text);
  }

  const decimals = text.length - lastSeparator - 1;

  if (decimals === 3) {
    return Number(text.replace(/[.,]/g, ''));
  }

  if (decimals === 1 || decimals === 2) {
    return Number(
      `${text.slice(0, lastSeparator).replace(/[.,]/g, '')}.${text.slice(
        lastSeparator + 1,
      )}`,
    );
  }

  return NaN;
}

const OUT_OF_STOCK = /sold\s*out|out\s*of\s*stock/i;

const STOCK_PATTERNS = [
  /(?<![\d.,])(\d+)\s*units?\s*(?:available|left|in\s*stock)/i,
  /last\s*few\s*:?\s*(\d+)(?![\d.,])/i,
  /available\s*\(?\s*(\d+)\s*\)?/i,
  /stock\s*:?\s*(\d+)(?![\d.,])/i,
  /only\s*(\d+)\s*left/i,
  /(?<![\d.,])(\d+)\s*(?:available|in\s*stock|remaining|left)/i,
];

export function parseStock(raw) {
  const text = normalizeText(raw);

  if (!text) {
    return { ok: false, reason: 'no stock text' };
  }

  if (OUT_OF_STOCK.test(text)) {
    return { ok: true, value: 0 };
  }

  for (const pattern of STOCK_PATTERNS) {
    const match = text.match(pattern);

    if (match) {
      return { ok: true, value: Number(match[1]) };
    }
  }

  return {
    ok: false,
    reason: `unrecognised stock text: "${text.slice(0, 60)}"`,
  };
}

export const STOCK_KEYWORDS =
  'units?\\s*(available|left)|last\\s*few|available|in\\s*stock|stock\\s*:|remaining|only\\s*\\d+\\s*left|sold\\s*out|out\\s*of\\s*stock';