import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Dev server proxies API calls to the Fastify backend (localhost:3000) so
// the browser only ever talks to one origin and CORS never comes up. The
// production build is static output that Fastify serves itself.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/documents': 'http://localhost:3000',
      '/search': 'http://localhost:3000',
      '/health': 'http://localhost:3000',
    },
  },
  build: {
    outDir: 'dist',
  },
});
