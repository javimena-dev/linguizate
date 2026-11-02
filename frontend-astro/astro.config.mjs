// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  output: 'static',
  server: {
    port: 4321
  },
  vite: {
    server: {
      proxy: {
        '/sanctum': {
          target: 'http://localhost:8000',
          changeOrigin: true
        },
        '/api/auth': {
          target: 'http://localhost:8000',
          changeOrigin: true
        },
        '/api/chat': {
          target: 'http://localhost:8000',
          changeOrigin: true
        },
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true
        }
      }
    }
  }
});
