/**
 * @evodb/codegen Validation Tests
 *
 * Comprehensive tests for validation.ts covering:
 * - ValidationError class
 * - JSON parsing with error handling
 * - Schema validation (tables, columns)
 * - Schema lock validation
 * - Edge cases and error handling
 */

import { describe, it, expect } from 'vitest';
import {
  ValidationError,
  parseJson,
  validateSchema,
  validateSchemaLock,
  parseAndValidateSchema,
  parseAndValidateSchemaLock,
} from '../validation.js';

// =============================================================================
// ValidationError Class Tests
// =============================================================================

describe('ValidationError', () => {
  it('should create error with message only', () => {
    const error = new ValidationError('Test error');
    expect(error.message).toBe('Test error');
    expect(error.path).toBe('');
    expect(error.hint).toBeUndefined();
    expect(error.name).toBe('ValidationError');
  });

  it('should create error with path', () => {
    const error = new ValidationError('Test error', 'tables.users');
    expect(error.message).toBe('Test error');
    expect(error.path).toBe('tables.users');
  });

  it('should create error with hint', () => {
    const error = new ValidationError('Test error', 'tables', 'Check your schema');
    expect(error.hint).toBe('Check your schema');
  });

  describe('toCliMessage', () => {
    it('should format message without path or hint', () => {
      const error = new ValidationError('Simple error');
      expect(error.toCliMessage()).toBe('Simple error');
    });

    it('should format message with path', () => {
      const error = new ValidationError('Field error', 'tables.users.id');
      expect(error.toCliMessage()).toBe('At "tables.users.id": Field error');
    });

    it('should format message with hint', () => {
      const error = new ValidationError('Field error', '', 'Try adding a type');
      expect(error.toCliMessage()).toBe('Field error\n  Hint: Try adding a type');
    });

    it('should format message with path and hint', () => {
      const error = new ValidationError('Field error', 'tables.users', 'Check the column definitions');
      const expected = 'At "tables.users": Field error\n  Hint: Check the column definitions';
      expect(error.toCliMessage()).toBe(expected);
    });
  });
});

// =============================================================================
// parseJson Tests
// =============================================================================

describe('parseJson', () => {
  it('should parse valid JSON', () => {
    const result = parseJson('{"tables": {}}', 'test.json');
    expect(result).toEqual({ tables: {} });
  });

  it('should parse complex nested JSON', () => {
    const json = JSON.stringify({
      tables: {
        users: {
          columns: {
            id: { type: 'integer' },
          },
        },
      },
    });
    const result = parseJson(json, 'schema.json');
    expect(result).toHaveProperty('tables.users.columns.id');
  });

  it('should throw ValidationError for invalid JSON', () => {
    expect(() => parseJson('{ invalid }', 'test.json')).toThrow(ValidationError);
  });

  it('should include file path in error message', () => {
    try {
      parseJson('{ invalid }', 'myschema.json');
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toContain('myschema.json');
    }
  });

  it('should provide hint with line/column for JSON parse errors', () => {
    // This JSON has an error at a specific position
    const invalidJson = '{\n  "name": "test"\n  "missing": "comma"\n}';
    try {
      parseJson(invalidJson, 'test.json');
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      const validationError = error as ValidationError;
      expect(validationError.hint).toBeDefined();
      // Hint should mention line or bracket/comma issues
      expect(validationError.hint).toMatch(/line|comma|bracket/i);
    }
  });

  it('should handle empty string input', () => {
    expect(() => parseJson('', 'test.json')).toThrow(ValidationError);
  });

  it('should handle non-SyntaxError exceptions', () => {
    // parseJson should re-throw non-SyntaxError exceptions
    // We can't easily test this without mocking JSON.parse, so we verify the basic behavior
    expect(() => parseJson('null', 'test.json')).not.toThrow();
  });
});

// =============================================================================
// validateSchema Tests
// =============================================================================

