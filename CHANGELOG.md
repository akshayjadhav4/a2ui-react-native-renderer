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
- Presenter `setX` callbacks now exist only for direct data bindings and are
  optional in `A2UIResolvedProps`. Missing bound values remain `undefined`;
  nested resolved props are inferred recursively. Wrong-type reads and writes
  report structured errors, and stale setters cannot update old bindings.
- Component definitions now stream in either order: pre-root updates are
  buffered, and unresolved structural children stay pending while available
  siblings render. Snapshots expose `pendingComponentIds`, both React entry
  points accept app-owned `renderPending`, and `A2UIComponentIdSchema` marks a
  single child without changing presenter props into a list. Missing references
  no longer raise an error; malformed IDs, known cycles, and limits still do.

### Known limitation

- The protocol has no general completion signal for a child definition that
  never arrives. The application owns any timeout or retry policy.

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
