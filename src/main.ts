import { config } from 'dotenv';
config({ quiet: true });
import { INestApplication, Logger } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import { Pool } from 'pg';
import { buildOpenApi, createApp } from './bootstrap';
import { loadConfig } from './config';
import { PG_POOL } from './db/db.module';

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const blue = (s: string) => (useColor ? `\x1b[34m${s}\x1b[0m` : s);
const red = (s: string) => (useColor ? `\x1b[31m${s}\x1b[0m` : s);

/** Connect to the database before accepting requests. Fails fast if it is unreachable. */
async function connectDatabase(app: INestApplication): Promise<void> {
  const pool = app.get<Pool>(PG_POOL);
  const { rows } = await pool.query<{ db: string; usr: string; postgis: string }>(
    'SELECT current_database() AS db, current_user AS usr, postgis_version() AS postgis',
  );
  const { db, usr, postgis } = rows[0];
  const { hostname, port } = new URL(loadConfig().DATABASE_URL);
  Logger.log(
    blue(`Connected to database "${db}" as ${usr} on ${hostname}:${port || 5432} (PostGIS ${postgis.split(' ')[0]})`),
    'Database',
  );
}

async function main() {
  const config = loadConfig();
  const app = await createApp();
  try {
    await connectDatabase(app);
  } catch (e) {
    Logger.error(red(`Could not connect to the database: ${(e as Error).message}`), 'Database');
    Logger.error(red('Is Postgres.app running? Check DATABASE_URL in .env.'), 'Database');
    await app.close();
    process.exit(1);
  }
  if (config.NODE_ENV !== 'production') {
    SwaggerModule.setup('api/docs', app, buildOpenApi(app));
  }
  await app.listen(config.PORT);
  Logger.log(`API listening on :${config.PORT}`, 'Bootstrap');
}
main();
