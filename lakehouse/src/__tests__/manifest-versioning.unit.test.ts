/**
 * Manifest Versioning Tests
 *
 * Tests for manifest schema versioning support:
 * - schemaVersion field on manifest
 * - Version validation during read operations
 * - VersionMismatchError for incompatible versions
 * - Migration path documentation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTable,
  serializeManifest,
  deserializeManifest,
  ManifestError,
} from '../manifest.js';
import {
  CURRENT_MANIFEST_VERSION,
  VersionMismatchError,
} from '../types.js';
import type { TableManifest } from '../types.js';
import {
  createMemoryTableStorage,
  TableStorage,
} from '../r2.js';

describe('Manifest Versioning', () => {
  describe('schemaVersion field', () => {
    it('should have schemaVersion field in TableManifest type', () => {
      // Create a new table and verify it has schemaVersion
      const { manifest } = createTable({
        location: 'test/table',
        schema: {
          columns: [{ name: 'id', type: 'int64', nullable: false }],
        },
      });

      // schemaVersion should be set to current version
      expect(manifest.schemaVersion).toBeDefined();
      expect(typeof manifest.schemaVersion).toBe('number');
    });

    it('should set schemaVersion to CURRENT_MANIFEST_VERSION on new tables', () => {
      const { manifest } = createTable({
        location: 'test/table',
        schema: {
          columns: [{ name: 'id', type: 'int64', nullable: false }],
        },
      });

      expect(manifest.schemaVersion).toBe(CURRENT_MANIFEST_VERSION);
    });

    it('should export CURRENT_MANIFEST_VERSION constant', () => {
      expect(CURRENT_MANIFEST_VERSION).toBeDefined();
      expect(typeof CURRENT_MANIFEST_VERSION).toBe('number');
      expect(CURRENT_MANIFEST_VERSION).toBe(1);
    });
  });

  describe('version 1 compatibility', () => {
    it('should successfully read manifest version 1', () => {
      const manifestV1 = {
        schemaVersion: 1,
        formatVersion: 1,
        tableId: 'test-table-id',
        location: 'test/table',
        currentSchemaId: 1,
        schemas: [{ schemaId: 1, path: '_schema/v1.json' }],
        partitionSpec: { specId: 0, fields: [] },
        currentSnapshotId: null,
        snapshots: [],
        stats: {
          totalRows: 0,
          totalFiles: 0,
          totalSizeBytes: 0,
          lastSnapshotTimestamp: null,
        },
        properties: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const json = JSON.stringify(manifestV1);
      const deserialized = deserializeManifest(json);

      expect(deserialized.schemaVersion).toBe(1);
      expect(deserialized.tableId).toBe('test-table-id');
    });

    it('should deserialize legacy manifests without schemaVersion as version 1', () => {
      // Simulate a legacy manifest that was created before schemaVersion existed
      const legacyManifest = {
        formatVersion: 1,
        tableId: 'legacy-table',
        location: 'test/legacy',
        currentSchemaId: 1,
        schemas: [{ schemaId: 1, path: '_schema/v1.json' }],
        partitionSpec: { specId: 0, fields: [] },
        currentSnapshotId: null,
        snapshots: [],
        stats: {
          totalRows: 0,
          totalFiles: 0,
          totalSizeBytes: 0,
          lastSnapshotTimestamp: null,
        },
        properties: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const json = JSON.stringify(legacyManifest);
      const deserialized = deserializeManifest(json);

      // Should default to version 1 for backward compatibility
      expect(deserialized.schemaVersion).toBe(1);
    });
  });

  describe('VersionMismatchError', () => {
    it('should throw VersionMismatchError for future manifest versions', () => {
      const futureManifest = {
        schemaVersion: 999, // Future version
        formatVersion: 1,
        tableId: 'future-table',
        location: 'test/future',
        currentSchemaId: 1,
        schemas: [{ schemaId: 1, path: '_schema/v1.json' }],
        partitionSpec: { specId: 0, fields: [] },
        currentSnapshotId: null,
        snapshots: [],
        stats: {
          totalRows: 0,
          totalFiles: 0,
          totalSizeBytes: 0,
          lastSnapshotTimestamp: null,
        },
        properties: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const json = JSON.stringify(futureManifest);

      expect(() => deserializeManifest(json)).toThrow(VersionMismatchError);
    });

    it('should include version info in VersionMismatchError message', () => {
      const futureManifest = {
        schemaVersion: 42,
        formatVersion: 1,
        tableId: 'future-table',
        location: 'test/future',
        currentSchemaId: 1,
        schemas: [{ schemaId: 1, path: '_schema/v1.json' }],
        partitionSpec: { specId: 0, fields: [] },
        currentSnapshotId: null,
        snapshots: [],
        stats: {
          totalRows: 0,
          totalFiles: 0,
          totalSizeBytes: 0,
          lastSnapshotTimestamp: null,
        },
        properties: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const json = JSON.stringify(futureManifest);

      try {
        deserializeManifest(json);
        expect.fail('Should have thrown VersionMismatchError');
      } catch (error) {
        expect(error).toBeInstanceOf(VersionMismatchError);
        const versionError = error as VersionMismatchError;
        expect(versionError.message).toContain('42');
        expect(versionError.message).toContain(String(CURRENT_MANIFEST_VERSION));
        expect(versionError.foundVersion).toBe(42);
        expect(versionError.supportedVersion).toBe(CURRENT_MANIFEST_VERSION);
      }
    });

    it('should export VersionMismatchError class', () => {
      expect(VersionMismatchError).toBeDefined();
      const error = new VersionMismatchError(99, CURRENT_MANIFEST_VERSION);
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('VersionMismatchError');
    });
  });

  describe('writeManifest version handling', () => {
    let storage: TableStorage;

    beforeEach(() => {
      storage = createMemoryTableStorage('test/versioned');
    });

    it('should preserve schemaVersion when writing manifest', async () => {
      const { manifest } = createTable({
        location: 'test/versioned',
        schema: {
          columns: [{ name: 'id', type: 'int64', nullable: false }],
        },
      });

      await storage.writeManifest(manifest);
      const read = await storage.readManifest();

      expect(read).not.toBeNull();
      expect(read!.schemaVersion).toBe(CURRENT_MANIFEST_VERSION);
    });

    it('should set schemaVersion to current version on serialization', () => {
      const { manifest } = createTable({
        location: 'test/table',
        schema: {
          columns: [{ name: 'id', type: 'int64', nullable: false }],
        },
      });

      const serialized = serializeManifest(manifest);
      const parsed = JSON.parse(serialized);

      expect(parsed.schemaVersion).toBe(CURRENT_MANIFEST_VERSION);
    });
  });

  describe('migration path documentation', () => {
    /**
     * Version Migration Strategy:
     *
     * The manifest schema version follows these principles:
     *
     * 1. BACKWARD COMPATIBILITY: Readers MUST be able to read manifests
     *    written by older versions. Missing fields default to safe values.
     *
     * 2. FORWARD COMPATIBILITY REJECTION: Readers MUST reject manifests
     *    from newer versions they don't understand (throw VersionMismatchError).
     *
     * 3. VERSION BUMPS: The schemaVersion is bumped when:
     *    - Required fields are added (breaking change)
     *    - Field semantics change in incompatible ways
     *    - Structural changes require migration logic
     *
     * 4. MIGRATION PROCESS:
     *    - Read old manifest (version N)
     *    - Apply migration transforms: migrateManifest(manifest, fromVersion, toVersion)
     *    - Write new manifest (version N+1)
     *
     * Example future migration (v1 -> v2):
     * ```typescript
     * function migrateV1ToV2(manifest: ManifestV1): ManifestV2 {
     *   return {
     *     ...manifest,
     *     schemaVersion: 2,
     *     newRequiredField: computeDefaultValue(manifest),
     *   };
     * }
     * ```
     */
    it('should document version migration strategy (this test serves as documentation)', () => {
      // This test exists to ensure the migration strategy is documented
      // The actual migration logic will be implemented when version 2 is introduced

      // Verify current version is 1
      expect(CURRENT_MANIFEST_VERSION).toBe(1);

      // Verify we have error handling for future versions
      expect(VersionMismatchError).toBeDefined();
    });
  });
});
