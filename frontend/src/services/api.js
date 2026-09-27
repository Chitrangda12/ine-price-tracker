// API calls used by the frontend.

const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

async function request(path, options = {}) {
  const response = await fetch(`${BASE}/api${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...options.headers,
    },
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      body.error || `Request failed (${response.status})`,
    );
  }

  return body;
}

export const api = {
  search: (query) =>
    request(`/store/search?q=${encodeURIComponent(query)}`).then(
      (body) => body.results,
    ),

  product: (storeProductId) =>
    request(
      `/store/products/${encodeURIComponent(storeProductId)}`,
    ),

  trackedProducts: () =>
    request('/tracked').then((body) => body.products),

  track: (storeProductId, optionId) =>
    request('/tracked', {
      method: 'POST',
      body: JSON.stringify({ storeProductId, optionId }),
    }),

  setActive: (id, isActive) =>
    request(`/tracked/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive }),
    }),

  attempts: (id) =>
    request(`/tracked/${id}/attempts`).then(
      (body) => body.attempts,
    ),

  scrapeNow: (id) =>
    request(`/tracked/${id}/scrape`, {
      method: 'POST',
    }),
};

export const exportCsvUrl = `${BASE}/api/export.csv`;