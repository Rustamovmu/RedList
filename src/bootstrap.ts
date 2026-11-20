import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { installBigIntJson } from './common/json';
import { requestId } from './common/request-id.middleware';

/** Shared by main.ts, the tests and the OpenAPI export, so all three see the same app. */
export async function createApp(): Promise<INestApplication> {
  installBigIntJson();
  const app = await NestFactory.create(AppModule, { logger: process.env.NODE_ENV === 'test' ? false : ['error', 'warn', 'log'] });
  app.setGlobalPrefix('api/v1');
  app.use(requestId);
  app.use(helmet());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableShutdownHooks();
  return app;
}

export function buildOpenApi(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Wildward API')
    .setDescription('Public catalogue and staff editorial API (R1). Population counts are strings (bigint).')
    .setVersion('0.1.0')
    .build();
  return SwaggerModule.createDocument(app, config);
}
