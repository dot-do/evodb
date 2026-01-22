# npm Publishing Strategy and Process

This document outlines the publishing strategy, versioning approach, and release workflow for the EvoDB monorepo.

## Table of Contents

- [Package Versioning](#package-versioning)
- [Monorepo Publishing Workflow](#monorepo-publishing-workflow)
- [Publishing Checklist](#publishing-checklist)
- [npm Configuration](#npm-configuration)
- [CI/CD Integration](#cicd-integration)

---

## Package Versioning

### Semantic Versioning Approach

All EvoDB packages follow [Semantic Versioning 2.0.0](https://semver.org/):

- **MAJOR** (`X.0.0`): Breaking changes to public APIs
- **MINOR** (`0.X.0`): New features, backward-compatible additions
- **PATCH** (`0.0.X`): Bug fixes, documentation updates, internal refactoring

#### Version Interpretation

| Change Type | Example | When to Use |
|-------------|---------|-------------|
| Breaking API change | `0.1.0` -> `1.0.0` | Removing/renaming exports, changing function signatures |
| New feature | `0.1.0` -> `0.2.0` | Adding new exports, new capabilities |
| Bug fix | `0.1.0` -> `0.1.1` | Fixing issues without API changes |

### Version Synchronization Across Packages

EvoDB uses **synchronized versioning** for all packages in the monorepo:

```
@evodb/core         0.1.0-rc.1
@evodb/rpc          0.1.0-rc.1
@evodb/lakehouse    0.1.0-rc.1
@evodb/writer       0.1.0-rc.1
@evodb/reader       0.1.0-rc.1
@evodb/query        0.1.0-rc.1
@evodb/observability 0.1.0-rc.1
@evodb/edge-cache   0.1.0-rc.1
```

**Rationale:**
- Simplifies compatibility tracking (same version = compatible)
- Reduces confusion for users about which versions work together
- Aligns with the tightly-coupled nature of the EvoDB architecture

**Note:** Internal packages (`@evodb/test-utils`, `@evodb/benchmark`, `@evodb/codegen`, `@evodb/e2e`) are not published to npm and may have independent versioning.

### Pre-release Versions

Pre-release versions follow the pattern: `MAJOR.MINOR.PATCH-PRERELEASE.N`

| Stage | Format | Example | Purpose |
|-------|--------|---------|---------|
| Alpha | `X.Y.Z-alpha.N` | `0.2.0-alpha.1` | Early development, API unstable |
| Beta | `X.Y.Z-beta.N` | `0.2.0-beta.1` | Feature-complete, testing phase |
| Release Candidate | `X.Y.Z-rc.N` | `0.2.0-rc.1` | Final testing before stable release |
| Stable | `X.Y.Z` | `0.2.0` | Production-ready release |

#### Pre-release Progression

```
0.1.0-rc.1 (current)
    |
    v
0.1.0 (first stable release)
    |
    v
0.2.0-alpha.1 -> 0.2.0-alpha.2 -> 0.2.0-beta.1 -> 0.2.0-rc.1 -> 0.2.0
```

---

## Monorepo Publishing Workflow

### Changesets Configuration

EvoDB uses [Changesets](https://github.com/changesets/changesets) for version management and changelog generation.

#### Configuration Location

`.changeset/config.json` - See the configuration file for current settings.

#### Creating a Changeset

When making changes that should be released:

```bash
# Interactive changeset creation
pnpm changeset

# Select affected packages
# Choose version bump type (major/minor/patch)
# Write a summary of changes
```

This creates a markdown file in `.changeset/` describing the change.

#### Changeset Format

```markdown
---
"@evodb/core": minor
"@evodb/lakehouse": minor
---

Add support for time-travel queries with snapshot isolation
```

### Package Dependencies and Order

Packages must be published in dependency order. The EvoDB dependency graph:

```
                    @evodb/core (foundation)
                         |
         +---------------+---------------+
         |               |               |
    @evodb/rpc    @evodb/lakehouse   @evodb/observability
         |               |
         +-------+-------+
                 |
         +-------+-------+
         |               |
    @evodb/writer   @evodb/reader
                         |
                    @evodb/query
                         |
                  @evodb/edge-cache
```

**Publishing Order:**
1. `@evodb/core` (no dependencies)
2. `@evodb/rpc`, `@evodb/lakehouse`, `@evodb/observability` (depend on core)
3. `@evodb/writer`, `@evodb/reader` (depend on core + others)
4. `@evodb/query` (depends on core + lakehouse)
5. `@evodb/edge-cache` (depends on query)

### Automated vs Manual Publishing

| Aspect | Automated (CI/CD) | Manual |
|--------|-------------------|--------|
| **When** | Merging to `main` with changesets | Hotfixes, emergency releases |
| **Trigger** | GitHub Actions workflow | Local `pnpm changeset publish` |
| **Recommended** | Yes, for all regular releases | Only when necessary |
| **Audit trail** | Full GitHub Actions logs | Limited local history |

#### Automated Publishing Flow

```
PR with changeset files
         |
         v
Merge to main branch
         |
         v
CI detects changesets
         |
         v
Creates "Version Packages" PR (or publishes directly)
         |
         v
Version bump + changelog update
         |
         v
npm publish (with provenance)
         |
         v
Git tag created (v0.2.0)
```

---

## Publishing Checklist

### Pre-publish Validation

Before any release, ensure:

- [ ] All changesets are accurate and complete
- [ ] No uncommitted changes in the repository
- [ ] On the correct branch (`main` for releases)
- [ ] npm authentication configured (`npm whoami`)
- [ ] Required permissions for `@evodb` scope

### Build Verification

```bash
# Clean build from scratch
pnpm clean
pnpm install

# Build all packages
pnpm build

# Verify build artifacts exist
ls -la core/dist/
ls -la lakehouse/dist/
# ... for each package
```

### Test Requirements

All tests must pass before publishing:

```bash
# Run full test suite
pnpm test

# Run specific test types
pnpm test:unit
pnpm test:integration
pnpm test:e2e

# Type checking
pnpm typecheck

# Linting
pnpm lint
```

**Minimum Coverage Requirements:**
- Unit tests: 80% line coverage
- Integration tests: Key workflows covered
- E2E tests: Critical paths verified

### Changelog Updates

Changesets automatically generate changelogs, but verify:

- [ ] `CHANGELOG.md` entries are meaningful and user-facing
- [ ] Breaking changes are clearly documented
- [ ] Migration instructions included for breaking changes
- [ ] Links to relevant issues/PRs where applicable

#### Changelog Format

```markdown
## 0.2.0

### Minor Changes

- `@evodb/core`: Add support for nullable columns in schema evolution
- `@evodb/query`: Implement zone map optimization for range queries

### Patch Changes

- `@evodb/writer`: Fix CDC buffer overflow in high-throughput scenarios
```

---

## npm Configuration

### Package Scoping

All EvoDB packages use the `@evodb` scope:

| Package | npm Name |
|---------|----------|
| core | `@evodb/core` |
| rpc | `@evodb/rpc` |
| lakehouse | `@evodb/lakehouse` |
| writer | `@evodb/writer` |
| reader | `@evodb/reader` |
| query | `@evodb/query` |
| observability | `@evodb/observability` |
| edge-cache | `@evodb/edge-cache` |

### Access Levels

All packages are published with **public** access:

```json
{
  "publishConfig": {
    "access": "public"
  }
}
```

This is configured in each package's `package.json` or via the publish command:

```bash
pnpm publish --access public
```

### Registry Configuration

EvoDB publishes to the official npm registry:

```
registry=https://registry.npmjs.org/
```

For local development with a private registry:

```bash
# .npmrc (local, not committed)
@evodb:registry=https://your-private-registry.com/
```

### Authentication

#### Local Development

```bash
# Login to npm
npm login

# Verify authentication
npm whoami

# Check scope access
npm access ls-packages @evodb
```

#### CI/CD Authentication

GitHub Actions uses `NPM_TOKEN` secret:

```yaml
env:
  NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

Token requirements:
- Type: Automation token (for CI) or Publish token
- Scope: Read and write access to `@evodb/*`
- 2FA: Automation tokens bypass 2FA requirements

---

## CI/CD Integration

### GitHub Actions Workflow for Publishing

The release workflow is defined in `.github/workflows/release.yml`.

#### Workflow Triggers

```yaml
on:
  push:
    branches:
      - main
  workflow_dispatch:  # Manual trigger option
```

#### Key Steps

1. **Checkout & Setup**
   - Checkout code with full git history
   - Setup Node.js and pnpm
   - Install dependencies

2. **Quality Gates**
   - Run type checking
   - Run linting
   - Run full test suite

3. **Version & Publish** (Changesets Action)
   - If changesets exist: Create version PR
   - If version PR merged: Publish to npm

### Release Automation

#### Changesets GitHub Action

```yaml
- name: Create Release Pull Request or Publish
  uses: changesets/action@v1
  with:
    publish: pnpm release
    version: pnpm version-packages
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

#### npm Provenance

Enable npm provenance for supply chain security:

```yaml
- run: pnpm publish -r --access public --provenance
```

This links published packages to their GitHub Actions build, providing:
- Verified build source
- Tamper-evident publishing
- SLSA compliance

### Version Bumping

#### Automatic (Recommended)

Changesets handles version bumping automatically:

```bash
# In CI, after merging changesets
pnpm changeset version

# Updates:
# - package.json versions
# - CHANGELOG.md files
# - Removes processed changeset files
```

#### Manual (Emergency Only)

```bash
# Bump all packages to a specific version
pnpm -r exec npm version 0.2.1 --no-git-tag-version

# Or individually
cd core && npm version patch --no-git-tag-version
```

### Git Tags

After successful publish, tags are created:

```
v0.2.0          # Main release tag
@evodb/core@0.2.0  # Individual package tags (optional)
```

---

## Quick Reference

### Common Commands

```bash
# Create a changeset
pnpm changeset

# Preview version bumps
pnpm changeset status

# Apply version bumps locally (CI usually does this)
pnpm changeset version

# Publish all packages
pnpm changeset publish

# Publish with public access
pnpm publish -r --access public
```

### Environment Variables

| Variable | Purpose | Where Set |
|----------|---------|-----------|
| `NPM_TOKEN` | npm authentication | GitHub Secrets |
| `GITHUB_TOKEN` | PR creation, releases | Automatic in Actions |
| `NODE_AUTH_TOKEN` | Alternative npm auth | GitHub Secrets |

### Troubleshooting

| Issue | Solution |
|-------|----------|
| "402 Payment Required" | Package needs `--access public` flag |
| "403 Forbidden" | Check npm token permissions and scope access |
| "409 Conflict" | Version already published; bump version |
| Build fails in CI | Run `pnpm build` locally first |
| Tests pass locally, fail in CI | Check Node.js version match |
