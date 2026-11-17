import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

config({ path: ['.env.test', '.env.local'] });

const testUrl = process.env.TEST_DATABASE_URL ?? '';
const prodUrl = process.env.DATABASE_URL ?? '';

if (!testUrl) throw new Error('TEST_DATABASE_URL is missing from .env.test. Run: npm run db:test:setup');
if (testUrl === prodUrl) throw new Error('TEST_DATABASE_URL matches DATABASE_URL. Refusing to migrate production.');

export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: testUrl },
});