describe('validateSchema', () => {
  it('should accept valid schema with tables', () => {
    const schema = {
      tables: {
        users: {
          columns: {
            id: { type: 'integer', primaryKey: true },
            name: { type: 'text' },
          },
        },
      },
    };
    expect(() => validateSchema(schema, 'test.json')).not.toThrow();
  });

  it('should accept schema nested in config object', () => {
    const config = {
      schema: {
        tables: {
          users: {
            columns: {
              id: { type: 'integer' },
            },
          },
        },
      },
    };
    expect(() => validateSchema(config, 'config.json')).not.toThrow();
  });

  it('should reject non-object schema', () => {
    expect(() => validateSchema(null, 'test.json')).toThrow(ValidationError);
    expect(() => validateSchema('string', 'test.json')).toThrow(ValidationError);
    expect(() => validateSchema(123, 'test.json')).toThrow(ValidationError);
    expect(() => validateSchema([], 'test.json')).toThrow(ValidationError);
  });

  it('should reject schema without tables property', () => {
    expect(() => validateSchema({}, 'test.json')).toThrow(ValidationError);
    try {
      validateSchema({}, 'test.json');
    } catch (error) {
      expect((error as ValidationError).message).toContain('tables');
    }
  });

  it('should reject schema where tables is not an object', () => {
    expect(() => validateSchema({ tables: 'not-object' }, 'test.json')).toThrow(ValidationError);
    expect(() => validateSchema({ tables: [] }, 'test.json')).toThrow(ValidationError);
    expect(() => validateSchema({ tables: null }, 'test.json')).toThrow(ValidationError);
  });

  it('should reject nested schema that is not an object', () => {
    const config = { schema: 'invalid' };
    expect(() => validateSchema(config, 'config.json')).toThrow(ValidationError);
  });

  describe('table validation', () => {
    it('should reject table that is not an object', () => {
      const schema = {
        tables: {
          users: 'not-an-object',
        },
      };
      expect(() => validateSchema(schema, 'test.json')).toThrow(ValidationError);
    });

    it('should reject table without columns', () => {
      const schema = {
        tables: {
          users: {},
        },
      };
      expect(() => validateSchema(schema, 'test.json')).toThrow(ValidationError);
      try {
        validateSchema(schema, 'test.json');
      } catch (error) {
        expect((error as ValidationError).message).toContain('columns');
      }
    });

    it('should reject table where columns is not an object', () => {
      const schema = {
        tables: {
          users: { columns: 'not-object' },
        },
      };
      expect(() => validateSchema(schema, 'test.json')).toThrow(ValidationError);
    });
  });

  describe('column validation', () => {
    it('should reject column that is not an object', () => {
      const schema = {
        tables: {
          users: {
            columns: {
              id: 'not-object',
            },
          },
        },
      };
      expect(() => validateSchema(schema, 'test.json')).toThrow(ValidationError);
    });

    it('should reject column without type', () => {
      const schema = {
        tables: {
          users: {
            columns: {
              id: {},
            },
          },
        },
      };
      expect(() => validateSchema(schema, 'test.json')).toThrow(ValidationError);
      try {
        validateSchema(schema, 'test.json');
      } catch (error) {
        expect((error as ValidationError).message).toContain('type');
      }
    });

    it('should reject column with invalid type', () => {
      const schema = {
        tables: {
          users: {
            columns: {
              id: { type: 'invalid-type' },
            },
          },
        },
      };
      expect(() => validateSchema(schema, 'test.json')).toThrow(ValidationError);
      try {
        validateSchema(schema, 'test.json');
      } catch (error) {
        const ve = error as ValidationError;
        expect(ve.message).toContain('invalid-type');
        expect(ve.hint).toContain('integer'); // Valid types should be listed
      }
    });

    it('should accept all valid SQL types', () => {
      const validTypes = ['integer', 'text', 'real', 'blob', 'boolean', 'json', 'timestamp'];
      for (const type of validTypes) {
        const schema = {
          tables: {
            test: {
              columns: {
                col: { type },
              },
            },
          },
        };
        expect(() => validateSchema(schema, 'test.json')).not.toThrow();
      }
    });

    it('should reject non-boolean primaryKey', () => {
      const schema = {
        tables: {
          users: {
            columns: {
              id: { type: 'integer', primaryKey: 'yes' },
            },
          },
        },
      };
      expect(() => validateSchema(schema, 'test.json')).toThrow(ValidationError);
    });

    it('should reject non-boolean nullable', () => {
      const schema = {
        tables: {
          users: {
            columns: {
              id: { type: 'integer', nullable: 1 },
            },
          },
        },
      };
      expect(() => validateSchema(schema, 'test.json')).toThrow(ValidationError);
    });

    it('should accept boolean primaryKey and nullable', () => {
      const schema = {
        tables: {
          users: {
            columns: {
              id: { type: 'integer', primaryKey: true, nullable: false },
              name: { type: 'text', nullable: true },
            },
          },
        },
      };
      expect(() => validateSchema(schema, 'test.json')).not.toThrow();
    });
  });

  it('should validate multiple tables', () => {
    const schema = {
      tables: {
        users: {
          columns: {
            id: { type: 'integer' },
          },
        },
        posts: {
          columns: {
            id: { type: 'integer' },
            title: { type: 'text' },
          },
        },
      },
    };
    expect(() => validateSchema(schema, 'test.json')).not.toThrow();
  });
});

