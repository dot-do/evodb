/**
 * Tests that all workspace packages declare sideEffects: false
 *
 * This ensures bundlers can perform effective tree-shaking of unused code.
 * Per TDD issue evodb-8ee: All 14 workspace packages should have this field.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Get __dirname for ES modules
const __dirname = dirname(fileURLToPath(import.meta.url));
// Navigate from core/src/__tests__ to the monorepo root (evodb/)
const workspaceRoot = join(__dirname, '..', '..', '..');

// Workspace packages as defined in root package.json
const WORKSPACE_PACKAGES = [
  'core',
  'rpc',
  'lakehouse',
  'writer',
  'reader',
  'query',
  'edge-cache',
  'lance-reader',
  'snippets-chain',
  'snippets-lance',
  'benchmark',
  'codegen',
  'e2e',
  'test-utils',
] as const;

describe('Package sideEffects configuration', () => {
  it('should have 14 workspace packages defined', () => {
    expect(WORKSPACE_PACKAGES.length).toBe(14);
  });

  describe.each(WORKSPACE_PACKAGES)('%s package', (packageName) => {
    const packageJsonPath = join(workspaceRoot, packageName, 'package.json');

    it('should have a package.json file', () => {
      expect(existsSync(packageJsonPath)).toBe(true);
    });

    it('should declare sideEffects: false for tree-shaking', () => {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
      expect(packageJson.sideEffects).toBe(false);
    });
  });

  it('should have all packages declaring sideEffects: false', () => {
    const packagesWithMissingSideEffects: string[] = [];

    for (const packageName of WORKSPACE_PACKAGES) {
      const packageJsonPath = join(workspaceRoot, packageName, 'package.json');
      if (!existsSync(packageJsonPath)) {
        packagesWithMissingSideEffects.push(`${packageName} (missing package.json)`);
        continue;
      }

      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
      if (packageJson.sideEffects !== false) {
        packagesWithMissingSideEffects.push(packageName);
      }
    }

    expect(
      packagesWithMissingSideEffects,
      `The following packages are missing sideEffects: false: ${packagesWithMissingSideEffects.join(', ')}`
    ).toEqual([]);
  });
});
