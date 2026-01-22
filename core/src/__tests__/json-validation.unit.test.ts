/**
 * @evodb/core - Type-safe JSON Validation Tests
 *
 * Tests for parseJSON, safeParseJSON, validate, safeValidate, and createTypeGuard.
 * Issue: evodb-u602, evodb-aqap, evodb-hyz2 - Type safety improvements
 */

import { describe, it, expect } from 'vitest';
import {
  parseJSON,
  safeParseJSON,
  validate,
  safeValidate,
  createTypeGuard,
  JSONParseError,
  JSONValidationError,
  type SafeParseJSONResult,
  type ZodSchemaLike,
  type ZodErrorLike,
} from '../validation.js';

// Mock Zod-like schema for testing
// This simulates how Zod schemas work without requiring the full zod dependency
function createMockSchema<T>(validator: (data: unknown) => data is T): ZodSchemaLike<T> {
  return {
    safeParse(data: unknown): { success: true; data: T } | { success: false; error: ZodErrorLike } {
      if (validator(data)) {
        return { success: true, data };
      }
      return {
        success: false,
        error: {
          issues: [{ code: 'custom', path: [], message: 'Validation failed' }],
          message: 'Validation failed',
        },
      };
    },
    parse(data: unknown): T {
      const result = this.safeParse(data);
      if (!result.success) {
        throw result.error;
      }
      return result.data;
    },
  };
}

// Type guards for testing
function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number';
}

interface User {
  name: string;
  age: number;
}

function isUser(value: unknown): value is User {
  return (
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    'age' in value &&
    typeof (value as User).name === 'string' &&
    typeof (value as User).age === 'number'
  );
}

interface Config {
  version: number;
  settings: Record<string, string>;
}

function isConfig(value: unknown): value is Config {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.version !== 'number') return false;
  if (typeof v.settings !== 'object' || v.settings === null) return false;
  for (const key of Object.keys(v.settings as Record<string, unknown>)) {
    if (typeof (v.settings as Record<string, unknown>)[key] !== 'string') return false;
  }
  return true;
}

