/**
 * Circuit Breaker for R2 Storage Operations
 * Issue: evodb-9t6 - TDD: Add R2 circuit breakers
 *
 * Implements the circuit breaker pattern for resilient R2 storage operations.
 * Protects against cascading failures by opening the circuit after a threshold
 * of consecutive failures, then entering half-open state to probe for recovery.
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Circuit tripped, requests fail fast without calling backend
 * - HALF_OPEN: Probing for recovery, limited requests allowed
 *
 * @example
 * ```typescript
 * // Wrap R2Storage with circuit breaker
 * const r2Storage = new R2Storage(env.MY_BUCKET);
 * const resilientStorage = createCircuitBreakerStorage(r2Storage, {
 *   failureThreshold: 5,
 *   resetTimeoutMs: 30000,
 * });
 *
 * // Use like normal Storage interface
 * await resilientStorage.write('data.bin', data);
 * const result = await resilientStorage.read('data.bin');
 * ```
 */

import type { Storage, StorageMetadata } from './storage.js';

// =============================================================================
// Types and Constants
// =============================================================================

/**
 * Circuit breaker states
 */
export enum CircuitState {
  /** Normal operation - requests pass through */
  CLOSED = 'CLOSED',
  /** Circuit tripped - requests fail fast */
  OPEN = 'OPEN',
  /** Probing for recovery - limited requests allowed */
  HALF_OPEN = 'HALF_OPEN',
}

/**
 * Circuit breaker configuration options
 */
export interface CircuitBreakerOptions {
  /** Number of consecutive failures before opening circuit (default: 5) */
  failureThreshold?: number;
  /** Time in ms to wait before transitioning from OPEN to HALF_OPEN (default: 30000) */
  resetTimeoutMs?: number;
  /** Number of successful requests in HALF_OPEN before closing circuit (default: 1) */
  halfOpenMaxAttempts?: number;
  /** Custom predicate to determine if an error should count as a failure */
  isFailure?: (error: unknown) => boolean;
}

/**
 * Circuit breaker statistics
 */
export interface CircuitBreakerStats {
  /** Current state of the circuit */
  state: CircuitState;
  /** Current consecutive failure count */
  failureCount: number;
  /** Total successful operations */
  successCount: number;
  /** Total failed operations */
  totalFailureCount: number;
  /** Operations rejected due to open circuit */
  rejectedCount: number;
  /** Timestamp when circuit was last opened */
  lastOpenedAt?: number;
  /** Timestamp when circuit was last closed */
  lastClosedAt?: number;
}

