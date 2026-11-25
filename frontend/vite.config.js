import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the API runs on :8000; Vite forwards /api and /uploads to it.
const proxy = { '/api': 'http://localhost:8000', '/uploads': 'http://localhost:8000' };

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy },
  preview: { port: 4173, proxy },
});
