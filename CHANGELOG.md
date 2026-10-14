# Changelog

All notable changes to this project will be documented in this file. The
project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Added `useA2UIEngine(options)` to manage a mounted feature's engine lifetime,
  preserve state across rerenders, and use current action/error callbacks.
  Catalogs and effective resource limits remain construction settings.
- Added optional `engine` placement to `A2UISurface`, allowing one surface to
  render without an outer provider while retaining provider-based usage.
- Added `exportA2UICatalogSchema` from
  `a2ui-react-native-renderer/catalog-schema` so an app can generate an A2UI
  v0.9/v0.9.1 catalog document from the same app-owned catalog used by the
  renderer. Supported Zod properties, A2UI marker references, and representable
  functions are exported without presenters or executable implementations;
  unsupported schemas fail with a named path. Apps own delivery to the agent.

### Changed

- External-engine `A2UIRenderer` now permits omitted `messages`; it observes
  imperative engine updates without requiring an empty array. Owned-engine
  mode still requires messages and retains existing collection replay rules.
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

### Fixed

- Pending and absent surfaces now update error fallback UI when a rejected
  operation leaves their accepted snapshot unchanged. Rendered content stays
  stable after rejected updates.
- Switching a surface's engine or ID clears old presenter failures even when
  the new surface has the same revision.

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