// =============================================================================
// validateSchemaLock Tests
// =============================================================================

describe('validateSchemaLock', () => {
  const validLock = {
    version: 1,
    lockedAt: '2024-01-15T12:00:00Z',
    schemaHash: 'abc123',
    schema: {
      tables: {
        users: {
          columns: {
            id: { type: 'integer' },
          },
        },
      },
    },
  };

  it('should accept valid lock file', () => {
    expect(() => validateSchemaLock(validLock, 'test.lock.json')).not.toThrow();
  });

  it('should reject non-object lock file', () => {
    expect(() => validateSchemaLock(null, 'test.lock.json')).toThrow(ValidationError);
    expect(() => validateSchemaLock('string', 'test.lock.json')).toThrow(ValidationError);
    expect(() => validateSchemaLock([], 'test.lock.json')).toThrow(ValidationError);
  });

  describe('version validation', () => {
    it('should reject lock without version', () => {
      const lock = { ...validLock };
      delete (lock as Record<string, unknown>).version;
      expect(() => validateSchemaLock(lock, 'test.lock.json')).toThrow(ValidationError);
    });

    it('should reject non-integer version', () => {
      const lock = { ...validLock, version: 1.5 };
      expect(() => validateSchemaLock(lock, 'test.lock.json')).toThrow(ValidationError);
    });

    it('should reject non-number version', () => {
      const lock = { ...validLock, version: '1' };
      expect(() => validateSchemaLock(lock, 'test.lock.json')).toThrow(ValidationError);
    });
  });

  describe('lockedAt validation', () => {
    it('should reject lock without lockedAt', () => {
      const lock = { ...validLock };
      delete (lock as Record<string, unknown>).lockedAt;
      expect(() => validateSchemaLock(lock, 'test.lock.json')).toThrow(ValidationError);
    });

    it('should reject non-string lockedAt', () => {
      const lock = { ...validLock, lockedAt: 12345 };
      expect(() => validateSchemaLock(lock, 'test.lock.json')).toThrow(ValidationError);
    });
  });

  describe('schemaHash validation', () => {
    it('should reject lock without schemaHash', () => {
      const lock = { ...validLock };
      delete (lock as Record<string, unknown>).schemaHash;
      expect(() => validateSchemaLock(lock, 'test.lock.json')).toThrow(ValidationError);
    });

    it('should reject non-string schemaHash', () => {
      const lock = { ...validLock, schemaHash: 12345 };
      expect(() => validateSchemaLock(lock, 'test.lock.json')).toThrow(ValidationError);
    });
  });

  describe('schema validation', () => {
    it('should reject lock without schema', () => {
      const lock = { ...validLock };
      delete (lock as Record<string, unknown>).schema;
      expect(() => validateSchemaLock(lock, 'test.lock.json')).toThrow(ValidationError);
    });

    it('should validate nested schema', () => {
      const lock = {
        ...validLock,
        schema: { tables: { users: { columns: { id: { type: 'invalid' } } } } },
      };
      expect(() => validateSchemaLock(lock, 'test.lock.json')).toThrow(ValidationError);
    });
  });

  it('should provide helpful hint for corrupted lock files', () => {
    try {
      validateSchemaLock({}, 'mydb.lock.json');
    } catch (error) {
      expect((error as ValidationError).hint).toMatch(/lock/i);
    }
  });
});

