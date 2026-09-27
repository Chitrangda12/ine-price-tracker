export class ScrapeError extends Error {
  constructor(code, message, { retryable = true } = {}) {
    super(message);
    this.name = 'ScrapeError';
    this.code = code;
    this.retryable = retryable;
  }
}

export function toScrapeError(error) {
  if (error instanceof ScrapeError) return error;

  const firstLine = String(error?.message ?? error).split('\n')[0];

  if (error?.name === 'TimeoutError') {
    return new ScrapeError('TIMEOUT', firstLine);
  }

  return new ScrapeError('UNEXPECTED', firstLine);
}