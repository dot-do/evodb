/**
 * Simplified Circuit Breaker for Cloudflare Workers
 * Issue: evodb-7d8 - Simplify circuit-breaker.ts for edge execution model
 *
 * This is a lightweight circuit breaker optimized for Cloudflare Workers' ephemeral
 * execution model. Instead of a full CLOSED -> OPEN -> HALF_OPEN state machine,
 * it uses a simple failure counter with exponential backoff.
 *
 * Key differences from traditional circuit breakers:
 * - No HALF_OPEN state (Workers are ephemeral, complex recovery probing is overkill)
 * - Simple exponential backoff instead of fixed reset timeout
 * - Minimal state tracking (failures + backoffUntil)
 * - ~150 lines instead of ~500 lines
 *
 * @example
 * ```typescript
 * const breaker = new CircuitBreaker({ failureThreshold: 5, maxBackoffMs: 30000 });
 * const result = await breaker.execute(() => fetchFromR2(key));
 * ```
 */

import type { Storage, StorageMetadata } from './storage.js';
import {
  DEFAULT_CIRCUIT_BREAKER_FAILURE_THRESHOLD,
  DEFAULT_CIRCUIT_BREAKER_RESET_TIMEOUT_MS,
} from './constants.js';

// =============================================================================
// Types and Constants
// =============================================================================

/**
 * Circuit breaker states (simplified: only CLOSED and OPEN)
 * HALF_OPEN is kept for backward compatibility but maps to CLOSED after backoff expires
 */
export enum CircuitState {
  /** Normal operation - requests pass through */
  CLOSED = 'CLOSED',
  /** Circuit tripped - requests fail fast during backoff period */
  OPEN = 'OPEN',
  /** @deprecated Kept for backward compatibility, behaves like CLOSED */
  HALF_OPEN = 'HALF_OPEN',
}

/**
 * Time provider interface for testability
 */
export interface MonotonicTimeProvider {
  now(): number;
}

export const defaultMonotonicTimeProvider: MonotonicTimeProvider = {
  now: () => performance.now(),
};

/**
 * Circuit breaker configuration options
 */
export interface CircuitBreakerOptions {
  /** Number of consecutive failures before opening circuit (default: 5) */
  failureThreshold?: number;
  /** @deprecated Use maxBackoffMs instead. Kept for backward compatibility */
  resetTimeoutMs?: number;
  /** Maximum backoff time in ms (default: 30000) */
  maxBackoffMs?: number;
  /** @deprecated Ignored in simplified implementation */
  halfOpenMaxAttempts?: number;
  /** Custom predicate to determine if an error should count as a failure */
  isFailure?: (error: unknown) => boolean;
  /** Custom time provider (for testing) */
  timeProvider?: MonotonicTimeProvider;
}

/**
 * Circuit breaker statistics
 */
export interface CircuitBreakerStats {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  totalFailureCount: number;
  rejectedCount: number;
  lastOpenedAt?: number;
  lastClosedAt?: number;
}

// =============================================================================
// CircuitBreakerError
// =============================================================================

/**
 * Error thrown when circuit is open and request is rejected
 */
export class CircuitBreakerError extends Error {
  readonly isCircuitBreakerError = true;
  readonly circuitState: CircuitState;

  constructor(message: string, state: CircuitState) {
    super(message);
    this.name = 'CircuitBreakerError';
    this.circuitState = state;
  }
}

// =============================================================================
// CircuitBreaker Implementation
// =============================================================================

/**
 * Simplified circuit breaker using failure counter + exponential backoff.
 * Optimized for Cloudflare Workers' ephemeral execution model.
 */
export class CircuitBreaker {
  private failures = 0;
  private backoffUntil = 0;
  private successCount = 0;
  private totalFailureCount = 0;
  private rejectedCount = 0;
  private lastOpenedAt?: number;
  private lastClosedAt?: number;

  private readonly failureThreshold: number;
  private readonly maxBackoffMs: number;
  private readonly isFailure: (error: unknown) => boolean;
  private readonly timeProvider: MonotonicTimeProvider;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? DEFAULT_CIRCUIT_BREAKER_FAILURE_THRESHOLD;
    this.maxBackoffMs = options.maxBackoffMs ?? options.resetTimeoutMs ?? DEFAULT_CIRCUIT_BREAKER_RESET_TIMEOUT_MS;
    this.isFailure = options.isFailure ?? (() => true);
    this.timeProvider = options.timeProvider ?? defaultMonotonicTimeProvider;
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    const now = this.timeProvider.now();

