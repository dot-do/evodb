/**
 * Buffer Config Validation Tests
 *
 * Tests for validateParentConfig and BUFFER_CONFIG_BOUNDS.
 * Ensures config values are within acceptable bounds.
 */

import { describe, it, expect } from 'vitest';
import {
  validateParentConfig,
  BUFFER_CONFIG_BOUNDS,
  DEFAULT_PARENT_CONFIG,
  type ParentConfig,
} from '../types.js';

// =============================================================================
// BUFFER CONFIG BOUNDS
// =============================================================================

describe('BUFFER_CONFIG_BOUNDS', () => {
  it('should have sensible minimum values', () => {
    expect(BUFFER_CONFIG_BOUNDS.minBufferSize).toBe(1024);
    expect(BUFFER_CONFIG_BOUNDS.minFlushIntervalMs).toBe(100);
    expect(BUFFER_CONFIG_BOUNDS.minFlushThresholdEntries).toBe(1);
    expect(BUFFER_CONFIG_BOUNDS.minDeduplicationWindowMs).toBe(1000);
  });

  it('should have sensible maximum values', () => {
    expect(BUFFER_CONFIG_BOUNDS.maxBufferSize).toBe(1024 * 1024 * 1024); // 1GB
    expect(BUFFER_CONFIG_BOUNDS.maxFlushIntervalMs).toBe(3600_000); // 1 hour
    expect(BUFFER_CONFIG_BOUNDS.maxFlushThresholdEntries).toBe(1_000_000);
    expect(BUFFER_CONFIG_BOUNDS.maxDeduplicationWindowMs).toBe(3600_000);
  });
});

// =============================================================================
// VALIDATE PARENT CONFIG - VALID CONFIGS
// =============================================================================

