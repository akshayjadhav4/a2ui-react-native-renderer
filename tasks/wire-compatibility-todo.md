# Tasks: In-Package A2UI Protocol Core

**Module id:** `wire-compatibility`

**Spec:** [SPEC-wire-compatibility.md](../SPEC-wire-compatibility.md)

**Plan:** [wire-compatibility-plan.md](wire-compatibility-plan.md)

**Status:** Approved and implemented on 2026-10-04; final checks recorded below.

These tasks replace the unstarted production tasks from the earlier dependency-upgrade plan for this same module. The completed baseline and upstream trials remain recorded below. The initial-release `tasks/todo.md` remains unchanged. Each task should finish with its focused checks passing before the next dependency is started.

## Completed decision work

- [x] **Baseline:** With `web_core@0.9.0`, `pnpm typecheck`, all 91 tests, and packed Expo/bare React Native iOS and Android bundles passed on 2026-10-04.
- [x] **Trial `web_core@0.10.7`:** Existing types and 91 tests plus a direct v0.9.1 lifecycle passed. Packed bare React Native iOS failed on a Basic Catalog static class block imported by the `v0_9` barrel. Log: `/private/tmp/a2ui-smoke-0.10.7.log`.
- [x] **Trial `web_core@0.12.0`:** Trial-only adapter changes made types, 91 tests, and packed Expo/bare React Native iOS/Android bundles pass. Bare iOS Metro source map contained 31 Basic Catalog and 22 Lit-family modules. Log: `/private/tmp/a2ui-smoke-0.12.0.log`.
- [x] **Architecture direction:** The user chose to implement the needed A2UI protocol core in this package rather than depend on `web_core`.

## Phase 1: Contract and schema foundation

- [x] **Task 1: Freeze the existing public contract**
  - Acceptance: Record representative v0.9 engine snapshots, errors, action payloads, public schema aliases, and type fixtures before cutover. Keep official v0.9/v0.9.1 fixture provenance visible.
  - Verify: `pnpm typecheck`, `pnpm test`; run focused baseline tests after `pnpm build`.
  - Likely files: `test/unit/wire-contract.test.mjs`, `test/types/engine.ts`, `test/types/catalog.tsx`, `test/fixtures/protocol/`.
  - Dependencies: Completed decision work. Scope: Medium.
  - Evidence: The passing 91-test baseline already covers immutable snapshots and notifications (`test/unit/engine-minimal.test.mjs`), structured validation and resource errors (`test/unit/validation.test.mjs`), action payloads (`test/unit/actions.test.mjs` and `test/integration/presenter-action.test.mjs`), app-owned schema aliases (`test/integration/bound-presenter.test.mjs`), and public type fixtures (`test/types/`). The official v0.9/v0.9.1 JSON schemas linked in the spec supply positive/negative protocol cases for Task 2. No redundant implementation-mirroring test was added.

- [x] **Task 2: Define internal v0.9/v0.9.1 schemas and types**
  - Acceptance: The four server messages and action/common values accept official positive cases, reject malformed fields and unsupported versions, and preserve existing public alias signatures where possible. The parser does not import `web_core`.
  - Verify: `pnpm build && node --test test/unit/protocol-schemas.test.mjs`; `pnpm typecheck`.
  - Likely files: `src/protocol/v0_9/schemas.ts`, `src/types/messages.ts`, `test/unit/protocol-schemas.test.mjs`, `test/types/engine.ts`.
  - Dependencies: Task 1. Scope: Medium.
  - Evidence: `src/protocol/v0_9/wireSchemas.ts` and `commonSchemas.ts` parse both supported versions and catalog-independent dynamic/action shapes without `web_core` imports. Focused protocol tests, `pnpm typecheck`, and the full 97-test suite pass. Public aliases remain on the existing adapter until cutover.

