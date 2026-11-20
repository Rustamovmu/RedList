/**
 * npm run validate:catalogue: the PLAN §11 quality report over everything that is published.
 * Prints a Markdown report and exits 1 if any check fails.
 */
import { config } from 'dotenv';
config({ quiet: true });
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { validateCatalogue, validationMarkdown } from '../quality/validate-catalogue';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    const results = await validateCatalogue(app);
    const species = results.find((r) => r.key === 'checklist')?.checked ?? 0;
    console.log(validationMarkdown(results, species));
    if (results.some((r) => r.failures.length)) process.exitCode = 1;
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
