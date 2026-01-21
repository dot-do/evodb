/**
 * Tests for validation error detail types
 *
 * These tests verify that the validation error detail type guards
 * work correctly for BlockValidationErrorDetails and ManifestValidationErrorDetails.
 */

import { describe, it, expect } from 'vitest';
import {
  isBlockValidationErrorDetails,
  isManifestValidationErrorDetails,
  type BlockValidationErrorDetails,
  type ManifestValidationErrorDetails,
} from '../validation.js';

describe('BlockValidationErrorDetails', () => {
  describe('isBlockValidationErrorDetails', () => {
    it('returns true for empty object', () => {
      expect(isBlockValidationErrorDetails({})).toBe(true);
    });

    it('returns true for details with receivedType', () => {
      const details: BlockValidationErrorDetails = {
        receivedType: 'null',
      };
      expect(isBlockValidationErrorDetails(details)).toBe(true);
    });

    it('returns true for details with column info', () => {
      const details: BlockValidationErrorDetails = {
        column: 'user_id',
        receivedType: 'object',
      };
      expect(isBlockValidationErrorDetails(details)).toBe(true);
    });

    it('returns true for details with length mismatch info', () => {
      const details: BlockValidationErrorDetails = {
        column: 'email',
        expectedLength: 100,
        actualLength: 99,
        firstColumn: 'id',
      };
      expect(isBlockValidationErrorDetails(details)).toBe(true);
    });

    it('returns true for details with parse error', () => {
      const details: BlockValidationErrorDetails = {
        parseError: 'Unexpected token at position 42',
      };
      expect(isBlockValidationErrorDetails(details)).toBe(true);
    });

    it('returns true for full details object', () => {
      const details: BlockValidationErrorDetails = {
        receivedType: 'string',
        column: 'data',
        expectedLength: 50,
        actualLength: 48,
        firstColumn: 'id',
        parseError: 'Invalid JSON',
      };
      expect(isBlockValidationErrorDetails(details)).toBe(true);
    });

    it('returns false for null', () => {
      expect(isBlockValidationErrorDetails(null)).toBe(false);
    });

    it('returns false for array', () => {
      expect(isBlockValidationErrorDetails([])).toBe(false);
    });

    it('returns false for primitive types', () => {
      expect(isBlockValidationErrorDetails('string')).toBe(false);
      expect(isBlockValidationErrorDetails(123)).toBe(false);
      expect(isBlockValidationErrorDetails(true)).toBe(false);
      expect(isBlockValidationErrorDetails(undefined)).toBe(false);
    });

    it('returns false for receivedType not a string', () => {
      expect(isBlockValidationErrorDetails({ receivedType: 123 })).toBe(false);
    });

    it('returns false for column not a string', () => {
      expect(isBlockValidationErrorDetails({ column: 123 })).toBe(false);
    });

    it('returns false for expectedLength not a number', () => {
      expect(isBlockValidationErrorDetails({ expectedLength: '100' })).toBe(false);
    });

    it('returns false for actualLength not a number', () => {
      expect(isBlockValidationErrorDetails({ actualLength: '99' })).toBe(false);
    });

    it('returns false for firstColumn not a string', () => {
      expect(isBlockValidationErrorDetails({ firstColumn: 123 })).toBe(false);
    });

    it('returns false for parseError not a string', () => {
      expect(isBlockValidationErrorDetails({ parseError: { message: 'error' } })).toBe(false);
    });
  });
});

describe('ManifestValidationErrorDetails', () => {
  describe('isManifestValidationErrorDetails', () => {
    it('returns true for empty object', () => {
      expect(isManifestValidationErrorDetails({})).toBe(true);
    });

    it('returns true for details with receivedType', () => {
      const details: ManifestValidationErrorDetails = {
        receivedType: 'array',
      };
      expect(isManifestValidationErrorDetails(details)).toBe(true);
    });

    it('returns true for details with field info', () => {
      const details: ManifestValidationErrorDetails = {
        field: 'version',
        expectedType: 'number',
        receivedType: 'string',
      };
      expect(isManifestValidationErrorDetails(details)).toBe(true);
    });

    it('returns true for details with table info', () => {
      const details: ManifestValidationErrorDetails = {
        table: 'events',
        field: 'schema',
      };
      expect(isManifestValidationErrorDetails(details)).toBe(true);
    });

    it('returns true for details with column info', () => {
      const details: ManifestValidationErrorDetails = {
        table: 'users',
        column: 'email',
        columnIndex: 2,
      };
      expect(isManifestValidationErrorDetails(details)).toBe(true);
    });

    it('returns true for details with invalid type info', () => {
      const details: ManifestValidationErrorDetails = {
        table: 'products',
        column: 'price',
        invalidType: 'money',
        validTypes: ['int32', 'int64', 'float64', 'string'],
      };
      expect(isManifestValidationErrorDetails(details)).toBe(true);
    });

    it('returns true for full details object', () => {
      const details: ManifestValidationErrorDetails = {
        receivedType: 'object',
        field: 'type',
        table: 'orders',
        column: 'status',
        columnIndex: 5,
        expectedType: 'string',
        invalidType: 'enum',
        validTypes: ['string', 'int32'],
      };
      expect(isManifestValidationErrorDetails(details)).toBe(true);
    });

    it('returns false for null', () => {
      expect(isManifestValidationErrorDetails(null)).toBe(false);
    });

    it('returns false for array', () => {
      expect(isManifestValidationErrorDetails([])).toBe(false);
    });

    it('returns false for primitive types', () => {
      expect(isManifestValidationErrorDetails('string')).toBe(false);
      expect(isManifestValidationErrorDetails(123)).toBe(false);
      expect(isManifestValidationErrorDetails(true)).toBe(false);
      expect(isManifestValidationErrorDetails(undefined)).toBe(false);
    });

    it('returns false for receivedType not a string', () => {
      expect(isManifestValidationErrorDetails({ receivedType: 123 })).toBe(false);
    });

    it('returns false for field not a string', () => {
      expect(isManifestValidationErrorDetails({ field: 123 })).toBe(false);
    });

    it('returns false for table not a string', () => {
      expect(isManifestValidationErrorDetails({ table: {} })).toBe(false);
    });

    it('returns false for column not a string', () => {
      expect(isManifestValidationErrorDetails({ column: true })).toBe(false);
    });

    it('returns false for columnIndex not a number', () => {
      expect(isManifestValidationErrorDetails({ columnIndex: '2' })).toBe(false);
    });

    it('returns false for expectedType not a string', () => {
      expect(isManifestValidationErrorDetails({ expectedType: 123 })).toBe(false);
    });

    it('returns false for invalidType not a string', () => {
      expect(isManifestValidationErrorDetails({ invalidType: 123 })).toBe(false);
    });

    it('returns false for validTypes not an array', () => {
      expect(isManifestValidationErrorDetails({ validTypes: 'string' })).toBe(false);
    });

    it('returns false for validTypes containing non-strings', () => {
      expect(isManifestValidationErrorDetails({ validTypes: ['string', 123] })).toBe(false);
    });
  });
});
