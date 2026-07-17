# Implementation Plan: a2ui-react-native-renderer

## Status

- Phase: Plan
- State: Awaiting human review
- Specification: `tasks/spec.md`
- Execution method: incremental, test-first, one atomic commit per task

## Overview

Build a standalone, catalog-agnostic React Native renderer for official A2UI
v0.9 messages. The work begins with the smallest end-to-end proof: a consumer
defines one test-only component, official messages create one surface, and the
package renders the component. Lifecycle, bindings, actions, validation,
diagnostics, packaging, and release automation are added only after that path is
working.

The current GenUI workspace package is a behavioral reference, not a directory
to copy. App-owned catalogs, Expo controls, styling, AG-UI integration, journal
placement, and server helpers are excluded.

## Architecture Decisions

### 1. Pure JavaScript React Native Library

The package contains TypeScript and React only. It has no native module, Expo
dependency, platform project, autolinking configuration, or code generation.

`react-native-builder-bob` produces JavaScript and declaration outputs. Package
exports target React Native, ESM, CommonJS where supported by the selected Bob
configuration, and TypeScript declarations without exposing workspace source
paths.

### 2. Official A2UI Messages Are The Input Contract

The public API accepts official v0.9 `A2UIMessage` values. It does not introduce
a simplified `{ components, rootId }` protocol. A thin convenience component
may own an engine, but it does not translate an alternative UI format.

### 3. Consumer-Owned Catalogs Are Mandatory

The package ships zero presenters. Consumers create immutable catalogs from:

- a required catalog ID;
- Zod v3 component property schemas;
- React Native presenters;
- optional A2UI function implementations;
- an optional theme schema.

This matches `@a2ui/web_core/v0_9`, which uses Zod component contracts, while
keeping visual implementation entirely outside the package.

### 4. Engine Owns State; React Subscribes

`createA2UIEngine` is a framework-neutral external store. React integration uses
`useSyncExternalStore` so unrelated surfaces do not rerender when one surface
changes. There is no Zustand dependency and no mirrored React state.

### 5. Simple API Is Composition, Not A Second Runtime

`A2UIRenderer` creates one stable internal engine when no engine is provided,
applies new message batches once, provides it through `A2UIProvider`, discovers
active surfaces, and renders `A2UISurface` for each one.

The advanced and simple APIs share the same engine, validation, errors, and
presenter adapter.

### 6. Validation Happens Before Visible Mutation

Messages are parsed at the package boundary. Component graphs, root references,
catalogs, schemas, and configured resource limits are validated before a new
surface revision becomes visible.

An invalid initial surface has no production UI. An invalid later revision
keeps the last valid revision. Every failure enters the structured error
channel.

### 7. Protocol Version Is Explicit

All v0.9 integration lives under `src/protocol/v0_9`. Public aliases expose the
official message and action types without spreading core-specific contexts
through the package. A future protocol version receives a separate adapter;
v0.9 behavior is not silently replaced.

### 8. No Transport Helpers

The package does not parse AG-UI events, JSONL streams, HTTP responses, or tool
results. Consumers extract A2UI messages and call `applyMessage`,
`applyMessages`, or pass a message collection to `A2UIRenderer`.

## Dependency Graph

```text
Package scaffold and build outputs
    -> public error and catalog contracts
        -> v0.9 protocol adapter and engine
            -> React provider and one-surface rendering
                -> convenience A2UIRenderer
                -> lifecycle and multi-surface behavior
                -> data bindings and template scopes
                -> actions and functions
                    -> validation and atomic recovery
                        -> diagnostics and error boundaries
                            -> performance hardening
                                -> consumer example
                                    -> packed-tarball smoke tests
                                        -> docs and CI
                                            -> npm release preparation
```

Tasks follow this order. Parallel work begins only after the public contracts
used by that work are accepted.

## Extraction Map

### Concepts To Reimplement Or Adapt

- instance-scoped engine and subscriptions;
- React context provider and surface hooks;
- component binding lifecycle adapter;
- one-surface renderer and error boundary;
- convenience renderer with stable engine ownership;
- structured surface ID helpers;
- official message and action type aliases.

### Current Code Explicitly Excluded

- `basicCatalog.ts` and all `components/**` presenters;
- `genuiCatalog.ts` and `Leaderboard`;
- Expo UI, Expo Image, Expo Symbols, Expo Web Browser, and Uniwind;
- `bundle.ts` model/transport metadata;
- chat journal and transcript placement helpers;
- AG-UI, TanStack AI, server builders, and model schemas;
- application themes, spacing contexts, and design tokens;
- app-specific `openUrl` implementation.

## Implementation Phases

### Phase 1: Publishable Skeleton

#### Task 1: Scaffold The JavaScript Library

Create the package metadata, strict TypeScript configuration, Bob build,
lint/format configuration, test command foundation, public entry point, license,
and npm file allowlist. Keep publication disabled with `private: true` until the
release gate task.

Verification:

- `pnpm install`
- `pnpm build`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm pack --dry-run`

#### Task 2: Define Public Catalog And Error Contracts

Implement immutable `defineA2UIComponent`, `defineA2UICatalog`, presenter types,
function definition types, catalog duplicate checks, and the public structured
error type. Add compile-time examples and runtime catalog tests.

Verification:

- component schema infers presenter props;
- invalid presenter props fail the type fixture;
- duplicate names and empty IDs fail deterministically;
- no React Native presenter is bundled.

### Checkpoint 1: Contracts

- Package builds into intended outputs.
- Public catalog example compiles.
- npm tarball contains no workspace or application files.
- Human reviews the initial public type declarations before engine work.

### Phase 2: Smallest End-To-End Renderer

#### Task 3: Implement The Minimal V0.9 Engine Path

Wrap `@a2ui/web_core/v0_9` with an instance-scoped engine supporting one valid
`createSurface` and `updateComponents` sequence. Expose stable surface snapshots
and subscriptions. Use a test-only `Text` catalog; do not add package
presenters.

Verification:

- official messages create one surface;
- the root and component records are available from the snapshot;
- malformed messages become structured errors;
- two engine instances cannot share state.

#### Task 4: Render One Consumer Component

Implement the presenter adapter, `A2UIProvider`, `A2UISurface`, and the first
renderer integration test. Render a test-only consumer `Text` presenter from the
surface created in Task 3.

Verification:

- resolved props reach the correct presenter;
- missing provider fails with an actionable developer error;
- unknown catalog/component cannot invoke a presenter;
- an engine update rerenders the subscribed surface.

#### Task 5: Add The Simple `A2UIRenderer`

Compose the engine, provider, active-surface discovery, and surface renderer
behind the minimal API. Deduplicate message application and keep the internal
engine stable across React rerenders.

Verification:

- the README-level simple example renders;
- rerendering with the same messages does not reapply them;
- passing a new batch updates the surface once;
- action and error callbacks can change without recreating the engine.

### Checkpoint 2: First Usable Vertical Slice

- A clean consumer can define one component and render official A2UI messages.
- Both simple and advanced APIs use the same runtime.
- Build, typecheck, lint, and focused tests pass.
- Commit history contains one independently revertible commit per task.

### Phase 3: Complete Protocol Runtime

#### Task 6: Complete Surface Lifecycle

Add component replacement, independent multiple surfaces, surface deletion,
root changes, and surface-specific subscriptions.

Verification:

- create, update, and delete sequences work;
- deletion removes state and rendered output;
- updating one surface does not notify another surface subscriber.

#### Task 7: Add Data Models And Bindings

Integrate `updateDataModel`, JSON pointer decoding, update/delete semantics, and
binding resolution. Add nested template scopes with both value and pointer
context.

Verification:

- literal and absolute bound values render;
- escaped and array JSON pointers resolve;
- relative template reads and writes use the correct item scope;
- deleting data does not leave stale presenter props.

#### Task 8: Add User Action Dispatch

Expose typed dispatch to presenters, resolve action context from the current
surface data model, and deliver official user actions to the latest consumer
callback.

Verification:

- native presenter interaction emits one action;
- context paths resolve at dispatch time;
- action handlers update without engine recreation;
- actions cannot cross surface data models.

#### Task 9: Add Consumer Functions

Implement `defineA2UIFunction` and bridge consumer-owned, schema-validated
functions into the v0.9 evaluator. Ship no built-in functions.

Verification:

- registered functions evaluate bindings and checks;
- invalid arguments produce `FUNCTION_ERROR`;
- unknown functions do not crash rendering;
- function failures cannot mutate engine state.

### Checkpoint 3: Protocol Behavior

- Lifecycle, bindings, actions, and functions work through consumer definitions.
- Official fixtures cover every supported message type.
- No app or transport code has entered the package.

### Phase 4: Hardening

#### Task 10: Add Graph And Resource Validation

Validate roots, duplicate IDs, references, cycles, schema properties, and
resource limits before committing visible revisions. Apply valid batches
transactionally per affected surface.

Verification:

- each invalid fixture reports the documented error code and path;
- oversized batches and surfaces are rejected;
- one invalid surface does not block a valid surface in the same batch;
- an invalid update retains the last valid revision.

#### Task 11: Add Development Diagnostics And Production Recovery

Add surface and presenter error boundaries, safe development diagnostics,
production null/custom fallbacks, error draining, and callback reporting.

Verification:

- presenter exceptions cannot escape the renderer boundary;
- development diagnostics contain identifiers but not full data models;
- production does not display internal diagnostics;
- every suppressed production failure still invokes `onError`.

#### Task 12: Harden Subscription And Render Performance

Make snapshots referentially stable, memoize catalog lookups, avoid full data
model cloning per component, and add rerender-count and 500-component stress
fixtures.

Verification:

- unrelated surfaces do not rerender;
- unchanged snapshots retain reference identity;
- a 500-component fixture completes without stack overflow or crash;
- no timers, network calls, or background tasks are introduced.

### Checkpoint 4: Runtime Release Candidate

- Full focused test suite and coverage gates pass.
- Invalid agent output is contained in development and production modes.
- Performance invariants are demonstrated by tests rather than assumptions.

### Phase 5: Consumer And Distribution Proof

#### Task 13: Build The Expo Consumer Example

Add an example application that owns a small fixture catalog and demonstrates
simple rendering, streamed updates, actions, deletion, and error handling. The
example imports only the package root.

Verification:

- example starts without Metro aliases;
- iOS and Android exports bundle;
- no package presenter is used;
- example catalog remains clearly consumer-owned.

#### Task 14: Verify The Packed Package As A Consumer

Pack the package, install the tarball into the Expo example, inspect package
contents, and add a clean bare React Native bundle smoke fixture or scripted
consumer check.

Verification:

- tests use the tarball rather than workspace linking;
- no source-relative or unpublished import is required;
- Expo and bare React Native resolve JavaScript and declarations;
- package contains no local absolute paths.

#### Task 15: Complete Consumer And Maintainer Documentation

Update README and focused guides for catalogs, streaming, actions, errors,
architecture, migration, contribution, and security. Reconcile
`docs/concepts.md` with the implemented API.

Verification:

- every public export has documentation and an executable example;
- limitations state v0.9-only and no bundled catalog;
- copied README examples compile in type tests;
- architecture documentation explains invariants and dependency boundaries.

### Checkpoint 5: Package Candidate

- A developer can follow the README from installation to a rendered surface.
- Packed-tarball consumer checks pass for Expo and bare React Native.
- Documentation matches actual exports.

### Phase 6: Automation And Publication

#### Task 16: Add CI Quality Gates

Add GitHub Actions for install, build, typecheck, lint, tests, coverage, package
inspection, and consumer smoke checks across supported Node versions.

Verification:

- CI runs from a clean checkout;
- dependency cache cannot hide missing package files;
- pull requests cannot bypass required quality jobs;
- no publish credentials are used by CI.

#### Task 17: Prepare Trusted Npm Publishing

Add repository metadata, changelog/release policy, protected publish workflow,
npm provenance configuration, and final package visibility. This task waits for
the GitHub owner and repository URL.

Verification:

- `npm view a2ui-react-native-renderer` is checked again immediately before the
  first publish;
- `pnpm release:check` passes from a clean tree;
- tarball is manually reviewed;
- publish workflow uses npm trusted publishing without a long-lived write
  token;
- version `0.1.0` is published only after explicit human approval.

### Checkpoint 6: Release

- All specification success criteria pass.
- Git tag, changelog, npm version, and GitHub release agree.
- npm displays provenance and the correct public repository.
- Installation instructions work against the registry package.

## Per-Task Execution Rules

For every task:

1. Load only the task, relevant spec sections, and directly affected files.
2. Write or update the failing test first when behavior changes.
3. Implement the smallest complete behavior.
4. Run the focused test and the commands affected by the change.
5. Review the diff for accidental public exports and scope expansion.
6. Commit with one descriptive conventional commit.
7. Mark the task and its verification evidence in `tasks/todo.md`.
8. Stop at each checkpoint for human review.

No task may leave the build broken for the next task.

## Parallelization

Most core tasks remain sequential because they share public contracts and
engine invariants.

Safe parallel work after Checkpoint 2:

- documentation examples against already accepted APIs;
- independent invalid-message fixtures;
- Expo example visual polish after the consumer path works.

Must remain sequential:

- catalog contract before protocol adapter;
- engine before React integration;
- bindings before actions;
- validation before production fallback behavior;
- package outputs before tarball consumer tests;
- repository metadata before trusted publishing.

## Risks And Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| `@a2ui/web_core` contains browser assumptions | High | Prove the smallest RN render path in Tasks 3-4 before broader extraction; wrap it behind a version adapter. |
| Zod instances differ between package boundaries | High | Use a documented Zod v3 peer range and test installation from a packed tarball. |
| Public types leak core internals | High | Add declaration/type fixtures at Task 2 and review generated declarations at every checkpoint. |
| Invalid incremental UI clears valid content | High | Validate and commit per surface transactionally; keep the previous valid revision. |
| Simple renderer reapplies messages on every render | Medium | Track applied batches and test rerender/application counts. |
| React 18 and 19 behave differently | Medium | Use `useSyncExternalStore`, avoid deprecated render APIs in public code, and test supported peer configurations. |
| Metro resolves workspace source but not npm output | High | Make tarball installation the required consumer test, not workspace linking. |
| No bundled catalog makes demos unclear | Medium | Keep all presenters in the example app and document that ownership prominently. |
| Development-only behavior leaks into production | Medium | Test both development diagnostics and production fallback paths explicitly. |
| Package name is claimed before release | Medium | Recheck npm immediately before publication; prepare an approved fallback name only if needed. |
| Scope grows into an AI/chat SDK | High | Enforce dependency and import boundary checks in CI. |

## Deferred Input

- GitHub owner and final public repository URL are required before Task 17.

## Plan Approval Gate

Implementation begins only after the human reviews and approves this plan and
the corresponding task checklist in `tasks/todo.md`.
