# Tasks: Progressive Surfaces

**Module id:** `progressive-surfaces`

**Spec:** [SPEC-progressive-surfaces.md](../SPEC-progressive-surfaces.md)

**Plan:** [progressive-surfaces-plan.md](progressive-surfaces-plan.md)

**Status:** Proposed for review on 2026-10-04. No implementation has started.

Tasks follow dependency order. Add a focused failing test or type fixture before each behavior change, then make it pass and record verification. Keep each implementation slice on `codex/native-core` and commit it separately. The old `tasks/todo.md` is a historical initial-release record and is not the active checklist.

## Phase A: Structural contract

- [ ] **Task 1: Export the single-child schema marker**
  - Acceptance: `A2UIComponentIdSchema` is a nonempty, tagged Zod string exported from the package root; type fixtures infer a string presenter prop, while `A2UIChildListSchema` still infers a resolved child list.
  - Verify: `pnpm build && pnpm typecheck && node --test test/unit/protocol-schemas.test.mjs`.
  - Likely files: `src/protocol/v0_9/commonSchemas.ts`, `src/protocol/v0_9/schemas.ts`, `src/index.ts`, `test/types/guides.tsx`.
  - Dependencies: Approved task list. Scope: Medium.

- [ ] **Task 2: Recognize marked single-child references**
  - Acceptance: The schema inspector reports a distinct `COMPONENT_ID` behavior through nested and optional/nullable wrappers. Graph extraction records its string as one edge; prop resolution keeps it a string. An ordinary `z.string()` creates no edge, and child-list/template behavior remains unchanged.
  - Verify: `pnpm build && node --test test/unit/schema-behavior.test.mjs test/unit/validation.test.mjs test/integration/bound-presenter.test.mjs && pnpm typecheck`.
  - Likely files: `src/protocol/v0_9/behavior.ts`, `src/protocol/v0_9/resolveProps.ts`, `src/validation/validateGraph.ts`, `test/unit/schema-behavior.test.mjs`, `test/unit/validation.test.mjs`.
  - Dependencies: Task 1. Scope: Medium.

### Checkpoint A

- [ ] Public declarations show a string single-child prop; graph and presenter tests cover tagged and untagged strings, nested fields, child lists, and template scopes.
- [ ] `pnpm typecheck`, focused tests, and `git diff --check` pass.

## Phase B: Protocol state

- [ ] **Task 3: Establish pending snapshot state**
  - Acceptance: A created surface has frozen `pendingComponentIds: ["root"]`; snapshots expose the readonly field and preserve its identity across data updates. Core root assignment is based on the actual presence of `components.root`. Deletion and recreation start clean.
  - Verify: `pnpm build && node --test test/unit/core-lifecycle.test.mjs test/unit/core-data.test.mjs test/unit/surface-lifecycle.test.mjs && pnpm typecheck`.
  - Likely files: `src/engine/types.ts`, `src/protocol/v0_9/core.ts`, `test/unit/core-lifecycle.test.mjs`, `test/unit/surface-lifecycle.test.mjs`.
  - Dependencies: Checkpoint A. Scope: Medium.

- [ ] **Task 4: Accept progressive component graphs atomically**
  - Acceptance: Child-first and root-first batches are accepted for v0.9/v0.9.1; reachable missing IDs appear once in deterministic order, while pre-root snapshots expose only `"root"`. Empty IDs and too many distinct unresolved IDs fail. Known cycles and depth violations, including those completed by late definitions, reject atomically; a following corrective message succeeds.
  - Verify: `pnpm build && node --test test/unit/validation.test.mjs test/unit/core-components.test.mjs test/unit/engine-minimal.test.mjs && pnpm typecheck`.
  - Likely files: `src/validation/validateGraph.ts`, `src/protocol/v0_9/core.ts`, `test/unit/validation.test.mjs`, `test/unit/core-components.test.mjs`, `test/unit/engine-minimal.test.mjs`.
  - Dependencies: Task 3. Scope: Medium.

### Checkpoint B

- [ ] Both message orders converge to the same graph and pending state; batch recovery, surface subscriptions, and immutable snapshot checks pass.
- [ ] `pnpm test`, `pnpm typecheck`, and `git diff --check` pass before React API changes.

