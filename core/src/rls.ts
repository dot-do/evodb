/**
 * Row-Level Security (RLS) for EvoDB
 *
 * TDD Issue: evodb-amp7
 *
 * This module provides:
 * - Policy definition and management for tables
 * - SELECT policy filtering of query results
 * - INSERT/UPDATE/DELETE policy validation
 * - Admin bypass functionality for privileged operations
 * - Flexible security context for multi-tenant applications
 *
 * @example
 * ```typescript
 * import { createRLSManager, Policy, SecurityContext } from '@evodb/core';
 *
 * const rlsManager = createRLSManager();
 *
 * // Define a policy that restricts users to their own data
 * rlsManager.definePolicy({
 *   name: 'users_own_data',
 *   table: 'posts',
 *   operations: ['SELECT', 'UPDATE', 'DELETE'],
 *   check: (row, context) => row.authorId === context.userId,
 * });
 *
 * // Filter rows based on context
 * const context: SecurityContext = { userId: 'user-123' };
 * const visiblePosts = rlsManager.filterRows('posts', allPosts, context);
 * ```
 */

import { EvoDBError } from './errors.js';
import { captureStackTrace } from './stack-trace.js';

// =============================================================================
// Types and Interfaces
// =============================================================================

/**
 * Supported policy operations
 */
export type PolicyOperation = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';

/**
 * Policy definition for row-level security
 */
export interface Policy {
  /** Unique policy name within the table */
  name: string;
  /** Table this policy applies to */
  table: string;
  /** Operations this policy applies to */
  operations: PolicyOperation[];
  /** Check function that determines if access is allowed */
  check: (row: unknown, context: SecurityContext) => boolean;
}

/**
 * Security context passed to policy check functions
 */
export interface SecurityContext {
  /** Current user's ID */
  userId?: string;
  /** Current user's roles */
  roles?: string[];
  /** Additional custom properties */
  [key: string]: unknown;
}

/**
 * RLS Manager interface for managing row-level security policies
 */
export interface RLSManager {
  /**
   * Define a new policy for a table
   * @param policy - The policy to define
   * @throws RLSError if policy name already exists for the table
   */
  definePolicy(policy: Policy): void;

  /**
   * Remove a policy from a table
   * @param table - The table name
   * @param name - The policy name to remove
   * @throws RLSError if policy doesn't exist
   */
  removePolicy(table: string, name: string): void;

  /**
   * Get all policies for a table
   * @param table - The table name
   * @returns Array of policies for the table
   */
  getPolicies(table: string): Policy[];

  /**
   * Check if an operation is allowed for a specific row
   * @param table - The table name
   * @param operation - The operation type
   * @param row - The row to check
   * @param context - The security context
   * @returns true if access is allowed, false otherwise
   */
  checkAccess(
    table: string,
    operation: PolicyOperation,
    row: unknown,
    context: SecurityContext
  ): boolean;

  /**
   * Filter rows based on SELECT policies
   * @param table - The table name
   * @param rows - The rows to filter
   * @param context - The security context
   * @returns Filtered array of rows the context has access to
   */
  filterRows<T>(table: string, rows: T[], context: SecurityContext): T[];

  /**
   * Create a bypass manager that skips all policy checks
   * @returns A new RLSManager that bypasses all policies
   */
  bypassRLS(): RLSManager;
}

// =============================================================================
// Error Types
// =============================================================================

/**
 * Error thrown when RLS operations fail
 */
export class RLSError extends EvoDBError {
  constructor(message: string, code: string = 'RLS_ERROR', details?: Record<string, unknown>) {
    super(message, code, details);
    this.name = 'RLSError';
    captureStackTrace(this, RLSError);
  }
}

// =============================================================================
// Implementation
// =============================================================================

/**
 * Internal RLS Manager implementation
 */
class RLSManagerImpl implements RLSManager {
  private readonly policies: Map<string, Policy[]> = new Map();
  private readonly bypassMode: boolean;

  constructor(bypassMode = false) {
    this.bypassMode = bypassMode;
  }

  definePolicy(policy: Policy): void {
    // Validate policy
    if (!policy.name || policy.name.trim() === '') {
      throw new RLSError('Policy name cannot be empty');
    }
    if (!policy.table || policy.table.trim() === '') {
      throw new RLSError('Policy table cannot be empty');
    }
    if (!policy.operations || policy.operations.length === 0) {
      throw new RLSError('Policy must have at least one operation');
    }

    // Get or create policies array for this table
    const tablePolicies = this.policies.get(policy.table) ?? [];

    // Check for duplicate policy name
    if (tablePolicies.some(p => p.name === policy.name)) {
      throw new RLSError(
        `Policy "${policy.name}" already exists for table "${policy.table}"`
      );
    }

    tablePolicies.push(policy);
    this.policies.set(policy.table, tablePolicies);
  }

  removePolicy(table: string, name: string): void {
    const tablePolicies = this.policies.get(table) ?? [];
    const index = tablePolicies.findIndex(p => p.name === name);

    if (index === -1) {
      throw new RLSError(
        `Policy "${name}" does not exist for table "${table}"`
      );
    }

    tablePolicies.splice(index, 1);
    this.policies.set(table, tablePolicies);
  }

  getPolicies(table: string): Policy[] {
    return [...(this.policies.get(table) ?? [])];
  }

  checkAccess(
    table: string,
    operation: PolicyOperation,
    row: unknown,
    context: SecurityContext
  ): boolean {
    // Bypass mode allows all operations
    if (this.bypassMode) {
      return true;
    }

    const tablePolicies = this.policies.get(table) ?? [];
    const operationPolicies = tablePolicies.filter(p =>
      p.operations.includes(operation)
    );

    // If no policies defined for this operation, allow by default
    if (operationPolicies.length === 0) {
      return true;
    }

    // For SELECT, use OR logic (any policy can grant access)
    // For INSERT/UPDATE/DELETE, use AND logic (all policies must pass)
    if (operation === 'SELECT') {
      return operationPolicies.some(policy => policy.check(row, context));
    } else {
      return operationPolicies.every(policy => policy.check(row, context));
    }
  }

  filterRows<T>(table: string, rows: T[], context: SecurityContext): T[] {
    // Bypass mode returns all rows
    if (this.bypassMode) {
      return rows;
    }

    const tablePolicies = this.policies.get(table) ?? [];
    const selectPolicies = tablePolicies.filter(p =>
      p.operations.includes('SELECT')
    );

    // If no SELECT policies defined, return all rows
    if (selectPolicies.length === 0) {
      return rows;
    }

    // Filter rows - any SELECT policy can grant access (OR logic)
    return rows.filter(row =>
      selectPolicies.some(policy => policy.check(row, context))
    );
  }

  bypassRLS(): RLSManager {
    // Create a new manager in bypass mode that shares the same policies
    const bypassManager = new RLSManagerImpl(true);

    // Copy policies to the bypass manager (not strictly necessary since bypass
    // mode ignores policies, but useful for consistency)
    this.policies.forEach((policies, table) => {
      bypassManager.policies.set(table, [...policies]);
    });

    return bypassManager;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a new RLS Manager instance
 * @returns A new RLSManager for managing row-level security policies
 *
 * @example
 * ```typescript
 * const rlsManager = createRLSManager();
 *
 * rlsManager.definePolicy({
 *   name: 'tenant_isolation',
 *   table: 'data',
 *   operations: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
 *   check: (row, context) => row.tenantId === context.tenantId,
 * });
 * ```
 */
export function createRLSManager(): RLSManager {
  return new RLSManagerImpl();
}
