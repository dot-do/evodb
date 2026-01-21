/**
 * Chaos Testing Utilities for EvoDB
 * Issue: evodb-187 - Add chaos testing suite
 *
 * This module provides chaos engineering utilities for testing system resilience:
 * - ChaosR2Bucket: Wraps R2BucketLike with probabilistic failure injection
 * - ChaosStorage: Wraps Storage interface with network failure simulation
 * - DelayInjector: Adds configurable latency to storage operations
 * - PartialWriteSimulator: Simulates partial/corrupted writes
 * - ConcurrencyConflictSimulator: Simulates race conditions and conflicts
 * - MemoryPressureSimulator: Simulates memory constraints
 * - ClockSkewSimulator: Simulates clock drift and skew
 *
 * All utilities support seeded randomness for reproducible testing.
 *
 * @example
 * ```typescript
 * // Wrap storage with chaos for testing
 * const chaosStorage = new ChaosStorage(baseStorage, {
 *   failureProbability: 0.3,
 *   failureMode: 'network',
 *   seed: 12345,
 * });
 *
 * // Use in tests
 * await expect(chaosStorage.read('key')).rejects.toThrow(/network/);
 * ```
 */

import type { Storage, StorageMetadata, R2BucketLike, R2ObjectLike, R2ObjectsLike, R2PutOptionsLike, R2ListOptionsLike } from './storage.js';
import type { MonotonicTimeProvider } from './circuit-breaker.js';

// =============================================================================
// Types and Configuration
// =============================================================================

/**
 * Failure modes for chaos injection
 */
export type FailureMode =
  | 'network'           // Generic network error
  | 'timeout'           // Request timeout
  | 'connection_reset'  // Connection reset by peer
  | 'service_unavailable' // 503 Service Unavailable
  | 'rate_limit';       // 429 Rate Limit Exceeded

/**
 * Operations that can be affected by chaos
 */
export type AffectedOperation = 'get' | 'put' | 'delete' | 'list' | 'head' | 'read' | 'write';

/**
 * Corruption modes for partial write simulation
 */
export type CorruptionMode =
  | 'truncate'        // Truncate data at random position
  | 'random_bytes'    // Corrupt random bytes
  | 'append_garbage'  // Append garbage bytes
  | 'flip_bits';      // Flip random bits

/**
 * Delay modes for latency injection
 */
export type DelayMode =
  | 'fixed'        // Fixed delay
  | 'random'       // Random delay within range
  | 'exponential'; // Exponential backoff

/**
 * Conflict modes for concurrency simulation
 */
export type ConflictMode =
  | 'write_write'   // Two concurrent writes
  | 'lost_update'   // Read-modify-write conflict
  | 'dirty_read';   // Read during write

/**
 * Full chaos configuration for creating chaos stacks
 */
export interface ChaosConfig {
  network?: {
    failureProbability: number;
    failureMode: FailureMode;
    affectedOperations?: AffectedOperation[];
  };
  latency?: {
    delayMs: number;
    delayMode: DelayMode;
    maxDelayMs?: number;
    timeoutMs?: number;
  };
  corruption?: {
    writeRatio?: number;
    corruptionMode?: CorruptionMode;
    corruptionRatio?: number;
    garbageBytes?: number;
  };
  memory?: {
    maxMemoryBytes: number;
    pressureThreshold?: number;
    trackReadMemory?: boolean;
    simulateFragmentation?: boolean;
    fragmentationLevel?: number;
  };
  clock?: {
    skewMs?: number;
    skewDirection?: 'forward' | 'backward';
    jitterMs?: number;
    driftRateMs?: number;
  };
  seed?: number;
}

// =============================================================================
// Seeded Random Number Generator
// =============================================================================

/**
 * Simple seeded PRNG using mulberry32 algorithm
 * Provides reproducible randomness for chaos testing
 */
export class SeededRandom {
  private state: number;

  constructor(seed: number = Date.now()) {
    this.state = seed;
  }

  /**
   * Returns a random number between 0 (inclusive) and 1 (exclusive)
   */
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Returns a random integer between min (inclusive) and max (exclusive)
   */
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min)) + min;
  }

  /**
   * Returns true with the given probability (0-1)
   */
  chance(probability: number): boolean {
    return this.next() < probability;
  }

  /**
   * Shuffles an array in place
   */
  shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i + 1);
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }
}

// =============================================================================
// Error Classes
// =============================================================================

/**
 * Network error for chaos injection
 */
export class ChaosNetworkError extends Error {
  readonly isChaosError = true;
  readonly failureMode: FailureMode;

  constructor(mode: FailureMode, message?: string) {
    super(message || ChaosNetworkError.getDefaultMessage(mode));
    this.name = 'ChaosNetworkError';
    this.failureMode = mode;
  }

