# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- @evodb/observability package extracted from core (metrics, tracing, logging)
- Focused entry points for tree-shaking (@evodb/core/encoding, /types, etc.)
- Lazy bitmap unpacking for memory efficiency
- Single-pass aggregation for query performance
- Pre-compiled column accessors for filter evaluation
- ASCII fast path for string comparison
- Example projects and starter templates

### Changed
- Simplified circuit-breaker.ts for edge execution model (497→289 lines)
- Simplified query-engine-selector.ts to basic heuristics (497→73 lines)
- Simplified schema.ts to essential functions (270→50 lines)
- Reduced branded types from 6 to 2 (BlockId, TableId)
- Consolidated error classes to 4 types

### Fixed
- Array spread in sortRows() causing memory duplication
- Merge column concatenation memory overhead
- TextEncoder created in loop instead of reused

### Removed
- Source maps from npm distribution
- Chaos testing from core (moved to test-utils)
