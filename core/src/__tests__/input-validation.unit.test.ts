/**
 * @evodb/core - Input Validation Security Tests
 *
 * Tests for comprehensive input validation to prevent security vulnerabilities.
 * Issue: evodb-go5v - TDD: Add comprehensive input validation for security
 *
 * Security patterns tested:
 * - SQL injection prevention in column names
 * - XSS pattern rejection
 * - Path traversal prevention
 * - Control character filtering
 * - Input length limits
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createColumnNameValidator,
  createPathValidator,
  sanitizeInput,
  type ColumnNameValidator,
  type PathValidator,
  type InputSanitizer,
} from '../validation.js';

// Also verify exports from main index
import {
  createColumnNameValidator as indexCreateColumnNameValidator,
  createPathValidator as indexCreatePathValidator,
  sanitizeInput as indexSanitizeInput,
  // Issue evodb-go5v, evodb-usd: verify validateColumnName and validateStoragePath aliases
  validateColumnName as indexValidateColumnName,
  validateStoragePath as indexValidateStoragePath,
} from '../index.js';

describe('Input Validation Security', () => {
  describe('createColumnNameValidator', () => {
    let validateColumnName: ColumnNameValidator;

    beforeEach(() => {
      validateColumnName = createColumnNameValidator();
    });

    describe('valid column names', () => {
      it('should accept valid alphanumeric column names', () => {
        expect(validateColumnName('name')).toBe(true);
        expect(validateColumnName('firstName')).toBe(true);
        expect(validateColumnName('user_id')).toBe(true);
        expect(validateColumnName('Column123')).toBe(true);
        expect(validateColumnName('_private')).toBe(true);
      });

      it('should accept column names with dots for nested paths', () => {
        expect(validateColumnName('user.name')).toBe(true);
        expect(validateColumnName('data.nested.value')).toBe(true);
        expect(validateColumnName('meta.tags.0')).toBe(true);
      });

      it('should accept column names with array notation', () => {
        expect(validateColumnName('items[0]')).toBe(true);
        expect(validateColumnName('data[123]')).toBe(true);
        expect(validateColumnName('nested.array[5].value')).toBe(true);
      });
    });

    describe('SQL injection prevention', () => {
      it('should reject column names with SQL injection - DROP TABLE', () => {
        expect(validateColumnName('name; DROP TABLE users; --')).toBe(false);
        expect(validateColumnName('id"; DROP TABLE users; --')).toBe(false);
        expect(validateColumnName("name'; DROP TABLE users; --")).toBe(false);
      });

      it('should reject column names with SQL injection - UNION SELECT', () => {
        expect(validateColumnName('name UNION SELECT * FROM passwords')).toBe(false);
        expect(validateColumnName('id UNION ALL SELECT * FROM secrets')).toBe(false);
      });

      it('should reject column names with SQL injection - OR 1=1', () => {
        expect(validateColumnName("name' OR '1'='1")).toBe(false);
        expect(validateColumnName('id OR 1=1')).toBe(false);
        expect(validateColumnName("name' OR 1=1 --")).toBe(false);
      });

      it('should reject column names with semicolons', () => {
        expect(validateColumnName('name;')).toBe(false);
        expect(validateColumnName('a;b')).toBe(false);
        expect(validateColumnName(';DROP TABLE')).toBe(false);
      });

      it('should reject column names with SQL comment patterns', () => {
        expect(validateColumnName('name--comment')).toBe(false);
        expect(validateColumnName('name/*comment*/')).toBe(false);
        expect(validateColumnName('/* admin */ name')).toBe(false);
      });

      it('should reject column names with quotes', () => {
        expect(validateColumnName("name'")).toBe(false);
        expect(validateColumnName('name"')).toBe(false);
        expect(validateColumnName('name`')).toBe(false);
        expect(validateColumnName("O'Brien")).toBe(false);
      });

      it('should reject column names with parentheses (function calls)', () => {
        expect(validateColumnName('sleep(10)')).toBe(false);
        expect(validateColumnName('BENCHMARK(1000000,SHA1("test"))')).toBe(false);
        expect(validateColumnName('name()')).toBe(false);
      });
    });

    describe('XSS pattern rejection', () => {
      it('should reject column names with script tags', () => {
        expect(validateColumnName('<script>alert(1)</script>')).toBe(false);
        expect(validateColumnName('name<script>evil()</script>')).toBe(false);
        expect(validateColumnName('<SCRIPT>alert("XSS")</SCRIPT>')).toBe(false);
      });

      it('should reject column names with HTML tags', () => {
        expect(validateColumnName('<img src=x onerror=alert(1)>')).toBe(false);
        expect(validateColumnName('<div onclick="evil()">')).toBe(false);
        expect(validateColumnName('<a href="javascript:evil()">')).toBe(false);
      });

      it('should reject column names with event handlers', () => {
        expect(validateColumnName('onload=alert(1)')).toBe(false);
        expect(validateColumnName('onerror=evil')).toBe(false);
        expect(validateColumnName('onmouseover=attack')).toBe(false);
      });

      it('should reject column names with javascript: protocol', () => {
        expect(validateColumnName('javascript:alert(1)')).toBe(false);
        expect(validateColumnName('JAVASCRIPT:void(0)')).toBe(false);
      });
    });

    describe('control character filtering', () => {
      it('should reject column names with null bytes', () => {
        expect(validateColumnName('name\0')).toBe(false);
        expect(validateColumnName('\0hidden')).toBe(false);
        expect(validateColumnName('na\0me')).toBe(false);
      });

      it('should reject column names with newlines', () => {
        expect(validateColumnName('name\n')).toBe(false);
        expect(validateColumnName('name\r\n')).toBe(false);
        expect(validateColumnName('first\nsecond')).toBe(false);
      });

      it('should reject column names with tabs', () => {
        expect(validateColumnName('name\t')).toBe(false);
        expect(validateColumnName('\tname')).toBe(false);
      });

      it('should reject column names with other control characters', () => {
        expect(validateColumnName('name\x1F')).toBe(false); // Unit separator
        expect(validateColumnName('name\x07')).toBe(false); // Bell
        expect(validateColumnName('name\x1B')).toBe(false); // Escape
      });
    });

    describe('length limits', () => {
      it('should reject empty column names', () => {
        expect(validateColumnName('')).toBe(false);
      });

      it('should reject overly long column names (>255 chars)', () => {
        const longName = 'a'.repeat(256);
        expect(validateColumnName(longName)).toBe(false);
      });

      it('should accept column names at the limit (255 chars)', () => {
        const maxName = 'a'.repeat(255);
        expect(validateColumnName(maxName)).toBe(true);
      });
    });

    describe('custom configuration', () => {
      it('should allow custom max length', () => {
        const validator = createColumnNameValidator({ maxLength: 50 });
        expect(validator('a'.repeat(50))).toBe(true);
        expect(validator('a'.repeat(51))).toBe(false);
      });

      it('should allow disabling dot notation', () => {
        const validator = createColumnNameValidator({ allowDots: false });
        expect(validator('user.name')).toBe(false);
        expect(validator('username')).toBe(true);
      });
    });
  });

  describe('createPathValidator', () => {
    let validatePath: PathValidator;

    beforeEach(() => {
      validatePath = createPathValidator();
    });

    describe('valid paths', () => {
      it('should accept valid storage paths', () => {
        expect(validatePath('blocks/123')).toBe(true);
        expect(validatePath('data/2024/01/file.bin')).toBe(true);
        expect(validatePath('tenant_123/blocks/abc-def')).toBe(true);
        expect(validatePath('a/b/c/d/e')).toBe(true);
      });

      it('should accept paths with allowed characters', () => {
        expect(validatePath('block-123')).toBe(true);
        expect(validatePath('block_456')).toBe(true);
        expect(validatePath('Block.123')).toBe(true);
      });
    });

    describe('path traversal prevention', () => {
      it('should reject paths with parent directory traversal', () => {
        expect(validatePath('../secret')).toBe(false);
        expect(validatePath('data/../../../etc/passwd')).toBe(false);
        expect(validatePath('blocks/../../private')).toBe(false);
      });

      it('should reject paths with encoded traversal', () => {
        expect(validatePath('..%2f..%2fetc/passwd')).toBe(false);
        expect(validatePath('%2e%2e/secret')).toBe(false);
        expect(validatePath('..%5c..%5cwindows')).toBe(false);
      });

      it('should reject paths with double-encoded traversal', () => {
        expect(validatePath('%252e%252e%252f')).toBe(false);
        expect(validatePath('..%252fetc')).toBe(false);
      });

      it('should reject paths starting with slash (absolute paths)', () => {
        expect(validatePath('/etc/passwd')).toBe(false);
        expect(validatePath('/root/.ssh/id_rsa')).toBe(false);
      });

      it('should reject Windows-style path traversal', () => {
        expect(validatePath('..\\windows\\system32')).toBe(false);
        expect(validatePath('data\\..\\..\\private')).toBe(false);
      });
    });

    describe('null byte injection prevention', () => {
      it('should reject paths with null bytes', () => {
        expect(validatePath('file.txt\0.jpg')).toBe(false);
        expect(validatePath('block\0/hidden')).toBe(false);
      });

      it('should reject paths with encoded null bytes', () => {
        expect(validatePath('file%00.txt')).toBe(false);
      });
    });

    describe('special character filtering', () => {
      it('should reject paths with shell metacharacters', () => {
        expect(validatePath('block;ls')).toBe(false);
        expect(validatePath('file|cat')).toBe(false);
        expect(validatePath('data&rm -rf')).toBe(false);
        expect(validatePath('path`whoami`')).toBe(false);
      });

      it('should reject paths with newlines', () => {
        expect(validatePath('file\n')).toBe(false);
        expect(validatePath('path\r\n')).toBe(false);
      });
    });

    describe('length limits', () => {
      it('should reject empty paths', () => {
        expect(validatePath('')).toBe(false);
      });

      it('should reject overly long paths (>1024 chars)', () => {
        const longPath = 'a/'.repeat(513); // Creates 1026+ char path
        expect(validatePath(longPath)).toBe(false);
      });

      it('should accept paths at the limit', () => {
        const path = 'a'.repeat(1024);
        expect(validatePath(path)).toBe(true);
      });
    });
  });

  describe('sanitizeInput', () => {
    let sanitize: InputSanitizer;

    beforeEach(() => {
      sanitize = sanitizeInput;
    });

    describe('control character removal', () => {
      it('should remove null bytes', () => {
        expect(sanitize('hello\0world')).toBe('helloworld');
        expect(sanitize('\0test\0')).toBe('test');
      });

      it('should remove other control characters', () => {
        expect(sanitize('hello\x07world')).toBe('helloworld'); // Bell
        expect(sanitize('test\x1B')).toBe('test'); // Escape
        expect(sanitize('\x1Fvalue')).toBe('value'); // Unit separator
      });

      it('should preserve tabs and newlines by default (for multiline content)', () => {
        expect(sanitize('line1\nline2')).toBe('line1\nline2');
        expect(sanitize('col1\tcol2')).toBe('col1\tcol2');
      });
    });

    describe('HTML entity handling', () => {
      it('should escape dangerous HTML characters for display', () => {
        expect(sanitize('<script>alert(1)</script>')).not.toContain('<script>');
        expect(sanitize('<img onerror=x>')).not.toContain('<img');
      });

      it('should escape angle brackets', () => {
        const result = sanitize('<div>test</div>');
        expect(result).not.toBe('<div>test</div>');
        expect(result).toContain('&lt;');
        expect(result).toContain('&gt;');
      });

      it('should escape quotes', () => {
        const result = sanitize('"quoted" and \'single\'');
        expect(result).toContain('&quot;');
        expect(result).toContain('&#x27;');
      });

      it('should escape ampersands', () => {
        expect(sanitize('A & B')).toBe('A &amp; B');
      });
    });

    describe('length limiting', () => {
      it('should truncate overly long inputs', () => {
        const longInput = 'a'.repeat(10001);
        const result = sanitize(longInput);
        expect(result.length).toBeLessThanOrEqual(10000);
      });

      it('should allow custom max length', () => {
        const input = 'a'.repeat(200);
        const result = sanitize(input, { maxLength: 100 });
        expect(result.length).toBe(100);
      });
    });

    describe('unicode handling', () => {
      it('should preserve valid unicode characters', () => {
        expect(sanitize('Hello 世界')).toBe('Hello 世界');
        expect(sanitize('emoji 🎉')).toBe('emoji 🎉');
        expect(sanitize('Ñoño')).toBe('Ñoño');
      });

      it('should handle mixed unicode and ASCII', () => {
        expect(sanitize('user@日本.com')).toBe('user@日本.com');
      });
    });

    describe('edge cases', () => {
      it('should handle empty strings', () => {
        expect(sanitize('')).toBe('');
      });

      it('should handle whitespace-only strings', () => {
        expect(sanitize('   ')).toBe('   ');
      });

      it('should return already-safe strings unchanged', () => {
        expect(sanitize('hello world')).toBe('hello world');
        expect(sanitize('user123')).toBe('user123');
      });
    });
  });

  describe('Integration: Real-world attack patterns', () => {
    let validateColumnName: ColumnNameValidator;
    let validatePath: PathValidator;

    beforeEach(() => {
      validateColumnName = createColumnNameValidator();
      validatePath = createPathValidator();
    });

    it('should block SQLMap default payloads', () => {
      // Common SQLMap test strings
      expect(validateColumnName("1' AND '1'='1")).toBe(false);
      expect(validateColumnName("1' AND SLEEP(5)--")).toBe(false);
      expect(validateColumnName("1; WAITFOR DELAY '0:0:5'--")).toBe(false);
    });

    it('should block OWASP Top 10 SQL injection patterns', () => {
      expect(validateColumnName("admin'--")).toBe(false);
      expect(validateColumnName("' OR '1'='1'/*")).toBe(false);
      expect(validateColumnName("1' ORDER BY 1--")).toBe(false);
      expect(validateColumnName("1' HAVING 1=1--")).toBe(false);
    });

    it('should block XSS polyglot payloads', () => {
      // Common XSS polyglots
      expect(validateColumnName("jaVasCript:/*-/*`/*\\`/*'/*\"/**/(/* */oNcLiCk=alert() )//")).toBe(false);
      expect(validateColumnName("<svg/onload=alert('XSS')>")).toBe(false);
      expect(validateColumnName("'><script>alert(String.fromCharCode(88,83,83))</script>")).toBe(false);
    });

    it('should block path traversal variants from security scanners', () => {
      expect(validatePath('....//....//etc/passwd')).toBe(false);
      expect(validatePath('..;/..;/etc/passwd')).toBe(false);
      expect(validatePath('.../...//etc')).toBe(false);
    });
  });

  describe('Module exports', () => {
    it('should export validation functions from main index', () => {
      // Verify exports are the same functions
      expect(indexCreateColumnNameValidator).toBe(createColumnNameValidator);
      expect(indexCreatePathValidator).toBe(createPathValidator);
      expect(indexSanitizeInput).toBe(sanitizeInput);
    });

    it('should work correctly when imported from main index', () => {
      const validator = indexCreateColumnNameValidator();
      expect(validator('validName')).toBe(true);
      expect(validator("'; DROP TABLE --")).toBe(false);

      const pathValidator = indexCreatePathValidator();
      expect(pathValidator('valid/path')).toBe(true);
      expect(pathValidator('../secret')).toBe(false);

      expect(indexSanitizeInput('<script>alert(1)</script>')).toContain('&lt;');
    });

    it('should export validateColumnName and validateStoragePath aliases (evodb-go5v, evodb-usd)', () => {
      // Verify the throwing validators are exported with the requested names
      expect(typeof indexValidateColumnName).toBe('function');
      expect(typeof indexValidateStoragePath).toBe('function');
    });

    it('should validate and throw errors for invalid column names via validateColumnName', () => {
      // Valid column names should not throw
      expect(() => indexValidateColumnName('user_id')).not.toThrow();
      expect(() => indexValidateColumnName('firstName')).not.toThrow();
      expect(() => indexValidateColumnName('data.nested.value')).not.toThrow();

      // SQL injection patterns should throw
      expect(() => indexValidateColumnName('id; DROP TABLE')).toThrow();
      expect(() => indexValidateColumnName("name'; DROP TABLE users; --")).toThrow();

      // XSS patterns should throw
      expect(() => indexValidateColumnName('<script>')).toThrow();

      // Control characters should throw
      expect(() => indexValidateColumnName('col\0umn')).toThrow();
      expect(() => indexValidateColumnName('col\x1Fumn')).toThrow();

      // Path traversal should throw
      expect(() => indexValidateColumnName('../../../etc/passwd')).toThrow();
    });

    it('should validate and throw errors for invalid paths via validateStoragePath', () => {
      // Valid paths should not throw
      expect(() => indexValidateStoragePath('blocks/123')).not.toThrow();
      expect(() => indexValidateStoragePath('data/2024/01/file.bin')).not.toThrow();

      // Path traversal should throw
      expect(() => indexValidateStoragePath('../')).toThrow();
      expect(() => indexValidateStoragePath('../../../etc/passwd')).toThrow();

      // Absolute paths should throw
      expect(() => indexValidateStoragePath('/etc/passwd')).toThrow();
      expect(() => indexValidateStoragePath('/root/.ssh')).toThrow();
    });
  });
});
