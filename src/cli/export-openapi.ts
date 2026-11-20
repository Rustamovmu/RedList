/** Writes openapi.json. The frontend generates its types from this file (npm run contracts:generate there). */
import { config } from 'dotenv';
config({ quiet: true });
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildOpenApi, createApp } from '../bootstrap';

async function main() {
  const app = await createApp();
  const out = path.resolve(__dirname, '../../openapi.json');
  writeFileSync(out, JSON.stringify(buildOpenApi(app), null, 2) + '\n');
  await app.close();
  console.log(`wrote ${out}`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
