import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Strict CSP for the production build (dev needs inline scripts for React Fast Refresh)
const csp = {
  name: 'inject-csp',
  apply: 'build',
  transformIndexHtml: () => [{
    tag: 'meta',
    attrs: {
      'http-equiv': 'Content-Security-Policy',
      content: "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'",
    },
    injectTo: 'head-prepend',
  }],
};

export default defineConfig({
  base: './', // required for loading dist/index.html via file://
  plugins: [react(), tailwindcss(), csp],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true },
});