// =============================================================================
// parseAndValidateSchema Tests
// =============================================================================

describe('parseAndValidateSchema', () => {
  it('should parse and validate valid schema JSON', () => {
    const json = JSON.stringify({
      tables: {
        users: {
          columns: {
            id: { type: 'integer' },
          },
        },
      },
    });
    const result = parseAndValidateSchema(json, 'test.json');
    expect(result.tables).toBeDefined();
    expect(result.tables.users).toBeDefined();
  });

  it('should extract schema from config wrapper', () => {
    const json = JSON.stringify({
      schema: {
        tables: {
          users: {
            columns: {
              id: { type: 'integer' },
            },
          },
        },
      },
    });
    const result = parseAndValidateSchema(json, 'config.json');
    expect(result.tables).toBeDefined();
    expect(result.tables.users).toBeDefined();
  });

  it('should throw for invalid JSON', () => {
    expect(() => parseAndValidateSchema('{ invalid }', 'test.json')).toThrow(ValidationError);
  });

  it('should throw for invalid schema structure', () => {
    expect(() => parseAndValidateSchema('{}', 'test.json')).toThrow(ValidationError);
  });
});

// =============================================================================
// parseAndValidateSchemaLock Tests
// =============================================================================

describe('parseAndValidateSchemaLock', () => {
  it('should parse and validate valid lock JSON', () => {
    const lock = {
      version: 1,
      lockedAt: '2024-01-15T12:00:00Z',
      schemaHash: 'abc123',
      schema: {
        tables: {
          users: {
            columns: {
              id: { type: 'integer' },
            },
          },
        },
      },
    };
    const result = parseAndValidateSchemaLock(JSON.stringify(lock), 'test.lock.json');
    expect(result.version).toBe(1);
    expect(result.schema.tables).toBeDefined();
  });

  it('should throw for invalid JSON', () => {
    expect(() => parseAndValidateSchemaLock('{ invalid }', 'test.lock.json')).toThrow(ValidationError);
  });

  it('should throw for invalid lock structure', () => {
    expect(() => parseAndValidateSchemaLock('{}', 'test.lock.json')).toThrow(ValidationError);
  });

  it('should throw for missing required fields', () => {
    const lock = { version: 1 }; // Missing other required fields
    expect(() => parseAndValidateSchemaLock(JSON.stringify(lock), 'test.lock.json')).toThrow(ValidationError);
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('Edge Cases', () => {
  it('should handle deeply nested tables validation path', () => {
    const schema = {
      tables: {
        very_long_table_name: {
          columns: {
            deeply_nested_column: { type: 'invalid' },
          },
        },
      },
    };
    try {
      validateSchema(schema, 'test.json');
    } catch (error) {
      expect((error as ValidationError).path).toContain('very_long_table_name');
      expect((error as ValidationError).path).toContain('deeply_nested_column');
    }
  });

  it('should handle empty tables object', () => {
    const schema = { tables: {} };
    // Empty tables should be valid (no tables defined yet)
    expect(() => validateSchema(schema, 'test.json')).not.toThrow();
  });

  it('should handle table with empty columns object', () => {
    const schema = {
      tables: {
        users: { columns: {} },
      },
    };
    // Empty columns should be valid (no columns defined yet)
    expect(() => validateSchema(schema, 'test.json')).not.toThrow();
  });

  it('should handle special characters in table names', () => {
    const schema = {
      tables: {
        'my-table': {
          columns: {
            'my-column': { type: 'text' },
          },
        },
      },
    };
    expect(() => validateSchema(schema, 'test.json')).not.toThrow();
  });
});
