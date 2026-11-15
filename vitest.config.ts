import { config } from 'dotenv';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

config({ path: ['.env.test', '.env.local'] });

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname) } },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 30_000,
  },
});