  private static getDefaultMessage(mode: FailureMode): string {
    switch (mode) {
      case 'network':
        return 'Network error: Connection failed';
      case 'timeout':
        return 'Network timeout: Request timed out';
      case 'connection_reset':
        return 'Network error: Connection reset by peer';
      case 'service_unavailable':
        return 'Service unavailable: 503 error';
      case 'rate_limit':
        return 'Rate limit exceeded: 429 error';
    }
  }
}

/**
 * Partial write error
 */
export class PartialWriteError extends Error {
  readonly bytesWritten: number;
  readonly totalBytes: number;

  constructor(bytesWritten: number, totalBytes: number) {
    super(`Partial write failure: ${bytesWritten}/${totalBytes} bytes written`);
    this.name = 'PartialWriteError';
    this.bytesWritten = bytesWritten;
    this.totalBytes = totalBytes;
  }
}

/**
 * Corruption detection error
 */
export class CorruptionDetectedError extends Error {
  readonly expectedHash: string;
  readonly actualHash: string;

  constructor(expectedHash: string, actualHash: string) {
    super(`Data corruption detected: expected hash ${expectedHash}, got ${actualHash}`);
    this.name = 'CorruptionDetectedError';
    this.expectedHash = expectedHash;
    this.actualHash = actualHash;
  }
}

/**
 * Memory pressure error
 */
export class MemoryPressureError extends Error {
  readonly requestedBytes: number;
  readonly availableBytes: number;

  constructor(requestedBytes: number, availableBytes: number) {
    super(`Memory pressure: requested ${requestedBytes} bytes, only ${availableBytes} available`);
    this.name = 'MemoryPressureError';
    this.requestedBytes = requestedBytes;
    this.availableBytes = availableBytes;
  }
}

/**
 * Concurrency conflict error
 */
export class ConflictError extends Error {
  readonly conflictMode: ConflictMode;

  constructor(mode: ConflictMode, message?: string) {
    super(message || `Concurrency conflict: ${mode}`);
    this.name = 'ConflictError';
    this.conflictMode = mode;
  }
}

/**
 * ETag mismatch error (precondition failed)
 */
export class ETagMismatchError extends Error {
  readonly expectedEtag: string;
  readonly actualEtag: string | undefined;

  constructor(expectedEtag: string, actualEtag: string | undefined) {
    super(`Precondition failed: ETag mismatch (expected: ${expectedEtag}, actual: ${actualEtag})`);
    this.name = 'ETagMismatchError';
    this.expectedEtag = expectedEtag;
    this.actualEtag = actualEtag;
  }
}

/**
 * Chaos timeout error (for chaos testing utilities)
 *
 * Note: Named ChaosTimeoutError to avoid conflict with the general
 * TimeoutError in @evodb/core/errors.
 */
