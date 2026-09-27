import { useCallback, useEffect, useState } from 'react';
import ProductDetail from './components/ProductDetail.jsx';
import SearchPanel from './components/SearchPanel.jsx';
import TrackedTable from './components/TrackedTable.jsx';
import { api, exportCsvUrl } from './services/api.js';

export default function App() {
  const [products, setProducts] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [scrapingId, setScrapingId] = useState(null);
  const [notice, setNotice] = useState('');

  const loadProducts = useCallback(async () => {
    try {
      setProducts(await api.trackedProducts());
      setLoadError('');
    } catch (err) {
      setLoadError(err.message);
    }
  }, []);

  useEffect(() => {
    loadProducts();

    // Refresh periodically so scheduled scrape results appear without a page reload.
    const timer = setInterval(loadProducts, 60_000);

    return () => clearInterval(timer);
  }, [loadProducts]);

  async function handleTracked(tracked) {
    await loadProducts();
    setSelectedId(tracked.id);
  }

  async function handleScrapeNow(product) {
    setScrapingId(product.id);
    setNotice(
      `Scraping ${product.product_name}. This can take a minute or two.`,
    );

    try {
      const attempt = await api.scrapeNow(product.id);

      setNotice(
        attempt.outcome === 'success'
          ? `${product.product_name} updated successfully.`
          : `${product.product_name} update failed.`,
      );
    } catch (err) {
      setNotice(err.message);
    } finally {
      setScrapingId(null);
      await loadProducts();
    }
  }

  async function handleToggleActive(product) {
    try {
      await api.setActive(product.id, !product.is_active);
      await loadProducts();
    } catch (err) {
      setNotice(err.message);
    }
  }

  const selected =
    products.find((product) => product.id === selectedId) ?? null;

  return (
    <div className="page">
      <header className="topbar">
        <div>
          <h1>INE price tracker</h1>
          <p className="muted">
            Track product prices and stock, updated every 2 hours.
          </p>
        </div>

        <a
          className="button button-secondary"
          href={exportCsvUrl}
          download
        >
          Export CSV
        </a>
      </header>

      {loadError && (
        <p className="banner banner-error" role="alert">
          Could not load tracked products: {loadError}
        </p>
      )}

      {notice && (
        <p className="banner" role="status">
          {notice}
        </p>
      )}

      <main className="layout">
        <SearchPanel onTracked={handleTracked} />

        <div className="watch">
          <TrackedTable
            products={products}
            selectedId={selectedId}
            scrapingId={scrapingId}
            onSelect={setSelectedId}
            onScrapeNow={handleScrapeNow}
            onToggleActive={handleToggleActive}
          />

          {selected && (
            <ProductDetail
              key={selected.id}
              product={selected}
            />
          )}
        </div>
      </main>
    </div>
  );
}