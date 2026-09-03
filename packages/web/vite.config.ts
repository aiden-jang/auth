/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 34110,
    // In dev the auth Worker runs on :34100; proxy so the UI is same-origin with the API
    // and the session cookie flows without CORS.
    proxy: {
      '/auth': { target: 'http://localhost:34100', changeOrigin: true },
      '/health': { target: 'http://localhost:34100', changeOrigin: true },
    },
  },
  test: {
    // Everything except e2e/, which is Playwright's: calling its test() from vitest throws.
    include: ['{src,test}/**/*.test.{ts,tsx}'],
  },
});
