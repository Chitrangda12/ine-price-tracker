import { formatPrice, formatStock, formatTime } from '../format.js';
import OutcomeTag from './OutcomeTag.jsx';

export default function TrackedTable({
  products,
  selectedId,
  scrapingId,
  onSelect,
  onScrapeNow,
  onToggleActive,
}) {
  return (
    <section className="panel" aria-labelledby="tracked-heading">
      <div className="panel-head">
        <h2 id="tracked-heading">Tracked products</h2>
        <p className="muted small">
          Showing the latest available price and stock.
        </p>
      </div>

      {products.length === 0 ? (
        <p className="empty">
          Nothing is tracked yet. Search for a product to start.
        </p>
      ) : (
        <div className="table-scroll">
          <table className="tracked">
            <thead>
              <tr>
                <th scope="col">Product</th>
                <th scope="col">Price</th>
                <th scope="col" className="num">
                  Stock
                </th>
                <th scope="col">Last scrape</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>

            <tbody>
              {products.map((product) => {
                const isSelected = product.id === selectedId;
                const priceIsOld =
                  product.current_price !== null &&
                  product.last_outcome === 'failed';

                const rowClass = [
                  isSelected && 'selected',
                  !product.is_active && 'paused',
                ]
                  .filter(Boolean)
                  .join(' ');

                return (
                  <tr key={product.id} className={rowClass}>
                    <td>
                      <button
                        type="button"
                        className="product-link"
                        aria-pressed={isSelected}
                        onClick={() => onSelect(product.id)}
                      >
                        {product.product_name}
                      </button>

                      <div className="muted small">
                        {product.option_label}
                        {!product.is_active && ' (paused)'}
                      </div>

                      {product.price_dropped && (
                        <div className="alert-text">
                          ↓ Price dropped
                        </div>
                      )}

                      {product.back_in_stock && (
                        <div className="alert-text">
                          ✓ Back in stock
                        </div>
                      )}
                    </td>

                    <td>
                      {product.current_price !== null ? (
                        <span className="tag">
                          {formatPrice(product.current_price)}
                        </span>
                      ) : (
                        <span className="muted">—</span>
                      )}

                      {priceIsOld && (
                        <div className="muted small nowrap">
                          as of {formatTime(product.price_updated_at)}
                        </div>
                      )}
                    </td>

                    <td className="num">
                      {formatStock(product.current_stock)}
                    </td>

                    <td>
                      {product.last_outcome ? (
                        <>
                          <OutcomeTag outcome={product.last_outcome} />
                          <div className="muted small nowrap">
                            {formatTime(product.last_scraped_at)}
                          </div>
                        </>
                      ) : (
                        <span className="muted small">
                          Not scraped yet
                        </span>
                      )}
                    </td>

                    <td className="actions">
                      <button
                        type="button"
                        className="button button-small"
                        disabled={scrapingId !== null}
                        onClick={() => onScrapeNow(product)}
                      >
                        {product.id === scrapingId
                          ? 'Scraping…'
                          : 'Scrape now'}
                      </button>

                      <button
                        type="button"
                        className="button button-small button-secondary"
                        onClick={() => onToggleActive(product)}
                      >
                        {product.is_active ? 'Pause' : 'Resume'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}