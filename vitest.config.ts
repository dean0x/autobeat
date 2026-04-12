import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'], // Global test setup for cleanup
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/index.ts',
        'vitest.config.ts',
        'tests/**/*'
      ]
    },
    testTimeout: 30000, // Increased for integration tests
    hookTimeout: 30000,
    include: [
      'src/**/*.test.{ts,tsx}',
      'tests/**/*.test.{ts,tsx}'
    ],
    exclude: [
      'node_modules',
      'dist',
      '.git'
    ],
    pool: 'forks',
    maxWorkers: 1, // CRITICAL: Single worker to prevent resource exhaustion
    // Kill and replace worker forks when they exceed 1GB.
    // With pool: 'forks', this is a hard kill — OS reclaims all memory instantly.
    vmMemoryLimit: '1024MB',
    // CRITICAL: Run ALL tests sequentially to prevent crashes
    sequence: {
      concurrent: false,
      shuffle: false
    },
    // CRITICAL: Disable parallel test execution within files
    fileParallelism: false,
    // Module cache shared within each fork's lifetime for performance.
    // Safe: vmMemoryLimit kills and replaces forks, so accumulation is bounded.
    isolate: false
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
});