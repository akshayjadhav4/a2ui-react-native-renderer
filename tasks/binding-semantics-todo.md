# Tasks: Presenter Binding Semantics

**Module id:** `binding-semantics`

**Spec:** [SPEC-binding-semantics.md](../SPEC-binding-semantics.md)

**Plan:** [binding-semantics-plan.md](binding-semantics-plan.md)

**Status:** Draft for review. No binding implementation task has started.

Tasks are ordered by dependency. Each should finish with its focused checks passing before moving on.

## Phase 1: Contract and schema metadata

- [x] **Task 1: Freeze presenter baseline**
  - Acceptance: Record literal, bound, and function dynamic values, current generated setter behavior, missing-path behavior, and nested presenter types without changing runtime code.
  - Verify: `pnpm build && node --test test/integration/bound-presenter.test.mjs test/integration/consumer-functions.test.mjs`; `pnpm typecheck`.
  - Likely files: `test/integration/bound-presenter.test.mjs`, `test/types/catalog.tsx`.
  - Dependencies: Approved spec. Scope: Small.

- [x] **Task 2: Correct public resolved-prop types**
  - Acceptance: `A2UIResolvedProps` models dynamic values as possibly `undefined`, makes generated setters optional, recursively resolves nested objects/arrays, and leaves static fields correctly typed.
  - Verify: `pnpm typecheck`; `pnpm build && node --test test/unit/catalog.test.mjs`.
  - Likely files: `src/catalog/types.ts`, `test/types/catalog.tsx`, `test/types/guides.tsx`.
  - Dependencies: Task 1. Scope: Medium.

### Checkpoint A

- [x] Type fixtures compile for optional setters and nested resolved values; existing runtime tests pass.

- [x] **Task 3: Classify dynamic kinds and reject setter collisions**
  - Acceptance: The behavior inspector identifies known dynamic kinds through common Zod wrappers; ambiguous custom unions remain unknown. Catalog registration rejects a real `setX` property that a sibling dynamic field would overwrite.
  - Verify: `pnpm build && node --test test/unit/schema-behavior.test.mjs test/unit/catalog.test.mjs`; `pnpm typecheck`.
  - Likely files: `src/protocol/v0_9/behavior.ts`, `src/catalog/defineComponent.ts`, `test/unit/schema-behavior.test.mjs`, `test/unit/catalog.test.mjs`.
  - Dependencies: Task 2. Scope: Medium.

### Checkpoint B

- [x] Existing app-owned catalog schemas still register and expected dynamic kinds are available to the resolver.

## Phase 2: Runtime read and write behavior

- [x] **Task 4: Expose setters only for current bindings**
  - Acceptance: A direct `{ path }` receives a setter even if the data path is missing; literals and function calls receive no setter. Relative and escaped paths still resolve correctly.
  - Verify: `pnpm build && node --test test/integration/bound-presenter.test.mjs test/unit/bindings.test.mjs`.
  - Likely files: `src/protocol/v0_9/resolveProps.ts`, `test/integration/bound-presenter.test.mjs`.
  - Dependencies: Task 3. Scope: Small.

- [ ] **Task 5: Check resolved dynamic values before presentation**
  - Acceptance: Wrong-type bound values and function results produce `BINDING_ERROR` or `FUNCTION_ERROR`; missing paths remain `undefined`; a later correcting data update recovers the presenter.
  - Verify: `pnpm build && node --test test/integration/bound-presenter.test.mjs test/integration/consumer-functions.test.mjs test/integration/diagnostics.test.mjs`; `pnpm typecheck`.
  - Likely files: `src/protocol/v0_9/resolveProps.ts`, `src/rendering/presenterAdapter.tsx`, `test/integration/bound-presenter.test.mjs`, `test/integration/consumer-functions.test.mjs`.
  - Dependencies: Task 4. Scope: Medium.

### Checkpoint C

- [ ] Invalid typed values cannot reach a presenter; action context and subscription tests pass.

- [ ] **Task 6: Validate current-state local writes**
  - Acceptance: Setters reject wrong types and stale component bindings with a structured error and no model mutation. Valid rapid successive writes, template-scoped writes, and surface-isolated notifications continue to work.
  - Verify: `pnpm build && node --test test/integration/bound-presenter.test.mjs test/integration/surface-subscriptions.test.mjs test/unit/core-data.test.mjs`; `pnpm typecheck`.
  - Likely files: `src/protocol/v0_9/resolveProps.ts`, `src/rendering/presenterAdapter.tsx`, `src/engine/internals.ts`, `test/integration/bound-presenter.test.mjs`.
  - Dependencies: Task 5. Scope: Medium.

### Checkpoint D

- [ ] Invalid and stale writes preserve snapshot identity/revision; valid writes affect only their surface.

## Phase 3: Migration and consumer proof

- [ ] **Task 7: Document migration and verify packed consumers**
  - Acceptance: Docs and Expo example show optional setters and explicit native editability; changelog records the public type change; no runtime dependency or bundled catalog is added.
  - Verify: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm pack:check`, `pnpm consumer:smoke`.
  - Likely files: `docs/catalogs.md`, `docs/api.md`, `docs/migration.md`, `CHANGELOG.md`, `example/expo/src/catalog.tsx`.
  - Dependencies: Checkpoint D. Scope: Medium.

### Checkpoint E: Module complete

- [ ] All approved spec criteria pass and generated public declarations match the optional setter contract.
- [ ] Packed Expo and bare React Native iOS/Android consumers build without web renderer modules.
- [ ] The package still owns no Basic Catalog, transport, or network synchronization.
