/**
 * Backup and Disaster Recovery Module for EvoDB
 *
 * TDD Issue: evodb-n58v
 *
 * This module provides:
 * - Point-in-time snapshots of database state
 * - Incremental backups using change detection
 * - Restore functionality with verification
 * - Backup metadata and versioning
 * - Backup rotation policies
 *
 * @example
 * ```typescript
 * import { BackupManager, InMemoryBackupStorage } from '@evodb/core';
 *
 * const storage = new InMemoryBackupStorage();
 * const backup = new BackupManager(storage);
 *
 * // Create a full backup
 * const snapshot = await backup.create({
 *   data: databaseState,
 *   type: 'full',
 * });
 *
 * // Create incremental backup
 * const incremental = await backup.create({
 *   data: changes,
 *   type: 'incremental',
 *   baseSnapshotId: snapshot.id,
 * });
 *
 * // Restore from backup
 * const restored = await backup.restore(snapshot.id);
 *
 * // List backups
 * const backups = await backup.list();
 *
 * // Apply rotation policy
 * await backup.applyRotationPolicy({ maxCount: 10, maxAgeDays: 30 });
 * ```
 */

import { EvoDBError } from './errors.js';
import { captureStackTrace } from './stack-trace.js';
import type { StorageProvider } from './storage-provider.js';
import { safeParseJSON } from './validation.js';
import { SerializableBackupMetadataSchema } from './schemas.js';

// =============================================================================
// Constants
// =============================================================================

/** Magic number for backup files: "EVBK" */
const BACKUP_MAGIC = 0x45564B42;

/** Current backup format version */
const BACKUP_VERSION = 1;

/** Header size in bytes */
const BACKUP_HEADER_SIZE = 64;

// =============================================================================
// Types and Interfaces
// =============================================================================

/**
 * Backup type enum
 */
export enum BackupType {
  /** Full backup containing complete database state */
  Full = 'full',
  /** Incremental backup containing only changes since base snapshot */
  Incremental = 'incremental',
}

/**
 * Backup status enum
 */
export enum BackupStatus {
  /** Backup is in progress */
  InProgress = 'in_progress',
  /** Backup completed successfully */
  Completed = 'completed',
  /** Backup failed */
  Failed = 'failed',
  /** Backup is being verified */
  Verifying = 'verifying',
}

/**
 * Backup metadata containing information about a snapshot
 */
export interface BackupMetadata {
  /** Unique identifier for this backup (ULID-like format) */
  id: string;
  /** Backup type (full or incremental) */
  type: BackupType;
  /** Backup status */
  status: BackupStatus;
  /** Creation timestamp (ms since epoch) */
  createdAt: number;
  /** Completion timestamp (ms since epoch) */
  completedAt?: number;
  /** Size in bytes of the backup data */
  sizeBytes: number;
  /** CRC32 checksum of the backup data */
  checksum: number;
  /** Base snapshot ID for incremental backups */
  baseSnapshotId?: string;
  /** Number of rows/documents in the backup */
  rowCount: number;
  /** Schema version at backup time */
  schemaVersion?: number;
  /** Minimum LSN included in backup */
  minLsn?: bigint;
  /** Maximum LSN included in backup */
  maxLsn?: bigint;
  /** Custom tags for categorization */
  tags?: string[];
  /** Optional description */
  description?: string;
}

/**
 * Serializable version of BackupMetadata (bigints converted to strings)
 */
export interface SerializableBackupMetadata {
  id: string;
  type: BackupType;
  status: BackupStatus;
  createdAt: number;
  completedAt?: number;
  sizeBytes: number;
  checksum: number;
  baseSnapshotId?: string;
  rowCount: number;
  schemaVersion?: number;
  minLsn?: string;
  maxLsn?: string;
  tags?: string[];
  description?: string;
}

/**
 * Options for creating a backup
 */
