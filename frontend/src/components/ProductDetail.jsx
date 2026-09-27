import { useEffect, useState } from 'react';
import { formatPrice, formatStock, formatTime } from '../format.js';
import { api } from '../services/api.js';
import OutcomeTag from './OutcomeTag.jsx';
import PriceChart from './PriceChart.jsx';

const RUN_BY = { scheduled: 'Schedule', manual: 'Manual' };

export default function ProductDetail({ product }) {
  const [attempts, setAttempts] = useState(null);
  const [error, setError] = useState('');

  // Reload the history when this product gets a new scrape.
  useEffect(() => {
    let cancelled = false;

    api
      .attempts(product.id)
      .then((rows) => {
        if (!cancelled) {
          setAttempts(rows);
          setError('');
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [product.id, product.last_scraped_at]);

  // Failed scrapes have no price or stock, so they stay out of the history table.
  const withPrice = (attempts ?? []).filter(
    (attempt) => attempt.outcome !== 'failed',
  );

  const failedCount = (attempts ?? []).length - withPrice.length;

  return (
    <section
      className="panel detail"
      aria-labelledby="detail-heading"
    >
      <div className="detail-head">
        <div>
          <h2 id="detail-heading">{product.product_name}</h2>

          <p className="muted">
            {product.option_axis ?? 'Option'}: {product.option_label}.
            Store ID {product.store_product_id}.{' '}
            <a
              href={product.product_url}
              target="_blank"
              rel="noreferrer"
            >
              Open in store
            </a>
          </p>
        </div>

        {product.current_price !== null && (
          <span className="tag tag-large">
            {formatPrice(product.current_price)}
          </span>
        )}
      </div>

      {error && (
        <p className="error" role="alert">
          Could not load the history: {error}
        </p>
      )}

      {attempts === null && !error && (
        <p className="muted">Loading history…</p>
      )}

      {attempts && (
        <>
          <h3>Price and stock history</h3>

          <PriceChart points={[...withPrice].reverse()} />

          {withPrice.length === 0 ? (
            <p className="empty">No successful scrape yet.</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Time</th>
                    <th scope="col" className="num">
                      Price
                    </th>
                    <th scope="col" className="num">
                      Stock
                    </th>
                    <th scope="col">Outcome</th>
                  </tr>
                </thead>

                <tbody>
                  {withPrice.map((attempt) => (
                    <tr key={attempt.id}>
                      <td className="nowrap">
                        {formatTime(attempt.scraped_at)}
                      </td>
                      <td className="num">
                        {formatPrice(attempt.price)}
                      </td>
                      <td className="num">
                        {formatStock(attempt.stock)}
                      </td>
                      <td>
                        <OutcomeTag outcome={attempt.outcome} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {failedCount > 0 && (
            <p className="muted small note">
              {failedCount} failed{' '}
              {failedCount === 1 ? 'scrape has' : 'scrapes have'} no
              price, so {failedCount === 1 ? 'it is' : 'they are'} not
              in this history. The scrape log below lists every scrape.
            </p>
          )}

          <h3>Scrape log</h3>

          {attempts.length === 0 ? (
            <p className="empty">
              Not scraped yet. Use Scrape now, or wait for the next
              scheduled run.
            </p>
          ) : (
            <div className="table-scroll">
              <table className="log">
                <thead>
                  <tr>
                    <th scope="col">Time</th>
                    <th scope="col">Outcome</th>
                    <th scope="col" className="num">
                      Price
                    </th>
                    <th scope="col" className="num">
                      Stock
                    </th>
                    <th scope="col" className="num">
                      Tries
                    </th>
                    <th scope="col">Run by</th>
                    <th scope="col">Details</th>
                  </tr>
                </thead>

                <tbody>
                  {attempts.map((attempt) => (
                    <tr key={attempt.id}>
                      <td className="nowrap">
                        {formatTime(attempt.scraped_at)}
                      </td>
                      <td>
                        <OutcomeTag outcome={attempt.outcome} />
                      </td>
                      <td className="num">
                        {formatPrice(attempt.price)}
                      </td>
                      <td className="num">
                        {formatStock(attempt.stock)}
                      </td>
                      <td className="num">{attempt.attempts}</td>
                      <td>
                        {RUN_BY[attempt.triggered_by] ??
                          attempt.triggered_by}
                      </td>
                      <td className="details">
                        {attempt.error_message
                          ? attempt.error_message
                              .split('\n')
                              .map((line, index) => (
                                <div key={index}>{line}</div>
                              ))
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}