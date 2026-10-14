# Tasks: Render Reactivity

**Spec:** [SPEC-render-reactivity.md](../SPEC-render-reactivity.md)

**Plan:** [render-reactivity-plan.md](render-reactivity-plan.md)

**Status:** Implementation authorized on 2026-10-14 with “ok approve start work.”

The user approved the plan and explicitly directed implementation. This task
breakdown implements that authorization on `codex/native-core`, without another
approval stop. Commit verified slices and preserve historical task records.

- [x] **Task 1: Conservative presenter-value comparison**
  - Acceptance: Ordinary records/arrays compare values and complete own keys; primitives/functions use identity. Unusual objects, cycles, accessors, excessive depth/work fail conservatively. No JSON serialization or function execution.
  - Files: `src/rendering/equalPresenterValues.ts`, `test/unit/presenter-equality.test.mjs`.
  - Verify: Failing unit cases first; `pnpm build && node --test test/unit/presenter-equality.test.mjs && pnpm typecheck`.
  - Dependencies: Approved plan/start authorization.
  - Evidence: Four unit cases failed before the helper existed, then passed. Comparison preserves callbacks, symbols, key order, missing fields, signed zero, and sparse arrays; it avoids getters and conservatively rejects cycles/aliases, unusual objects, or excessive traversal. Build/typecheck pass.

- [ ] **Task 2: Private setter factory support**
  - Acceptance: Resolver supports a private optional factory with complete binding descriptors, including nested properties. Default setter behavior and all existing bindings remain unchanged.
  - Files: `src/protocol/v0_9/resolveProps.ts`, `test/unit/setter-factory.test.mjs`.
  - Verify: Failing unit cases first; `pnpm build && node --test test/unit/setter-factory.test.mjs test/unit/bindings.test.mjs && pnpm typecheck`.
  - Dependencies: Task 1.

### Checkpoint A

- [ ] Tested foundations preserve existing resolution; no public export changes.

- [ ] **Task 3: Complete presenter preservation path**
  - Acceptance: Nodes independently read current surface state; child callbacks remain current; owner-scoped setters are stable and still reject stale writes. Actual presenters remain React components inside a conservative memoized host and outside accepted-revision error recovery. Six measured targets pass with correct output.
  - Files: `src/rendering/presenterAdapter.tsx`, `src/react/A2UISurface.tsx`, `test/integration/render-reactivity.test.mjs`, `tasks/render-reactivity-measurements.md`.
  - Verify: Failing counts first; `pnpm build && node --test test/integration/render-reactivity.test.mjs test/integration/bound-presenter.test.mjs test/integration/surface-subscriptions.test.mjs && node tasks/render-reactivity-baseline.mjs && pnpm typecheck`.
  - Dependencies: Checkpoint A.

- [ ] **Task 4: Scope, functions, errors, and React behavior**
  - Acceptance: Both wire versions and three entry modes pass; scope-only and external absolute bindings update; functions reevaluate; error recovery works; presenter state/context and current action context remain live. Generated callbacks stay stable only while valid.
  - Files: `test/integration/render-reactivity.test.mjs`, runtime fixes limited to the affected rendering helper.
  - Verify: Failing/reproduction cases before fixes; `pnpm build && node --test test/integration/render-reactivity.test.mjs test/integration/consumer-functions.test.mjs test/integration/diagnostics.test.mjs && pnpm typecheck`.
  - Dependencies: Task 3.

### Checkpoint B

- [ ] Targets and scope controls pass; existing tests, lint, formatting, and typecheck pass.

- [ ] **Task 5: Template and lifecycle invalidation**
  - Acceptance: Append/removal/reordering/root replacement, child arrival, component replacement/type/rebind, saved setters/child callbacks, deletion/recreation, engine/ID changes, and subscription cleanup retain current semantics.
  - Files: `test/integration/render-reactivity.test.mjs`, runtime fixes limited to the affected rendering helper.
  - Verify: `pnpm build && node --test test/integration/render-reactivity.test.mjs test/integration/surface-renderer.test.mjs test/integration/surface-subscriptions.test.mjs && node tasks/render-reactivity-baseline.mjs`.
  - Dependencies: Checkpoint B.

- [ ] **Task 6: Measurements and consumer documentation**
  - Acceptance: Seven-case three-run before/after proof and attempt ledger recorded. Existing guides and unreleased changelog explain automatic skips and full-scope limits without device FPS claims.
  - Files: `tasks/render-reactivity-measurements.md`, `README.md`, `docs/catalogs.md`, `docs/architecture.md`, `CHANGELOG.md`.
  - Verify: Same measurement harness, documentation assertions, targeted Prettier, `git diff --check`.
  - Dependencies: Task 5.

### Checkpoint C

- [ ] Repeated targets pass; correctness and measurement limits are documented.

- [ ] **Task 7: Package verification and completion records**
  - Acceptance: All required gates and packed Expo/bare iOS/Android checks pass; public exports unchanged; module records and handoff updated after review.
  - Files: `SPEC-render-reactivity.md`, `tasks/render-reactivity-plan.md`, this tracker, `CAPABILITY-MAP.md`, `HANDOFF.md`.
  - Verify: `pnpm build && pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm example:check && pnpm pack:check && pnpm consumer:smoke`; module-document Prettier and links; `git diff --check`.
  - Dependencies: Checkpoint C. Fix failures in focused slices before completion.

### Checkpoint D

- [ ] All spec criteria and package gates pass; verified slices committed for review.
