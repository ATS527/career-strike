import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Live tests call real public job boards; they run only when CS_LIVE=1 (npm run test:live).
    exclude: process.env.CS_LIVE ? configDefaults.exclude : [...configDefaults.exclude, 'test/live/**'],
    pool: 'forks',
    testTimeout: 20_000,
  },
});
