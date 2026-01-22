/**
 * @evodb/core - Real-time Subscriptions API
 *
 * Provides real-time event subscriptions for data changes.
 * Supports table-level and query-filtered subscriptions.
 *
 * TDD Issue: evodb-kn18
 *
 * @example
 * ```typescript
 * import { createSubscriptionManager } from '@evodb/core';
 *
 * const manager = createSubscriptionManager();
 *
 * // Subscribe to all changes on a table
 * const sub = manager.subscribe('users', (event) => {
 *   console.log(`${event.type} on ${event.table}:`, event.data);
 * });
 *
 * // Subscribe with query filter
 * const querySub = manager.subscribeQuery(
 *   { table: 'orders', predicates: [{ column: 'status', operator: 'eq', value: 'pending' }] },
 *   (event) => console.log('Pending order change:', event)
 * );
 *
 * // Emit events (typically called by the database layer)
 * manager.emit({ type: 'insert', table: 'users', data: { id: 1, name: 'Alice' }, timestamp: Date.now() });
 *
 * // Cleanup
 * sub.unsubscribe();
 * querySub.unsubscribe();
 * ```
 */

import type { ExecutorQuery, ExecutorPredicate } from './query-executor.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Subscription handle returned when subscribing to events.
 * Provides the ability to unsubscribe when notifications are no longer needed.
 */
export interface Subscription {
  /** Unique identifier for this subscription */
  id: string;

  /** Stop receiving events for this subscription */
  unsubscribe(): void;
}

/**
 * Event emitted when data changes in the database.
 * Contains the type of change, affected table, and relevant data.
 *
 * @typeParam T - Type of the data being changed (defaults to unknown)
 */
export interface ChangeEvent<T = unknown> {
  /** Type of change that occurred */
  type: 'insert' | 'update' | 'delete';

  /** Name of the affected table */
  table: string;

  /** The new/current data (for insert/update) or deleted data (for delete) */
  data: T;

  /** Previous data before the change (only for update events) */
  previousData?: T;

  /** Unix timestamp (milliseconds) when the event occurred */
  timestamp: number;
}

/**
 * Callback function invoked when a subscribed event occurs.
 *
 * @typeParam T - Type of the data in the event
 */
export type SubscriptionCallback<T = unknown> = (event: ChangeEvent<T>) => void;

/**
 * Manager for real-time subscriptions.
 * Handles subscription lifecycle and event distribution.
 */
export interface SubscriptionManager {
  /**
   * Subscribe to all changes on a specific table.
   *
   * @typeParam T - Type of the data in events
   * @param table - Name of the table to subscribe to
   * @param callback - Function to call when events occur
   * @returns Subscription handle for managing the subscription
   */
  subscribe<T = unknown>(table: string, callback: SubscriptionCallback<T>): Subscription;

  /**
   * Subscribe to changes matching a query filter.
   * Only events that match the query predicates will trigger the callback.
   *
   * @typeParam T - Type of the data in events
   * @param query - Query specification with table and optional predicates
   * @param callback - Function to call when matching events occur
   * @returns Subscription handle for managing the subscription
   */
  subscribeQuery<T = unknown>(query: ExecutorQuery, callback: SubscriptionCallback<T>): Subscription;

  /**
   * Emit a change event to all matching subscribers.
   * This is typically called by the database layer when data changes.
   *
   * @param event - The change event to emit
   */
  emit(event: ChangeEvent): void;
}

// =============================================================================
// Internal Types
// =============================================================================

interface InternalSubscription {
  id: string;
  table: string;
  callback: SubscriptionCallback;
  query?: ExecutorQuery;
}

// =============================================================================
// Implementation
// =============================================================================

/**
 * Generate a unique subscription ID.
 */
function generateSubscriptionId(): string {
  return `sub_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Evaluate a single predicate against a data value.
 */
function evaluatePredicate(data: unknown, predicate: ExecutorPredicate): boolean {
  const record = data as Record<string, unknown>;
  const value = record[predicate.column];

  switch (predicate.operator) {
    case 'eq':
      return value === predicate.value;
    case 'ne':
      return value !== predicate.value;
    case 'gt':
      return (value as number) > (predicate.value as number);
    case 'gte':
    case 'ge':
      return (value as number) >= (predicate.value as number);
    case 'lt':
      return (value as number) < (predicate.value as number);
    case 'lte':
    case 'le':
      return (value as number) <= (predicate.value as number);
    case 'in':
      return (predicate.values ?? []).includes(value);
    case 'notIn':
      return !(predicate.values ?? []).includes(value);
    case 'between':
      return (
        (value as number) >= (predicate.lowerBound as number) &&
        (value as number) <= (predicate.upperBound as number)
      );
    case 'like':
      // Simple like pattern matching (% is wildcard)
      if (typeof value !== 'string' || typeof predicate.value !== 'string') return false;
      const pattern = predicate.value.replace(/%/g, '.*').replace(/_/g, '.');
      return new RegExp(`^${pattern}$`, 'i').test(value);
    case 'isNull':
      return value === null || value === undefined;
    case 'isNotNull':
      return value !== null && value !== undefined;
    default:
      return true;
  }
}

/**
 * Check if data matches all predicates in a query (AND logic).
 */
function matchesQuery(data: unknown, query: ExecutorQuery): boolean {
  if (!query.predicates || query.predicates.length === 0) {
    return true;
  }

  return query.predicates.every((predicate) => {
    const result = evaluatePredicate(data, predicate);
    return predicate.not ? !result : result;
  });
}

/**
 * Create a new subscription manager instance.
 *
 * @returns A new SubscriptionManager for handling real-time subscriptions
 *
 * @example
 * ```typescript
 * const manager = createSubscriptionManager();
 *
 * // Subscribe to all user changes
 * const sub = manager.subscribe('users', (event) => {
 *   console.log('User changed:', event.type, event.data);
 * });
 *
 * // Emit an event
 * manager.emit({
 *   type: 'insert',
 *   table: 'users',
 *   data: { id: 1, name: 'Alice' },
 *   timestamp: Date.now()
 * });
 *
 * // Cleanup
 * sub.unsubscribe();
 * ```
 */
export function createSubscriptionManager(): SubscriptionManager {
  const subscriptions = new Map<string, InternalSubscription>();

  return {
    subscribe<T = unknown>(table: string, callback: SubscriptionCallback<T>): Subscription {
      const id = generateSubscriptionId();

      const subscription: InternalSubscription = {
        id,
        table,
        callback: callback as SubscriptionCallback,
      };

      subscriptions.set(id, subscription);

      return {
        id,
        unsubscribe(): void {
          subscriptions.delete(id);
        },
      };
    },

    subscribeQuery<T = unknown>(query: ExecutorQuery, callback: SubscriptionCallback<T>): Subscription {
      const id = generateSubscriptionId();

      const subscription: InternalSubscription = {
        id,
        table: query.table,
        callback: callback as SubscriptionCallback,
        query,
      };

      subscriptions.set(id, subscription);

      return {
        id,
        unsubscribe(): void {
          subscriptions.delete(id);
        },
      };
    },

    emit(event: ChangeEvent): void {
      for (const subscription of subscriptions.values()) {
        // Check if subscription is for this table
        if (subscription.table !== event.table) {
          continue;
        }

        // If it's a query subscription, check if the event matches the query
        if (subscription.query) {
          if (!matchesQuery(event.data, subscription.query)) {
            continue;
          }
        }

        // Call the subscriber's callback
        subscription.callback(event);
      }
    },
  };
}
