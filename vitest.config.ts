import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Unit tests are offline and fast. Testnet integration tests live in tests/testnet and
// run only through `npm run test:testnet` (vitest --mode testnet), because they hit friendbot and Horizon.
export default defineConfig(({ mode }) => {
  // 'testnet' runs the live suites; 'capture' runs only the fixture capture (also live).
  const testnet = mode === 'testnet' || mode === 'capture';
  const include =
    mode === 'capture'
      ? ['tests/testnet/capture.test.ts']
      : testnet
        ? ['tests/testnet/credit.test.ts']
        : ['src/**/*.test.ts', 'tests/unit/**/*.test.ts'];
  return {
    resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
    test: {
      include,
      testTimeout: testnet ? 120_000 : 5_000,
      hookTimeout: testnet ? 120_000 : 10_000,
      fileParallelism: !testnet,
    },
  };
});
