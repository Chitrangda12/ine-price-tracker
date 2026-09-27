import { config } from '../config.js';

export const STORE_PATHS = {
  listings: (page, limit) => `/api/v2/listings?page=${page}&limit=${limit}`,
  item: (id) => `/api/v2/items/${encodeURIComponent(id)}`,
  productPage: (id) => `/item/${encodeURIComponent(id)}`,
};

export const productPageUrl = (id) =>
  config.storeUrl + STORE_PATHS.productPage(id);

export class StoreApiError extends Error {
  constructor(message, { status = 502, retryable = true } = {}) {
    super(message);
    this.name = 'StoreApiError';
    this.status = status;
    this.retryable = retryable;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getJson(path, { tries = 3, timeoutMs = 10_000 } = {}) {
  let lastError;

  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const response = await fetch(config.storeUrl + path, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (response.status === 404) {
        throw new StoreApiError(`Not found on the store: ${path}`, {
          status: 404,
          retryable: false,
        });
      }

      if (!response.ok) {
        throw new StoreApiError(
          `Store responded ${response.status} for ${path}`,
        );
      }

      if (
        !(response.headers.get('content-type') || '').includes('json')
      ) {
        throw new StoreApiError(
          `Store returned non-JSON for ${path}; the API path may have changed`,
          {
            retryable: false,
          },
        );
      }

      return await response.json();
    } catch (error) {
      lastError =
        error.name === 'TimeoutError'
          ? new StoreApiError(
              `Store did not respond within ${timeoutMs / 1000}s for ${path}`,
            )
          : error;

      if (lastError.retryable === false || attempt === tries) {
        break;
      }

      await sleep(500 * attempt);
    }
  }

  if (lastError instanceof StoreApiError) {
    throw lastError;
  }

  throw new StoreApiError(
    `Could not reach the store: ${lastError.message}`,
  );
}

const CATALOG_TTL_MS = 10 * 60 * 1000;
const MAX_CATALOG_PAGES = 1000;

let catalog = {
  products: [],
  loadedAt: 0,
};

let catalogLoading = null;

const normalize = (text) =>
  String(text ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

async function fetchCatalog() {
  const byId = new Map();
  let storeTotal = null;

  for (let page = 1; page <= MAX_CATALOG_PAGES; page++) {
    const body = await getJson(STORE_PATHS.listings(page, 100));

    const items =
      body.results ??
      body.items ??
      body.products ??
      [];

    const knownBefore = byId.size;

    for (const product of items) {
      if (product?.id === undefined || !product.name) continue;

      byId.set(String(product.id), {
        id: String(product.id),
        name: String(product.name).trim(),
        brand: product.brand ?? null,
        category: product.category ?? null,
      });
    }

    storeTotal =
      Number(body.count ?? body.total ?? body.totalCount) ||
      storeTotal;

    const totalPages =
      Number(
        body.totalPages ??
        body.total_pages ??
        body.pages,
      ) || null;

    const addedNothing = byId.size === knownBefore;

    if (items.length === 0) break;

    if (totalPages) {
      const shortOfTotal =
        storeTotal !== null &&
        byId.size < storeTotal;

      if (
        page >= totalPages &&
        (!shortOfTotal || addedNothing)
      ) {
        break;
      }
    } else if (addedNothing) {
      break;
    }
  }

  if (byId.size === 0) {
    throw new StoreApiError(
      'The store catalog came back empty; the listings format may have changed',
    );
  }

  if (storeTotal && byId.size < storeTotal) {
    console.warn(
      `[store] catalog loaded ${byId.size} of ${storeTotal} products; some may not be searchable`,
    );
  }

  return [...byId.values()];
}

async function getCatalog() {
  if (
    catalog.products.length &&
    Date.now() - catalog.loadedAt < CATALOG_TTL_MS
  ) {
    return catalog.products;
  }

  catalogLoading ??= fetchCatalog()
    .then((products) => {
      catalog = {
        products,
        loadedAt: Date.now(),
      };

      return products;
    })
    .finally(() => {
      catalogLoading = null;
    });

  return catalogLoading;
}

export async function searchProducts(query, limit = 25) {
  const q = normalize(query);
  const words = q.split(' ').filter(Boolean);

  if (words.length === 0) return [];

  const products = await getCatalog();

  const rank = (product) => {
    const name = normalize(product.name);

    if (name === q) return 0;
    if (name.startsWith(q)) return 1;

    return 2;
  };

  return products
    .filter((product) =>
      words.every((word) =>
        normalize(product.name).includes(word),
      ),
    )
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        a.name.localeCompare(b.name),
    )
    .slice(0, limit);
}

export async function getProduct(id) {
  const item = await getJson(STORE_PATHS.item(id));

  const productId = String(item.id ?? id);

  const options = (item.options ?? [])
    .map((option) => ({
      id: String(option.id ?? ''),
      label: String(
        option.label ?? option.name ?? '',
      ).trim(),
    }))
    .filter((option) => option.id && option.label);

  if (!item.name || options.length === 0) {
    throw new StoreApiError(
      `Store product ${productId} has no name or options in its API response`,
      {
        retryable: false,
      },
    );
  }

  return {
    id: productId,
    name: String(item.name).trim(),
    url: productPageUrl(productId),
    brand: item.brand ?? null,
    category: item.category ?? null,
    optionAxis: item.optionAxis ?? 'Option',
    options,
  };
}