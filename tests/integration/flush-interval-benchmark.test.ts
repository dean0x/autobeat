/**
 * Integration test: outputFlushIntervalMs default lowered to 1000ms (v1.3.0)
 *
 * ARCHITECTURE: Verifies that the new default (1000ms) is reflected in a
 * loaded configuration with no env overrides.
 *
 * Pattern: Configuration loading — no real process spawning.
 * Rationale: The dashboard redesign requires sub-second flush cadence for
 * real-time output streaming. The default was lowered from 5000ms to 1000ms.
 */

import { describe, expect, it } from 'vitest';
import { ConfigurationSchema } from '../../src/core/configuration.js';

describe('outputFlushIntervalMs default (v1.3.0)', () => {
  it('schema default should be 1000ms', () => {
    // Parse an empty object to get all schema defaults
    const defaults = ConfigurationSchema.parse({});
    expect(defaults.outputFlushIntervalMs).toBe(1000);
  });

  it('default should be lower than the previous 5000ms default', () => {
    const defaults = ConfigurationSchema.parse({});
    expect(defaults.outputFlushIntervalMs).toBeLessThan(5000);
  });

  it('default should be within the valid range [500, 30000]ms', () => {
    const defaults = ConfigurationSchema.parse({});
    expect(defaults.outputFlushIntervalMs).toBeGreaterThanOrEqual(500);
    expect(defaults.outputFlushIntervalMs).toBeLessThanOrEqual(30000);
  });

  it('accepts custom override of 500ms (minimum)', () => {
    const result = ConfigurationSchema.safeParse({ outputFlushIntervalMs: 500 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.outputFlushIntervalMs).toBe(500);
    }
  });

  it('rejects values below 500ms', () => {
    const result = ConfigurationSchema.safeParse({ outputFlushIntervalMs: 499 });
    expect(result.success).toBe(false);
  });
});