describe('Type-safe JSON Validation', () => {
  const stringSchema = createMockSchema(isString);
  const numberSchema = createMockSchema(isNumber);
  const userSchema = createMockSchema(isUser);
  const configSchema = createMockSchema(isConfig);

  describe('parseJSON', () => {
    it('should parse and validate valid JSON', () => {
      const result = parseJSON('"hello"', stringSchema);
      expect(result).toBe('hello');
    });

    it('should parse and validate complex objects', () => {
      const json = JSON.stringify({ name: 'Alice', age: 30 });
      const result = parseJSON(json, userSchema);
      expect(result).toEqual({ name: 'Alice', age: 30 });
    });

    it('should throw JSONParseError for invalid JSON syntax', () => {
      expect(() => parseJSON('not valid json', stringSchema)).toThrow(JSONParseError);
      expect(() => parseJSON('{invalid}', stringSchema)).toThrow(JSONParseError);
      expect(() => parseJSON('', stringSchema)).toThrow(JSONParseError);
    });

    it('should throw JSONValidationError when validation fails', () => {
      expect(() => parseJSON('123', stringSchema)).toThrow(JSONValidationError);
      expect(() => parseJSON('"string"', numberSchema)).toThrow(JSONValidationError);
    });

    it('should include error details in JSONParseError', () => {
      try {
        parseJSON('invalid json', stringSchema);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(JSONParseError);
        expect((error as JSONParseError).message).toContain('Failed to parse JSON');
        expect((error as JSONParseError).cause).toBeDefined();
      }
    });

    it('should include zodError in JSONValidationError', () => {
      try {
        parseJSON('123', stringSchema);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(JSONValidationError);
        expect((error as JSONValidationError).zodError).toBeDefined();
        expect((error as JSONValidationError).zodError.issues).toHaveLength(1);
      }
    });

    it('should handle nested objects with proper typing', () => {
      const json = JSON.stringify({
        version: 1,
        settings: { theme: 'dark', language: 'en' },
      });
      const result = parseJSON(json, configSchema);
      expect(result.version).toBe(1);
      expect(result.settings.theme).toBe('dark');
    });
  });

  describe('safeParseJSON', () => {
    it('should return success: true with data for valid JSON', () => {
      const result = safeParseJSON('"hello"', stringSchema);
      expect(result.success).toBe(true);
      expect(result.data).toBe('hello');
      expect(result.error).toBeUndefined();
    });

    it('should return success: false with error for invalid JSON syntax', () => {
      const result = safeParseJSON('not valid json', stringSchema);
      expect(result.success).toBe(false);
      expect(result.data).toBeUndefined();
      expect(result.error).toBeDefined();
      expect(result.error!.issues[0].message).toBe('Invalid JSON syntax');
    });

    it('should return success: false with error when validation fails', () => {
      const result = safeParseJSON('123', stringSchema);
      expect(result.success).toBe(false);
      expect(result.data).toBeUndefined();
      expect(result.error).toBeDefined();
    });

    it('should never throw', () => {
      // Invalid JSON
      expect(() => safeParseJSON('invalid', stringSchema)).not.toThrow();
      // Validation failure
      expect(() => safeParseJSON('123', stringSchema)).not.toThrow();
      // Empty string
      expect(() => safeParseJSON('', stringSchema)).not.toThrow();
    });

    it('should handle complex nested objects', () => {
      const json = JSON.stringify({ name: 'Bob', age: 25 });
      const result = safeParseJSON(json, userSchema);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ name: 'Bob', age: 25 });
    });

    it('should handle arrays', () => {
      const arraySchema = createMockSchema(
        (v): v is string[] => Array.isArray(v) && v.every(isString)
      );
      const result = safeParseJSON('["a", "b", "c"]', arraySchema);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(['a', 'b', 'c']);
    });
  });

  describe('validate', () => {
    it('should validate already-parsed values', () => {
      const value = { name: 'Charlie', age: 35 };
      const result = validate(value, userSchema);
      expect(result).toEqual(value);
    });

    it('should throw JSONValidationError for invalid values', () => {
      const value = { name: 'Charlie' }; // missing age
      expect(() => validate(value, userSchema)).toThrow(JSONValidationError);
    });

    it('should work with primitive values', () => {
      expect(validate('hello', stringSchema)).toBe('hello');
      expect(validate(42, numberSchema)).toBe(42);
    });

    it('should provide detailed error message', () => {
      try {
        validate({ name: 123 }, userSchema);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(JSONValidationError);
        expect((error as JSONValidationError).message).toContain('Validation failed');
      }
    });
  });

  describe('safeValidate', () => {
    it('should return success: true with data for valid values', () => {
      const value = { name: 'Diana', age: 40 };
      const result = safeValidate(value, userSchema);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(value);
    });

    it('should return success: false with error for invalid values', () => {
      const value = { name: 123 }; // invalid type
      const result = safeValidate(value, userSchema);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should never throw', () => {
      expect(() => safeValidate(null, userSchema)).not.toThrow();
      expect(() => safeValidate(undefined, userSchema)).not.toThrow();
      expect(() => safeValidate({}, userSchema)).not.toThrow();
    });
  });

  describe('createTypeGuard', () => {
    it('should create a working type guard', () => {
      const isUserGuard = createTypeGuard(userSchema);

      expect(isUserGuard({ name: 'Eve', age: 28 })).toBe(true);
      expect(isUserGuard({ name: 'Eve' })).toBe(false);
      expect(isUserGuard(null)).toBe(false);
      expect(isUserGuard(undefined)).toBe(false);
      expect(isUserGuard('string')).toBe(false);
    });

    it('should narrow types correctly', () => {
      const isUserGuard = createTypeGuard(userSchema);
      const value: unknown = { name: 'Frank', age: 45 };

      if (isUserGuard(value)) {
        // TypeScript should know value is User here
        expect(value.name).toBe('Frank');
        expect(value.age).toBe(45);
      } else {
        expect.fail('Should have passed validation');
      }
    });

    it('should work with primitive schemas', () => {
      const isStringGuard = createTypeGuard(stringSchema);
      expect(isStringGuard('hello')).toBe(true);
      expect(isStringGuard(123)).toBe(false);
      expect(isStringGuard(null)).toBe(false);
    });

    it('should work with complex nested schemas', () => {
      const isConfigGuard = createTypeGuard(configSchema);

      expect(
        isConfigGuard({
          version: 1,
          settings: { key: 'value' },
        })
      ).toBe(true);

      expect(
        isConfigGuard({
          version: 'not a number',
          settings: {},
        })
      ).toBe(false);
    });
  });

  describe('error classes', () => {
    describe('JSONParseError', () => {
      it('should have correct name', () => {
        const error = new JSONParseError('test');
        expect(error.name).toBe('JSONParseError');
      });

      it('should store cause', () => {
        const cause = new Error('original');
        const error = new JSONParseError('test', cause);
        expect(error.cause).toBe(cause);
      });

      it('should be instanceof Error', () => {
        const error = new JSONParseError('test');
        expect(error).toBeInstanceOf(Error);
      });
    });

    describe('JSONValidationError', () => {
      it('should have correct name', () => {
        const error = new JSONValidationError('test', {
          issues: [],
          message: 'test',
        });
        expect(error.name).toBe('JSONValidationError');
      });

      it('should store zodError', () => {
        const zodError: ZodErrorLike = {
          issues: [{ code: 'custom', path: ['field'], message: 'invalid' }],
          message: 'Validation failed',
        };
        const error = new JSONValidationError('test', zodError);
        expect(error.zodError).toBe(zodError);
      });

      it('should be instanceof Error', () => {
        const error = new JSONValidationError('test', {
          issues: [],
          message: 'test',
        });
        expect(error).toBeInstanceOf(Error);
      });
    });
  });

  describe('type narrowing', () => {
    it('should properly narrow SafeParseJSONResult types', () => {
      const result: SafeParseJSONResult<User> = safeParseJSON(
        JSON.stringify({ name: 'Grace', age: 33 }),
        userSchema
      );

      if (result.success) {
        // data should be defined and typed as User
        const user: User = result.data;
        expect(user.name).toBe('Grace');
        // error should be undefined
        expect(result.error).toBeUndefined();
      } else {
        // data should be undefined
        expect(result.data).toBeUndefined();
        // error should be defined
        expect(result.error).toBeDefined();
      }
    });
  });

  describe('edge cases', () => {
    it('should handle null JSON value', () => {
      const nullableSchema = createMockSchema(
        (v): v is null => v === null
      );
      const result = parseJSON('null', nullableSchema);
      expect(result).toBeNull();
    });

    it('should handle boolean JSON values', () => {
      const boolSchema = createMockSchema(
        (v): v is boolean => typeof v === 'boolean'
      );
      expect(parseJSON('true', boolSchema)).toBe(true);
      expect(parseJSON('false', boolSchema)).toBe(false);
    });

    it('should handle empty arrays', () => {
      const arraySchema = createMockSchema(
        (v): v is unknown[] => Array.isArray(v)
      );
      const result = parseJSON('[]', arraySchema);
      expect(result).toEqual([]);
    });

    it('should handle empty objects', () => {
      const objectSchema = createMockSchema(
        (v): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
      );
      const result = parseJSON('{}', objectSchema);
      expect(result).toEqual({});
    });

    it('should handle unicode in JSON', () => {
      const result = parseJSON('"Hello 世界"', stringSchema);
      expect(result).toBe('Hello 世界');
    });

    it('should handle escaped characters in JSON', () => {
      const result = parseJSON('"line1\\nline2"', stringSchema);
      expect(result).toBe('line1\nline2');
    });
  });
});
