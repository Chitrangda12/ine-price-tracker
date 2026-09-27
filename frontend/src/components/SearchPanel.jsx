import { useState } from 'react';
import { api } from '../services/api.js';

const IDLE = { busy: false, error: '', message: '' };

export default function SearchPanel({ onTracked }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [product, setProduct] = useState(null);
  const [optionId, setOptionId] = useState('');
  const [status, setStatus] = useState(IDLE);

  async function search(event) {
    event.preventDefault();

    const searchText = query.trim();

    if (searchText.length < 2) {
      setStatus({
        ...IDLE,
        error: 'Type at least 2 characters.',
      });
      return;
    }

    setProduct(null);
    setStatus({
      ...IDLE,
      busy: true,
      message: 'Searching the store…',
    });

    try {
      setResults(await api.search(searchText));
      setStatus(IDLE);
    } catch (err) {
      setResults(null);
      setStatus({ ...IDLE, error: err.message });
    }
  }

  async function choose(result) {
    setStatus({
      ...IDLE,
      busy: true,
      message: 'Loading options…',
    });

    try {
      setProduct(await api.product(result.id));

      // Let the user choose the exact option.
      setOptionId('');
      setStatus(IDLE);
    } catch (err) {
      setStatus({ ...IDLE, error: err.message });
    }
  }

  async function track() {
    setStatus({
      ...IDLE,
      busy: true,
      message: 'Saving…',
    });

    try {
      const tracked = await api.track(product.id, optionId);

      setStatus(IDLE);
      setProduct(null);
      setResults(null);
      setQuery('');
      onTracked(tracked);
    } catch (err) {
      setStatus({ ...IDLE, error: err.message });
    }
  }

  return (
    <section
      className="panel search"
      aria-labelledby="search-heading"
    >
      <h2 id="search-heading">Track a product</h2>

      <form onSubmit={search} className="search-form">
        <label htmlFor="search-input">Product name</label>

        <div className="search-row">
          <input
            id="search-input"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Full or partial name"
            autoComplete="off"
          />

          <button
            type="submit"
            className="button"
            disabled={status.busy}
          >
            Search
          </button>
        </div>
      </form>

      {status.message && (
        <p className="muted status" role="status">
          {status.message}
        </p>
      )}

      {status.error && (
        <p className="error status" role="alert">
          {status.error}
        </p>
      )}

      {!product && results && results.length === 0 && (
        <p className="empty">
          No products match “{query.trim()}”. Try fewer or shorter
          words.
        </p>
      )}

      {!product && results && results.length > 0 && (
        <ul className="results">
          {results.map((result) => (
            <li key={result.id}>
              <button
                type="button"
                className="result"
                onClick={() => choose(result)}
                disabled={status.busy}
              >
                <span className="result-name">{result.name}</span>
                <span className="muted small">
                  Store ID {result.id}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {product && (
        <div className="chosen">
          {results && (
            <button
              type="button"
              className="close-button"
              onClick={() => setProduct(null)}
              aria-label="Back to search results"
              title="Back to search results"
            >
              ×
            </button>
          )}

          <h3>{product.name}</h3>
          <p className="muted small">Store ID {product.id}</p>

          <fieldset className="options">
            <legend>
              Choose the {product.optionAxis.toLowerCase()} to track
            </legend>

            {product.options.map((option) => (
              <label key={option.id} className="option">
                <input
                  type="radio"
                  name="option"
                  value={option.id}
                  checked={optionId === option.id}
                  onChange={() => setOptionId(option.id)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </fieldset>

          <button
            type="button"
            className="button"
            disabled={!optionId || status.busy}
            onClick={track}
          >
            Track this option
          </button>
        </div>
      )}
    </section>
  );
}