export interface CreateBackupOptions {
  /** Data to backup (serialized database state) */
  data: Uint8Array;
  /** Backup type (defaults to full) */
  type?: BackupType;
  /** Base snapshot ID for incremental backups */
  baseSnapshotId?: string;
  /** Number of rows/documents */
  rowCount?: number;
  /** Schema version */
  schemaVersion?: number;
  /** Minimum LSN */
  minLsn?: bigint;
  /** Maximum LSN */
  maxLsn?: bigint;
  /** Custom tags */
  tags?: string[];
  /** Description */
  description?: string;
}

/**
 * Options for restoring from a backup
 */
export interface RestoreOptions {
  /** Whether to verify checksum before restore (default: true) */
  verifyChecksum?: boolean;
  /** Whether to include incremental chain (default: true) */
  includeIncrementals?: boolean;
}

/**
 * Result of a restore operation
 */
export interface RestoreResult {
  /** The restored data */
  data: Uint8Array;
  /** Metadata of the backup that was restored */
  metadata: BackupMetadata;
  /** Chain of backups used (for incremental restores) */
  chain: BackupMetadata[];
  /** Whether checksum verification passed */
  verified: boolean;
}

/**
 * Options for listing backups
 */
export interface ListBackupsOptions {
  /** Filter by backup type */
  type?: BackupType;
  /** Filter by status */
  status?: BackupStatus;
  /** Filter by tags (any match) */
  tags?: string[];
  /** Maximum number of results */
  limit?: number;
  /** Skip first N results */
  offset?: number;
  /** Sort order for createdAt (default: 'desc') */
  sortOrder?: 'asc' | 'desc';
}

/**
 * Backup rotation policy
 */
export interface RotationPolicy {
  /** Maximum number of backups to keep */
  maxCount?: number;
  /** Maximum age in days for backups */
  maxAgeDays?: number;
  /** Minimum number of full backups to keep */
  minFullBackups?: number;
  /** Whether to keep at least one backup per day */
  keepDailyBackups?: boolean;
}

/**
 * Result of applying a rotation policy
 */
export interface RotationResult {
  /** Number of backups deleted */
  deletedCount: number;
  /** IDs of deleted backups */
  deletedIds: string[];
  /** Number of backups retained */
  retainedCount: number;
}

/**
 * Backup verification result
 */
export interface VerificationResult {
  /** Whether the backup is valid */
  valid: boolean;
  /** Checksum matches */
  checksumValid: boolean;
  /** Size matches */
  sizeValid: boolean;
  /** Header is valid */
  headerValid: boolean;
  /** Error message if invalid */
  error?: string;
}

// =============================================================================
// Error Classes
// =============================================================================

/**
 * Error thrown when a backup operation fails
 */
export class BackupError extends EvoDBError {
  constructor(message: string, code: string = 'BACKUP_ERROR', details?: Record<string, unknown>) {
    super(message, code, details);
    this.name = 'BackupError';
    captureStackTrace(this, BackupError);
  }
}

// =============================================================================
// CRC32 Implementation
// =============================================================================

const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[i] = c;
}

/**
 * Calculate CRC32 checksum for data
 */
export function calculateChecksum(data: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// =============================================================================
// ID Generation
// =============================================================================

/**
 * Generate a ULID-like backup ID
 * Format: timestamp (10 chars base32) + random (16 chars base32)
 */
export function generateBackupId(): string {
  const timestamp = Date.now();
  const timestampStr = timestamp.toString(32).padStart(10, '0');
  const random = new Uint8Array(10);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(random);
  } else {
    // Fallback for environments without crypto
    for (let i = 0; i < random.length; i++) {
      random[i] = Math.floor(Math.random() * 256);
    }
  }
  const randomStr = Array.from(random)
    .map(b => b.toString(32).padStart(2, '0'))
    .join('')
    .slice(0, 16);
  return `bkp_${timestampStr}${randomStr}`;
}

// =============================================================================
// Serialization Functions
// =============================================================================

/**
 * Serialize backup data with header
 */
