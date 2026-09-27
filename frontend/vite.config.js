import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    // In local development, /api calls go to the Express backend.
    proxy: { '/api': 'http://localhost:4000' },
  },
});
