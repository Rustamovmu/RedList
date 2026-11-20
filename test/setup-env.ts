import { config } from 'dotenv';
import path from 'node:path';

config({ path: path.resolve(__dirname, '../.env.test'), override: true, quiet: true });
if (!process.env.DATABASE_URL?.includes('test')) {
  throw new Error('Refusing to run integration tests: DATABASE_URL in .env.test must point at a *test* database.');
}