// Default configuration values
const DEFAULT_FAILURE_THRESHOLD = 5;
const DEFAULT_RESET_TIMEOUT_MS = 30000;
const DEFAULT_HALF_OPEN_MAX_ATTEMPTS = 1;

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
 * Generic circuit breaker that can wrap any async operation.
 *
 * @example
 * ```typescript
 * const breaker = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 5000 });
 *
 * // Wrap operations
 * const result = await breaker.execute(() => fetchFromR2(key));
 * ```
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private totalFailureCount = 0;
  private rejectedCount = 0;
  private lastOpenedAt?: number;
  private lastClosedAt?: number;
  private halfOpenAttempts = 0;

  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly halfOpenMaxAttempts: number;
  private readonly isFailure: (error: unknown) => boolean;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
    this.resetTimeoutMs = options.resetTimeoutMs ?? DEFAULT_RESET_TIMEOUT_MS;
    this.halfOpenMaxAttempts = options.halfOpenMaxAttempts ?? DEFAULT_HALF_OPEN_MAX_ATTEMPTS;
    this.isFailure = options.isFailure ?? (() => true);
  }

  /**
   * Execute an operation through the circuit breaker
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Check state before executing
    this.updateState();

    if (this.state === CircuitState.OPEN) {
      this.rejectedCount++;
      throw new CircuitBreakerError(
        'Circuit breaker is open - request rejected',
        this.state
      );
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    this.updateState();
    return this.state;
  }

  /**
   * Get current failure count
   */
  getFailureCount(): number {
    return this.failureCount;
  }

  /**
   * Get circuit breaker statistics
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.getState(),
      failureCount: this.failureCount,
      successCount: this.successCount,
      totalFailureCount: this.totalFailureCount,
      rejectedCount: this.rejectedCount,
      lastOpenedAt: this.lastOpenedAt,
      lastClosedAt: this.lastClosedAt,
    };
  }

  /**
   * Manually reset the circuit breaker to CLOSED state
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.halfOpenAttempts = 0;
    this.lastClosedAt = Date.now();
  }

  /**
   * Manually trip the circuit breaker to OPEN state
   */
  trip(): void {
    this.state = CircuitState.OPEN;
    this.lastOpenedAt = Date.now();
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Update state based on time (OPEN -> HALF_OPEN transition)
   */
  private updateState(): void {
    if (this.state === CircuitState.OPEN && this.lastOpenedAt) {
      const elapsed = Date.now() - this.lastOpenedAt;
      if (elapsed >= this.resetTimeoutMs) {
        this.state = CircuitState.HALF_OPEN;
        this.halfOpenAttempts = 0;
      }
    }
  }

  /**
   * Handle successful operation
   */
  private onSuccess(): void {
    this.successCount++;

    if (this.state === CircuitState.HALF_OPEN) {
      this.halfOpenAttempts++;
      if (this.halfOpenAttempts >= this.halfOpenMaxAttempts) {
        // Successful recovery - close circuit
        this.state = CircuitState.CLOSED;
        this.failureCount = 0;
        this.halfOpenAttempts = 0;
        this.lastClosedAt = Date.now();
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Reset failure count on success in CLOSED state
      this.failureCount = 0;
    }
  }

  /**
   * Handle failed operation
   */
  private onFailure(error: unknown): void {
    // Check if this error should count as a failure
    if (!this.isFailure(error)) {
      return;
    }

    this.failureCount++;
    this.totalFailureCount++;

    if (this.state === CircuitState.HALF_OPEN) {
      // Failed probe - return to OPEN state
      this.state = CircuitState.OPEN;
      this.lastOpenedAt = Date.now();
    } else if (this.state === CircuitState.CLOSED) {
      // Check if we should trip the circuit
      if (this.failureCount >= this.failureThreshold) {
        this.state = CircuitState.OPEN;
        this.lastOpenedAt = Date.now();
      }
    }
  }
}

// =============================================================================
// CircuitBreakerStorage - Storage Wrapper
// =============================================================================

/**
 * Storage implementation that wraps another Storage with circuit breaker protection.
 * Implements the full Storage interface and can be used as a drop-in replacement.
 *
 * @example
 * ```typescript
 * const r2Storage = new R2Storage(env.MY_BUCKET);
 * const protected = new CircuitBreakerStorage(r2Storage, {
 *   failureThreshold: 5,
 *   resetTimeoutMs: 30000,
 * });
 *
 * // Use like normal Storage
 * await protected.write('key', data);
 * ```
 */
export class CircuitBreakerStorage implements Storage {
  private readonly storage: Storage;
  private readonly breaker: CircuitBreaker;

  constructor(storage: Storage, options: CircuitBreakerOptions = {}) {
    this.storage = storage;
    this.breaker = new CircuitBreaker(options);
  }

  // ===========================================================================
  // Storage Interface Implementation
  // ===========================================================================

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
    // Fallback: read and check if null
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
    // Fallback: read full file and slice
    const data = await this.read(path);
    if (!data) {
      throw new Error(`Object not found: ${path}`);
    }
    let start = offset;
    if (start < 0) {
      start = data.length + offset;
    }
    return data.slice(start, start + length);
  }

  // ===========================================================================
  // Circuit Breaker Controls
  // ===========================================================================

  /**
   * Get current circuit state
   */
  getCircuitState(): CircuitState {
    return this.breaker.getState();
  }

  /**
   * Get current failure count
   */
  getFailureCount(): number {
    return this.breaker.getFailureCount();
  }

  /**
   * Get circuit breaker statistics
   */
  getStats(): CircuitBreakerStats {
    return this.breaker.getStats();
  }

  /**
   * Manually reset the circuit breaker
   */
  resetCircuit(): void {
    this.breaker.reset();
  }

  /**
   * Manually trip the circuit breaker
   */
  tripCircuit(): void {
    this.breaker.trip();
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a CircuitBreakerStorage wrapping the given storage
 *
 * @example
 * ```typescript
 * const r2Storage = new R2Storage(env.MY_BUCKET);
 * const resilientStorage = createCircuitBreakerStorage(r2Storage, {
 *   failureThreshold: 5,
 *   resetTimeoutMs: 30000,
 * });
 * ```
 */
export function createCircuitBreakerStorage(
  storage: Storage,
  options?: CircuitBreakerOptions
): CircuitBreakerStorage {
  return new CircuitBreakerStorage(storage, options);
}
