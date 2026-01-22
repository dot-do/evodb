/**
 * Tests for Row-Level Security (RLS)
 *
 * TDD Issue: evodb-amp7
 *
 * This test suite covers:
 * - Policy creation and deletion
 * - SELECT policy filtering query results
 * - INSERT policy validating new rows
 * - UPDATE policy validating changes
 * - DELETE policy restricting deletions
 * - Admin bypass functionality
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createRLSManager,
  RLSManager,
  Policy,
  PolicyOperation,
  SecurityContext,
  RLSError,
} from '../rls.js';

// =============================================================================
// Policy Definition Tests
// =============================================================================

describe('Row-Level Security', () => {
  let rlsManager: RLSManager;

  beforeEach(() => {
    rlsManager = createRLSManager();
  });

  describe('definePolicy()', () => {
    it('creates policy for table', () => {
      const policy: Policy = {
        name: 'users_own_data',
        table: 'users',
        operations: ['SELECT', 'UPDATE', 'DELETE'],
        check: (row: unknown, context: SecurityContext) => {
          const r = row as { userId?: string };
          return r.userId === context.userId;
        },
      };

      rlsManager.definePolicy(policy);

      const policies = rlsManager.getPolicies('users');
      expect(policies).toHaveLength(1);
      expect(policies[0].name).toBe('users_own_data');
      expect(policies[0].operations).toEqual(['SELECT', 'UPDATE', 'DELETE']);
    });

    it('should create multiple policies for same table', () => {
      const policy1: Policy = {
        name: 'select_own',
        table: 'posts',
        operations: ['SELECT'],
        check: (row: unknown, context: SecurityContext) => {
          const r = row as { authorId?: string };
          return r.authorId === context.userId;
        },
      };

      const policy2: Policy = {
        name: 'select_public',
        table: 'posts',
        operations: ['SELECT'],
        check: (row: unknown) => {
          const r = row as { isPublic?: boolean };
          return r.isPublic === true;
        },
      };

      rlsManager.definePolicy(policy1);
      rlsManager.definePolicy(policy2);

      const policies = rlsManager.getPolicies('posts');
      expect(policies).toHaveLength(2);
    });

    it('should throw error for duplicate policy name on same table', () => {
      const policy: Policy = {
        name: 'users_own_data',
        table: 'users',
        operations: ['SELECT'],
        check: () => true,
      };

      rlsManager.definePolicy(policy);

      expect(() => rlsManager.definePolicy(policy)).toThrow(RLSError);
    });

    it('should throw error for empty policy name', () => {
      const policy: Policy = {
        name: '',
        table: 'users',
        operations: ['SELECT'],
        check: () => true,
      };

      expect(() => rlsManager.definePolicy(policy)).toThrow(RLSError);
    });

    it('should throw error for empty table name', () => {
      const policy: Policy = {
        name: 'test_policy',
        table: '',
        operations: ['SELECT'],
        check: () => true,
      };

      expect(() => rlsManager.definePolicy(policy)).toThrow(RLSError);
    });

    it('should throw error for empty operations array', () => {
      const policy: Policy = {
        name: 'test_policy',
        table: 'users',
        operations: [],
        check: () => true,
      };

      expect(() => rlsManager.definePolicy(policy)).toThrow(RLSError);
    });
  });

  describe('removePolicy()', () => {
    it('should remove existing policy', () => {
      const policy: Policy = {
        name: 'users_own_data',
        table: 'users',
        operations: ['SELECT'],
        check: () => true,
      };

      rlsManager.definePolicy(policy);
      rlsManager.removePolicy('users', 'users_own_data');

      const policies = rlsManager.getPolicies('users');
      expect(policies).toHaveLength(0);
    });

    it('should throw error when removing non-existent policy', () => {
      expect(() => rlsManager.removePolicy('users', 'non_existent')).toThrow(RLSError);
    });

    it('should only remove the specified policy', () => {
      const policy1: Policy = {
        name: 'policy1',
        table: 'users',
        operations: ['SELECT'],
        check: () => true,
      };
      const policy2: Policy = {
        name: 'policy2',
        table: 'users',
        operations: ['SELECT'],
        check: () => true,
      };

      rlsManager.definePolicy(policy1);
      rlsManager.definePolicy(policy2);
      rlsManager.removePolicy('users', 'policy1');

      const policies = rlsManager.getPolicies('users');
      expect(policies).toHaveLength(1);
      expect(policies[0].name).toBe('policy2');
    });
  });

  // =============================================================================
  // SELECT Policy Tests
  // =============================================================================

  describe('SELECT policy filters query results', () => {
    it('filters query results based on user context', () => {
      const policy: Policy = {
        name: 'select_own_posts',
        table: 'posts',
        operations: ['SELECT'],
        check: (row: unknown, context: SecurityContext) => {
          const r = row as { authorId?: string };
          return r.authorId === context.userId;
        },
      };

      rlsManager.definePolicy(policy);

      const rows = [
        { id: '1', authorId: 'user-1', title: 'Post 1' },
        { id: '2', authorId: 'user-2', title: 'Post 2' },
        { id: '3', authorId: 'user-1', title: 'Post 3' },
      ];

      const context: SecurityContext = { userId: 'user-1' };
      const filtered = rlsManager.filterRows('posts', rows, context);

      expect(filtered).toHaveLength(2);
      expect(filtered.map(r => r.id)).toEqual(['1', '3']);
    });

    it('should return empty array when no rows match policy', () => {
      const policy: Policy = {
        name: 'select_own',
        table: 'posts',
        operations: ['SELECT'],
        check: (row: unknown, context: SecurityContext) => {
          const r = row as { authorId?: string };
          return r.authorId === context.userId;
        },
      };

      rlsManager.definePolicy(policy);

      const rows = [
        { id: '1', authorId: 'user-2', title: 'Post 1' },
        { id: '2', authorId: 'user-3', title: 'Post 2' },
      ];

      const context: SecurityContext = { userId: 'user-1' };
      const filtered = rlsManager.filterRows('posts', rows, context);

      expect(filtered).toHaveLength(0);
    });

    it('should apply multiple SELECT policies with OR logic', () => {
      // User can see their own posts OR public posts
      const ownPostsPolicy: Policy = {
        name: 'select_own',
        table: 'posts',
        operations: ['SELECT'],
        check: (row: unknown, context: SecurityContext) => {
          const r = row as { authorId?: string };
          return r.authorId === context.userId;
        },
      };

      const publicPostsPolicy: Policy = {
        name: 'select_public',
        table: 'posts',
        operations: ['SELECT'],
        check: (row: unknown) => {
          const r = row as { isPublic?: boolean };
          return r.isPublic === true;
        },
      };

      rlsManager.definePolicy(ownPostsPolicy);
      rlsManager.definePolicy(publicPostsPolicy);

      const rows = [
        { id: '1', authorId: 'user-1', isPublic: false, title: 'My Private Post' },
        { id: '2', authorId: 'user-2', isPublic: true, title: 'Public Post' },
        { id: '3', authorId: 'user-2', isPublic: false, title: 'Other Private Post' },
      ];

      const context: SecurityContext = { userId: 'user-1' };
      const filtered = rlsManager.filterRows('posts', rows, context);

      expect(filtered).toHaveLength(2);
      expect(filtered.map(r => r.id)).toEqual(['1', '2']);
    });

    it('should return all rows when no policies defined for table', () => {
      const rows = [
        { id: '1', name: 'Item 1' },
        { id: '2', name: 'Item 2' },
      ];

      const context: SecurityContext = { userId: 'user-1' };
      const filtered = rlsManager.filterRows('items', rows, context);

      expect(filtered).toHaveLength(2);
    });

    it('should filter based on role context', () => {
      const policy: Policy = {
        name: 'admin_see_all',
        table: 'users',
        operations: ['SELECT'],
        check: (_row: unknown, context: SecurityContext) => {
          return context.roles?.includes('admin') ?? false;
        },
      };

      rlsManager.definePolicy(policy);

      const rows = [
        { id: '1', name: 'Alice' },
        { id: '2', name: 'Bob' },
      ];

      const regularUserContext: SecurityContext = { userId: 'user-1', roles: ['user'] };
      const adminContext: SecurityContext = { userId: 'admin-1', roles: ['admin'] };

      expect(rlsManager.filterRows('users', rows, regularUserContext)).toHaveLength(0);
      expect(rlsManager.filterRows('users', rows, adminContext)).toHaveLength(2);
    });
  });

  // =============================================================================
  // INSERT Policy Tests
  // =============================================================================

  describe('INSERT policy validates new rows', () => {
    it('validates new rows based on policy', () => {
      const policy: Policy = {
        name: 'insert_own_posts',
        table: 'posts',
        operations: ['INSERT'],
        check: (row: unknown, context: SecurityContext) => {
          const r = row as { authorId?: string };
          return r.authorId === context.userId;
        },
      };

      rlsManager.definePolicy(policy);

      const context: SecurityContext = { userId: 'user-1' };

      // Valid insert - authorId matches userId
      const validRow = { authorId: 'user-1', title: 'My Post' };
      expect(rlsManager.checkAccess('posts', 'INSERT', validRow, context)).toBe(true);

      // Invalid insert - authorId doesn't match userId
      const invalidRow = { authorId: 'user-2', title: 'Fake Post' };
      expect(rlsManager.checkAccess('posts', 'INSERT', invalidRow, context)).toBe(false);
    });

    it('should allow insert when no INSERT policies exist', () => {
      // Only SELECT policy exists
      const selectPolicy: Policy = {
        name: 'select_own',
        table: 'posts',
        operations: ['SELECT'],
        check: () => false,
      };

      rlsManager.definePolicy(selectPolicy);

      const context: SecurityContext = { userId: 'user-1' };
      const row = { authorId: 'anyone', title: 'Post' };

      // INSERT should be allowed since there's no INSERT policy
      expect(rlsManager.checkAccess('posts', 'INSERT', row, context)).toBe(true);
    });

    it('should require all INSERT policies to pass (AND logic)', () => {
      // Policy 1: Must be author
      const authorPolicy: Policy = {
        name: 'must_be_author',
        table: 'posts',
        operations: ['INSERT'],
        check: (row: unknown, context: SecurityContext) => {
          const r = row as { authorId?: string };
          return r.authorId === context.userId;
        },
      };

      // Policy 2: Must have valid category
      const categoryPolicy: Policy = {
        name: 'valid_category',
        table: 'posts',
        operations: ['INSERT'],
        check: (row: unknown) => {
          const r = row as { category?: string };
          return ['tech', 'news', 'sports'].includes(r.category ?? '');
        },
      };

      rlsManager.definePolicy(authorPolicy);
      rlsManager.definePolicy(categoryPolicy);

      const context: SecurityContext = { userId: 'user-1' };

      // Both policies pass
      const validRow = { authorId: 'user-1', category: 'tech', title: 'Tech Post' };
      expect(rlsManager.checkAccess('posts', 'INSERT', validRow, context)).toBe(true);

      // Only author policy passes
      const invalidCategory = { authorId: 'user-1', category: 'invalid', title: 'Post' };
      expect(rlsManager.checkAccess('posts', 'INSERT', invalidCategory, context)).toBe(false);

      // Only category policy passes
      const invalidAuthor = { authorId: 'user-2', category: 'tech', title: 'Post' };
      expect(rlsManager.checkAccess('posts', 'INSERT', invalidAuthor, context)).toBe(false);
    });
  });

  // =============================================================================
  // UPDATE Policy Tests
  // =============================================================================

  describe('UPDATE policy validates changes', () => {
    it('validates updates based on policy', () => {
      const policy: Policy = {
        name: 'update_own_posts',
        table: 'posts',
        operations: ['UPDATE'],
        check: (row: unknown, context: SecurityContext) => {
          const r = row as { authorId?: string };
          return r.authorId === context.userId;
        },
      };

      rlsManager.definePolicy(policy);

      const context: SecurityContext = { userId: 'user-1' };

      // Can update own post
      const ownPost = { id: '1', authorId: 'user-1', title: 'My Post' };
      expect(rlsManager.checkAccess('posts', 'UPDATE', ownPost, context)).toBe(true);

      // Cannot update someone else's post
      const otherPost = { id: '2', authorId: 'user-2', title: 'Other Post' };
      expect(rlsManager.checkAccess('posts', 'UPDATE', otherPost, context)).toBe(false);
    });

    it('should allow update when no UPDATE policies exist', () => {
      const selectPolicy: Policy = {
        name: 'select_all',
        table: 'posts',
        operations: ['SELECT'],
        check: () => true,
      };

      rlsManager.definePolicy(selectPolicy);

      const context: SecurityContext = { userId: 'user-1' };
      const row = { id: '1', authorId: 'anyone', title: 'Post' };

      expect(rlsManager.checkAccess('posts', 'UPDATE', row, context)).toBe(true);
    });

    it('should check policy against current row state', () => {
      const policy: Policy = {
        name: 'editors_can_update',
        table: 'articles',
        operations: ['UPDATE'],
        check: (row: unknown, context: SecurityContext) => {
          const r = row as { editorIds?: string[] };
          return r.editorIds?.includes(context.userId ?? '') ?? false;
        },
      };

      rlsManager.definePolicy(policy);

      const context: SecurityContext = { userId: 'editor-1' };

      const articleWithEditor = { id: '1', editorIds: ['editor-1', 'editor-2'], title: 'Article' };
      const articleWithoutEditor = { id: '2', editorIds: ['editor-3'], title: 'Other Article' };

      expect(rlsManager.checkAccess('articles', 'UPDATE', articleWithEditor, context)).toBe(true);
      expect(rlsManager.checkAccess('articles', 'UPDATE', articleWithoutEditor, context)).toBe(false);
    });
  });

  // =============================================================================
  // DELETE Policy Tests
  // =============================================================================

  describe('DELETE policy restricts deletions', () => {
    it('restricts deletions based on policy', () => {
      const policy: Policy = {
        name: 'delete_own_posts',
        table: 'posts',
        operations: ['DELETE'],
        check: (row: unknown, context: SecurityContext) => {
          const r = row as { authorId?: string };
          return r.authorId === context.userId;
        },
      };

      rlsManager.definePolicy(policy);

      const context: SecurityContext = { userId: 'user-1' };

      // Can delete own post
      const ownPost = { id: '1', authorId: 'user-1', title: 'My Post' };
      expect(rlsManager.checkAccess('posts', 'DELETE', ownPost, context)).toBe(true);

      // Cannot delete someone else's post
      const otherPost = { id: '2', authorId: 'user-2', title: 'Other Post' };
      expect(rlsManager.checkAccess('posts', 'DELETE', otherPost, context)).toBe(false);
    });

    it('should allow delete when no DELETE policies exist', () => {
      const selectPolicy: Policy = {
        name: 'select_own',
        table: 'posts',
        operations: ['SELECT'],
        check: () => false,
      };

      rlsManager.definePolicy(selectPolicy);

      const context: SecurityContext = { userId: 'user-1' };
      const row = { id: '1', authorId: 'anyone', title: 'Post' };

      expect(rlsManager.checkAccess('posts', 'DELETE', row, context)).toBe(true);
    });

    it('should enforce multiple DELETE policies with AND logic', () => {
      // Can only delete if: owner AND post is in draft status
      const ownerPolicy: Policy = {
        name: 'owner_only',
        table: 'posts',
        operations: ['DELETE'],
        check: (row: unknown, context: SecurityContext) => {
          const r = row as { authorId?: string };
          return r.authorId === context.userId;
        },
      };

      const draftPolicy: Policy = {
        name: 'draft_only',
        table: 'posts',
        operations: ['DELETE'],
        check: (row: unknown) => {
          const r = row as { status?: string };
          return r.status === 'draft';
        },
      };

      rlsManager.definePolicy(ownerPolicy);
      rlsManager.definePolicy(draftPolicy);

      const context: SecurityContext = { userId: 'user-1' };

      // Own draft post - can delete
      const ownDraft = { id: '1', authorId: 'user-1', status: 'draft', title: 'Draft Post' };
      expect(rlsManager.checkAccess('posts', 'DELETE', ownDraft, context)).toBe(true);

      // Own published post - cannot delete
      const ownPublished = { id: '2', authorId: 'user-1', status: 'published', title: 'Published' };
      expect(rlsManager.checkAccess('posts', 'DELETE', ownPublished, context)).toBe(false);

      // Someone else's draft - cannot delete
      const otherDraft = { id: '3', authorId: 'user-2', status: 'draft', title: 'Other Draft' };
      expect(rlsManager.checkAccess('posts', 'DELETE', otherDraft, context)).toBe(false);
    });
  });

  // =============================================================================
  // Admin Bypass Tests
  // =============================================================================

  describe('bypassRLS()', () => {
    it('allows admin access bypassing all policies', () => {
      const policy: Policy = {
        name: 'users_own_data',
        table: 'users',
        operations: ['SELECT', 'UPDATE', 'DELETE'],
        check: (row: unknown, context: SecurityContext) => {
          const r = row as { id?: string };
          return r.id === context.userId;
        },
      };

      rlsManager.definePolicy(policy);

      const rows = [
        { id: 'user-1', name: 'Alice' },
        { id: 'user-2', name: 'Bob' },
        { id: 'user-3', name: 'Charlie' },
      ];

      const regularContext: SecurityContext = { userId: 'user-1' };

      // Regular user only sees their own data
      const regularFiltered = rlsManager.filterRows('users', rows, regularContext);
      expect(regularFiltered).toHaveLength(1);

      // Admin bypass sees all data
      const adminFiltered = rlsManager.bypassRLS().filterRows('users', rows, regularContext);
      expect(adminFiltered).toHaveLength(3);
    });

    it('should bypass access checks for all operations', () => {
      const policy: Policy = {
        name: 'restrictive_policy',
        table: 'secrets',
        operations: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
        check: () => false, // Deny everything
      };

      rlsManager.definePolicy(policy);

      const context: SecurityContext = { userId: 'user-1' };
      const row = { id: '1', secret: 'top-secret' };

      // Regular access is denied
      expect(rlsManager.checkAccess('secrets', 'SELECT', row, context)).toBe(false);
      expect(rlsManager.checkAccess('secrets', 'INSERT', row, context)).toBe(false);
      expect(rlsManager.checkAccess('secrets', 'UPDATE', row, context)).toBe(false);
      expect(rlsManager.checkAccess('secrets', 'DELETE', row, context)).toBe(false);

      // Bypass allows all operations
      const bypassManager = rlsManager.bypassRLS();
      expect(bypassManager.checkAccess('secrets', 'SELECT', row, context)).toBe(true);
      expect(bypassManager.checkAccess('secrets', 'INSERT', row, context)).toBe(true);
      expect(bypassManager.checkAccess('secrets', 'UPDATE', row, context)).toBe(true);
      expect(bypassManager.checkAccess('secrets', 'DELETE', row, context)).toBe(true);
    });

    it('should not modify original manager', () => {
      const policy: Policy = {
        name: 'deny_all',
        table: 'data',
        operations: ['SELECT'],
        check: () => false,
      };

      rlsManager.definePolicy(policy);

      const context: SecurityContext = { userId: 'user-1' };
      const row = { id: '1' };

      // Get bypass manager
      const bypassManager = rlsManager.bypassRLS();

      // Original manager should still enforce policies
      expect(rlsManager.checkAccess('data', 'SELECT', row, context)).toBe(false);
      expect(bypassManager.checkAccess('data', 'SELECT', row, context)).toBe(true);

      // Check they are different instances in behavior
      expect(rlsManager.checkAccess('data', 'SELECT', row, context)).toBe(false);
    });
  });

  // =============================================================================
  // Context Extension Tests
  // =============================================================================

  describe('custom context properties', () => {
    it('should support custom context properties', () => {
      interface CustomContext extends SecurityContext {
        tenantId: string;
        subscription: 'free' | 'pro' | 'enterprise';
      }

      const policy: Policy = {
        name: 'tenant_isolation',
        table: 'data',
        operations: ['SELECT'],
        check: (row: unknown, context: SecurityContext) => {
          const r = row as { tenantId?: string };
          const c = context as CustomContext;
          return r.tenantId === c.tenantId;
        },
      };

      rlsManager.definePolicy(policy);

      const rows = [
        { id: '1', tenantId: 'tenant-a', data: 'A data' },
        { id: '2', tenantId: 'tenant-b', data: 'B data' },
        { id: '3', tenantId: 'tenant-a', data: 'More A data' },
      ];

      const context: CustomContext = {
        userId: 'user-1',
        tenantId: 'tenant-a',
        subscription: 'pro',
      };

      const filtered = rlsManager.filterRows('data', rows, context);
      expect(filtered).toHaveLength(2);
      expect(filtered.every(r => r.tenantId === 'tenant-a')).toBe(true);
    });
  });

  // =============================================================================
  // Type Safety Tests
  // =============================================================================

  describe('type definitions', () => {
    it('should have correct Policy interface shape', () => {
      const policy: Policy = {
        name: 'test_policy',
        table: 'test_table',
        operations: ['SELECT', 'INSERT'],
        check: (_row: unknown, _context: SecurityContext) => true,
      };

      expect(policy.name).toBe('test_policy');
      expect(policy.table).toBe('test_table');
      expect(policy.operations).toEqual(['SELECT', 'INSERT']);
      expect(typeof policy.check).toBe('function');
    });

    it('should have correct SecurityContext interface shape', () => {
      const context: SecurityContext = {
        userId: 'user-123',
        roles: ['admin', 'editor'],
        customProp: 'custom-value',
      };

      expect(context.userId).toBe('user-123');
      expect(context.roles).toEqual(['admin', 'editor']);
      expect(context.customProp).toBe('custom-value');
    });

    it('should support all policy operations', () => {
      const allOperations: PolicyOperation[] = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];

      const policy: Policy = {
        name: 'all_ops',
        table: 'test',
        operations: allOperations,
        check: () => true,
      };

      expect(policy.operations).toHaveLength(4);
    });
  });
});
