/**
 * @evodb/core - NPM Package Files Tests
 *
 * TDD Issue: evodb-a9o
 * Tests that published packages exclude source maps (.map files)
 * from npm distribution to reduce package size.
 *
 * Source maps account for 43% of core package size (556KB).
 * They should not be in npm distribution.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Navigate from core/src/__tests__ to the monorepo root (evodb/)
const rootDir = join(__dirname, '..', '..', '..');

interface PackageJson {
  name: string;
  private?: boolean;
  files?: string[];
}

// Publishable packages (not private, have @evodb scope)
const publishablePackages = [
  'core',
  'reader',
  'writer',
  'query',
  'lakehouse',
  'rpc',
  'edge-cache',
  'lance-reader',
  'codegen',
  'test-utils',
  'snippets-chain',
  'snippets-lance',
];

describe('NPM Package Distribution', () => {
  describe('Source map exclusion', () => {
    it.each(publishablePackages)(
      '%s package.json has files field that excludes source maps',
      (packageName) => {
        const packageJsonPath = join(rootDir, packageName, 'package.json');
        const packageJson: PackageJson = JSON.parse(
          readFileSync(packageJsonPath, 'utf-8')
        );

        // Skip private packages
        if (packageJson.private) {
          return;
        }

        // Must have files field
        expect(packageJson.files).toBeDefined();
        expect(Array.isArray(packageJson.files)).toBe(true);

        // Files field must not include patterns that would include .map files
        const files = packageJson.files!;

        // Should not have "dist" alone (would include .map files)
        expect(files).not.toContain('dist');

        // Should have specific file type patterns
        const hasJsPattern = files.some(
          (f) => f.includes('**/*.js') || f.includes('*.js')
        );
        const hasDtsPattern = files.some(
          (f) => f.includes('**/*.d.ts') || f.includes('*.d.ts')
        );

        expect(hasJsPattern).toBe(true);
        expect(hasDtsPattern).toBe(true);

        // Should NOT have .map patterns
        const hasMapPattern = files.some((f) => f.includes('.map'));
        expect(hasMapPattern).toBe(false);

        // Verify no catch-all dist pattern that would include maps
        const hasDangerousPattern = files.some(
          (f) => f === 'dist' || f === 'dist/' || f === 'dist/**' || f === 'dist/**/*'
        );
        expect(hasDangerousPattern).toBe(false);
      }
    );

    it('all publishable packages should have consistent files field', () => {
      const expectedPatterns = ['dist/**/*.js', 'dist/**/*.d.ts', 'README.md'];

      for (const packageName of publishablePackages) {
        const packageJsonPath = join(rootDir, packageName, 'package.json');
        const packageJson: PackageJson = JSON.parse(
          readFileSync(packageJsonPath, 'utf-8')
        );

        // Skip private packages
        if (packageJson.private) {
          continue;
        }

        const files = packageJson.files || [];

        // Should include the essential patterns
        for (const pattern of expectedPatterns) {
          expect(files).toContain(pattern);
        }
      }
    });
  });
});
