/**
 * Circuit Breaker RPC Client
 * Issue: evodb-bnv8 - TDD: Add circuit breaker to RPC client
 *
 * Wraps RPC client calls with circuit breaker protection using
 * the simplified CircuitBreaker from @evodb/core.
 *
 * The circuit breaker prevents cascading failures by:
 * - Tracking consecutive failures
 * - Opening the circuit after a threshold is reached
 * - Rejecting requests immediately when open
 * - Allowing retry attempts after a backoff period
 *
 * @example
 * ```typescript
 * const client = new CircuitBreakerRpcClient({
 *   parentDoUrl: 'ws://parent-do.example.com/ws',
 *   sourceDoId: 'child-do-123',
 *   circuitBreaker: {
 *     failureThreshold: 5,
 *     maxBackoffMs: 30000,
 *   },
 *   send: async (entries) => {
 *     // Your actual RPC implementation
 *     return rpcClient.sendBatch(entries);
 *   },
 * });
 *
 * // Requests are protected by circuit breaker
 * const result = await client.sendBatch(entries);
 * ```
 */

import {
  CircuitBreaker,
  CircuitBreakerError,
  CircuitState,
  type CircuitBreakerOptions,
  type CircuitBreakerStats,
  type MonotonicTimeProvider,
} from '@evodb/core';
import type { WalEntry } from './types.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Send result from the underlying RPC implementation
 */
export interface RpcSendResult {
  status: string;
  sequenceNumber?: number;
  [key: string]: unknown;
}

/**
 * Configuration for CircuitBreakerRpcClient
 */
export interface CircuitBreakerRpcConfig {
  /** Parent DO WebSocket URL */
  parentDoUrl: string;

  /** Source DO identifier */
  sourceDoId: string;

  /** Source shard name (optional) */
  sourceShardName?: string;

  /** Circuit breaker configuration */
  circuitBreaker?: CircuitBreakerOptions;

  /**
   * The underlying send function to wrap with circuit breaker.
   * This should be the actual RPC implementation.
   */
  send: (entries: WalEntry[]) => Promise<RpcSendResult>;
}

/**
 * Extended stats including RPC-specific information
 */
export interface CircuitBreakerRpcStats extends CircuitBreakerStats {
  /** Source DO identifier */
  sourceDoId: string;

  /** Parent DO URL */
  parentDoUrl: string;
}

// =============================================================================
// CircuitBreakerRpcClient Implementation
// =============================================================================

/**
 * RPC client wrapper with circuit breaker protection.
 *
 * This class wraps an underlying RPC send function with circuit breaker
 * protection, preventing cascading failures when the parent DO becomes
 * unavailable or unresponsive.
 *
 * Circuit breaker states:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Requests fail fast without calling the underlying function
 * - (After backoff expires, transitions back to CLOSED)
 *
 * The simplified circuit breaker uses exponential backoff instead of
 * a traditional HALF_OPEN state, which is more suitable for the
 * ephemeral execution model of Cloudflare Workers.
 */
export class CircuitBreakerRpcClient {
  private readonly config: CircuitBreakerRpcConfig;
  private readonly breaker: CircuitBreaker;

  constructor(config: CircuitBreakerRpcConfig) {
    this.config = config;
    this.breaker = new CircuitBreaker(config.circuitBreaker);
  }

  /**
   * Send a batch of WAL entries with circuit breaker protection.
   *
   * If the circuit is open, this will reject immediately without
   * calling the underlying send function.
   *
   * @param entries - WAL entries to send
   * @returns The result from the underlying send function
   * @throws CircuitBreakerError if the circuit is open
   * @throws Error if the underlying send function fails
   */
  async sendBatch(entries: WalEntry[]): Promise<RpcSendResult> {
    return this.breaker.execute(() => this.config.send(entries));
  }

  /**
   * Get the current circuit state.
   *
   * @returns 'CLOSED' or 'OPEN'
   */
  getCircuitState(): 'CLOSED' | 'OPEN' | 'HALF_OPEN' {
    return this.breaker.getState();
  }

  /**
   * Get the current failure count.
   *
   * This is the number of consecutive failures. It resets to 0
   * after a successful request.
   */
  getFailureCount(): number {
    return this.breaker.getFailureCount();
  }

  /**
   * Get circuit breaker statistics.
   *
   * @returns Statistics including success/failure counts and state
   */
  getStats(): CircuitBreakerRpcStats {
    const baseStats = this.breaker.getStats();
    return {
      ...baseStats,
      sourceDoId: this.config.sourceDoId,
      parentDoUrl: this.config.parentDoUrl,
    };
  }

  /**
   * Manually reset the circuit breaker.
   *
   * This closes the circuit and resets the failure count to 0.
   * Use this when you know the underlying service has recovered.
   */
  resetCircuit(): void {
    this.breaker.reset();
  }

  /**
   * Manually trip the circuit breaker.
   *
   * This opens the circuit immediately, causing all requests to
   * fail fast until the backoff period expires.
   */
  tripCircuit(): void {
    this.breaker.trip();
  }

  /**
   * Get the parent DO URL.
   */
  getParentDoUrl(): string {
    return this.config.parentDoUrl;
  }

  /**
   * Get the source DO identifier.
   */
  getSourceDoId(): string {
    return this.config.sourceDoId;
  }

  /**
   * Get the source shard name.
   */
  getSourceShardName(): string | undefined {
    return this.config.sourceShardName;
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a CircuitBreakerRpcClient with default configuration.
 *
 * @param config - Client configuration
 * @returns A new CircuitBreakerRpcClient instance
 */
export function createCircuitBreakerRpcClient(
  config: CircuitBreakerRpcConfig
): CircuitBreakerRpcClient {
  return new CircuitBreakerRpcClient(config);
}

/**
 * Default circuit breaker options for RPC clients.
 *
 * These defaults are tuned for typical RPC scenarios:
 * - 5 failures before opening circuit
 * - 30 second maximum backoff
 */
export const DEFAULT_RPC_CIRCUIT_BREAKER_OPTIONS: CircuitBreakerOptions = {
  failureThreshold: 5,
  maxBackoffMs: 30000,
};

// =============================================================================
// Re-exports from @evodb/core for convenience
// =============================================================================

export {
  CircuitBreaker,
  CircuitBreakerError,
  CircuitState,
  type CircuitBreakerOptions,
  type CircuitBreakerStats,
  type MonotonicTimeProvider,
};
