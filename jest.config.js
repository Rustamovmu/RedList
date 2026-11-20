/** Integration tests run against a real PostgreSQL+PostGIS database (DATABASE_URL in .env.test). */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/test/**/*.spec.ts'],
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  testTimeout: 30000,
};
