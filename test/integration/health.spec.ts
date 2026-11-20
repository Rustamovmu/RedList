import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Pool } from 'pg';
import { createApp } from '../../src/bootstrap';
import { freshDatabase } from '../helpers';

let app: INestApplication;
let pool: Pool;

beforeAll(async () => {
  pool = await freshDatabase();
  app = await createApp();
  await app.init();
});
afterAll(async () => {
  await app.close();
  await pool.end();
});

it('GET /api/v1/health/live', async () => {
  const res = await request(app.getHttpServer()).get('/api/v1/health/live').expect(200);
  expect(res.body).toEqual({ status: 'ok' });
  expect(res.headers['x-request-id']).toBeDefined();
});

it('GET /api/v1/health/ready reports PostGIS', async () => {
  const res = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200);
  expect(res.body.postgis).toMatch(/^3\./);
});

it('unknown routes use the standard error shape', async () => {
  const res = await request(app.getHttpServer()).get('/api/v1/nope').expect(404);
  expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: expect.any(String) } });
});
