const wholePrice = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const exactPrice = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
});

export const formatPrice = (value) => {
  if (value === null || value === undefined) {
    return '—';
  }

  return (Number.isInteger(value) ? wholePrice : exactPrice).format(
    value,
  );
};

export const formatStock = (value) => {
  if (value === null || value === undefined) {
    return '—';
  }

  return value === 0 ? 'Sold out' : String(value);
};

export const formatTime = (iso) =>
  iso
    ? new Date(iso).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : '—';