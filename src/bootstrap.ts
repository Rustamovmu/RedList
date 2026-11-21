import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { loadConfig } from './config';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { installBigIntJson } from './common/json';
import { requestId } from './common/request-id.middleware';

/** Shared by main.ts, the tests and the OpenAPI export, so all three see the same app. */
export async function createApp(): Promise<INestApplication> {
  installBigIntJson();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: process.env.NODE_ENV === 'test' ? false : ['error', 'warn', 'log'] });
  app.setGlobalPrefix('api/v1');
  // Behind the Next.js rewrite (dev) or Nginx (prod): trust only those proxies, so req.ip is the real client
  // address for login rate limiting (TRUST_PROXY, DECISIONS D-030).
  const trustProxy = loadConfig().TRUST_PROXY.split(',').map((s) => s.trim());
  (app.getHttpAdapter().getInstance() as { set: (k: string, v: unknown) => void }).set('trust proxy', trustProxy);
  // Range polygons travel in draft saves; Express's 100 kB default is too small for them (DECISIONS D-016).
  app.useBodyParser('json', { limit: '2mb' });
  app.use(requestId);
  app.use(helmet(apiHelmetOptions(process.env.NODE_ENV === 'production')));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableShutdownHooks();
  return app;
}

/**
 * Security headers for API responses (M5, DECISIONS D-029). The API serves JSON and WebP only, so in
 * production its CSP allows nothing to load or run. Swagger UI (non-production only) keeps Helmet's default CSP.
 * HSTS is left to Nginx, where TLS ends, so its max-age can be raised step by step (docs/DEPLOYMENT.md).
 */
export function apiHelmetOptions(production: boolean): Parameters<typeof helmet>[0] {
  return {
    hsts: false,
    frameguard: { action: 'deny' },
    contentSecurityPolicy: production
      ? { useDefaults: false, directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"], formAction: ["'none'"] } }
      : undefined,
  };
}

export function buildOpenApi(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Wildward API')
    .setDescription('Public catalogue and staff editorial API (R1). Population counts are strings (bigint). Staff routes need the session cookie; mutations also need Origin and x-csrf-token.')
    .setVersion('0.1.0')
    .addCookieAuth('ww_session')
    .build();
  return SwaggerModule.createDocument(app, config);
}