export class ChaosTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Operation timed out after ${timeoutMs}ms`);
    this.name = 'ChaosTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

// =============================================================================
// ChaosR2Bucket - R2 Bucket Wrapper with Failure Injection
// =============================================================================

export interface ChaosR2BucketOptions {
  failureProbability: number;
  failureMode: FailureMode;
  affectedOperations?: AffectedOperation[];
  seed?: number;
}

/**
 * Wraps an R2BucketLike with probabilistic failure injection
 */
export class ChaosR2Bucket implements R2BucketLike {
  private readonly bucket: R2BucketLike;
  private readonly random: SeededRandom;
  private failureProbability: number;
  private failureMode: FailureMode;
  private readonly affectedOperations: Set<AffectedOperation>;

  constructor(bucket: R2BucketLike, options: ChaosR2BucketOptions) {
    this.bucket = bucket;
    this.random = new SeededRandom(options.seed);
    this.failureProbability = options.failureProbability;
    this.failureMode = options.failureMode;
    this.affectedOperations = new Set(options.affectedOperations || ['get', 'put', 'delete', 'list', 'head']);
  }

  private shouldFail(operation: AffectedOperation): boolean {
    if (!this.affectedOperations.has(operation)) {
      return false;
    }
    return this.random.chance(this.failureProbability);
  }

  private throwError(): never {
    throw new ChaosNetworkError(this.failureMode);
  }

  async get(key: string): Promise<R2ObjectLike | null> {
    if (this.shouldFail('get')) {
      this.throwError();
    }
    return this.bucket.get(key);
  }

  async put(key: string, value: ArrayBuffer | Uint8Array | string, options?: R2PutOptionsLike): Promise<R2ObjectLike> {
    if (this.shouldFail('put')) {
      this.throwError();
    }
    return this.bucket.put(key, value, options);
  }

  async delete(key: string): Promise<void> {
    if (this.shouldFail('delete')) {
      this.throwError();
    }
    return this.bucket.delete(key);
  }

  async list(options?: R2ListOptionsLike): Promise<R2ObjectsLike> {
    if (this.shouldFail('list')) {
      this.throwError();
    }
    return this.bucket.list(options);
  }

  async head(key: string): Promise<R2ObjectLike | null> {
    if (this.shouldFail('head')) {
      this.throwError();
    }
    return this.bucket.head(key);
  }

  /**
   * Update failure probability at runtime
   */
  setFailureProbability(probability: number): void {
    this.failureProbability = probability;
  }

  /**
   * Update failure mode at runtime
   */
  setFailureMode(mode: FailureMode): void {
    this.failureMode = mode;
  }
}

// =============================================================================
// ChaosStorage - Storage Interface Wrapper with Failure Injection
// =============================================================================

export interface ChaosStorageOptions {
  failureProbability: number;
  failureMode: FailureMode;
  affectedOperations?: AffectedOperation[];
  seed?: number;
}

/**
 * Wraps a Storage implementation with probabilistic failure injection
 */
export class ChaosStorage implements Storage {
  private readonly storage: Storage;
  private readonly random: SeededRandom;
  private failureProbability: number;
  private failureMode: FailureMode;
  private readonly affectedOperations: Set<AffectedOperation>;

  constructor(storage: Storage, options: ChaosStorageOptions) {
    this.storage = storage;
    this.random = new SeededRandom(options.seed);
    this.failureProbability = options.failureProbability;
    this.failureMode = options.failureMode;
    this.affectedOperations = new Set(options.affectedOperations || ['read', 'write', 'delete', 'list']);
  }

  private shouldFail(operation: AffectedOperation): boolean {
    if (!this.affectedOperations.has(operation)) {
      return false;
    }
    return this.random.chance(this.failureProbability);
  }

  private throwError(): never {
    throw new ChaosNetworkError(this.failureMode);
  }

  async read(path: string): Promise<Uint8Array | null> {
    if (this.shouldFail('read')) {
      this.throwError();
    }
    return this.storage.read(path);
  }

  async write(path: string, data: Uint8Array): Promise<void> {
    if (this.shouldFail('write')) {
      this.throwError();
    }
    return this.storage.write(path, data);
  }

  async list(prefix: string): Promise<{ paths: string[] }> {
    if (this.shouldFail('list')) {
      this.throwError();
    }
    return this.storage.list(prefix);
  }

  async delete(path: string): Promise<void> {
    if (this.shouldFail('delete')) {
      this.throwError();
    }
    return this.storage.delete(path);
  }

  async exists(path: string): Promise<boolean> {
    if (this.storage.exists) {
      if (this.shouldFail('read')) {
        this.throwError();
      }
      return this.storage.exists(path);
    }
    const data = await this.read(path);
    return data !== null;
  }

  async head(path: string): Promise<StorageMetadata | null> {
    if (this.storage.head) {
      if (this.shouldFail('head')) {
        this.throwError();
      }
      return this.storage.head(path);
    }
    return null;
  }

  async readRange(path: string, offset: number, length: number): Promise<Uint8Array> {
    if (this.shouldFail('read')) {
      this.throwError();
    }
    if (this.storage.readRange) {
      return this.storage.readRange(path, offset, length);
    }
    const data = await this.storage.read(path);
    if (!data) {
      throw new Error(`Object not found: ${path}`);
    }
    return data.slice(offset, offset + length);
  }

  /**
   * Update failure probability at runtime
   */
  setFailureProbability(probability: number): void {
    this.failureProbability = probability;
  }

  /**
   * Update failure mode at runtime
   */
  setFailureMode(mode: FailureMode): void {
    this.failureMode = mode;
  }
}

// =============================================================================
// DelayInjector - Latency Simulation
// =============================================================================

export interface DelayInjectorOptions {
  delayMs: number;
  delayMode: DelayMode;
  maxDelayMs?: number;
  timeoutMs?: number;
  backoffMultiplier?: number;
  operationDelays?: {
    read?: number;
    write?: number;
    list?: number;
    delete?: number;
  };
  seed?: number;
}

/**
 * Wraps a Storage implementation with configurable latency injection
 */
export class DelayInjector implements Storage {
  private readonly storage: Storage;
  private readonly random: SeededRandom;
  private readonly baseDelayMs: number;
  private readonly delayMode: DelayMode;
  private readonly maxDelayMs: number;
  private readonly timeoutMs?: number;
  private readonly backoffMultiplier: number;
  private readonly operationDelays: Map<string, number>;
  private operationCount = 0;

  constructor(storage: Storage, options: DelayInjectorOptions) {
    this.storage = storage;
    this.random = new SeededRandom(options.seed);
    this.baseDelayMs = options.delayMs;
    this.delayMode = options.delayMode;
    this.maxDelayMs = options.maxDelayMs ?? options.delayMs * 2;
    this.timeoutMs = options.timeoutMs;
    this.backoffMultiplier = options.backoffMultiplier ?? 2;
    this.operationDelays = new Map();
    if (options.operationDelays) {
      for (const [op, delay] of Object.entries(options.operationDelays)) {
        this.operationDelays.set(op, delay);
      }
    }
  }

  private calculateDelay(operation: string): number {
    // Check for operation-specific delay
    const opDelay = this.operationDelays.get(operation);
    if (opDelay !== undefined) {
      return opDelay;
    }

    switch (this.delayMode) {
      case 'fixed':
        return this.baseDelayMs;
      case 'random':
        return this.random.nextInt(this.baseDelayMs, this.maxDelayMs + 1);
      case 'exponential': {
        const delay = Math.min(
          this.baseDelayMs * Math.pow(this.backoffMultiplier, this.operationCount),
          this.maxDelayMs
        );
        this.operationCount++;
        return delay;
      }
    }
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async withDelay<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    const delayMs = this.calculateDelay(operation);

    if (this.timeoutMs !== undefined && delayMs > this.timeoutMs) {
      // Create a promise that rejects after timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new ChaosTimeoutError(this.timeoutMs!)), this.timeoutMs);
      });
      return Promise.race([timeoutPromise, this.delay(delayMs).then(fn)]);
    }

    await this.delay(delayMs);
    return fn();
  }

  async read(path: string): Promise<Uint8Array | null> {
    return this.withDelay('read', () => this.storage.read(path));
  }

  async write(path: string, data: Uint8Array): Promise<void> {
    return this.withDelay('write', () => this.storage.write(path, data));
  }

  async list(prefix: string): Promise<{ paths: string[] }> {
    return this.withDelay('list', () => this.storage.list(prefix));
  }

  async delete(path: string): Promise<void> {
    return this.withDelay('delete', () => this.storage.delete(path));
  }

  async exists(path: string): Promise<boolean> {
    if (this.storage.exists) {
      return this.withDelay('read', () => this.storage.exists!(path));
    }
    const data = await this.read(path);
    return data !== null;
  }

  async head(path: string): Promise<StorageMetadata | null> {
    if (this.storage.head) {
      return this.withDelay('head', () => this.storage.head!(path));
    }
    return null;
  }

  async readRange(path: string, offset: number, length: number): Promise<Uint8Array> {
    return this.withDelay('read', async () => {
      if (this.storage.readRange) {
        return this.storage.readRange(path, offset, length);
      }
      const data = await this.storage.read(path);
      if (!data) {
        throw new Error(`Object not found: ${path}`);
      }
      return data.slice(offset, offset + length);
    });
  }

  /**
   * Reset operation count (for exponential backoff)
   */
  reset(): void {
    this.operationCount = 0;
  }
}

// =============================================================================
// PartialWriteSimulator - Corruption Testing
// =============================================================================

export interface PartialWriteSimulatorOptions {
  writeRatio?: number;
  failAfterPartialWrite?: boolean;
  corruptionMode?: CorruptionMode;
  corruptionRatio?: number;
  garbageBytes?: number;
  verifyOnRead?: boolean;
  seed?: number;
}

/**
 * Simulates partial writes and data corruption for resilience testing
 */
export class PartialWriteSimulator implements Storage {
  private readonly storage: Storage;
  private readonly random: SeededRandom;
  private readonly writeRatio: number;
  private readonly failAfterPartialWrite: boolean;
  private readonly corruptionMode?: CorruptionMode;
  private readonly corruptionRatio: number;
  private readonly garbageBytes: number;
  private readonly verifyOnRead: boolean;
  private readonly hashMap = new Map<string, string>();

  constructor(storage: Storage, options: PartialWriteSimulatorOptions) {
    this.storage = storage;
    this.random = new SeededRandom(options.seed);
    this.writeRatio = options.writeRatio ?? 1.0;
    this.failAfterPartialWrite = options.failAfterPartialWrite ?? false;
    this.corruptionMode = options.corruptionMode;
    this.corruptionRatio = options.corruptionRatio ?? 0.1;
    this.garbageBytes = options.garbageBytes ?? 10;
    this.verifyOnRead = options.verifyOnRead ?? false;
  }

  /**
   * Compute a simple hash of data (for corruption detection)
   */
  computeHash(data: Uint8Array): string {
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      hash = ((hash << 5) - hash + data[i]) | 0;
    }
    return hash.toString(16);
  }

  private corruptData(data: Uint8Array): Uint8Array {
    if (!this.corruptionMode) {
      return data;
    }

    switch (this.corruptionMode) {
      case 'truncate': {
        const truncatePos = this.random.nextInt(1, data.length);
        return data.slice(0, truncatePos);
      }
      case 'random_bytes': {
        const corrupted = new Uint8Array(data);
        const numCorrupt = Math.ceil(data.length * this.corruptionRatio);
        for (let i = 0; i < numCorrupt; i++) {
          const pos = this.random.nextInt(0, data.length);
          corrupted[pos] = this.random.nextInt(0, 256);
        }
        return corrupted;
      }
      case 'append_garbage': {
        const result = new Uint8Array(data.length + this.garbageBytes);
        result.set(data);
        for (let i = data.length; i < result.length; i++) {
          result[i] = this.random.nextInt(0, 256);
        }
        return result;
      }
      case 'flip_bits': {
        const flipped = new Uint8Array(data);
        const numFlip = Math.ceil(data.length * this.corruptionRatio);
        for (let i = 0; i < numFlip; i++) {
          const pos = this.random.nextInt(0, data.length);
          const bitPos = this.random.nextInt(0, 8);
          flipped[pos] ^= (1 << bitPos);
        }
        return flipped;
      }
    }
  }

  async read(path: string, options?: { expectedHash?: string }): Promise<Uint8Array | null> {
    const data = await this.storage.read(path);

    if (data && this.verifyOnRead && options?.expectedHash) {
      const actualHash = this.computeHash(data);
      if (actualHash !== options.expectedHash) {
        throw new CorruptionDetectedError(options.expectedHash, actualHash);
      }
    }

    return data;
  }

  async write(path: string, data: Uint8Array, options?: { expectedHash?: string }): Promise<void> {
    let dataToWrite = data;

    // Apply corruption if configured
    if (this.corruptionMode) {
      dataToWrite = this.corruptData(data);
    }

    // Apply partial write ratio
    if (this.writeRatio < 1.0) {
      const bytesToWrite = Math.floor(data.length * this.writeRatio);
      dataToWrite = data.slice(0, bytesToWrite);

      await this.storage.write(path, dataToWrite);

      if (this.failAfterPartialWrite) {
        throw new PartialWriteError(bytesToWrite, data.length);
      }
      return;
    }

    // Store hash for verification if provided
    if (options?.expectedHash) {
      this.hashMap.set(path, options.expectedHash);
    }

    await this.storage.write(path, dataToWrite);
  }

  async list(prefix: string): Promise<{ paths: string[] }> {
    return this.storage.list(prefix);
  }

  async delete(path: string): Promise<void> {
    this.hashMap.delete(path);
    return this.storage.delete(path);
  }

  async exists(path: string): Promise<boolean> {
    if (this.storage.exists) {
      return this.storage.exists(path);
    }
    const data = await this.storage.read(path);
    return data !== null;
  }

  async head(path: string): Promise<StorageMetadata | null> {
    if (this.storage.head) {
      return this.storage.head(path);
    }
    return null;
  }

  async readRange(path: string, offset: number, length: number): Promise<Uint8Array> {
    if (this.storage.readRange) {
      return this.storage.readRange(path, offset, length);
    }
    const data = await this.storage.read(path);
    if (!data) {
      throw new Error(`Object not found: ${path}`);
    }
    return data.slice(offset, offset + length);
  }
}

// =============================================================================
// ConcurrencyConflictSimulator - Race Condition Testing
// =============================================================================

export interface ConcurrencyConflictSimulatorOptions {
  conflictProbability?: number;
  conflictMode?: ConflictMode;
  useOptimisticLocking?: boolean;
  detectLostUpdates?: boolean;
  seed?: number;
}

/**
 * Simulates concurrent access conflicts for testing distributed systems
 */
export class ConcurrencyConflictSimulator implements Storage {
  private readonly storage: Storage;
  private readonly random: SeededRandom;
  private readonly conflictProbability: number;
  private readonly conflictMode: ConflictMode;
  private readonly useOptimisticLocking: boolean;
  private readonly detectLostUpdates: boolean;
  private readonly etags = new Map<string, string>();
  private readonly pendingWrites = new Map<string, Promise<void>>();
  private readonly versions = new Map<string, number>();

  constructor(storage: Storage, options: ConcurrencyConflictSimulatorOptions = {}) {
    this.storage = storage;
    this.random = new SeededRandom(options.seed);
    this.conflictProbability = options.conflictProbability ?? 0.5;
    this.conflictMode = options.conflictMode ?? 'write_write';
    this.useOptimisticLocking = options.useOptimisticLocking ?? false;
    this.detectLostUpdates = options.detectLostUpdates ?? false;
  }

  private generateEtag(): string {
    return `"${Date.now().toString(16)}-${this.random.nextInt(0, 0xFFFF).toString(16)}"`;
  }

  async read(path: string): Promise<Uint8Array | null> {
    return this.storage.read(path);
  }

  async write(path: string, data: Uint8Array): Promise<void> {
    // Check for write-write conflicts
    if (this.conflictMode === 'write_write' && this.pendingWrites.has(path)) {
      if (this.random.chance(this.conflictProbability)) {
        throw new ConflictError('write_write', `Concurrent write conflict on ${path}`);
      }
    }

    // Track this write as pending
    const writePromise = this.storage.write(path, data);
    this.pendingWrites.set(path, writePromise);

    try {
      await writePromise;
      // Update ETag on successful write
      this.etags.set(path, this.generateEtag());
      this.versions.set(path, (this.versions.get(path) ?? 0) + 1);
    } finally {
      this.pendingWrites.delete(path);
    }
  }

  /**
   * Write with simulated delay to allow concurrent operations
   */
  async writeWithDelay(path: string, data: Uint8Array, delayMs: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, delayMs));
    return this.write(path, data);
  }

  /**
   * Write and return the new ETag
   */
  async writeWithEtag(path: string, data: Uint8Array): Promise<string> {
    await this.storage.write(path, data);
    const etag = this.generateEtag();
    this.etags.set(path, etag);
    return etag;
  }

  /**
   * Conditional write that only succeeds if ETag matches
   */
  async conditionalWrite(path: string, data: Uint8Array, expectedEtag: string): Promise<void> {
    const currentEtag = this.etags.get(path);

    if (this.useOptimisticLocking && currentEtag !== expectedEtag) {
      throw new ETagMismatchError(expectedEtag, currentEtag);
    }

    return this.writeWithEtag(path, data).then(() => {});
  }

  /**
   * Read-modify-write operation with lost update detection
   */
  async readModifyWrite(
    path: string,
    modifier: (data: Uint8Array) => Uint8Array
  ): Promise<void> {
    const versionBefore = this.versions.get(path) ?? 0;
    const data = await this.storage.read(path);

    if (!data) {
      throw new Error(`Object not found: ${path}`);
    }

    // Simulate some processing time that could allow concurrent modification
    if (this.random.chance(this.conflictProbability)) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    // Check for lost updates
    if (this.detectLostUpdates) {
      const versionAfter = this.versions.get(path) ?? 0;
      if (versionAfter !== versionBefore) {
        throw new ConflictError('lost_update', `Lost update detected on ${path}`);
      }
    }

    const modified = modifier(data);
    return this.write(path, modified);
  }

  /**
   * Write with timestamp for ordering
   */
  async writeWithTimestamp(path: string, data: Uint8Array, _timestamp: number): Promise<void> {
    // In a real implementation, this would use the timestamp for conflict resolution
    // For simulation, we just do a normal write with conflict checking
    return this.write(path, data);
  }

  async list(prefix: string): Promise<{ paths: string[] }> {
    return this.storage.list(prefix);
  }

  async delete(path: string): Promise<void> {
    this.etags.delete(path);
    this.versions.delete(path);
    return this.storage.delete(path);
  }

  async exists(path: string): Promise<boolean> {
    if (this.storage.exists) {
      return this.storage.exists(path);
    }
    const data = await this.storage.read(path);
    return data !== null;
  }

  async head(path: string): Promise<StorageMetadata | null> {
    if (this.storage.head) {
      return this.storage.head(path);
    }
    return null;
  }

  async readRange(path: string, offset: number, length: number): Promise<Uint8Array> {
    if (this.storage.readRange) {
      return this.storage.readRange(path, offset, length);
    }
    const data = await this.storage.read(path);
    if (!data) {
      throw new Error(`Object not found: ${path}`);
    }
    return data.slice(offset, offset + length);
  }
}

// =============================================================================
// MemoryPressureSimulator - Memory Constraint Testing
// =============================================================================

export interface MemoryPressureSimulatorOptions {
  maxMemoryBytes: number;
  pressureThreshold?: number;
  rejectOnPressure?: boolean;
  trackReadMemory?: boolean;
  simulateFragmentation?: boolean;
  fragmentationLevel?: number;
  maxSlowdownMs?: number;
  seed?: number;
}

/**
 * Simulates memory constraints for testing systems under memory pressure
 */
export class MemoryPressureSimulator implements Storage {
  private readonly storage: Storage;
  private readonly random: SeededRandom;
  private readonly maxMemoryBytes: number;
  private readonly pressureThreshold: number;
  private readonly rejectOnPressure: boolean;
  private readonly trackReadMemory: boolean;
  private readonly simulateFragmentation: boolean;
  private readonly fragmentationLevel: number;
  private readonly maxSlowdownMs: number;
  private currentMemoryUsage = 0;
  private readonly allocations = new Map<string, number>();
  private fragmentationRatio = 0;

  constructor(storage: Storage, options: MemoryPressureSimulatorOptions) {
    this.storage = storage;
    this.random = new SeededRandom(options.seed);
    this.maxMemoryBytes = options.maxMemoryBytes;
    this.pressureThreshold = options.pressureThreshold ?? 0.8;
    this.rejectOnPressure = options.rejectOnPressure ?? false;
    this.trackReadMemory = options.trackReadMemory ?? false;
    this.simulateFragmentation = options.simulateFragmentation ?? false;
    this.fragmentationLevel = options.fragmentationLevel ?? 0.3;
    this.maxSlowdownMs = options.maxSlowdownMs ?? 1000;
  }

  private checkMemoryAvailable(bytes: number): boolean {
    const availableBytes = this.maxMemoryBytes - this.currentMemoryUsage;

    // Account for fragmentation
    if (this.simulateFragmentation) {
      const effectiveAvailable = availableBytes * (1 - this.fragmentationRatio);
      return bytes <= effectiveAvailable;
    }

    return bytes <= availableBytes;
  }

  private async applyPressureSlowdown(): Promise<void> {
    const usageRatio = this.currentMemoryUsage / this.maxMemoryBytes;
    if (usageRatio >= this.pressureThreshold) {
      const pressureLevel = (usageRatio - this.pressureThreshold) / (1 - this.pressureThreshold);
      const delayMs = Math.floor(pressureLevel * this.maxSlowdownMs);
      if (delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  async read(path: string): Promise<Uint8Array | null> {
    if (this.trackReadMemory) {
      const meta = this.storage.head ? await this.storage.head(path) : null;
      const size = meta?.size ?? 0;

      if (this.rejectOnPressure && !this.checkMemoryAvailable(size)) {
        throw new MemoryPressureError(size, this.maxMemoryBytes - this.currentMemoryUsage);
      }
    }

    await this.applyPressureSlowdown();
    return this.storage.read(path);
  }

  async write(path: string, data: Uint8Array): Promise<void> {
    const bytes = data.length;

    // Release old allocation if overwriting
    if (this.allocations.has(path)) {
      this.currentMemoryUsage -= this.allocations.get(path)!;
    }

    if (this.rejectOnPressure && !this.checkMemoryAvailable(bytes)) {
      throw new MemoryPressureError(bytes, this.maxMemoryBytes - this.currentMemoryUsage);
    }

    await this.applyPressureSlowdown();

    await this.storage.write(path, data);

    this.currentMemoryUsage += bytes;
    this.allocations.set(path, bytes);

    // Update fragmentation after allocation
    if (this.simulateFragmentation) {
      this.fragmentationRatio = Math.min(
        this.fragmentationRatio + this.random.next() * 0.05,
        this.fragmentationLevel
      );
    }
  }

  async list(prefix: string): Promise<{ paths: string[] }> {
    await this.applyPressureSlowdown();
    return this.storage.list(prefix);
  }

  async delete(path: string): Promise<void> {
    const freedBytes = this.allocations.get(path) ?? 0;
    this.currentMemoryUsage -= freedBytes;
    this.allocations.delete(path);

    // Deletes can increase fragmentation
    if (this.simulateFragmentation && freedBytes > 0) {
      this.fragmentationRatio = Math.min(
        this.fragmentationRatio + this.random.next() * 0.1,
        this.fragmentationLevel
      );
    }

    return this.storage.delete(path);
  }

  async exists(path: string): Promise<boolean> {
    if (this.storage.exists) {
      return this.storage.exists(path);
    }
    const data = await this.storage.read(path);
    return data !== null;
  }

  async head(path: string): Promise<StorageMetadata | null> {
    if (this.storage.head) {
      return this.storage.head(path);
    }
    return null;
  }

  async readRange(path: string, offset: number, length: number): Promise<Uint8Array> {
    if (this.trackReadMemory && this.rejectOnPressure && !this.checkMemoryAvailable(length)) {
      throw new MemoryPressureError(length, this.maxMemoryBytes - this.currentMemoryUsage);
    }

    await this.applyPressureSlowdown();

    if (this.storage.readRange) {
      return this.storage.readRange(path, offset, length);
    }
    const data = await this.storage.read(path);
    if (!data) {
      throw new Error(`Object not found: ${path}`);
    }
    return data.slice(offset, offset + length);
  }

  /**
   * Get current memory usage
   */
  getCurrentMemoryUsage(): number {
    return this.currentMemoryUsage;
  }

  /**
   * Get current fragmentation ratio
   */
  getFragmentationRatio(): number {
    return this.fragmentationRatio;
  }

  /**
   * Manually compact (reduce fragmentation)
   */
  compact(): void {
    this.fragmentationRatio = 0;
  }
}

// =============================================================================
// ClockSkewSimulator - Time Drift Testing
// =============================================================================

export interface ClockSkewSimulatorOptions {
  skewMs?: number;
  skewDirection?: 'forward' | 'backward';
  jitterMs?: number;
  driftRateMs?: number;
  seed?: number;
}

/**
 * Simulates clock skew and drift for testing distributed systems
 */
export class ClockSkewSimulator implements Storage {
  private readonly storage: Storage;
  private readonly random: SeededRandom;
  private readonly skewMs: number;
  private readonly skewDirection: 'forward' | 'backward';
  private readonly jitterMs: number;
  private readonly driftRateMs: number;
  private skewApplied = false;
  private totalDriftMs = 0;
  private monotonicTime = 0;

  constructor(storage: Storage, options: ClockSkewSimulatorOptions = {}) {
    this.storage = storage;
    this.random = new SeededRandom(options.seed);
    this.skewMs = options.skewMs ?? 0;
    this.skewDirection = options.skewDirection ?? 'forward';
    this.jitterMs = options.jitterMs ?? 0;
    this.driftRateMs = options.driftRateMs ?? 0;
    this.monotonicTime = performance.now();
  }

  /**
   * Get the simulated current time (wall clock)
   */
  now(): number {
    let time = Date.now();

    // Apply skew if activated
    if (this.skewApplied) {
      time += this.skewDirection === 'forward' ? this.skewMs : -this.skewMs;
    }

    // Apply accumulated drift
    time += this.totalDriftMs;

    // Apply jitter
    if (this.jitterMs > 0) {
      time += this.random.nextInt(-this.jitterMs, this.jitterMs + 1);
    }

    return time;
  }

  /**
   * Apply the configured skew (simulates sudden clock change)
   */
  applySkeW(): void {
    this.skewApplied = true;
  }

  /**
   * Simulate one tick of clock drift
   */
  tick(): void {
    this.totalDriftMs += this.driftRateMs;
    this.monotonicTime += 1000; // 1 second in monotonic time
  }

  /**
   * Get a monotonic time provider for circuit breakers
   */
  getMonotonicTimeProvider(): MonotonicTimeProvider {
    return {
      now: () => this.monotonicTime,
    };
  }

  /**
   * Advance monotonic time manually (for testing)
   */
  advanceMonotonicTime(ms: number): void {
    this.monotonicTime += ms;
  }

  async read(path: string): Promise<Uint8Array | null> {
    return this.storage.read(path);
  }

  async write(path: string, data: Uint8Array): Promise<void> {
    return this.storage.write(path, data);
  }

  async list(prefix: string): Promise<{ paths: string[] }> {
    return this.storage.list(prefix);
  }

  async delete(path: string): Promise<void> {
    return this.storage.delete(path);
  }

  async exists(path: string): Promise<boolean> {
    if (this.storage.exists) {
      return this.storage.exists(path);
    }
    const data = await this.storage.read(path);
    return data !== null;
  }

  async head(path: string): Promise<StorageMetadata | null> {
    if (this.storage.head) {
      return this.storage.head(path);
    }
    return null;
  }

  async readRange(path: string, offset: number, length: number): Promise<Uint8Array> {
    if (this.storage.readRange) {
      return this.storage.readRange(path, offset, length);
    }
    const data = await this.storage.read(path);
    if (!data) {
      throw new Error(`Object not found: ${path}`);
    }
    return data.slice(offset, offset + length);
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a chaos-enabled storage stack from configuration
 */
export function createChaosStack(baseStorage: Storage, config: ChaosConfig): Storage {
  let storage = baseStorage;

  // Apply in reverse order (innermost first)

  // 1. Corruption (closest to actual storage)
  if (config.corruption) {
    storage = new PartialWriteSimulator(storage, {
      ...config.corruption,
      seed: config.seed,
    });
  }

  // 2. Memory pressure
  if (config.memory) {
    storage = new MemoryPressureSimulator(storage, {
      ...config.memory,
      seed: config.seed,
    });
  }

  // 3. Clock skew
  if (config.clock) {
    storage = new ClockSkewSimulator(storage, {
      ...config.clock,
      seed: config.seed,
    });
  }

  // 4. Latency
  if (config.latency) {
    storage = new DelayInjector(storage, {
      ...config.latency,
      seed: config.seed,
    });
  }

  // 5. Network failures (outermost)
  if (config.network) {
    storage = new ChaosStorage(storage, {
      ...config.network,
      seed: config.seed,
    });
  }

  return storage;
}
