import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Live tests call real public job boards; they run only when CS_LIVE=1 (npm run test:live).
    exclude: process.env.CS_LIVE ? configDefaults.exclude : [...configDefaults.exclude, 'test/live/**'],
    pool: 'forks',
    setupFiles: ['test/setup/no-network.ts'],
    // Tests never touch the user's keychain; the keychain store has its own dedicated test.
    env: { CAREER_STRIKE_SECRET_STORE: 'file' },
    testTimeout: 20_000,
  },
});