    // Check if we're in backoff period
    if (now < this.backoffUntil) {
      this.rejectedCount++;
      throw new CircuitBreakerError('Circuit breaker is open - request rejected', CircuitState.OPEN);
    }

    try {
      const result = await operation();
      // Success - reset failure count
      this.failures = 0;
      this.backoffUntil = 0;
      this.successCount++;
      if (this.lastOpenedAt !== undefined) {
        this.lastClosedAt = Date.now();
      }
      return result;
    } catch (error) {
      if (this.isFailure(error)) {
        this.failures++;
        this.totalFailureCount++;

        if (this.failures >= this.failureThreshold) {
          // Calculate exponential backoff: min(1000 * 2^failures, maxBackoffMs)
          const backoffMs = Math.min(1000 * Math.pow(2, this.failures - this.failureThreshold), this.maxBackoffMs);
          this.backoffUntil = now + backoffMs;
          this.lastOpenedAt = Date.now();
        }
      }
      throw error;
    }
  }

  getState(): CircuitState {
    const now = this.timeProvider.now();
    return now < this.backoffUntil ? CircuitState.OPEN : CircuitState.CLOSED;
  }

  getFailureCount(): number {
    return this.failures;
  }

  getStats(): CircuitBreakerStats {
    return {
      state: this.getState(),
      failureCount: this.failures,
      successCount: this.successCount,
      totalFailureCount: this.totalFailureCount,
      rejectedCount: this.rejectedCount,
      lastOpenedAt: this.lastOpenedAt,
      lastClosedAt: this.lastClosedAt,
    };
  }

  reset(): void {
    this.failures = 0;
    this.backoffUntil = 0;
    this.lastClosedAt = Date.now();
  }

  trip(): void {
    this.backoffUntil = this.timeProvider.now() + this.maxBackoffMs;
    this.lastOpenedAt = Date.now();
  }
}

// =============================================================================
// CircuitBreakerStorage - Storage Wrapper
// =============================================================================

/**
 * Storage wrapper with circuit breaker protection
 */
export class CircuitBreakerStorage implements Storage {
  private readonly storage: Storage;
  private readonly breaker: CircuitBreaker;

  constructor(storage: Storage, options: CircuitBreakerOptions = {}) {
    this.storage = storage;
    this.breaker = new CircuitBreaker(options);
  }

  async read(path: string): Promise<Uint8Array | null> {
    return this.breaker.execute(() => this.storage.read(path));
  }

  async write(path: string, data: Uint8Array): Promise<void> {
    return this.breaker.execute(() => this.storage.write(path, data));
  }

  async list(prefix: string): Promise<{ paths: string[] }> {
    return this.breaker.execute(() => this.storage.list(prefix));
  }

  async delete(path: string): Promise<void> {
    return this.breaker.execute(() => this.storage.delete(path));
  }

  async exists(path: string): Promise<boolean> {
    if (this.storage.exists) {
      return this.breaker.execute(() => this.storage.exists!(path));
    }
    const data = await this.read(path);
    return data !== null;
  }

  async head(path: string): Promise<StorageMetadata | null> {
    if (this.storage.head) {
      return this.breaker.execute(() => this.storage.head!(path));
    }
    return null;
  }

  async readRange(path: string, offset: number, length: number): Promise<Uint8Array> {
    if (this.storage.readRange) {
      return this.breaker.execute(() => this.storage.readRange!(path, offset, length));
    }
    const data = await this.read(path);
    if (!data) throw new Error(`Object not found: ${path}`);
    const start = offset < 0 ? data.length + offset : offset;
    return data.slice(start, start + length);
  }

  getCircuitState(): CircuitState {
    return this.breaker.getState();
  }

  getFailureCount(): number {
    return this.breaker.getFailureCount();
  }

  getStats(): CircuitBreakerStats {
    return this.breaker.getStats();
  }

  resetCircuit(): void {
    this.breaker.reset();
  }

  tripCircuit(): void {
    this.breaker.trip();
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createCircuitBreakerStorage(
  storage: Storage,
  options?: CircuitBreakerOptions
): CircuitBreakerStorage {
  return new CircuitBreakerStorage(storage, options);
}