## Phase C: React rendering

- [ ] **Task 5: Show an app-owned pending root**
  - Acceptance: `A2UISurface` and `A2UIRenderer` accept the same optional `renderPending` callback. A created surface without `root` calls it with `{ surfaceId, componentId: "root", kind: "root" }`; default output remains `null`. A surface ID not yet created retains current behavior. Public prop types compile.
  - Verify: `pnpm build && node --test test/integration/surface-renderer.test.mjs test/integration/convenience-renderer.test.mjs && pnpm typecheck`.
  - Likely files: `src/react/A2UISurface.tsx`, `src/react/A2UIRenderer.tsx`, `test/integration/surface-renderer.test.mjs`, `test/integration/convenience-renderer.test.mjs`, `test/types/renderer.tsx`.
  - Dependencies: Checkpoint B. Scope: Medium.

- [ ] **Task 6: Replace pending child positions as definitions arrive**
  - Acceptance: A presenter calling `renderChild` for a reachable pending structural ID receives app-owned pending UI or `null`, while valid siblings render. A later child definition replaces that position without an error. An arbitrary missing ID still reports `INVALID_REFERENCE`; missing data remains `undefined` for the presenter.
  - Verify: `pnpm build && node --test test/integration/surface-renderer.test.mjs test/integration/diagnostics.test.mjs test/integration/bound-presenter.test.mjs test/integration/performance-renderer.test.mjs && pnpm typecheck`.
  - Likely files: `src/rendering/presenterAdapter.tsx`, `src/react/A2UISurface.tsx`, `test/integration/surface-renderer.test.mjs`, `test/integration/diagnostics.test.mjs`, `test/integration/bound-presenter.test.mjs`.
  - Dependencies: Task 5. Scope: Medium.

### Checkpoint C

- [ ] Both React entry points render app-owned root and child pending UI with exact callback arguments, then replace it after updates; default rendering omits only missing positions.
- [ ] Valid pending references emit no `onError`; invalid child calls, presenter errors, and wrong-type data retain structured recovery. `pnpm test` and `pnpm typecheck` pass.

## Phase D: Migration and package proof

- [ ] **Task 7: Document the progressive API and migration**
  - Acceptance: README and API/catalog/streaming/migration docs show an app-owned single-child presenter and loading callback, explain pending snapshot IDs and `undefined` data, and remove claims that progressive references are unsupported.
  - Verify: `pnpm exec prettier --check README.md docs/api.md docs/catalogs.md docs/streaming-and-actions.md docs/migration.md`; inspect examples against the generated declaration.
  - Likely files: `README.md`, `docs/api.md`, `docs/catalogs.md`, `docs/streaming-and-actions.md`, `docs/migration.md`.
  - Dependencies: Checkpoint C. Scope: Medium.

- [ ] **Task 8: Finish error guidance and native consumer proof**
  - Acceptance: Error docs and changelog distinguish pending refs from validation failures, document app-owned optional agent feedback, and update documentation assertions. Package version, license, runtime dependencies, and Basic Catalog ownership remain unchanged.
  - Verify: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm pack:check && pnpm consumer:smoke`; `pnpm exec prettier --check SPEC-progressive-surfaces.md tasks/progressive-surfaces-plan.md tasks/progressive-surfaces-todo.md`; `git diff --check`.
  - Likely files: `docs/errors-and-security.md`, `docs/concepts.md`, `CHANGELOG.md`, `test/unit/documentation.test.mjs`.
  - Dependencies: Task 7. Scope: Medium.

### Checkpoint D: Module complete

- [ ] All approved spec success criteria pass for v0.9 and v0.9.1, including child-first/root-first streams, late error recovery, missing data, and app-owned loading UI.
- [ ] Generated declarations expose only the three planned API additions, and packed Expo/bare React Native iOS/Android consumer checks pass.
- [ ] No Basic Catalog, transport client, new dependency, license change, or package publication is included.

## Review decisions

The plan's separate `COMPONENT_ID` behavior and validator-returned pending list are reflected in Tasks 2 and 4. Review the task boundaries, verification commands, and migration scope before implementation.
