import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { msw } from 'msw/vite';
import path from 'node:path';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  // Serve from a sub-path when set (the demo on GitHub Pages: `/<repo>/`).
  base: process.env.BASE_PATH ?? '/',
  plugins: [
    react(),
    tailwindcss(),
    // The backend-less demo (`--mode demo`) serves and emits the MSW worker script.
    {
      ...msw({ mode: 'worker-only' }),
      apply: (_, { mode }) => mode === 'demo',
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
});
