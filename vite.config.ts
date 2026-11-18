import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 2000 },
  test: { include: ['src/**/*.test.ts', 'tests-ts/**/*.test.ts'] },
} as never);
