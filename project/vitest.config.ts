import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    pool: 'threads',
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
    },
  },
});
