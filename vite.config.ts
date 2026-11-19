import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 2000 },
  test: { include: ['src/**/*.test.ts'], testTimeout: 120000 },
} as never);
