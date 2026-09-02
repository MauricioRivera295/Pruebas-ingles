import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// El reconocimiento de voz corre en el servidor Express (server/index.js);
// el cliente solo consume /api/* durante desarrollo vía proxy.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
