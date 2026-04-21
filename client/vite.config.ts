import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    target: "ES2020",
    outDir: "dist",
    sourcemap: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3005'
    }
  }
});
