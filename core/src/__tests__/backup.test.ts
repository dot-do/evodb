/**
 * Tests for Backup and Disaster Recovery Module
 *
 * TDD Issue: evodb-n58v
 *
 * This test suite covers:
 * - Point-in-time snapshots
 * - Incremental backups with change detection
 * - Restore functionality with verification
 * - Backup metadata and versioning
 * - Backup rotation policies
 * - Integrity verification with checksums
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  BackupManager,
  InMemoryBackupStorage,
  StorageProviderBackupStorage,
  BackupType,
  BackupStatus,
  BackupError,
  calculateChecksum,
  generateBackupId,
  serializeBackup,
  deserializeBackup,
  metadataToSerializable,
  serializableToMetadata,
  BACKUP_MAGIC,
  BACKUP_VERSION,
  BACKUP_HEADER_SIZE,
  type BackupMetadata,
  type CreateBackupOptions,
  type RotationPolicy,
} from '../backup.js';
import { InMemoryStorageProvider } from '../storage-provider.js';

// =============================================================================
// Test Utilities
// =============================================================================

function createTestData(content: string): Uint8Array {
  return new TextEncoder().encode(content);
}

function generateLargeTestData(sizeKB: number): Uint8Array {
  const data = new Uint8Array(sizeKB * 1024);
  for (let i = 0; i < data.length; i++) {
    data[i] = i % 256;
  }
  return data;
}

// =============================================================================
// Checksum Tests
// =============================================================================

describe('calculateChecksum', () => {
  it('should calculate CRC32 checksum for data', () => {
    const data = createTestData('hello world');
    const checksum = calculateChecksum(data);

    expect(checksum).toBeDefined();
    expect(typeof checksum).toBe('number');
    expect(checksum).toBeGreaterThan(0);
  });

  it('should return same checksum for identical data', () => {
    const data1 = createTestData('hello world');
    const data2 = createTestData('hello world');

    expect(calculateChecksum(data1)).toBe(calculateChecksum(data2));
  });

  it('should return different checksum for different data', () => {
    const data1 = createTestData('hello world');
    const data2 = createTestData('hello universe');

    expect(calculateChecksum(data1)).not.toBe(calculateChecksum(data2));
  });

  it('should handle empty data', () => {
    const data = new Uint8Array(0);
    const checksum = calculateChecksum(data);

    expect(checksum).toBeDefined();
    expect(typeof checksum).toBe('number');
  });

  it('should handle large data efficiently', () => {
    const data = generateLargeTestData(100); // 100KB
    const start = Date.now();
    const checksum = calculateChecksum(data);
    const elapsed = Date.now() - start;

    expect(checksum).toBeDefined();
    expect(elapsed).toBeLessThan(100); // Should complete in < 100ms
  });
});

// =============================================================================
// ID Generation Tests
// =============================================================================

describe('generateBackupId', () => {
  it('should generate unique IDs', () => {
    const id1 = generateBackupId();
    const id2 = generateBackupId();

    expect(id1).not.toBe(id2);
  });

  it('should generate IDs with correct prefix', () => {
    const id = generateBackupId();

    expect(id.startsWith('bkp_')).toBe(true);
  });

  it('should generate IDs of consistent length', () => {
    const id1 = generateBackupId();
    const id2 = generateBackupId();

    expect(id1.length).toBe(id2.length);
  });

  it('should include timestamp component', () => {
    const id1 = generateBackupId();
    // Wait a bit to ensure different timestamp
    const id2 = generateBackupId();

    // The timestamp portion (chars 4-14) should be sortable
    const ts1 = id1.slice(4, 14);
    const ts2 = id2.slice(4, 14);
    expect(ts1 <= ts2).toBe(true);
  });
});

// =============================================================================
// Serialization Tests
// =============================================================================

describe('serializeBackup/deserializeBackup', () => {
  it('should serialize and deserialize backup data', () => {
    const data = createTestData('test data');
    const metadata: BackupMetadata = {
      id: generateBackupId(),
      type: BackupType.Full,
      status: BackupStatus.Completed,
      createdAt: Date.now(),
      sizeBytes: data.length,
      checksum: calculateChecksum(data),
      rowCount: 100,
      schemaVersion: 1,
      minLsn: 1n,
      maxLsn: 100n,
    };

    const serialized = serializeBackup(data, metadata);
    const { header, data: deserializedData } = deserializeBackup(serialized);

    expect(deserializedData).toEqual(data);
    expect(header.type).toBe(metadata.type);
    expect(header.checksum).toBe(metadata.checksum);
    expect(header.rowCount).toBe(metadata.rowCount);
    expect(header.schemaVersion).toBe(metadata.schemaVersion);
  });

  it('should include magic number in header', () => {
    const data = createTestData('test');
    const metadata: BackupMetadata = {
      id: generateBackupId(),
      type: BackupType.Full,
      status: BackupStatus.Completed,
      createdAt: Date.now(),
      sizeBytes: data.length,
      checksum: calculateChecksum(data),
      rowCount: 0,
    };

    const serialized = serializeBackup(data, metadata);
    const view = new DataView(serialized.buffer);
    const magic = view.getUint32(0, true);

    expect(magic).toBe(BACKUP_MAGIC);
  });

  it('should reject data with invalid magic number', () => {
    const invalidData = new Uint8Array(BACKUP_HEADER_SIZE + 10);
    // Set wrong magic number
    new DataView(invalidData.buffer).setUint32(0, 0x12345678, true);

    expect(() => deserializeBackup(invalidData)).toThrow(BackupError);
  });

  it('should reject data that is too short', () => {
    const shortData = new Uint8Array(10);

    expect(() => deserializeBackup(shortData)).toThrow(BackupError);
    expect(() => deserializeBackup(shortData)).toThrow('too short');
  });

  it('should preserve LSN values', () => {
    const data = createTestData('test');
    const metadata: BackupMetadata = {
      id: generateBackupId(),
      type: BackupType.Full,
      status: BackupStatus.Completed,
      createdAt: Date.now(),
      sizeBytes: data.length,
      checksum: calculateChecksum(data),
      rowCount: 0,
      minLsn: 9007199254740993n, // > Number.MAX_SAFE_INTEGER
      maxLsn: 9007199254740999n,
    };

    const serialized = serializeBackup(data, metadata);
    const { header } = deserializeBackup(serialized);

    expect(header.minLsn).toBe(9007199254740993n);
    expect(header.maxLsn).toBe(9007199254740999n);
  });
});

// =============================================================================
// Metadata Serialization Tests
// =============================================================================

describe('metadataToSerializable/serializableToMetadata', () => {
  it('should convert bigint LSN to string and back', () => {
    const metadata: BackupMetadata = {
      id: 'test-id',
      type: BackupType.Full,
      status: BackupStatus.Completed,
      createdAt: Date.now(),
      sizeBytes: 100,
      checksum: 12345,
      rowCount: 10,
      minLsn: 9007199254740993n,
      maxLsn: 9007199254740999n,
    };

    const serializable = metadataToSerializable(metadata);
    expect(serializable.minLsn).toBe('9007199254740993');
    expect(serializable.maxLsn).toBe('9007199254740999');

    const restored = serializableToMetadata(serializable);
    expect(restored.minLsn).toBe(metadata.minLsn);
    expect(restored.maxLsn).toBe(metadata.maxLsn);
  });

  it('should handle undefined LSN values', () => {
    const metadata: BackupMetadata = {
      id: 'test-id',
      type: BackupType.Full,
      status: BackupStatus.Completed,
      createdAt: Date.now(),
      sizeBytes: 100,
      checksum: 12345,
      rowCount: 10,
    };

    const serializable = metadataToSerializable(metadata);
    expect(serializable.minLsn).toBeUndefined();
    expect(serializable.maxLsn).toBeUndefined();

    const restored = serializableToMetadata(serializable);
    expect(restored.minLsn).toBeUndefined();
    expect(restored.maxLsn).toBeUndefined();
  });
});

// =============================================================================
// InMemoryBackupStorage Tests
// =============================================================================

describe('InMemoryBackupStorage', () => {
  let storage: InMemoryBackupStorage;

  beforeEach(() => {
    storage = new InMemoryBackupStorage();
  });

  it('should store and retrieve backup data', async () => {
    const data = createTestData('test data');
    await storage.putBackup('test-id', data);

    const retrieved = await storage.getBackup('test-id');
    expect(retrieved).toEqual(data);
  });

  it('should return null for non-existent backup', async () => {
    const result = await storage.getBackup('non-existent');
    expect(result).toBeNull();
  });

  it('should store and retrieve metadata', async () => {
    const metadata: BackupMetadata = {
      id: 'test-id',
      type: BackupType.Full,
      status: BackupStatus.Completed,
      createdAt: Date.now(),
      sizeBytes: 100,
      checksum: 12345,
      rowCount: 10,
    };

    await storage.putMetadata('test-id', metadata);
    const retrieved = await storage.getMetadata('test-id');

    expect(retrieved).toEqual(metadata);
  });

  it('should list backup IDs', async () => {
    const meta1: BackupMetadata = {
      id: 'id-1',
      type: BackupType.Full,
      status: BackupStatus.Completed,
      createdAt: Date.now(),
      sizeBytes: 100,
      checksum: 1,
      rowCount: 0,
    };
    const meta2: BackupMetadata = {
      id: 'id-2',
      type: BackupType.Full,
      status: BackupStatus.Completed,
      createdAt: Date.now(),
      sizeBytes: 100,
      checksum: 2,
      rowCount: 0,
    };

    await storage.putMetadata('id-1', meta1);
    await storage.putMetadata('id-2', meta2);

    const ids = await storage.listBackupIds();
    expect(ids).toContain('id-1');
    expect(ids).toContain('id-2');
  });

  it('should delete backup and metadata', async () => {
    const data = createTestData('test');
    const metadata: BackupMetadata = {
      id: 'test-id',
      type: BackupType.Full,
      status: BackupStatus.Completed,
      createdAt: Date.now(),
      sizeBytes: data.length,
      checksum: calculateChecksum(data),
      rowCount: 0,
    };

    await storage.putBackup('test-id', data);
    await storage.putMetadata('test-id', metadata);

    await storage.deleteBackup('test-id');
    await storage.deleteMetadata('test-id');

    expect(await storage.getBackup('test-id')).toBeNull();
    expect(await storage.getMetadata('test-id')).toBeNull();
  });

  it('should make defensive copies', async () => {
    const data = createTestData('test');
    await storage.putBackup('test-id', data);

    // Modify original data
    data[0] = 0xFF;

    // Retrieved data should be unchanged
    const retrieved = await storage.getBackup('test-id');
    expect(retrieved![0]).not.toBe(0xFF);
  });
});

// =============================================================================
// StorageProviderBackupStorage Tests
// =============================================================================

describe('StorageProviderBackupStorage', () => {
  let provider: InMemoryStorageProvider;
  let storage: StorageProviderBackupStorage;

  beforeEach(() => {
    provider = new InMemoryStorageProvider();
    storage = new StorageProviderBackupStorage(provider);
  });

  it('should store and retrieve backup data', async () => {
    const data = createTestData('test data');
    await storage.putBackup('test-id', data);

    const retrieved = await storage.getBackup('test-id');
    expect(retrieved).toEqual(data);
  });

  it('should store and retrieve metadata', async () => {
    const metadata: BackupMetadata = {
      id: 'test-id',
      type: BackupType.Full,
      status: BackupStatus.Completed,
      createdAt: Date.now(),
      sizeBytes: 100,
      checksum: 12345,
      rowCount: 10,
      minLsn: 1n,
      maxLsn: 100n,
    };

    await storage.putMetadata('test-id', metadata);
    const retrieved = await storage.getMetadata('test-id');

    expect(retrieved).toEqual(metadata);
  });

  it('should use custom prefix', async () => {
    const customStorage = new StorageProviderBackupStorage(provider, {
      prefix: 'custom/path/',
    });

    const data = createTestData('test');
    await customStorage.putBackup('test-id', data);

    // Verify it's stored under the custom prefix
    const exists = await provider.exists('custom/path/data/test-id.bak');
    expect(exists).toBe(true);
  });

  it('should list backup IDs', async () => {
    const meta1: BackupMetadata = {
      id: 'id-1',
      type: BackupType.Full,
      status: BackupStatus.Completed,
      createdAt: Date.now(),
      sizeBytes: 100,
      checksum: 1,
      rowCount: 0,
    };

    await storage.putMetadata('id-1', meta1);

    const ids = await storage.listBackupIds();
    expect(ids).toContain('id-1');
  });
});

// =============================================================================
// BackupManager - Create Tests
// =============================================================================

describe('BackupManager.create', () => {
  let storage: InMemoryBackupStorage;
  let manager: BackupManager;

  beforeEach(() => {
    storage = new InMemoryBackupStorage();
    manager = new BackupManager(storage);
  });

  it('should create a full backup', async () => {
    const data = createTestData('test database state');

    const metadata = await manager.create({
      data,
      type: BackupType.Full,
      rowCount: 100,
    });

    expect(metadata.id).toBeDefined();
    expect(metadata.type).toBe(BackupType.Full);
    expect(metadata.status).toBe(BackupStatus.Completed);
    expect(metadata.sizeBytes).toBe(data.length);
    expect(metadata.rowCount).toBe(100);
    expect(metadata.completedAt).toBeDefined();
  });

  it('should default to full backup type', async () => {
    const data = createTestData('test');

    const metadata = await manager.create({ data });

    expect(metadata.type).toBe(BackupType.Full);
  });

  it('should create incremental backup with base snapshot', async () => {
    // Create full backup first
    const fullData = createTestData('full backup data');
    const fullBackup = await manager.create({
      data: fullData,
      type: BackupType.Full,
    });

    // Create incremental backup
    const incrData = createTestData('incremental changes');
    const incrBackup = await manager.create({
      data: incrData,
      type: BackupType.Incremental,
      baseSnapshotId: fullBackup.id,
    });

    expect(incrBackup.type).toBe(BackupType.Incremental);
    expect(incrBackup.baseSnapshotId).toBe(fullBackup.id);
  });

  it('should throw error for incremental without base', async () => {
    const data = createTestData('test');

    await expect(
      manager.create({
        data,
        type: BackupType.Incremental,
      })
    ).rejects.toThrow(BackupError);
  });

  it('should throw error for non-existent base snapshot', async () => {
    const data = createTestData('test');

    await expect(
      manager.create({
        data,
        type: BackupType.Incremental,
        baseSnapshotId: 'non-existent-id',
      })
    ).rejects.toThrow('Base snapshot not found');
  });

  it('should include optional metadata fields', async () => {
    const data = createTestData('test');

    const metadata = await manager.create({
      data,
      type: BackupType.Full,
      schemaVersion: 5,
      minLsn: 100n,
      maxLsn: 200n,
      tags: ['daily', 'production'],
      description: 'Daily production backup',
    });

    expect(metadata.schemaVersion).toBe(5);
    expect(metadata.minLsn).toBe(100n);
    expect(metadata.maxLsn).toBe(200n);
    expect(metadata.tags).toEqual(['daily', 'production']);
    expect(metadata.description).toBe('Daily production backup');
  });

  it('should calculate checksum correctly', async () => {
    const data = createTestData('test data for checksum');

    const metadata = await manager.create({ data });

    expect(metadata.checksum).toBe(calculateChecksum(data));
  });
});

// =============================================================================
// BackupManager - Restore Tests
// =============================================================================

describe('BackupManager.restore', () => {
  let storage: InMemoryBackupStorage;
  let manager: BackupManager;

  beforeEach(() => {
    storage = new InMemoryBackupStorage();
    manager = new BackupManager(storage);
  });

  it('should restore from a full backup', async () => {
    const originalData = createTestData('original database state');
    const backup = await manager.create({
      data: originalData,
      type: BackupType.Full,
    });

    const result = await manager.restore(backup.id);

    expect(result.data).toEqual(originalData);
    expect(result.metadata.id).toBe(backup.id);
    expect(result.verified).toBe(true);
  });

  it('should throw error for non-existent backup', async () => {
    await expect(
      manager.restore('non-existent-id')
    ).rejects.toThrow('Backup not found');
  });

  it('should throw error for incomplete backup', async () => {
    // Create backup metadata manually with InProgress status
    const metadata: BackupMetadata = {
      id: 'test-id',
      type: BackupType.Full,
      status: BackupStatus.InProgress,
      createdAt: Date.now(),
      sizeBytes: 100,
      checksum: 12345,
      rowCount: 0,
    };
    await storage.putMetadata('test-id', metadata);

    await expect(
      manager.restore('test-id')
    ).rejects.toThrow('Cannot restore from in_progress backup');
  });

  it('should verify checksum during restore', async () => {
    const data = createTestData('test data');
    const backup = await manager.create({ data });

    // Corrupt the stored backup data
    const backupData = await storage.getBackup(backup.id);
    if (backupData) {
      backupData[BACKUP_HEADER_SIZE + 5] = 0xFF; // Corrupt some data
      await storage.putBackup(backup.id, backupData);
    }

    await expect(
      manager.restore(backup.id, { verifyChecksum: true })
    ).rejects.toThrow('Checksum mismatch');
  });

  it('should allow skipping checksum verification', async () => {
    const data = createTestData('test data');
    const backup = await manager.create({ data });

    // Corrupt the stored backup data
    const backupData = await storage.getBackup(backup.id);
    if (backupData) {
      backupData[BACKUP_HEADER_SIZE + 5] = 0xFF;
      await storage.putBackup(backup.id, backupData);
    }

    // Should not throw with verifyChecksum: false
    const result = await manager.restore(backup.id, { verifyChecksum: false });
    expect(result.verified).toBe(true); // No verification performed
  });

  it('should restore incremental backup chain', async () => {
    // Create full backup
    const fullData = createTestData('full backup');
    const fullBackup = await manager.create({
      data: fullData,
      type: BackupType.Full,
    });

    // Create incremental backup
    const incrData = createTestData('incremental changes');
    const incrBackup = await manager.create({
      data: incrData,
      type: BackupType.Incremental,
      baseSnapshotId: fullBackup.id,
    });

    const result = await manager.restore(incrBackup.id);

    expect(result.chain).toHaveLength(2);
    expect(result.chain[0].id).toBe(fullBackup.id);
    expect(result.chain[1].id).toBe(incrBackup.id);
  });

  it('should throw error for broken chain', async () => {
    // Create incremental backup with manually set base
    const incrData = createTestData('incremental');
    const backup = await manager.create({
      data: incrData,
      type: BackupType.Full, // Start as full to bypass validation
    });

    // Manually modify metadata to make it look like incremental with missing base
    const metadata = await storage.getMetadata(backup.id);
    if (metadata) {
      metadata.type = BackupType.Incremental;
      metadata.baseSnapshotId = 'missing-base-id';
      await storage.putMetadata(backup.id, metadata);
    }

    await expect(
      manager.restore(backup.id)
    ).rejects.toThrow('Base snapshot not found in chain');
  });
});

// =============================================================================
// BackupManager - List Tests
// =============================================================================

describe('BackupManager.list', () => {
  let storage: InMemoryBackupStorage;
  let manager: BackupManager;

  beforeEach(() => {
    storage = new InMemoryBackupStorage();
    manager = new BackupManager(storage);
  });

  it('should list all backups', async () => {
    const data = createTestData('test');
    await manager.create({ data, tags: ['tag1'] });
    await manager.create({ data, tags: ['tag2'] });
    await manager.create({ data, tags: ['tag3'] });

    const backups = await manager.list();

    expect(backups).toHaveLength(3);
  });

  it('should filter by backup type', async () => {
    const data = createTestData('test');
    const fullBackup = await manager.create({ data, type: BackupType.Full });
    await manager.create({
      data,
      type: BackupType.Incremental,
      baseSnapshotId: fullBackup.id,
    });

    const fullBackups = await manager.list({ type: BackupType.Full });

    expect(fullBackups).toHaveLength(1);
    expect(fullBackups[0].type).toBe(BackupType.Full);
  });

  it('should filter by status', async () => {
    const data = createTestData('test');
    await manager.create({ data });

    const completed = await manager.list({ status: BackupStatus.Completed });
    const failed = await manager.list({ status: BackupStatus.Failed });

    expect(completed).toHaveLength(1);
    expect(failed).toHaveLength(0);
  });

  it('should filter by tags', async () => {
    const data = createTestData('test');
    await manager.create({ data, tags: ['daily'] });
    await manager.create({ data, tags: ['weekly'] });
    await manager.create({ data, tags: ['daily', 'production'] });

    const dailyBackups = await manager.list({ tags: ['daily'] });

    expect(dailyBackups).toHaveLength(2);
  });

  it('should sort by createdAt descending by default', async () => {
    const data = createTestData('test');
    await manager.create({ data });
    // Small delay to ensure different timestamps
    await new Promise(resolve => setTimeout(resolve, 10));
    await manager.create({ data });

    const backups = await manager.list();

    expect(backups[0].createdAt).toBeGreaterThanOrEqual(backups[1].createdAt);
  });

  it('should sort ascending when requested', async () => {
    const data = createTestData('test');
    await manager.create({ data });
    await new Promise(resolve => setTimeout(resolve, 10));
    await manager.create({ data });

    const backups = await manager.list({ sortOrder: 'asc' });

    expect(backups[0].createdAt).toBeLessThanOrEqual(backups[1].createdAt);
  });

  it('should apply limit and offset', async () => {
    const data = createTestData('test');
    await manager.create({ data });
    await manager.create({ data });
    await manager.create({ data });

    const page1 = await manager.list({ limit: 2, offset: 0 });
    const page2 = await manager.list({ limit: 2, offset: 2 });

    expect(page1).toHaveLength(2);
    expect(page2).toHaveLength(1);
  });
});

// =============================================================================
// BackupManager - Delete Tests
// =============================================================================

describe('BackupManager.delete', () => {
  let storage: InMemoryBackupStorage;
  let manager: BackupManager;

  beforeEach(() => {
    storage = new InMemoryBackupStorage();
    manager = new BackupManager(storage);
  });

  it('should delete a backup', async () => {
    const data = createTestData('test');
    const backup = await manager.create({ data });

    await manager.delete(backup.id);

    const backups = await manager.list();
    expect(backups).toHaveLength(0);
  });

  it('should throw error for non-existent backup', async () => {
    await expect(
      manager.delete('non-existent-id')
    ).rejects.toThrow('Backup not found');
  });

  it('should prevent deleting backup that has dependents', async () => {
    const data = createTestData('test');
    const fullBackup = await manager.create({ data, type: BackupType.Full });
    await manager.create({
      data,
      type: BackupType.Incremental,
      baseSnapshotId: fullBackup.id,
    });

    await expect(
      manager.delete(fullBackup.id)
    ).rejects.toThrow('depends on it');
  });

  it('should allow deleting incremental backup', async () => {
    const data = createTestData('test');
    const fullBackup = await manager.create({ data, type: BackupType.Full });
    const incrBackup = await manager.create({
      data,
      type: BackupType.Incremental,
      baseSnapshotId: fullBackup.id,
    });

    await manager.delete(incrBackup.id);

    const backups = await manager.list();
    expect(backups).toHaveLength(1);
    expect(backups[0].id).toBe(fullBackup.id);
  });
});

// =============================================================================
// BackupManager - Verify Tests
// =============================================================================

describe('BackupManager.verify', () => {
  let storage: InMemoryBackupStorage;
  let manager: BackupManager;

  beforeEach(() => {
    storage = new InMemoryBackupStorage();
    manager = new BackupManager(storage);
  });

  it('should verify a valid backup', async () => {
    const data = createTestData('test data');
    const backup = await manager.create({ data });

    const result = await manager.verify(backup.id);

    expect(result.valid).toBe(true);
    expect(result.checksumValid).toBe(true);
    expect(result.sizeValid).toBe(true);
    expect(result.headerValid).toBe(true);
  });

  it('should detect corrupted checksum', async () => {
    const data = createTestData('test data');
    const backup = await manager.create({ data });

    // Corrupt the stored backup data
    const backupData = await storage.getBackup(backup.id);
    if (backupData) {
      backupData[BACKUP_HEADER_SIZE + 5] = 0xFF;
      await storage.putBackup(backup.id, backupData);
    }

    const result = await manager.verify(backup.id);

    expect(result.valid).toBe(false);
    expect(result.checksumValid).toBe(false);
  });

  it('should return invalid for non-existent backup', async () => {
    const result = await manager.verify('non-existent-id');

    expect(result.valid).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('should return invalid for missing backup data', async () => {
    // Create metadata without data
    const metadata: BackupMetadata = {
      id: 'test-id',
      type: BackupType.Full,
      status: BackupStatus.Completed,
      createdAt: Date.now(),
      sizeBytes: 100,
      checksum: 12345,
      rowCount: 0,
    };
    await storage.putMetadata('test-id', metadata);

    const result = await manager.verify('test-id');

    expect(result.valid).toBe(false);
    expect(result.error).toContain('data not found');
  });
});

// =============================================================================
// BackupManager - Rotation Policy Tests
// =============================================================================

describe('BackupManager.applyRotationPolicy', () => {
  let storage: InMemoryBackupStorage;
  let manager: BackupManager;

  beforeEach(() => {
    storage = new InMemoryBackupStorage();
    manager = new BackupManager(storage);
  });

  it('should apply maxCount policy', async () => {
    const data = createTestData('test');
    await manager.create({ data });
    await manager.create({ data });
    await manager.create({ data });
    await manager.create({ data });
    await manager.create({ data });

    const result = await manager.applyRotationPolicy({ maxCount: 3 });

    expect(result.deletedCount).toBe(2);
    expect(result.retainedCount).toBe(3);
    const remaining = await manager.list();
    expect(remaining).toHaveLength(3);
  });

  it('should apply maxAgeDays policy', async () => {
    const data = createTestData('test');

    // Create a backup
    const backup = await manager.create({ data });

    // Manually backdate the metadata
    const metadata = await storage.getMetadata(backup.id);
    if (metadata) {
      metadata.createdAt = Date.now() - (31 * 24 * 60 * 60 * 1000); // 31 days ago
      await storage.putMetadata(backup.id, metadata);
    }

    // Create a recent backup
    await manager.create({ data });

    const result = await manager.applyRotationPolicy({ maxAgeDays: 30 });

    expect(result.deletedCount).toBe(1);
    expect(result.retainedCount).toBe(1);
  });

  it('should keep minFullBackups', async () => {
    const data = createTestData('test');
    await manager.create({ data, type: BackupType.Full });
    await manager.create({ data, type: BackupType.Full });
    await manager.create({ data, type: BackupType.Full });

    const result = await manager.applyRotationPolicy({
      maxCount: 1,
      minFullBackups: 2,
    });

    expect(result.retainedCount).toBe(2);
    const remaining = await manager.list();
    expect(remaining.filter(b => b.type === BackupType.Full)).toHaveLength(2);
  });

  it('should handle empty backup list', async () => {
    const result = await manager.applyRotationPolicy({ maxCount: 5 });

    expect(result.deletedCount).toBe(0);
    expect(result.retainedCount).toBe(0);
    expect(result.deletedIds).toHaveLength(0);
  });

  it('should delete incrementals before full backups', async () => {
    const data = createTestData('test');
    const fullBackup = await manager.create({ data, type: BackupType.Full });

    // Create multiple incrementals
    await manager.create({
      data,
      type: BackupType.Incremental,
      baseSnapshotId: fullBackup.id,
    });
    await manager.create({
      data,
      type: BackupType.Incremental,
      baseSnapshotId: fullBackup.id,
    });

    const result = await manager.applyRotationPolicy({
      maxCount: 2,
      minFullBackups: 1,
    });

    // Should delete incrementals first
    expect(result.deletedCount).toBeGreaterThanOrEqual(1);
    const remaining = await manager.list();
    expect(remaining.some(b => b.type === BackupType.Full)).toBe(true);
  });
});

// =============================================================================
// BackupManager - getChain Tests
// =============================================================================

describe('BackupManager.getChain', () => {
  let storage: InMemoryBackupStorage;
  let manager: BackupManager;

  beforeEach(() => {
    storage = new InMemoryBackupStorage();
    manager = new BackupManager(storage);
  });

  it('should return single-element chain for full backup', async () => {
    const data = createTestData('test');
    const backup = await manager.create({ data, type: BackupType.Full });

    const chain = await manager.getChain(backup.id);

    expect(chain).toHaveLength(1);
    expect(chain[0].id).toBe(backup.id);
  });

  it('should return full chain for incremental backup', async () => {
    const data = createTestData('test');
    const full = await manager.create({ data, type: BackupType.Full });
    const incr1 = await manager.create({
      data,
      type: BackupType.Incremental,
      baseSnapshotId: full.id,
    });
    const incr2 = await manager.create({
      data,
      type: BackupType.Incremental,
      baseSnapshotId: incr1.id,
    });

    const chain = await manager.getChain(incr2.id);

    expect(chain).toHaveLength(3);
    expect(chain[0].id).toBe(full.id);
    expect(chain[1].id).toBe(incr1.id);
    expect(chain[2].id).toBe(incr2.id);
  });

  it('should throw error for broken chain', async () => {
    const data = createTestData('test');
    const backup = await manager.create({ data, type: BackupType.Full });

    // Modify metadata to point to non-existent base
    const metadata = await storage.getMetadata(backup.id);
    if (metadata) {
      metadata.baseSnapshotId = 'missing-base';
      await storage.putMetadata(backup.id, metadata);
    }

    await expect(
      manager.getChain(backup.id)
    ).rejects.toThrow('Backup not found in chain');
  });
});

// =============================================================================
// Error Class Tests
// =============================================================================

describe('BackupError', () => {
  it('should extend EvoDBError', () => {
    const error = new BackupError('Test error', 'TEST_CODE');

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('BackupError');
    expect(error.code).toBe('TEST_CODE');
    expect(error.message).toBe('Test error');
  });

  it('should include details', () => {
    const error = new BackupError('Test error', 'TEST_CODE', { key: 'value' });

    expect(error.details).toEqual({ key: 'value' });
  });

  it('should use default code', () => {
    const error = new BackupError('Test error');

    expect(error.code).toBe('BACKUP_ERROR');
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe('Backup Integration', () => {
  let storage: InMemoryBackupStorage;
  let manager: BackupManager;

  beforeEach(() => {
    storage = new InMemoryBackupStorage();
    manager = new BackupManager(storage);
  });

  it('should handle complete backup/restore cycle', async () => {
    // Simulate database state
    const dbState = {
      users: [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ],
      posts: [
        { id: 1, title: 'Hello', userId: 1 },
      ],
    };

    const originalData = new TextEncoder().encode(JSON.stringify(dbState));

    // Create backup
    const backup = await manager.create({
      data: originalData,
      type: BackupType.Full,
      rowCount: 3,
      tags: ['production', 'daily'],
    });

    // Verify backup
    const verification = await manager.verify(backup.id);
    expect(verification.valid).toBe(true);

    // Restore backup
    const restored = await manager.restore(backup.id);

    // Verify restored data matches original
    expect(restored.data).toEqual(originalData);

    const restoredState = JSON.parse(new TextDecoder().decode(restored.data));
    expect(restoredState).toEqual(dbState);
  });

  it('should handle incremental backup chain', async () => {
    const encoder = new TextEncoder();

    // Create full backup
    const fullState = { version: 1, data: 'initial' };
    const fullBackup = await manager.create({
      data: encoder.encode(JSON.stringify(fullState)),
      type: BackupType.Full,
    });

    // Create incremental backup
    const incrState1 = { version: 2, data: 'updated' };
    const incr1 = await manager.create({
      data: encoder.encode(JSON.stringify(incrState1)),
      type: BackupType.Incremental,
      baseSnapshotId: fullBackup.id,
    });

    // Create another incremental
    const incrState2 = { version: 3, data: 'final' };
    const incr2 = await manager.create({
      data: encoder.encode(JSON.stringify(incrState2)),
      type: BackupType.Incremental,
      baseSnapshotId: incr1.id,
    });

    // Restore from latest
    const restored = await manager.restore(incr2.id);

    expect(restored.chain).toHaveLength(3);
    expect(restored.chain.map(m => m.id)).toEqual([
      fullBackup.id,
      incr1.id,
      incr2.id,
    ]);
  });

  it('should handle large data sets', async () => {
    const largeData = generateLargeTestData(500); // 500KB

    const backup = await manager.create({
      data: largeData,
      type: BackupType.Full,
      rowCount: 10000,
    });

    const restored = await manager.restore(backup.id);

    expect(restored.data.length).toBe(largeData.length);
    expect(restored.data).toEqual(largeData);
  });
});
