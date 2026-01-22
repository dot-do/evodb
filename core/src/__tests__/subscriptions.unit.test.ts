/**
 * Tests for Real-time Subscriptions API
 *
 * TDD Issue: evodb-kn18
 *
 * This test suite covers:
 * - Subscription lifecycle (subscribe/unsubscribe)
 * - Event types (insert/update/delete)
 * - Query-based subscription filtering
 * - Subscription management
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createSubscriptionManager,
  type SubscriptionManager,
  type Subscription,
  type ChangeEvent,
} from '../subscriptions.js';
import type { ExecutorQuery } from '../query-executor.js';

// =============================================================================
// Real-time Subscriptions Tests
// =============================================================================

describe('Real-time Subscriptions', () => {
  let manager: SubscriptionManager;

  beforeEach(() => {
    manager = createSubscriptionManager();
  });

  describe('subscribe()', () => {
    it('returns subscription handle', () => {
      const callback = vi.fn();
      const subscription = manager.subscribe('users', callback);

      expect(subscription).toBeDefined();
      expect(subscription.id).toBeDefined();
      expect(typeof subscription.id).toBe('string');
      expect(typeof subscription.unsubscribe).toBe('function');
    });

    it('assigns unique subscription IDs', () => {
      const callback = vi.fn();
      const sub1 = manager.subscribe('users', callback);
      const sub2 = manager.subscribe('users', callback);
      const sub3 = manager.subscribe('posts', callback);

      expect(sub1.id).not.toBe(sub2.id);
      expect(sub2.id).not.toBe(sub3.id);
      expect(sub1.id).not.toBe(sub3.id);
    });
  });

  describe('subscription receives insert events', () => {
    it('notifies subscriber on insert', () => {
      const callback = vi.fn();
      manager.subscribe('users', callback);

      const event: ChangeEvent = {
        type: 'insert',
        table: 'users',
        data: { id: 1, name: 'Alice' },
        timestamp: Date.now(),
      };

      manager.emit(event);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(event);
    });

    it('does not notify unrelated table subscribers', () => {
      const usersCallback = vi.fn();
      const postsCallback = vi.fn();

      manager.subscribe('users', usersCallback);
      manager.subscribe('posts', postsCallback);

      const event: ChangeEvent = {
        type: 'insert',
        table: 'users',
        data: { id: 1, name: 'Alice' },
        timestamp: Date.now(),
      };

      manager.emit(event);

      expect(usersCallback).toHaveBeenCalledTimes(1);
      expect(postsCallback).not.toHaveBeenCalled();
    });
  });

  describe('subscription receives update events', () => {
    it('notifies subscriber on update with previous data', () => {
      const callback = vi.fn();
      manager.subscribe('users', callback);

      const event: ChangeEvent = {
        type: 'update',
        table: 'users',
        data: { id: 1, name: 'Alice Updated' },
        previousData: { id: 1, name: 'Alice' },
        timestamp: Date.now(),
      };

      manager.emit(event);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(event);
    });

    it('includes previousData in update events', () => {
      const callback = vi.fn();
      manager.subscribe('users', callback);

      const event: ChangeEvent = {
        type: 'update',
        table: 'users',
        data: { id: 1, name: 'New Name' },
        previousData: { id: 1, name: 'Old Name' },
        timestamp: Date.now(),
      };

      manager.emit(event);

      const receivedEvent = callback.mock.calls[0][0] as ChangeEvent;
      expect(receivedEvent.previousData).toEqual({ id: 1, name: 'Old Name' });
      expect(receivedEvent.data).toEqual({ id: 1, name: 'New Name' });
    });
  });

  describe('subscription receives delete events', () => {
    it('notifies subscriber on delete', () => {
      const callback = vi.fn();
      manager.subscribe('users', callback);

      const event: ChangeEvent = {
        type: 'delete',
        table: 'users',
        data: { id: 1, name: 'Alice' },
        timestamp: Date.now(),
      };

      manager.emit(event);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(event);
    });

    it('includes deleted data in delete events', () => {
      const callback = vi.fn();
      manager.subscribe('users', callback);

      const event: ChangeEvent = {
        type: 'delete',
        table: 'users',
        data: { id: 1, name: 'Deleted User', email: 'deleted@example.com' },
        timestamp: Date.now(),
      };

      manager.emit(event);

      const receivedEvent = callback.mock.calls[0][0] as ChangeEvent;
      expect(receivedEvent.type).toBe('delete');
      expect(receivedEvent.data).toEqual({ id: 1, name: 'Deleted User', email: 'deleted@example.com' });
    });
  });

  describe('unsubscribe() stops receiving events', () => {
    it('stops receiving events after unsubscribe', () => {
      const callback = vi.fn();
      const subscription = manager.subscribe('users', callback);

      // First event should be received
      manager.emit({
        type: 'insert',
        table: 'users',
        data: { id: 1, name: 'Alice' },
        timestamp: Date.now(),
      });

      expect(callback).toHaveBeenCalledTimes(1);

      // Unsubscribe
      subscription.unsubscribe();

      // Second event should not be received
      manager.emit({
        type: 'insert',
        table: 'users',
        data: { id: 2, name: 'Bob' },
        timestamp: Date.now(),
      });

      expect(callback).toHaveBeenCalledTimes(1); // Still 1
    });

    it('unsubscribe is idempotent', () => {
      const callback = vi.fn();
      const subscription = manager.subscribe('users', callback);

      subscription.unsubscribe();
      subscription.unsubscribe(); // Should not throw
      subscription.unsubscribe();

      // Still should not receive events
      manager.emit({
        type: 'insert',
        table: 'users',
        data: { id: 1, name: 'Alice' },
        timestamp: Date.now(),
      });

      expect(callback).not.toHaveBeenCalled();
    });

    it('only unsubscribes the specific subscription', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      const sub1 = manager.subscribe('users', callback1);
      manager.subscribe('users', callback2);

      sub1.unsubscribe();

      manager.emit({
        type: 'insert',
        table: 'users',
        data: { id: 1, name: 'Alice' },
        timestamp: Date.now(),
      });

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).toHaveBeenCalledTimes(1);
    });
  });

  describe('query subscription filters events', () => {
    it('filters events based on query predicates', () => {
      const callback = vi.fn();

      const query: ExecutorQuery = {
        table: 'users',
        predicates: [{ column: 'status', operator: 'eq', value: 'active' }],
      };

      manager.subscribeQuery(query, callback);

      // This event matches the filter
      manager.emit({
        type: 'insert',
        table: 'users',
        data: { id: 1, name: 'Alice', status: 'active' },
        timestamp: Date.now(),
      });

      // This event does not match the filter
      manager.emit({
        type: 'insert',
        table: 'users',
        data: { id: 2, name: 'Bob', status: 'inactive' },
        timestamp: Date.now(),
      });

      expect(callback).toHaveBeenCalledTimes(1);
      expect((callback.mock.calls[0][0] as ChangeEvent).data).toEqual({ id: 1, name: 'Alice', status: 'active' });
    });

    it('allows events when no predicates specified', () => {
      const callback = vi.fn();

      const query: ExecutorQuery = {
        table: 'users',
      };

      manager.subscribeQuery(query, callback);

      manager.emit({
        type: 'insert',
        table: 'users',
        data: { id: 1, name: 'Alice' },
        timestamp: Date.now(),
      });

      manager.emit({
        type: 'update',
        table: 'users',
        data: { id: 1, name: 'Alice Updated' },
        timestamp: Date.now(),
      });

      expect(callback).toHaveBeenCalledTimes(2);
    });

    it('returns subscription handle for query subscription', () => {
      const callback = vi.fn();
      const query: ExecutorQuery = { table: 'users' };

      const subscription = manager.subscribeQuery(query, callback);

      expect(subscription).toBeDefined();
      expect(subscription.id).toBeDefined();
      expect(typeof subscription.unsubscribe).toBe('function');
    });

    it('can unsubscribe from query subscription', () => {
      const callback = vi.fn();
      const query: ExecutorQuery = { table: 'users' };

      const subscription = manager.subscribeQuery(query, callback);

      manager.emit({
        type: 'insert',
        table: 'users',
        data: { id: 1, name: 'Alice' },
        timestamp: Date.now(),
      });

      expect(callback).toHaveBeenCalledTimes(1);

      subscription.unsubscribe();

      manager.emit({
        type: 'insert',
        table: 'users',
        data: { id: 2, name: 'Bob' },
        timestamp: Date.now(),
      });

      expect(callback).toHaveBeenCalledTimes(1); // Still 1
    });

    it('filters with multiple predicates (AND logic)', () => {
      const callback = vi.fn();

      const query: ExecutorQuery = {
        table: 'orders',
        predicates: [
          { column: 'status', operator: 'eq', value: 'completed' },
          { column: 'total', operator: 'gte', value: 100 },
        ],
      };

      manager.subscribeQuery(query, callback);

      // Matches both predicates
      manager.emit({
        type: 'insert',
        table: 'orders',
        data: { id: 1, status: 'completed', total: 150 },
        timestamp: Date.now(),
      });

      // Matches only first predicate
      manager.emit({
        type: 'insert',
        table: 'orders',
        data: { id: 2, status: 'completed', total: 50 },
        timestamp: Date.now(),
      });

      // Matches only second predicate
      manager.emit({
        type: 'insert',
        table: 'orders',
        data: { id: 3, status: 'pending', total: 200 },
        timestamp: Date.now(),
      });

      expect(callback).toHaveBeenCalledTimes(1);
      expect((callback.mock.calls[0][0] as ChangeEvent).data).toEqual({ id: 1, status: 'completed', total: 150 });
    });
  });

  describe('multiple subscribers', () => {
    it('notifies all subscribers for a table', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const callback3 = vi.fn();

      manager.subscribe('users', callback1);
      manager.subscribe('users', callback2);
      manager.subscribe('users', callback3);

      manager.emit({
        type: 'insert',
        table: 'users',
        data: { id: 1, name: 'Alice' },
        timestamp: Date.now(),
      });

      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
      expect(callback3).toHaveBeenCalledTimes(1);
    });

    it('handles mix of table and query subscriptions', () => {
      const tableCallback = vi.fn();
      const queryCallback = vi.fn();

      manager.subscribe('users', tableCallback);
      manager.subscribeQuery(
        {
          table: 'users',
          predicates: [{ column: 'role', operator: 'eq', value: 'admin' }],
        },
        queryCallback
      );

      // Non-admin user
      manager.emit({
        type: 'insert',
        table: 'users',
        data: { id: 1, name: 'Alice', role: 'user' },
        timestamp: Date.now(),
      });

      expect(tableCallback).toHaveBeenCalledTimes(1);
      expect(queryCallback).not.toHaveBeenCalled();

      // Admin user
      manager.emit({
        type: 'insert',
        table: 'users',
        data: { id: 2, name: 'Bob', role: 'admin' },
        timestamp: Date.now(),
      });

      expect(tableCallback).toHaveBeenCalledTimes(2);
      expect(queryCallback).toHaveBeenCalledTimes(1);
    });
  });

  describe('event ordering', () => {
    it('events include timestamp', () => {
      const callback = vi.fn();
      manager.subscribe('users', callback);

      const beforeEmit = Date.now();

      manager.emit({
        type: 'insert',
        table: 'users',
        data: { id: 1 },
        timestamp: Date.now(),
      });

      const afterEmit = Date.now();

      const event = callback.mock.calls[0][0] as ChangeEvent;
      expect(event.timestamp).toBeGreaterThanOrEqual(beforeEmit);
      expect(event.timestamp).toBeLessThanOrEqual(afterEmit);
    });
  });

  describe('typed subscriptions', () => {
    it('supports generic type parameter', () => {
      interface User {
        id: number;
        name: string;
        email: string;
      }

      const callback = vi.fn<[ChangeEvent<User>], void>();
      manager.subscribe<User>('users', callback);

      const userData: User = { id: 1, name: 'Alice', email: 'alice@example.com' };

      manager.emit({
        type: 'insert',
        table: 'users',
        data: userData,
        timestamp: Date.now(),
      });

      expect(callback).toHaveBeenCalledTimes(1);
      const event = callback.mock.calls[0][0];
      expect(event.data.name).toBe('Alice');
      expect(event.data.email).toBe('alice@example.com');
    });
  });
});
