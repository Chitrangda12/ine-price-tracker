import { formatPrice, formatTime } from '../format.js';

const W = 640;
const H = 170;
const PAD = { top: 16, right: 16, bottom: 30, left: 96 };

export default function PriceChart({ points }) {
  if (points.length === 0) return null;

  if (points.length === 1) {
    return (
      <p className="muted small note">
        The chart appears after two successful scrapes.
      </p>
    );
  }

  const times = points.map((point) =>
    new Date(point.scraped_at).getTime(),
  );

  const prices = points.map((point) => point.price);
  const low = Math.min(...prices);
  const high = Math.max(...prices);

  const [min, max] =
    low === high
      ? [low * 0.98, high * 1.02]
      : [low, high];

  const x = (time) =>
    PAD.left +
    ((time - times[0]) /
      (times.at(-1) - times[0] || 1)) *
      (W - PAD.left - PAD.right);

  const y = (value) =>
    PAD.top +
    (1 - (value - min) / (max - min)) *
      (H - PAD.top - PAD.bottom);

  const line = points
    .map(
      (point, index) =>
        `${x(times[index]).toFixed(1)},${y(point.price).toFixed(1)}`,
    )
    .join(' ');

  const levels = low === high ? [low] : [high, low];

  return (
    <figure className="chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Price went from ${formatPrice(
          prices[0],
        )} to ${formatPrice(
          prices.at(-1),
        )} over ${points.length} scrapes`}
      >
        {levels.map((value) => (
          <g key={value}>
            <line
              className="grid"
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(value)}
              y2={y(value)}
            />
            <text
              x={PAD.left - 10}
              y={y(value)}
              textAnchor="end"
              dominantBaseline="middle"
            >
              {formatPrice(value)}
            </text>
          </g>
        ))}

        <text x={PAD.left} y={H - 8}>
          {formatTime(points[0].scraped_at)}
        </text>

        <text
          x={W - PAD.right}
          y={H - 8}
          textAnchor="end"
        >
          {formatTime(points.at(-1).scraped_at)}
        </text>

        <polyline className="line" points={line} />

        {points.map((point, index) => (
          <circle
            key={point.id}
            className="dot"
            cx={x(times[index])}
            cy={y(point.price)}
            r="4"
          >
            <title>
              {`${formatTime(point.scraped_at)}: ${formatPrice(
                point.price,
              )}, stock ${point.stock}`}
            </title>
          </circle>
        ))}
      </svg>
    </figure>
  );
}