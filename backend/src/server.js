import cors from 'cors';
import express from 'express';
import { config } from './config.js';
import { apiRouter } from './routes/api.js';

const app = express();

app.use(cors({ origin: config.corsOrigins }));
app.use(express.json());

app.use('/api', apiRouter);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status ?? 500;

  if (status >= 500) {
    console.error(`[api] ${req.method} ${req.path}:`, err);
  }

  res.status(status).json({
    error:
      status >= 500 && !err.status
        ? 'Internal server error'
        : err.message,
  });
});

app.listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}`);
});