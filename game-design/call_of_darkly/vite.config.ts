import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  server: { port: 5173 },
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 1000 },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
