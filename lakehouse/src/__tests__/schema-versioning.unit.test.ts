/**
 * @evodb/lakehouse - Schema Versioning Tests
 *
 * Tests for schema creation, evolution, and compatibility checking.
 */

import { describe, it, expect } from 'vitest';
import {
  createTable,
  createSchema,
  evolveSchema,
  isCompatible,
  addSchema,
  setCurrentSchema,
} from '../index.js';

describe('Schema Versioning', () => {
  describe('createSchema', () => {
    it('should create schema with auto-generated ID', () => {
      const schema = createSchema([
        { name: 'id', type: 'uuid', nullable: false },
        { name: 'name', type: 'string', nullable: false },
        { name: 'age', type: 'int32', nullable: true },
      ]);

      expect(schema.schemaId).toBe(1);
      expect(schema.version).toBe(1);
      expect(schema.columns).toHaveLength(3);
      expect(schema.createdAt).toBeDefined();
    });

    it('should preserve column metadata', () => {
      const schema = createSchema([
        {
          name: 'status',
          type: 'string',
          nullable: false,
          defaultValue: 'pending',
          doc: 'Order status',
        },
      ]);

      expect(schema.columns[0].defaultValue).toBe('pending');
      expect(schema.columns[0].doc).toBe('Order status');
    });
  });

  describe('evolveSchema', () => {
    it('should add new column', () => {
      const v1 = createSchema([
        { name: 'id', type: 'uuid', nullable: false },
      ]);

      const v2 = evolveSchema(v1, [
        { type: 'add_column', column: { name: 'email', type: 'string', nullable: true } },
      ]);

      expect(v2.schemaId).toBe(2);
      expect(v2.version).toBe(2);
      expect(v2.columns).toHaveLength(2);
      expect(v2.columns[1].name).toBe('email');
    });

    it('should drop column', () => {
      const v1 = createSchema([
        { name: 'id', type: 'uuid', nullable: false },
        { name: 'temp', type: 'string', nullable: true },
      ]);

      const v2 = evolveSchema(v1, [
        { type: 'drop_column', columnName: 'temp' },
      ]);

      expect(v2.columns).toHaveLength(1);
      expect(v2.columns[0].name).toBe('id');
    });

    it('should rename column', () => {
      const v1 = createSchema([
        { name: 'old_name', type: 'string', nullable: false },
      ]);

      const v2 = evolveSchema(v1, [
        { type: 'rename_column', oldName: 'old_name', newName: 'new_name' },
      ]);

      expect(v2.columns[0].name).toBe('new_name');
    });

    it('should update column type (widening)', () => {
      const v1 = createSchema([
        { name: 'count', type: 'int32', nullable: false },
      ]);

      const v2 = evolveSchema(v1, [
        { type: 'update_type', columnName: 'count', newType: 'int64' },
      ]);

      expect(v2.columns[0].type).toBe('int64');
    });

    it('should make column nullable', () => {
      const v1 = createSchema([
        { name: 'required', type: 'string', nullable: false },
      ]);

      const v2 = evolveSchema(v1, [
        { type: 'make_nullable', columnName: 'required' },
      ]);

      expect(v2.columns[0].nullable).toBe(true);
    });

    it('should reject duplicate column name on add', () => {
      const v1 = createSchema([
        { name: 'id', type: 'uuid', nullable: false },
      ]);

      expect(() => evolveSchema(v1, [
        { type: 'add_column', column: { name: 'id', type: 'string', nullable: true } },
      ])).toThrow();
    });

    it('should reject drop of non-existent column', () => {
      const v1 = createSchema([
        { name: 'id', type: 'uuid', nullable: false },
      ]);

      expect(() => evolveSchema(v1, [
        { type: 'drop_column', columnName: 'nonexistent' },
      ])).toThrow();
    });
  });

  describe('isCompatible', () => {
    it('should allow adding nullable columns (backward compatible)', () => {
      const v1 = createSchema([
        { name: 'id', type: 'uuid', nullable: false },
      ]);

      const v2 = evolveSchema(v1, [
        { type: 'add_column', column: { name: 'email', type: 'string', nullable: true } },
      ]);

      const result = isCompatible(v1, v2, 'backward');
      expect(result.compatible).toBe(true);
    });

    it('should reject adding required columns without default (backward)', () => {
      const v1 = createSchema([
        { name: 'id', type: 'uuid', nullable: false },
      ]);

      const v2 = evolveSchema(v1, [
        { type: 'add_column', column: { name: 'required', type: 'string', nullable: false } },
      ]);

      const result = isCompatible(v1, v2, 'backward');
      expect(result.compatible).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject dropping columns (forward compatibility)', () => {
      const v1 = createSchema([
        { name: 'id', type: 'uuid', nullable: false },
        { name: 'temp', type: 'string', nullable: true },
      ]);

      const v2 = evolveSchema(v1, [
        { type: 'drop_column', columnName: 'temp' },
      ]);

      const result = isCompatible(v1, v2, 'forward');
      expect(result.compatible).toBe(false);
    });

    it('should allow type widening (int32 -> int64)', () => {
      const v1 = createSchema([
        { name: 'count', type: 'int32', nullable: false },
      ]);

      const v2 = evolveSchema(v1, [
        { type: 'update_type', columnName: 'count', newType: 'int64' },
      ]);

      const result = isCompatible(v1, v2, 'backward');
      expect(result.compatible).toBe(true);
    });

    it('should reject incompatible type changes', () => {
      const v1 = createSchema([
        { name: 'value', type: 'int64', nullable: false },
      ]);

      const v2 = evolveSchema(v1, [
        { type: 'update_type', columnName: 'value', newType: 'string' },
      ]);

      const result = isCompatible(v1, v2, 'backward');
      expect(result.compatible).toBe(false);
    });
  });

  describe('addSchema / setCurrentSchema', () => {
    it('should add new schema to manifest', () => {
      const { manifest, schema: v1 } = createTable({
        location: 'test',
        schema: { columns: [{ name: 'id', type: 'uuid', nullable: false }] },
      });

      const v2 = evolveSchema(v1, [
        { type: 'add_column', column: { name: 'name', type: 'string', nullable: true } },
      ]);

      const updated = addSchema(manifest, v2);

      expect(updated.schemas).toHaveLength(2);
      expect(updated.currentSchemaId).toBe(v2.schemaId);
    });

    it('should set current schema without adding', () => {
      const { manifest, schema: v1 } = createTable({
        location: 'test',
        schema: { columns: [{ name: 'id', type: 'uuid', nullable: false }] },
      });

      const v2 = evolveSchema(v1, [
        { type: 'add_column', column: { name: 'name', type: 'string', nullable: true } },
      ]);

      let updated = addSchema(manifest, v2);
      updated = setCurrentSchema(updated, v1.schemaId);

      expect(updated.currentSchemaId).toBe(v1.schemaId);
    });

    it('should reject setting non-existent schema as current', () => {
      const { manifest } = createTable({
        location: 'test',
        schema: { columns: [{ name: 'id', type: 'uuid', nullable: false }] },
      });

      expect(() => setCurrentSchema(manifest, 999)).toThrow();
    });
  });
});