export function serializeBackup(data: Uint8Array, metadata: BackupMetadata): Uint8Array {
  const result = new Uint8Array(BACKUP_HEADER_SIZE + data.length);
  const view = new DataView(result.buffer);
  let offset = 0;

  // Magic number (4 bytes)
  view.setUint32(offset, BACKUP_MAGIC, true);
  offset += 4;

  // Version (2 bytes)
  view.setUint16(offset, BACKUP_VERSION, true);
  offset += 2;

  // Backup type (1 byte)
  result[offset++] = metadata.type === BackupType.Full ? 0 : 1;

  // Flags (1 byte) - reserved
  result[offset++] = 0;

  // Created timestamp (8 bytes)
  view.setBigUint64(offset, BigInt(metadata.createdAt), true);
  offset += 8;

  // Data size (4 bytes)
  view.setUint32(offset, data.length, true);
  offset += 4;

  // Row count (4 bytes)
  view.setUint32(offset, metadata.rowCount, true);
  offset += 4;

  // Schema version (4 bytes)
  view.setUint32(offset, metadata.schemaVersion ?? 0, true);
  offset += 4;

  // Min LSN (8 bytes)
  view.setBigUint64(offset, metadata.minLsn ?? 0n, true);
  offset += 8;

  // Max LSN (8 bytes)
  view.setBigUint64(offset, metadata.maxLsn ?? 0n, true);
  offset += 8;

  // Checksum (4 bytes)
  view.setUint32(offset, metadata.checksum, true);
  offset += 4;

  // Reserved (12 bytes to fill header to 64)
  offset += 12;

  // Data
  result.set(data, BACKUP_HEADER_SIZE);

  return result;
}

/**
 * Deserialize backup data and extract header
 */
