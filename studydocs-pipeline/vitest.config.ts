import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Integration/e2e suites share real Mongo/S3/SQS resources (see
    // docker-compose.yml); running test files in parallel causes one
    // file's afterEach cleanup to race with another file's assertions.
    fileParallelism: false,
  },
});
