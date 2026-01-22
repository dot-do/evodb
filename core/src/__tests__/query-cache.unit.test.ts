/**
 * Query Cache Unit Tests
 * Issue: evodb-mgwo - TDD: Implement declarative query caching
 *
 * Tests for the QueryCache providing:
 * - In-memory caching of query results
 * - TTL-based expiration
 * - Pattern-based invalidation
 * - Cache key normalization
 * - LRU eviction with maxSize
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createQueryCache,
  type QueryCache,
  type QueryCacheOptions,
} from '../query-cache.js';

describe('Query Cache', () => {
  let cache: QueryCache;

  beforeEach(() => {
    vi.useFakeTimers();
    cache = createQueryCache();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('cache hit returns cached result', () => {
    it('should return cached value for existing key', () => {
      const data = { name: 'test', value: 42 };
      cache.set('query:users:1', data);

      const result = cache.get<typeof data>('query:users:1');

      expect(result).toEqual(data);
    });

    it('should return exact same reference for cached objects', () => {
      const data = { name: 'test' };
      cache.set('key', data);

      const result = cache.get('key');

      expect(result).toBe(data);
    });

    it('should handle primitive values', () => {
      cache.set('number', 42);
      cache.set('string', 'hello');
      cache.set('boolean', true);
      cache.set('null', null);

      expect(cache.get('number')).toBe(42);
      expect(cache.get('string')).toBe('hello');
      expect(cache.get('boolean')).toBe(true);
      expect(cache.get('null')).toBe(null);
    });

    it('should handle array values', () => {
      const arr = [1, 2, 3];
      cache.set('array', arr);

      expect(cache.get('array')).toEqual([1, 2, 3]);
    });
  });

  describe('cache miss executes query', () => {
    it('should return undefined for non-existent key', () => {
      const result = cache.get('non-existent');

      expect(result).toBeUndefined();
    });

    it('should return undefined for cleared cache', () => {
      cache.set('key', 'value');
      cache.clear();

      expect(cache.get('key')).toBeUndefined();
    });

    it('should return undefined for invalidated entry', () => {
      cache.set('users:1', { name: 'Alice' });
      cache.invalidate('users:1');

      expect(cache.get('users:1')).toBeUndefined();
    });
  });

  describe('TTL expires cached entries', () => {
    it('should expire entry after TTL', () => {
      cache.set('key', 'value', { ttl: 1000 });

      // Before expiration
      expect(cache.get('key')).toBe('value');

      // After expiration
      vi.advanceTimersByTime(1001);
      expect(cache.get('key')).toBeUndefined();
    });

    it('should use default TTL when not specified per-entry', () => {
      const cacheWithDefaultTtl = createQueryCache({ ttl: 500 });
      cacheWithDefaultTtl.set('key', 'value');

      expect(cacheWithDefaultTtl.get('key')).toBe('value');

      vi.advanceTimersByTime(501);
      expect(cacheWithDefaultTtl.get('key')).toBeUndefined();
    });

    it('should override default TTL with per-entry TTL', () => {
      const cacheWithDefaultTtl = createQueryCache({ ttl: 500 });
      cacheWithDefaultTtl.set('key', 'value', { ttl: 2000 });

      vi.advanceTimersByTime(501);
      expect(cacheWithDefaultTtl.get('key')).toBe('value'); // Still valid

      vi.advanceTimersByTime(1500);
      expect(cacheWithDefaultTtl.get('key')).toBeUndefined(); // Now expired
    });

    it('should not expire entry when TTL is 0 (infinite)', () => {
      const cacheWithNoTtl = createQueryCache({ ttl: 0 });
      cacheWithNoTtl.set('key', 'value');

      vi.advanceTimersByTime(100000);
      expect(cacheWithNoTtl.get('key')).toBe('value');
    });

    it('should handle negative TTL as immediate expiration', () => {
      cache.set('key', 'value', { ttl: -1 });

      expect(cache.get('key')).toBeUndefined();
    });

    it('should update TTL on re-set', () => {
      cache.set('key', 'value1', { ttl: 1000 });

      vi.advanceTimersByTime(800);
      cache.set('key', 'value2', { ttl: 1000 });

      vi.advanceTimersByTime(800);
      expect(cache.get('key')).toBe('value2'); // Still valid

      vi.advanceTimersByTime(300);
      expect(cache.get('key')).toBeUndefined(); // Now expired
    });
  });

  describe('invalidation removes related entries', () => {
    it('should invalidate exact key match', () => {
      cache.set('users:1', { name: 'Alice' });
      cache.set('users:2', { name: 'Bob' });

      cache.invalidate('users:1');

      expect(cache.get('users:1')).toBeUndefined();
      expect(cache.get('users:2')).toEqual({ name: 'Bob' });
    });

    it('should invalidate by glob pattern with *', () => {
      cache.set('users:1', { name: 'Alice' });
      cache.set('users:2', { name: 'Bob' });
      cache.set('posts:1', { title: 'Hello' });

      cache.invalidate('users:*');

      expect(cache.get('users:1')).toBeUndefined();
      expect(cache.get('users:2')).toBeUndefined();
      expect(cache.get('posts:1')).toEqual({ title: 'Hello' });
    });

    it('should invalidate by prefix pattern', () => {
      cache.set('api:users:list', []);
      cache.set('api:users:1', { id: 1 });
      cache.set('api:posts:list', []);

      cache.invalidate('api:users:*');

      expect(cache.get('api:users:list')).toBeUndefined();
      expect(cache.get('api:users:1')).toBeUndefined();
      expect(cache.get('api:posts:list')).toEqual([]);
    });

    it('should invalidate all entries with * pattern', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      cache.invalidate('*');

      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBeUndefined();
      expect(cache.get('c')).toBeUndefined();
    });

    it('should support invalidateOn option during set', () => {
      cache.set('users:list', [], { invalidateOn: ['users:*', 'auth:*'] });
      cache.set('users:1', { name: 'Alice' });

      // Invalidating users:* should remove users:list
      cache.invalidate('users:*');

      expect(cache.get('users:list')).toBeUndefined();
      expect(cache.get('users:1')).toBeUndefined();
    });

    it('should handle invalidation of non-existent keys gracefully', () => {
      // Should not throw
      expect(() => cache.invalidate('non-existent')).not.toThrow();
      expect(() => cache.invalidate('*')).not.toThrow();
    });
  });

  describe('cache key is normalized', () => {
    it('should treat equivalent keys as the same', () => {
      cache.set('  key  ', 'value');

      expect(cache.get('key')).toBe('value');
      expect(cache.get('  key  ')).toBe('value');
    });

    it('should normalize case for case-insensitive matching', () => {
      const caseInsensitiveCache = createQueryCache();
      caseInsensitiveCache.set('Users:1', 'value');

      // Keys are stored as-is but lookup normalizes
      expect(caseInsensitiveCache.get('users:1')).toBe('value');
      expect(caseInsensitiveCache.get('USERS:1')).toBe('value');
    });

    it('should handle special characters in keys', () => {
      cache.set('query:select * from users', 'result');
      cache.set('key:with:colons', 'value');
      cache.set('key/with/slashes', 'value2');

      expect(cache.get('query:select * from users')).toBe('result');
      expect(cache.get('key:with:colons')).toBe('value');
      expect(cache.get('key/with/slashes')).toBe('value2');
    });

    it('should handle empty string key', () => {
      cache.set('', 'empty-key-value');

      expect(cache.get('')).toBe('empty-key-value');
    });

    it('should handle unicode keys', () => {
      cache.set('emoji:key', 'value');
      cache.set('japanese:query', 'result');

      expect(cache.get('emoji:key')).toBe('value');
      expect(cache.get('japanese:query')).toBe('result');
    });
  });

  describe('maxSize eviction', () => {
    it('should evict oldest entry when maxSize exceeded', () => {
      const smallCache = createQueryCache({ maxSize: 3 });

      smallCache.set('a', 1);
      smallCache.set('b', 2);
      smallCache.set('c', 3);
      smallCache.set('d', 4); // Should evict 'a'

      expect(smallCache.get('a')).toBeUndefined();
      expect(smallCache.get('b')).toBe(2);
      expect(smallCache.get('c')).toBe(3);
      expect(smallCache.get('d')).toBe(4);
    });

    it('should update LRU order on get', () => {
      const smallCache = createQueryCache({ maxSize: 3 });

      smallCache.set('a', 1);
      smallCache.set('b', 2);
      smallCache.set('c', 3);

      // Access 'a' to make it most recently used
      smallCache.get('a');

      smallCache.set('d', 4); // Should evict 'b' (least recently used)

      expect(smallCache.get('a')).toBe(1); // Still present
      expect(smallCache.get('b')).toBeUndefined(); // Evicted
      expect(smallCache.get('c')).toBe(3);
      expect(smallCache.get('d')).toBe(4);
    });

    it('should not evict when updating existing key', () => {
      const smallCache = createQueryCache({ maxSize: 2 });

      smallCache.set('a', 1);
      smallCache.set('b', 2);
      smallCache.set('a', 3); // Update, not insert

      expect(smallCache.get('a')).toBe(3);
      expect(smallCache.get('b')).toBe(2);
    });

    it('should handle maxSize of 1', () => {
      const tinyCache = createQueryCache({ maxSize: 1 });

      tinyCache.set('a', 1);
      expect(tinyCache.get('a')).toBe(1);

      tinyCache.set('b', 2);
      expect(tinyCache.get('a')).toBeUndefined();
      expect(tinyCache.get('b')).toBe(2);
    });

    it('should allow unlimited entries when maxSize is 0', () => {
      const unlimitedCache = createQueryCache({ maxSize: 0 });

      for (let i = 0; i < 1000; i++) {
        unlimitedCache.set(`key:${i}`, i);
      }

      expect(unlimitedCache.get('key:0')).toBe(0);
      expect(unlimitedCache.get('key:999')).toBe(999);
    });
  });

  describe('clear', () => {
    it('should remove all entries', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      cache.clear();

      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBeUndefined();
      expect(cache.get('c')).toBeUndefined();
    });

    it('should be safe to call on empty cache', () => {
      expect(() => cache.clear()).not.toThrow();
    });
  });

  describe('type safety', () => {
    it('should preserve types through get/set', () => {
      interface User {
        id: number;
        name: string;
      }

      const user: User = { id: 1, name: 'Alice' };
      cache.set('user:1', user);

      const retrieved = cache.get<User>('user:1');
      expect(retrieved?.id).toBe(1);
      expect(retrieved?.name).toBe('Alice');
    });

    it('should handle undefined values', () => {
      cache.set('undef', undefined);

      // undefined is a valid value, distinct from cache miss
      // Implementation should differentiate
      const result = cache.get('undef');
      expect(result).toBeUndefined();
    });
  });

  describe('factory function', () => {
    it('should create cache with default options', () => {
      const defaultCache = createQueryCache();
      defaultCache.set('key', 'value');
      expect(defaultCache.get('key')).toBe('value');
    });

    it('should create cache with custom options', () => {
      const customCache = createQueryCache({
        ttl: 1000,
        maxSize: 100,
      });

      customCache.set('key', 'value');
      expect(customCache.get('key')).toBe('value');

      vi.advanceTimersByTime(1001);
      expect(customCache.get('key')).toBeUndefined();
    });

    it('should create independent cache instances', () => {
      const cache1 = createQueryCache();
      const cache2 = createQueryCache();

      cache1.set('key', 'value1');
      cache2.set('key', 'value2');

      expect(cache1.get('key')).toBe('value1');
      expect(cache2.get('key')).toBe('value2');
    });
  });

  describe('edge cases', () => {
    it('should handle very long keys', () => {
      const longKey = 'x'.repeat(10000);
      cache.set(longKey, 'value');
      expect(cache.get(longKey)).toBe('value');
    });

    it('should handle rapid successive operations', () => {
      for (let i = 0; i < 1000; i++) {
        cache.set(`key:${i}`, i);
      }

      for (let i = 0; i < 1000; i++) {
        expect(cache.get(`key:${i}`)).toBe(i);
      }
    });

    it('should handle concurrent set and invalidate', () => {
      cache.set('key', 'value1');
      cache.invalidate('key');
      cache.set('key', 'value2');

      expect(cache.get('key')).toBe('value2');
    });
  });
});