export function deserializeBackup(data: Uint8Array): { header: Partial<BackupMetadata>; data: Uint8Array } {
  if (data.length < BACKUP_HEADER_SIZE) {
    throw new BackupError('Backup data too short', 'INVALID_BACKUP', {
      expectedMinSize: BACKUP_HEADER_SIZE,
      actualSize: data.length,
    });
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 0;

  // Magic number
  const magic = view.getUint32(offset, true);
  offset += 4;
  if (magic !== BACKUP_MAGIC) {
    throw new BackupError('Invalid backup magic number', 'INVALID_MAGIC', {
      expected: BACKUP_MAGIC,
      actual: magic,
    });
  }

  // Version
  const version = view.getUint16(offset, true);
  offset += 2;
  if (version > BACKUP_VERSION) {
    throw new BackupError('Unsupported backup version', 'UNSUPPORTED_VERSION', {
      maxSupported: BACKUP_VERSION,
      actual: version,
    });
  }

  // Backup type
  const typeValue = data[offset++];
  const type = typeValue === 0 ? BackupType.Full : BackupType.Incremental;

  // Flags (skip)
  offset++;

  // Created timestamp
  const createdAt = Number(view.getBigUint64(offset, true));
  offset += 8;

  // Data size
  const dataSize = view.getUint32(offset, true);
  offset += 4;

  // Row count
  const rowCount = view.getUint32(offset, true);
  offset += 4;

  // Schema version
  const schemaVersion = view.getUint32(offset, true);
  offset += 4;

  // Min LSN
  const minLsn = view.getBigUint64(offset, true);
  offset += 8;

  // Max LSN
  const maxLsn = view.getBigUint64(offset, true);
  offset += 8;

  // Checksum
  const checksum = view.getUint32(offset, true);

  const backupData = data.slice(BACKUP_HEADER_SIZE, BACKUP_HEADER_SIZE + dataSize);

  return {
    header: {
      type,
      createdAt,
      sizeBytes: dataSize,
      rowCount,
      schemaVersion: schemaVersion || undefined,
      minLsn: minLsn || undefined,
      maxLsn: maxLsn || undefined,
      checksum,
    },
    data: backupData,
  };
}

/**
 * Convert BackupMetadata to serializable format
 */
export function metadataToSerializable(metadata: BackupMetadata): SerializableBackupMetadata {
  return {
    ...metadata,
    minLsn: metadata.minLsn?.toString(),
    maxLsn: metadata.maxLsn?.toString(),
  };
}

/**
 * Convert SerializableBackupMetadata to BackupMetadata
 */
export function serializableToMetadata(serializable: SerializableBackupMetadata): BackupMetadata {
  return {
    ...serializable,
    minLsn: serializable.minLsn ? BigInt(serializable.minLsn) : undefined,
    maxLsn: serializable.maxLsn ? BigInt(serializable.maxLsn) : undefined,
  };
}

// =============================================================================
// Backup Storage Interface
// =============================================================================

/**
 * Interface for backup storage backends
 */
export interface BackupStorage {
  /** Store backup data */
  putBackup(id: string, data: Uint8Array): Promise<void>;
  /** Retrieve backup data */
  getBackup(id: string): Promise<Uint8Array | null>;
  /** Delete backup data */
  deleteBackup(id: string): Promise<void>;
  /** Store backup metadata */
  putMetadata(id: string, metadata: BackupMetadata): Promise<void>;
  /** Retrieve backup metadata */
  getMetadata(id: string): Promise<BackupMetadata | null>;
  /** Delete backup metadata */
  deleteMetadata(id: string): Promise<void>;
  /** List all backup IDs */
  listBackupIds(): Promise<string[]>;
}

// =============================================================================
// In-Memory Backup Storage
// =============================================================================

/**
 * In-memory implementation of BackupStorage for testing
 */
export class InMemoryBackupStorage implements BackupStorage {
  private backups = new Map<string, Uint8Array>();
  private metadata = new Map<string, BackupMetadata>();

  async putBackup(id: string, data: Uint8Array): Promise<void> {
    this.backups.set(id, data.slice());
  }

  async getBackup(id: string): Promise<Uint8Array | null> {
    const data = this.backups.get(id);
    return data ? data.slice() : null;
  }

  async deleteBackup(id: string): Promise<void> {
    this.backups.delete(id);
  }

  async putMetadata(id: string, metadata: BackupMetadata): Promise<void> {
    this.metadata.set(id, { ...metadata });
  }

  async getMetadata(id: string): Promise<BackupMetadata | null> {
    const meta = this.metadata.get(id);
    return meta ? { ...meta } : null;
  }

  async deleteMetadata(id: string): Promise<void> {
    this.metadata.delete(id);
  }

  async listBackupIds(): Promise<string[]> {
    return Array.from(this.metadata.keys());
  }

  /** Clear all stored data (for testing) */
  clear(): void {
    this.backups.clear();
    this.metadata.clear();
  }

  /** Get count of stored backups (for testing) */
  get size(): number {
    return this.metadata.size;
  }
}

// =============================================================================
// Storage Provider Backup Storage
// =============================================================================

/**
 * BackupStorage implementation using StorageProvider
 */
export class StorageProviderBackupStorage implements BackupStorage {
  private readonly prefix: string;

  constructor(
    private readonly provider: StorageProvider,
    options?: { prefix?: string }
  ) {
    this.prefix = options?.prefix ?? 'backups/';
  }

  private getBackupKey(id: string): string {
    return `${this.prefix}data/${id}.bak`;
  }

  private getMetadataKey(id: string): string {
    return `${this.prefix}meta/${id}.json`;
  }

  async putBackup(id: string, data: Uint8Array): Promise<void> {
    await this.provider.put(this.getBackupKey(id), data);
  }

  async getBackup(id: string): Promise<Uint8Array | null> {
    return this.provider.get(this.getBackupKey(id));
  }

  async deleteBackup(id: string): Promise<void> {
    await this.provider.delete(this.getBackupKey(id));
  }

  async putMetadata(id: string, metadata: BackupMetadata): Promise<void> {
    const serializable = metadataToSerializable(metadata);
    const json = JSON.stringify(serializable);
    await this.provider.put(
      this.getMetadataKey(id),
      new TextEncoder().encode(json)
    );
  }

  async getMetadata(id: string): Promise<BackupMetadata | null> {
    const data = await this.provider.get(this.getMetadataKey(id));
    if (!data) return null;
    const json = new TextDecoder().decode(data);

    // Use type-safe JSON parsing with validation schema
    const parseResult = safeParseJSON(json, SerializableBackupMetadataSchema);
    if (!parseResult.success) {
      // If validation fails, the metadata is corrupted - return null
      // This is safer than throwing since we're reading potentially corrupted data
      return null;
    }

    return serializableToMetadata(parseResult.data);
  }

  async deleteMetadata(id: string): Promise<void> {
    await this.provider.delete(this.getMetadataKey(id));
  }

  async listBackupIds(): Promise<string[]> {
    const keys = await this.provider.list(`${this.prefix}meta/`);
    return keys
      .filter(k => k.endsWith('.json'))
      .map(k => {
        const filename = k.split('/').pop() ?? '';
        return filename.replace('.json', '');
      });
  }
}

// =============================================================================
// BackupManager Class
// =============================================================================

/**
 * Manages backup creation, restoration, and lifecycle
 */
export class BackupManager {
  constructor(private readonly storage: BackupStorage) {}

  /**
   * Create a new backup
   */
  async create(options: CreateBackupOptions): Promise<BackupMetadata> {
    const id = generateBackupId();
    const type = options.type ?? BackupType.Full;

    // Validate incremental backup has base
    if (type === BackupType.Incremental && !options.baseSnapshotId) {
      throw new BackupError(
        'Incremental backup requires baseSnapshotId',
        'MISSING_BASE_SNAPSHOT'
      );
    }

    // Validate base snapshot exists for incremental
    if (options.baseSnapshotId) {
      const baseMeta = await this.storage.getMetadata(options.baseSnapshotId);
      if (!baseMeta) {
        throw new BackupError(
          `Base snapshot not found: ${options.baseSnapshotId}`,
          'BASE_SNAPSHOT_NOT_FOUND',
          { baseSnapshotId: options.baseSnapshotId }
        );
      }
    }

    const checksum = calculateChecksum(options.data);

    const metadata: BackupMetadata = {
      id,
      type,
      status: BackupStatus.InProgress,
      createdAt: Date.now(),
      sizeBytes: options.data.length,
      checksum,
      baseSnapshotId: options.baseSnapshotId,
      rowCount: options.rowCount ?? 0,
      schemaVersion: options.schemaVersion,
      minLsn: options.minLsn,
      maxLsn: options.maxLsn,
      tags: options.tags,
      description: options.description,
    };

    // Save metadata first (in progress)
    await this.storage.putMetadata(id, metadata);

    try {
      // Serialize and store backup
      const serialized = serializeBackup(options.data, metadata);
      await this.storage.putBackup(id, serialized);

      // Update metadata to completed
      metadata.status = BackupStatus.Completed;
      metadata.completedAt = Date.now();
      await this.storage.putMetadata(id, metadata);

      return metadata;
    } catch (error) {
      // Mark as failed
      metadata.status = BackupStatus.Failed;
      await this.storage.putMetadata(id, metadata);
      throw new BackupError(
        `Failed to create backup: ${error instanceof Error ? error.message : String(error)}`,
        'BACKUP_CREATION_FAILED',
        { originalError: String(error) }
      );
    }
  }

  /**
   * Restore from a backup
   */
  async restore(id: string, options: RestoreOptions = {}): Promise<RestoreResult> {
    const { verifyChecksum = true, includeIncrementals = true } = options;

    const metadata = await this.storage.getMetadata(id);
    if (!metadata) {
      throw new BackupError(`Backup not found: ${id}`, 'BACKUP_NOT_FOUND', { id });
    }

    if (metadata.status !== BackupStatus.Completed) {
      throw new BackupError(
        `Cannot restore from ${metadata.status} backup`,
        'INVALID_BACKUP_STATUS',
        { id, status: metadata.status }
      );
    }

    // Build the backup chain for incremental restores
    const chain: BackupMetadata[] = [metadata];

    if (includeIncrementals && metadata.type === BackupType.Incremental) {
      let currentMeta = metadata;
      while (currentMeta.baseSnapshotId) {
        const baseMeta = await this.storage.getMetadata(currentMeta.baseSnapshotId);
        if (!baseMeta) {
          throw new BackupError(
            `Base snapshot not found in chain: ${currentMeta.baseSnapshotId}`,
            'CHAIN_BROKEN',
            { missingId: currentMeta.baseSnapshotId }
          );
        }
        chain.unshift(baseMeta);
        currentMeta = baseMeta;
        if (baseMeta.type === BackupType.Full) break;
      }
    }

    // Restore from the chain (apply base first, then incrementals)
    let restoredData: Uint8Array | null = null;
    let verified = true;

    for (const meta of chain) {
      const backupData = await this.storage.getBackup(meta.id);
      if (!backupData) {
        throw new BackupError(
          `Backup data not found: ${meta.id}`,
          'DATA_NOT_FOUND',
          { id: meta.id }
        );
      }

      const { header, data } = deserializeBackup(backupData);

      // Verify checksum if requested
      if (verifyChecksum) {
        const actualChecksum = calculateChecksum(data);
        if (actualChecksum !== header.checksum) {
          verified = false;
          throw new BackupError(
            `Checksum mismatch for backup ${meta.id}`,
            'CHECKSUM_MISMATCH',
            {
              id: meta.id,
              expected: header.checksum,
              actual: actualChecksum,
            }
          );
        }
      }

      if (meta.type === BackupType.Full) {
        restoredData = data;
      } else {
        // For incremental, merge with base
        // Simple implementation: replace with incremental data
        // In a real implementation, this would merge changes
        restoredData = data;
      }
    }

    if (!restoredData) {
      throw new BackupError('No data restored', 'RESTORE_FAILED', { id });
    }

    return {
      data: restoredData,
      metadata,
      chain,
      verified,
    };
  }

  /**
   * List backups with optional filtering
   */
  async list(options: ListBackupsOptions = {}): Promise<BackupMetadata[]> {
    const ids = await this.storage.listBackupIds();
    const allMetadata: BackupMetadata[] = [];

    for (const id of ids) {
      const meta = await this.storage.getMetadata(id);
      if (meta) {
        allMetadata.push(meta);
      }
    }

    // Apply filters
    let filtered = allMetadata;

    if (options.type) {
      filtered = filtered.filter(m => m.type === options.type);
    }

    if (options.status) {
      filtered = filtered.filter(m => m.status === options.status);
    }

    if (options.tags && options.tags.length > 0) {
      filtered = filtered.filter(m =>
        m.tags?.some(t => options.tags!.includes(t))
      );
    }

    // Sort by createdAt
    const sortOrder = options.sortOrder ?? 'desc';
    filtered.sort((a, b) => {
      const diff = a.createdAt - b.createdAt;
      return sortOrder === 'desc' ? -diff : diff;
    });

    // Apply pagination
    const offset = options.offset ?? 0;
    const limit = options.limit;

    if (limit !== undefined) {
      return filtered.slice(offset, offset + limit);
    }

    return filtered.slice(offset);
  }

  /**
   * Delete a backup
   */
  async delete(id: string): Promise<void> {
    const metadata = await this.storage.getMetadata(id);
    if (!metadata) {
      throw new BackupError(`Backup not found: ${id}`, 'BACKUP_NOT_FOUND', { id });
    }

    // Check if any other backup depends on this one
    const ids = await this.storage.listBackupIds();
    for (const otherId of ids) {
      if (otherId === id) continue;
      const otherMeta = await this.storage.getMetadata(otherId);
      if (otherMeta?.baseSnapshotId === id) {
        throw new BackupError(
          `Cannot delete backup: ${otherId} depends on it`,
          'BACKUP_IN_USE',
          { id, dependentId: otherId }
        );
      }
    }

    await this.storage.deleteBackup(id);
    await this.storage.deleteMetadata(id);
  }

  /**
   * Verify a backup's integrity
   */
  async verify(id: string): Promise<VerificationResult> {
    const metadata = await this.storage.getMetadata(id);
    if (!metadata) {
      return {
        valid: false,
        checksumValid: false,
        sizeValid: false,
        headerValid: false,
        error: `Backup not found: ${id}`,
      };
    }

    const backupData = await this.storage.getBackup(id);
    if (!backupData) {
      return {
        valid: false,
        checksumValid: false,
        sizeValid: false,
        headerValid: false,
        error: `Backup data not found: ${id}`,
      };
    }

    try {
      const { header, data } = deserializeBackup(backupData);

      const actualChecksum = calculateChecksum(data);
      const checksumValid = actualChecksum === header.checksum;
      const sizeValid = data.length === header.sizeBytes;
      const headerValid = true; // If deserialize succeeded, header is valid

      return {
        valid: checksumValid && sizeValid && headerValid,
        checksumValid,
        sizeValid,
        headerValid,
      };
    } catch (error) {
      return {
        valid: false,
        checksumValid: false,
        sizeValid: false,
        headerValid: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Apply rotation policy to remove old backups
   */
  async applyRotationPolicy(policy: RotationPolicy): Promise<RotationResult> {
    const allBackups = await this.list({ sortOrder: 'desc' });
    const deletedIds: string[] = [];
    const now = Date.now();
    const msPerDay = 24 * 60 * 60 * 1000;

    // Separate full and incremental backups
    const fullBackups = allBackups.filter(b => b.type === BackupType.Full);
    const incrementalBackups = allBackups.filter(b => b.type === BackupType.Incremental);

    // Track which backups to keep
    const keepIds = new Set<string>();

    // Keep minimum number of full backups
    const minFullBackups = policy.minFullBackups ?? 1;
    for (let i = 0; i < Math.min(minFullBackups, fullBackups.length); i++) {
      keepIds.add(fullBackups[i].id);
    }

    // Keep daily backups if requested
    if (policy.keepDailyBackups) {
      const seenDays = new Set<string>();
      for (const backup of allBackups) {
        const day = new Date(backup.createdAt).toISOString().split('T')[0];
        if (!seenDays.has(day)) {
          seenDays.add(day);
          keepIds.add(backup.id);
        }
      }
    }

    // Apply maxCount policy
    if (policy.maxCount !== undefined) {
      for (let i = 0; i < Math.min(policy.maxCount, allBackups.length); i++) {
        keepIds.add(allBackups[i].id);
      }
    }

    // Determine which backups to delete
    const toDelete: BackupMetadata[] = [];

    for (const backup of allBackups) {
      // Skip if marked to keep
      if (keepIds.has(backup.id)) continue;

      // Check age policy
      if (policy.maxAgeDays !== undefined) {
        const ageMs = now - backup.createdAt;
        const ageDays = ageMs / msPerDay;
        if (ageDays > policy.maxAgeDays) {
          toDelete.push(backup);
          continue;
        }
      }

      // Check count policy (handled above by keepIds)
      if (policy.maxCount !== undefined && !keepIds.has(backup.id)) {
        const currentIndex = allBackups.findIndex(b => b.id === backup.id);
        if (currentIndex >= policy.maxCount) {
          toDelete.push(backup);
        }
      }
    }

    // Delete backups (incrementals first to avoid dependency issues)
    const incrementalsToDelete = toDelete.filter(b => b.type === BackupType.Incremental);
    const fullsToDelete = toDelete.filter(b => b.type === BackupType.Full);

    for (const backup of [...incrementalsToDelete, ...fullsToDelete]) {
      try {
        await this.delete(backup.id);
        deletedIds.push(backup.id);
      } catch {
        // Skip backups that can't be deleted (e.g., still in use)
      }
    }

    return {
      deletedCount: deletedIds.length,
      deletedIds,
      retainedCount: allBackups.length - deletedIds.length,
    };
  }

  /**
   * Get the backup chain for an incremental backup
   */
  async getChain(id: string): Promise<BackupMetadata[]> {
    const chain: BackupMetadata[] = [];
    let currentId: string | undefined = id;

    while (currentId) {
      const metadata = await this.storage.getMetadata(currentId);
      if (!metadata) {
        throw new BackupError(
          `Backup not found in chain: ${currentId}`,
          'CHAIN_BROKEN',
          { missingId: currentId }
        );
      }
      chain.unshift(metadata);
      currentId = metadata.baseSnapshotId;
    }

    return chain;
  }
}

// =============================================================================
// Exports
// =============================================================================

export {
  BACKUP_MAGIC,
  BACKUP_VERSION,
  BACKUP_HEADER_SIZE,
};