describe('validateParentConfig - valid configs', () => {
  it('should accept default config', () => {
    const result = validateParentConfig(DEFAULT_PARENT_CONFIG);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should accept empty config (uses defaults)', () => {
    const result = validateParentConfig({});
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should accept minimum valid values', () => {
    const config: Partial<ParentConfig> = {
      flushThresholdEntries: BUFFER_CONFIG_BOUNDS.minFlushThresholdEntries,
      flushThresholdBytes: BUFFER_CONFIG_BOUNDS.minBufferSize,
      flushThresholdMs: BUFFER_CONFIG_BOUNDS.minFlushIntervalMs,
      flushIntervalMs: BUFFER_CONFIG_BOUNDS.minFlushIntervalMs,
      maxBufferSize: BUFFER_CONFIG_BOUNDS.minBufferSize,
      maxFallbackSize: BUFFER_CONFIG_BOUNDS.minBufferSize,
      deduplicationWindowMs: BUFFER_CONFIG_BOUNDS.minDeduplicationWindowMs,
    };
    const result = validateParentConfig(config);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should accept maximum valid values', () => {
    const config: Partial<ParentConfig> = {
      flushThresholdEntries: BUFFER_CONFIG_BOUNDS.maxFlushThresholdEntries,
      flushThresholdBytes: BUFFER_CONFIG_BOUNDS.maxBufferSize,
      flushThresholdMs: BUFFER_CONFIG_BOUNDS.maxFlushIntervalMs,
      flushIntervalMs: BUFFER_CONFIG_BOUNDS.maxFlushIntervalMs,
      maxBufferSize: BUFFER_CONFIG_BOUNDS.maxBufferSize,
      maxFallbackSize: BUFFER_CONFIG_BOUNDS.maxBufferSize,
      deduplicationWindowMs: BUFFER_CONFIG_BOUNDS.maxDeduplicationWindowMs,
    };
    const result = validateParentConfig(config);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

// =============================================================================
// VALIDATE PARENT CONFIG - INVALID VALUES
// =============================================================================

describe('validateParentConfig - invalid values', () => {
  describe('flushThresholdEntries', () => {
    it('should reject zero', () => {
      const result = validateParentConfig({ flushThresholdEntries: 0 });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('flushThresholdEntries');
    });

    it('should reject negative values', () => {
      const result = validateParentConfig({ flushThresholdEntries: -1 });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('flushThresholdEntries');
    });

    it('should reject non-integers', () => {
      const result = validateParentConfig({ flushThresholdEntries: 1.5 });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('flushThresholdEntries');
    });

    it('should reject values exceeding max', () => {
      const result = validateParentConfig({
        flushThresholdEntries: BUFFER_CONFIG_BOUNDS.maxFlushThresholdEntries + 1,
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('flushThresholdEntries');
    });
  });

  describe('flushThresholdBytes', () => {
    it('should reject zero', () => {
      const result = validateParentConfig({ flushThresholdBytes: 0 });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('flushThresholdBytes');
    });

    it('should reject negative values', () => {
      const result = validateParentConfig({ flushThresholdBytes: -1024 });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('flushThresholdBytes');
    });

    it('should reject values below minimum', () => {
      const result = validateParentConfig({
        flushThresholdBytes: BUFFER_CONFIG_BOUNDS.minBufferSize - 1,
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('flushThresholdBytes');
    });

    it('should reject values exceeding max', () => {
      const result = validateParentConfig({
        flushThresholdBytes: BUFFER_CONFIG_BOUNDS.maxBufferSize + 1,
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('flushThresholdBytes');
    });
  });

  describe('flushThresholdMs', () => {
    it('should reject zero', () => {
      const result = validateParentConfig({ flushThresholdMs: 0 });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('flushThresholdMs');
    });

    it('should reject values below minimum', () => {
      const result = validateParentConfig({
        flushThresholdMs: BUFFER_CONFIG_BOUNDS.minFlushIntervalMs - 1,
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('flushThresholdMs');
    });

    it('should reject values exceeding max', () => {
      const result = validateParentConfig({
        flushThresholdMs: BUFFER_CONFIG_BOUNDS.maxFlushIntervalMs + 1,
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('flushThresholdMs');
    });
  });

  describe('flushIntervalMs', () => {
    it('should reject zero', () => {
      const result = validateParentConfig({ flushIntervalMs: 0 });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('flushIntervalMs');
    });

    it('should reject values below minimum', () => {
      const result = validateParentConfig({
        flushIntervalMs: BUFFER_CONFIG_BOUNDS.minFlushIntervalMs - 1,
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('flushIntervalMs');
    });

    it('should reject values exceeding max', () => {
      const result = validateParentConfig({
        flushIntervalMs: BUFFER_CONFIG_BOUNDS.maxFlushIntervalMs + 1,
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('flushIntervalMs');
    });
  });

  describe('maxBufferSize', () => {
    it('should reject zero', () => {
      const result = validateParentConfig({ maxBufferSize: 0 });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('maxBufferSize');
    });

    it('should reject values below minimum', () => {
      const result = validateParentConfig({
        maxBufferSize: BUFFER_CONFIG_BOUNDS.minBufferSize - 1,
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('maxBufferSize');
    });

    it('should reject values exceeding max', () => {
      const result = validateParentConfig({
        maxBufferSize: BUFFER_CONFIG_BOUNDS.maxBufferSize + 1,
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('maxBufferSize');
    });
  });

  describe('maxFallbackSize', () => {
    it('should reject zero', () => {
      const result = validateParentConfig({ maxFallbackSize: 0 });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('maxFallbackSize');
    });

    it('should reject values below minimum', () => {
      const result = validateParentConfig({
        maxFallbackSize: BUFFER_CONFIG_BOUNDS.minBufferSize - 1,
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('maxFallbackSize');
    });

    it('should reject values exceeding max', () => {
      const result = validateParentConfig({
        maxFallbackSize: BUFFER_CONFIG_BOUNDS.maxBufferSize + 1,
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('maxFallbackSize');
    });
  });

  describe('deduplicationWindowMs', () => {
    it('should reject zero', () => {
      const result = validateParentConfig({ deduplicationWindowMs: 0 });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('deduplicationWindowMs');
    });

    it('should reject values below minimum', () => {
      const result = validateParentConfig({
        deduplicationWindowMs: BUFFER_CONFIG_BOUNDS.minDeduplicationWindowMs - 1,
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('deduplicationWindowMs');
    });

    it('should reject values exceeding max', () => {
      const result = validateParentConfig({
        deduplicationWindowMs: BUFFER_CONFIG_BOUNDS.maxDeduplicationWindowMs + 1,
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('deduplicationWindowMs');
    });
  });
});

// =============================================================================
// VALIDATE PARENT CONFIG - CROSS-FIELD VALIDATIONS
// =============================================================================

describe('validateParentConfig - cross-field validations', () => {
  it('should reject flushThresholdBytes > maxBufferSize', () => {
    const result = validateParentConfig({
      maxBufferSize: 1024 * 1024, // 1MB
      flushThresholdBytes: 2 * 1024 * 1024, // 2MB
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('flushThresholdBytes') && e.includes('maxBufferSize'))).toBe(true);
  });

  it('should reject maxFallbackSize > maxBufferSize', () => {
    const result = validateParentConfig({
      maxBufferSize: 1024 * 1024, // 1MB
      maxFallbackSize: 2 * 1024 * 1024, // 2MB
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('maxFallbackSize') && e.includes('maxBufferSize'))).toBe(true);
  });

  it('should allow flushThresholdBytes == maxBufferSize', () => {
    const size = 10 * 1024 * 1024; // 10MB
    const result = validateParentConfig({
      maxBufferSize: size,
      flushThresholdBytes: size,
    });
    expect(result.valid).toBe(true);
  });

  it('should allow maxFallbackSize == maxBufferSize', () => {
    const size = 10 * 1024 * 1024; // 10MB
    const result = validateParentConfig({
      maxBufferSize: size,
      maxFallbackSize: size,
    });
    expect(result.valid).toBe(true);
  });

  it('should use default maxBufferSize for cross-field validation when not provided', () => {
    // flushThresholdBytes larger than default maxBufferSize should fail
    const result = validateParentConfig({
      flushThresholdBytes: DEFAULT_PARENT_CONFIG.maxBufferSize + 1024,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('flushThresholdBytes') && e.includes('maxBufferSize'))).toBe(true);
  });
});

// =============================================================================
// VALIDATE PARENT CONFIG - MULTIPLE ERRORS
// =============================================================================

describe('validateParentConfig - multiple errors', () => {
  it('should report all errors when multiple fields are invalid', () => {
    const result = validateParentConfig({
      flushThresholdEntries: -1,
      flushThresholdBytes: -1,
      flushIntervalMs: -1,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });

  it('should report both field-level and cross-field errors', () => {
    const result = validateParentConfig({
      maxBufferSize: 1024, // Valid but small
      flushThresholdBytes: 2048, // > maxBufferSize
      flushThresholdEntries: -1, // Invalid
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });
});
