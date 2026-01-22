/**
 * Tests for Import/Export functionality
 *
 * TDD Issue: evodb-wvrw
 *
 * This test suite covers:
 * - CSV import/export
 * - JSON import/export
 * - Streaming for large files
 * - Progress callbacks
 * - Error handling
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EvoDB } from '../evodb.js';
import {
  importCSV,
  importJSON,
  exportCSV,
  exportJSON,
  type ImportOptions,
} from '../import-export.js';

// =============================================================================
// CSV Import Tests
// =============================================================================

describe('Import/Export', () => {
  let db: EvoDB;

  beforeEach(() => {
    db = new EvoDB({ mode: 'development' });
  });

  describe('importCSV', () => {
    it('parses CSV and inserts rows', async () => {
      const csv = `name,age,email
Alice,30,alice@example.com
Bob,25,bob@example.com
Charlie,35,charlie@example.com`;

      const options: ImportOptions = { table: 'users' };
      const count = await importCSV(db, csv, options);

      expect(count).toBe(3);

      const rows = await db.query('users');
      expect(rows).toHaveLength(3);
      expect(rows[0].name).toBe('Alice');
      expect(rows[0].age).toBe('30'); // CSV values are strings by default
      expect(rows[0].email).toBe('alice@example.com');
      expect(rows[1].name).toBe('Bob');
      expect(rows[2].name).toBe('Charlie');
    });

    it('handles quoted values with commas', async () => {
      const csv = `name,description
"Smith, John","A person named John Smith"
"Doe, Jane","Another person"`;

      const count = await importCSV(db, csv, { table: 'people' });

      expect(count).toBe(2);
      const rows = await db.query('people');
      expect(rows[0].name).toBe('Smith, John');
      expect(rows[0].description).toBe('A person named John Smith');
    });

    it('handles quoted values with embedded quotes', async () => {
      const csv = `title,content
"Hello ""World""","This is ""quoted"" text"`;

      const count = await importCSV(db, csv, { table: 'posts' });

      expect(count).toBe(1);
      const rows = await db.query('posts');
      expect(rows[0].title).toBe('Hello "World"');
      expect(rows[0].content).toBe('This is "quoted" text');
    });

    it('handles empty values', async () => {
      const csv = `name,email,phone
Alice,alice@example.com,
Bob,,555-1234`;

      const count = await importCSV(db, csv, { table: 'contacts' });

      expect(count).toBe(2);
      const rows = await db.query('contacts');
      expect(rows[0].phone).toBe('');
      expect(rows[1].email).toBe('');
    });

    it('handles newlines in quoted values', async () => {
      const csv = `name,bio
Alice,"Line 1
Line 2
Line 3"`;

      const count = await importCSV(db, csv, { table: 'profiles' });

      expect(count).toBe(1);
      const rows = await db.query('profiles');
      expect(rows[0].bio).toBe('Line 1\nLine 2\nLine 3');
    });

    it('calls onProgress callback during import', async () => {
      const csv = `id,value
1,a
2,b
3,c
4,d
5,e`;

      const progressCalls: number[] = [];
      const onProgress = vi.fn((count: number) => {
        progressCalls.push(count);
      });

      await importCSV(db, csv, {
        table: 'items',
        batchSize: 2,
        onProgress,
      });

      expect(onProgress).toHaveBeenCalled();
      // Should have progress updates
      expect(progressCalls.length).toBeGreaterThan(0);
    });

    it('respects batchSize option', async () => {
      const csv = `id
1
2
3
4
5
6
7
8
9
10`;

      const progressCalls: number[] = [];
      await importCSV(db, csv, {
        table: 'numbers',
        batchSize: 3,
        onProgress: (count) => progressCalls.push(count),
      });

      // With batch size 3 and 10 rows, we should see progress at 3, 6, 9, 10
      expect(progressCalls).toContain(3);
      expect(progressCalls).toContain(6);
      expect(progressCalls).toContain(9);
      expect(progressCalls[progressCalls.length - 1]).toBe(10);
    });

    it('handles empty CSV (header only)', async () => {
      const csv = `name,email,phone`;

      const count = await importCSV(db, csv, { table: 'empty' });

      expect(count).toBe(0);
      const rows = await db.query('empty');
      expect(rows).toHaveLength(0);
    });

    it('throws on invalid CSV format', async () => {
      // Completely empty file
      const csv = '';

      await expect(
        importCSV(db, csv, { table: 'invalid' })
      ).rejects.toThrow();
    });
  });

  // =============================================================================
  // JSON Import Tests
  // =============================================================================

  describe('importJSON', () => {
    it('parses JSON array and inserts rows', async () => {
      const json = JSON.stringify([
        { name: 'Alice', age: 30, email: 'alice@example.com' },
        { name: 'Bob', age: 25, email: 'bob@example.com' },
        { name: 'Charlie', age: 35, email: 'charlie@example.com' },
      ]);

      const count = await importJSON(db, json, { table: 'users' });

      expect(count).toBe(3);

      const rows = await db.query('users');
      expect(rows).toHaveLength(3);
      expect(rows[0].name).toBe('Alice');
      expect(rows[0].age).toBe(30); // JSON preserves types
      expect(rows[1].name).toBe('Bob');
      expect(rows[2].name).toBe('Charlie');
    });

    it('handles nested objects', async () => {
      const json = JSON.stringify([
        {
          name: 'Alice',
          address: {
            city: 'NYC',
            zip: '10001',
          },
        },
      ]);

      const count = await importJSON(db, json, { table: 'users' });

      expect(count).toBe(1);
      const rows = await db.query('users');
      expect(rows[0].address).toEqual({ city: 'NYC', zip: '10001' });
    });

    it('handles arrays within objects', async () => {
      const json = JSON.stringify([
        {
          name: 'Post 1',
          tags: ['tech', 'coding', 'javascript'],
        },
      ]);

      const count = await importJSON(db, json, { table: 'posts' });

      expect(count).toBe(1);
      const rows = await db.query('posts');
      expect(rows[0].tags).toEqual(['tech', 'coding', 'javascript']);
    });

    it('handles null values', async () => {
      const json = JSON.stringify([
        { name: 'Alice', email: null },
        { name: 'Bob', email: 'bob@example.com' },
      ]);

      const count = await importJSON(db, json, { table: 'users' });

      expect(count).toBe(2);
      const rows = await db.query('users');
      expect(rows[0].email).toBeNull();
      expect(rows[1].email).toBe('bob@example.com');
    });

    it('calls onProgress callback during import', async () => {
      const items = Array.from({ length: 10 }, (_, i) => ({ id: i + 1 }));
      const json = JSON.stringify(items);

      const progressCalls: number[] = [];
      await importJSON(db, json, {
        table: 'items',
        batchSize: 3,
        onProgress: (count) => progressCalls.push(count),
      });

      expect(progressCalls.length).toBeGreaterThan(0);
      expect(progressCalls[progressCalls.length - 1]).toBe(10);
    });

    it('respects batchSize option', async () => {
      const items = Array.from({ length: 10 }, (_, i) => ({ id: i + 1 }));
      const json = JSON.stringify(items);

      const progressCalls: number[] = [];
      await importJSON(db, json, {
        table: 'numbers',
        batchSize: 3,
        onProgress: (count) => progressCalls.push(count),
      });

      expect(progressCalls).toContain(3);
      expect(progressCalls).toContain(6);
      expect(progressCalls).toContain(9);
    });

    it('handles empty JSON array', async () => {
      const json = JSON.stringify([]);

      const count = await importJSON(db, json, { table: 'empty' });

      expect(count).toBe(0);
      const rows = await db.query('empty');
      expect(rows).toHaveLength(0);
    });

    it('throws on invalid JSON', async () => {
      const invalidJson = '{ not valid json }';

      await expect(
        importJSON(db, invalidJson, { table: 'invalid' })
      ).rejects.toThrow();
    });

    it('throws on non-array JSON', async () => {
      const json = JSON.stringify({ name: 'single object' });

      await expect(
        importJSON(db, json, { table: 'invalid' })
      ).rejects.toThrow(/array/i);
    });
  });

  // =============================================================================
  // CSV Export Tests
  // =============================================================================

  describe('exportCSV', () => {
    it('generates valid CSV', async () => {
      await db.insert('users', [
        { name: 'Alice', age: 30, email: 'alice@example.com' },
        { name: 'Bob', age: 25, email: 'bob@example.com' },
      ]);

      const csv = await exportCSV(db, 'users');

      expect(csv).toContain('name');
      expect(csv).toContain('age');
      expect(csv).toContain('email');
      expect(csv).toContain('Alice');
      expect(csv).toContain('30');
      expect(csv).toContain('alice@example.com');
      expect(csv).toContain('Bob');
      expect(csv).toContain('25');

      // Verify CSV format - should have header row and data rows
      const lines = csv.trim().split('\n');
      expect(lines.length).toBe(3); // header + 2 data rows
    });

    it('escapes values with commas', async () => {
      await db.insert('people', [
        { name: 'Smith, John', role: 'Developer' },
      ]);

      const csv = await exportCSV(db, 'people');

      // Values with commas should be quoted
      expect(csv).toContain('"Smith, John"');
    });

    it('escapes values with quotes', async () => {
      await db.insert('posts', [
        { title: 'Hello "World"', content: 'Test' },
      ]);

      const csv = await exportCSV(db, 'posts');

      // Quotes within values should be doubled
      expect(csv).toContain('"Hello ""World"""');
    });

    it('escapes values with newlines', async () => {
      await db.insert('profiles', [
        { name: 'Alice', bio: 'Line 1\nLine 2' },
      ]);

      const csv = await exportCSV(db, 'profiles');

      // Values with newlines should be quoted
      expect(csv).toMatch(/"Line 1\nLine 2"/);
    });

    it('handles null values', async () => {
      await db.insert('data', [
        { name: 'Alice', value: null },
      ]);

      const csv = await exportCSV(db, 'data');

      // Null values should be empty
      const lines = csv.trim().split('\n');
      const dataLine = lines[1];
      expect(dataLine).toMatch(/Alice,$/m); // ends with empty field
    });

    it('handles empty table', async () => {
      // Query non-existent table returns empty
      const csv = await exportCSV(db, 'empty');

      // Should return just empty string or header only
      expect(csv).toBe('');
    });

    it('excludes _id column by default', async () => {
      await db.insert('items', [{ name: 'Item 1' }]);

      const csv = await exportCSV(db, 'items');

      // _id should not be in the output
      expect(csv).not.toContain('_id');
    });
  });

  // =============================================================================
  // JSON Export Tests
  // =============================================================================

  describe('exportJSON', () => {
    it('generates valid JSON array', async () => {
      await db.insert('users', [
        { name: 'Alice', age: 30, email: 'alice@example.com' },
        { name: 'Bob', age: 25, email: 'bob@example.com' },
      ]);

      const json = await exportJSON(db, 'users');

      const parsed = JSON.parse(json);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].name).toBe('Alice');
      expect(parsed[0].age).toBe(30);
      expect(parsed[1].name).toBe('Bob');
    });

    it('preserves nested objects', async () => {
      await db.insert('users', [
        {
          name: 'Alice',
          address: { city: 'NYC', zip: '10001' },
        },
      ]);

      const json = await exportJSON(db, 'users');

      const parsed = JSON.parse(json);
      expect(parsed[0].address).toEqual({ city: 'NYC', zip: '10001' });
    });

    it('preserves arrays', async () => {
      await db.insert('posts', [
        { title: 'Post 1', tags: ['tech', 'coding'] },
      ]);

      const json = await exportJSON(db, 'posts');

      const parsed = JSON.parse(json);
      expect(parsed[0].tags).toEqual(['tech', 'coding']);
    });

    it('preserves null values', async () => {
      await db.insert('data', [
        { name: 'Alice', value: null },
      ]);

      const json = await exportJSON(db, 'data');

      const parsed = JSON.parse(json);
      expect(parsed[0].value).toBeNull();
    });

    it('handles empty table', async () => {
      const json = await exportJSON(db, 'empty');

      const parsed = JSON.parse(json);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(0);
    });

    it('excludes _id column by default', async () => {
      await db.insert('items', [{ name: 'Item 1' }]);

      const json = await exportJSON(db, 'items');

      const parsed = JSON.parse(json);
      expect(parsed[0]).not.toHaveProperty('_id');
    });
  });

  // =============================================================================
  // Streaming/Large File Tests
  // =============================================================================

  describe('handles large files with streaming', () => {
    it('imports large CSV efficiently', async () => {
      // Generate a large CSV with 1000 rows
      const header = 'id,name,value';
      const rows = Array.from({ length: 1000 }, (_, i) =>
        `${i + 1},Item ${i + 1},${Math.random()}`
      );
      const csv = [header, ...rows].join('\n');

      const progressCalls: number[] = [];
      const count = await importCSV(db, csv, {
        table: 'large',
        batchSize: 100,
        onProgress: (n) => progressCalls.push(n),
      });

      expect(count).toBe(1000);

      const dbRows = await db.query('large');
      expect(dbRows).toHaveLength(1000);

      // Should have had multiple progress updates
      expect(progressCalls.length).toBeGreaterThan(5);
    });

    it('imports large JSON efficiently', async () => {
      // Generate a large JSON array with 1000 objects
      const items = Array.from({ length: 1000 }, (_, i) => ({
        id: i + 1,
        name: `Item ${i + 1}`,
        value: Math.random(),
      }));
      const json = JSON.stringify(items);

      const progressCalls: number[] = [];
      const count = await importJSON(db, json, {
        table: 'large',
        batchSize: 100,
        onProgress: (n) => progressCalls.push(n),
      });

      expect(count).toBe(1000);

      const dbRows = await db.query('large');
      expect(dbRows).toHaveLength(1000);

      // Should have had multiple progress updates
      expect(progressCalls.length).toBeGreaterThan(5);
    });

    it('exports large dataset efficiently', async () => {
      // Insert 500 rows
      const items = Array.from({ length: 500 }, (_, i) => ({
        id: i + 1,
        name: `Item ${i + 1}`,
        value: Math.random(),
      }));
      await db.insert('large', items);

      const csv = await exportCSV(db, 'large');
      const lines = csv.trim().split('\n');

      // Header + 500 data rows
      expect(lines).toHaveLength(501);

      const json = await exportJSON(db, 'large');
      const parsed = JSON.parse(json);
      expect(parsed).toHaveLength(500);
    });
  });

  // =============================================================================
  // Round-trip Tests
  // =============================================================================

  describe('round-trip consistency', () => {
    it('CSV export can be re-imported', async () => {
      const originalData = [
        { name: 'Alice', role: 'Admin' },
        { name: 'Bob', role: 'User' },
      ];
      await db.insert('source', originalData);

      const csv = await exportCSV(db, 'source');
      await importCSV(db, csv, { table: 'target' });

      const targetRows = await db.query('target');
      expect(targetRows).toHaveLength(2);
      expect(targetRows[0].name).toBe('Alice');
      expect(targetRows[1].name).toBe('Bob');
    });

    it('JSON export can be re-imported', async () => {
      const originalData = [
        { name: 'Alice', age: 30, active: true },
        { name: 'Bob', age: 25, active: false },
      ];
      await db.insert('source', originalData);

      const json = await exportJSON(db, 'source');
      await importJSON(db, json, { table: 'target' });

      const targetRows = await db.query<{ name: string; age: number; active: boolean }>('target');
      expect(targetRows).toHaveLength(2);
      expect(targetRows[0].name).toBe('Alice');
      expect(targetRows[0].age).toBe(30);
      expect(targetRows[0].active).toBe(true);
    });
  });
});