- [x] **Task 3: Replace schema behavior inspection**
  - Acceptance: Dynamic values and structural children are recognized in nested app-owned Zod component schemas after optional/nullable/default wrappers. Existing public `A2UI*Schema` helpers remain usable without new consumer metadata.
  - Verify: `pnpm build && node --test test/unit/schema-behavior.test.mjs test/integration/bound-presenter.test.mjs`; `pnpm typecheck`.
  - Likely files: `src/protocol/v0_9/behavior.ts`, `src/protocol/v0_9/resolveProps.ts`, `src/validation/validateGraph.ts`, `test/unit/schema-behavior.test.mjs`.
  - Dependencies: Task 2. Scope: Medium.
  - Evidence: The in-package inspector handles both existing `REF:` aliases and new `A2UI:` aliases through nested optional/nullable/default schemas. Both graph validation and presenter prop resolution now use it. `pnpm typecheck` and all 99 tests pass; no `scrapeSchemaBehavior` import remains.

### Checkpoint A: Protocol boundary

- [x] Both versions parse with internal schemas, while `v1.0` is rejected correctly.
- [x] Existing catalog schemas still identify bindings and child references; public type fixtures compile.
- [x] Production continues to use the old processor until the new state path is complete.

## Phase 2: One authoritative state model

- [x] **Task 4: Implement surface lifecycle transitions**
  - Acceptance: The internal core creates, finds, deletes, and recreates surfaces with catalog ID and surface metadata. Duplicate creates and unknown catalogs reject without mutating committed state.
  - Verify: `pnpm build && node --test test/unit/core-lifecycle.test.mjs`.
  - Likely files: `src/protocol/v0_9/core.ts`, `test/unit/core-lifecycle.test.mjs`.
  - Dependencies: Tasks 2–3. Scope: Small.
  - Evidence: Direct-core lifecycle tests cover create/delete/recreate, duplicate creation, unknown catalog, and version classification. State remains unchanged after rejection.

- [x] **Task 5: Implement atomic component updates**
  - Acceptance: Component adds/replacements obey app-owned schemas, graph and resource limits, and root rules. A late invalid component in one update leaves every earlier component in that update uncommitted.
  - Verify: `pnpm build && node --test test/unit/core-components.test.mjs test/unit/validation.test.mjs`.
  - Likely files: `src/protocol/v0_9/core.ts`, `src/validation/validateGraph.ts`, `test/unit/core-components.test.mjs`.
  - Dependencies: Task 4. Scope: Medium.
  - Evidence: Direct-core tests cover complete app-owned graphs, replacements, missing surfaces/references, and a late invalid component that leaves the entire prior snapshot intact.

- [x] **Task 6: Implement atomic data updates**
  - Acceptance: Root/path replacement and omitted-value removal match the official messages. Invalid pointers or oversized data preserve the prior model and revision.
  - Verify: `pnpm build && node --test test/unit/core-data.test.mjs test/unit/bindings.test.mjs`.
  - Likely files: `src/protocol/v0_9/core.ts`, `src/protocol/v0_9/bindings.ts`, `test/unit/core-data.test.mjs`.
  - Dependencies: Task 5. Scope: Medium.
  - Evidence: Direct-core tests cover root/path replacement, omitted-value removal, deep immutability, invalid pointers, and data-size limits. `pnpm typecheck` and all 107 tests pass after this slice.

- [x] **Task 7: Match action and function behavior**
  - Acceptance: Event context resolves from current data and emits the existing payload shape; registered local functions stay local and invalid calls report structured errors. Both supported wire versions pass the same action cases.
  - Verify: `pnpm build && node --test test/unit/actions.test.mjs test/integration/presenter-action.test.mjs test/integration/consumer-functions.test.mjs`; `pnpm typecheck`.
  - Likely files: `src/engine/actions.ts`, `src/protocol/v0_9/functions.ts`, `test/unit/actions.test.mjs`, `test/integration/presenter-action.test.mjs`.
  - Dependencies: Tasks 2 and 6. Scope: Medium.
  - Evidence: Action and function parsing now use in-package schemas. Omitted optional function args work; event payloads validate under both supported wire versions. Existing action/function integration tests, typecheck, and the 108-test full suite pass.

### Checkpoint B: Direct-core parity

- [x] Complete-graph v0.9 and v0.9.1 create/update/data/delete sequences pass against the internal core.
- [x] Representative v0.9 state and action outcomes match the dependency-backed baseline.
- [x] No failed update partially mutates the internal core.

## Phase 3: Engine cutover and recovery

