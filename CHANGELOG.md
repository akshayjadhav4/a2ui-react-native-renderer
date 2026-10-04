# Changelog

All notable changes to this project will be documented in this file. The
project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- Replaced `@a2ui/web_core` with an in-package protocol core that keeps native
  bundles free of its Basic Catalog and Lit dependencies.
- Added v0.9.1 messages alongside v0.9 for complete component graphs. The
  `A2UIMessage` type and public value schemas are now package-owned.
- `applyMessages` now continues after an invalid message and commits later
  valid messages, including on the same surface. Each accepted message commits
  atomically; oversized batches still reject in full.

### Known limitation

- Component references to children delivered in later messages still require
  progressive-reference support and are rejected for now.

## [0.1.1] - 2026-07-18

### Fixed

- Removed outdated pre-release wording from the README and documented the
  supported `0.1.x` release line.

## [0.1.0] - 2026-07-18

### Added

- Catalog-agnostic A2UI v0.9 engine for React Native and Expo.
- Consumer-defined Zod component schemas, native presenters, and functions.
- Simple `A2UIRenderer` and advanced engine/provider/surface APIs.
- Incremental surface lifecycle, data models, absolute and relative bindings,
  structural templates, and action dispatch.
- Transactional graph validation, resource limits, diagnostics, production
  recovery, and surface-isolated subscriptions.
- Expo SDK 57 example and packed-tarball smoke consumers for Expo and bare React
  Native on iOS and Android.
- Public API, architecture, catalog, streaming, migration, security, and
  contribution documentation.