- [x] **Task 8: Switch engine snapshots to the internal core**
  - Acceptance: The existing `createA2UIEngine` API reads one authoritative state, retains stable immutable snapshots and subscription behavior, and no longer constructs `MessageProcessor` or upstream models.
  - Verify: `pnpm typecheck`; `pnpm build && node --test test/unit/engine-minimal.test.mjs test/integration/presenter-action.test.mjs`.
  - Likely files: `src/protocol/v0_9/adapter.ts`, `src/engine/engine.ts`, `test/unit/engine-minimal.test.mjs`.
  - Dependencies: Checkpoint B. Scope: Medium.
  - Evidence: `createA2UIEngine` now delegates all surface state to `A2UIProtocolCore`, including presenter data setters. The adapter and duplicate surface/data/revision maps are removed. Typecheck, engine tests, and presenter integration tests pass.

- [x] **Task 9: Apply batch messages in order with recovery**
  - Acceptance: A rejected message leaves the last valid revision intact; later valid messages in the same batch apply, including on the same surface. The batch-size limit and one final notification remain.
  - Verify: `pnpm build && node --test test/unit/validation.test.mjs test/unit/engine-minimal.test.mjs`; `pnpm test`.
  - Likely files: `src/validation/validateMessages.ts`, `src/engine/engine.ts`, `test/unit/validation.test.mjs`, `test/unit/engine-minimal.test.mjs`.
  - Dependencies: Task 8. Scope: Medium.
  - Evidence: Engine tests prove same-surface recovery after an invalid graph or malformed v0.9.1 message, preservation of accepted creates, one batch notification, and atomic rejection of oversized batches. The old per-surface batch validator was removed. All 112 tests pass.

### Checkpoint C: Public behavior

- [x] Both versions complete engine-level flows with app-owned catalogs; malformed v0.9.1 reports validation error and v1.0 reports `UNSUPPORTED_VERSION`.
- [x] Same-surface recovery, unrelated-surface progress, actions, and subscription tests pass.
- [x] Generated public declarations contain no upstream internal types.

## Phase 4: Remove dependency and document the migration

- [x] **Task 10: Remove `web_core` and prove native packaging**
  - Acceptance: No source or generated declaration imports `@a2ui/web_core`; `package.json` and lockfile omit the runtime dependency. Packed Expo and bare React Native iOS/Android builds pass, and Metro includes no Basic Catalog/Lit/DOM code from this renderer.
  - Verify: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm pack:check`, `pnpm consumer:smoke`; inspect packed manifest and Metro source map.
  - Likely files: `package.json`, `pnpm-lock.yaml`, and any remaining upstream import sites identified by `rg`.
  - Dependencies: Checkpoint C. Scope: Medium.
  - Evidence: `pnpm remove @a2ui/web_core` updated the manifest and lockfile. Packed Expo and bare React Native iOS/Android builds pass. The installed package has no runtime dependencies; a bare iOS Metro source map contains 26 renderer modules and zero `web_core`, Basic Catalog, or Lit modules. The pack check now rejects these web renderer imports if they reappear.

- [x] **Task 11: Document exact support and migration**
  - Acceptance: README and docs describe v0.9/v0.9.1 complete-graph support, the progressive-reference limitation, app-owned components, new batch recovery behavior, and any public type changes. Architecture docs explain the in-package core and dependency removal.
  - Verify: `pnpm exec prettier --check README.md CHANGELOG.md docs`; review wording against the spec and final test results.
  - Likely files: `README.md`, `docs/architecture.md`, `docs/migration.md`, `docs/streaming-and-actions.md`, `CHANGELOG.md`.
  - Dependencies: Task 10. Scope: Medium.
  - Evidence: README, API, concepts, architecture, streaming, errors, migration, and changelog now state both supported wire versions, app-owned catalog, per-message recovery, dependency removal, and the progressive-reference limitation.

### Checkpoint D: Module complete

- [x] `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm pack:check`, and `pnpm consumer:smoke` pass after the final edit.
- [x] Installed React Native consumers use no `web_core`, Basic Catalog, Lit, or DOM module from this package.
- [x] All approved spec criteria are met; deferred progressive references and the planned `0.2.0` type migration are documented.
- [x] No Basic Catalog, transport, license, or publication work was included.
