# Tasks: React Surface API

**Module id:** `react-surface-api`

**Spec:** [SPEC-react-surface-api.md](../SPEC-react-surface-api.md)

**Plan:** [react-surface-api-plan.md](react-surface-api-plan.md)

**Status:** Complete on `codex/native-core` on 2026-10-14 after approval with “ok start.”

Follow dependency order on `codex/native-core` and commit each verified slice. Add meaningful failing tests before behavior changes, then implement and record evidence below. Preserve the historical initial-release `tasks/plan.md` and `tasks/todo.md`. Each task's file scope excludes its small evidence update in this tracker.

## Phase A: Engine ownership

- [x] **Task 1: Rename the private context reader**
  - Acceptance: The private context reader becomes `useA2UIEngineContext`; internal imports follow it. Existing public context hooks and provider-backed rendering retain their contracts. No new root export is introduced in this refactor.
  - Verify: `pnpm build && pnpm typecheck && node --test test/integration/convenience-renderer.test.mjs test/integration/surface-renderer.test.mjs test/integration/surface-subscriptions.test.mjs`; `git diff --check`.
  - Files: `src/react/A2UIProvider.tsx`, `src/react/hooks.ts`, `src/react/A2UISurface.tsx`.
  - Dependencies: Approved task list. Scope: Medium.
  - Evidence: Private reader renamed across provider, hooks, and surface. Build, typecheck, and all 19 focused integration tests pass; public contracts are unchanged.

- [x] **Task 2: Add the public engine hook**
  - Acceptance: Root-exported `useA2UIEngine` accepts `A2UIEngineOptions` and returns a stable owned engine through the shared lifecycle helper. Separate mounted instances have independent state. Latest action/error callbacks are used without resetting state; initial limits are passed to the engine.
  - Verify: Add failing hook/type cases first; `pnpm build && pnpm typecheck && node --test test/integration/engine-hook.test.mjs test/integration/convenience-renderer.test.mjs`; inspect emitted hook declarations.
  - Files: `src/react/useA2UIEngine.ts`, `src/react/useStableEngine.ts`, `src/index.ts`, `test/integration/engine-hook.test.mjs`, `test/types/engine.ts`.
  - Dependencies: Task 1. Scope: Medium.
  - Evidence: Missing root export failed first. The public hook now shares engine ownership with the renderer. All 10 focused hook/convenience tests, build, typecheck, and lint pass; declarations expose `useA2UIEngine(options: A2UIEngineOptions): A2UIEngine`.

- [x] **Task 3: Verify construction settings and final cleanup**
  - Acceptance: Equivalent inline catalog/limit containers pass, while changed catalog identities/order/count or effective limits throw clear configuration errors. Initial settings are copied so container mutation cannot conceal changes. Strict Mode replay preserves usable state; final unmount releases state/subscriptions and disposes once. External renderer engines remain usable after unmount.
  - Verify: Add failing cases first; `pnpm build && pnpm typecheck && node --test test/integration/engine-hook.test.mjs test/integration/convenience-renderer.test.mjs`; `pnpm lint`; `git diff --check`.
  - Files: `src/react/useStableEngine.ts`, `test/integration/engine-hook.test.mjs`, `test/integration/convenience-renderer.test.mjs`.
  - Dependencies: Task 2. Scope: Medium.
  - Evidence: Six configuration cases failed before the fix. Initial catalogs are copied and effective limits are compared; errors name the public hook. All 19 hook/convenience tests pass, including actual Strict Mode effect replay, usable retained state, final released state, and external-engine survival. A guard prevents duplicate deferred disposal. Engine freezing prevents a disposal-method spy, so lifecycle tests assert public state rather than changing engine immutability. Build, typecheck, and lint pass.

### Checkpoint A: Ownership ready

- [x] Hook and existing convenience tests pass; callbacks, configuration, and ownership match the spec.
- [x] `pnpm typecheck`, `pnpm lint`, and `git diff --check` pass; generated root declarations expose the hook.

## Phase B: Placement and renderer props

- [x] **Task 4: Support direct-engine surface placement**
  - Acceptance: `A2UISurface.engine` is optional; explicit-engine surfaces work without an outer provider and give their presenters the selected engine's context. Provider-only surfaces retain behavior. Pending root/child, resolved content, structured fallback, absent surface, and deletion agree in both paths; no external engine is disposed.
  - Verify: Add failing direct placement/context/type cases first; `pnpm build && pnpm typecheck && node --test test/integration/surface-renderer.test.mjs test/integration/surface-subscriptions.test.mjs`.
  - Files: `src/react/A2UISurface.tsx`, `test/integration/surface-renderer.test.mjs`, `test/types/renderer.tsx`.
  - Dependencies: Checkpoint A. Scope: Medium.
  - Evidence: Direct placement failed without a provider before implementation. A wrapper now supplies explicit engine context to all presenters. Lifecycle parity tests cover both wire versions, pending roots/children, fallback/recovery, deletion, and external-engine survival. Tests also reproduced an existing pending-error rerender gap; a private per-surface error subscription now updates fallback even when the accepted snapshot is unchanged. All 15 focused tests, build, typecheck, and lint pass.

- [x] **Task 5: Verify source changes and recovery**
  - Acceptance: Switching the direct engine or surface ID observes the new snapshot and releases the old subscription. An explicit engine takes precedence over a different outer provider. Old presenter failures clear when source identity changes, including equal surface revisions; later updates from the old source cannot replace new content.
  - Verify: Add failing source-switch cases first; `pnpm build && pnpm typecheck && node --test test/integration/surface-renderer.test.mjs test/integration/surface-subscriptions.test.mjs test/integration/diagnostics.test.mjs`; `git diff --check`.
  - Files: `src/react/A2UISurface.tsx`, `test/integration/surface-renderer.test.mjs`, `test/integration/surface-subscriptions.test.mjs`.
  - Dependencies: Task 4. Scope: Medium.
  - Evidence: Equal-revision engine and surface-ID changes reproduced stale presenter fallbacks before the fix. A local boundary generation remounts failed presenter state on source identity changes. Explicit context precedence and subscription cleanup/old-source isolation pass. All 26 surface/subscription/diagnostics tests, build, typecheck, and lint pass.

- [x] **Task 6: Make external renderer messages optional**
  - Acceptance: External-engine renderer props may omit `messages` and observe imperative engine updates without ingestion or replay on unrelated rerenders. Owned mode still requires messages; external mode still rejects catalog/callback props. Existing append/replay behavior, including empty/omitted collection transitions, is preserved.
  - Verify: Add failing integration/type cases first; `pnpm build && pnpm typecheck && node --test test/integration/convenience-renderer.test.mjs`; `git diff --check`.
  - Files: `src/react/A2UIRenderer.tsx`, `test/integration/convenience-renderer.test.mjs`, `test/types/renderer.tsx`.
  - Dependencies: Task 5. Scope: Medium.
  - Evidence: Omitted-message tests failed before normalization to a stable empty collection. Imperative updates, unrelated rerenders, and empty transitions now pass; types still require owned messages and reject mixed configuration. API reference updated early to satisfy the existing root-export documentation gate. The full checkpoint also caught and corrected an extra render on rejected updates without weakening its assertion. All 169 tests, typecheck, lint, and formatting pass.

### Checkpoint B: Public React flow ready

- [x] Provider and direct-engine surface paths behave consistently; source switching and error recovery pass.
- [x] `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm format:check` pass with retained collection behavior and public type constraints.

## Phase C: Consumer adoption

- [x] **Task 7: Adopt the API in native consumers**
  - Acceptance: Expo showcase uses the hook, ingests initial fixtures in an effect guarded against Strict Mode replay, retains app-owned simulated-source cancellation, and omits dummy messages. The packed bare fixture imports and exercises the hook/direct-engine surface flow. Consumer setup introduces no dependency or transport.
  - Verify: `pnpm build && pnpm example:check`; typecheck the bare fixture through `pnpm consumer:smoke` at the final checkpoint; inspect initialization and cancellation effects.
  - Files: `example/expo/src/components/renderer-showcase.tsx`, `test/fixtures/bare-consumer/index.tsx`.
  - Dependencies: Checkpoint B. Scope: Small.
  - Evidence: Expo showcase uses the public hook and omitted external messages; initial fixtures apply in a guarded effect and source cancellation stays app-owned. Bare fixture uses the public hook/direct surface flow with guarded fixture ingestion. Build and Expo typecheck/lint pass; packed fixture checks run at Checkpoint D.

- [x] **Task 8: Document the complete React stream flow**
  - Acceptance: README, public API, and streaming guide show hook-owned lifetime and direct one-surface placement with an app-owned subscription returning unsubscribe. Examples cover latest callbacks, stable construction settings, keyed remounts, placement ownership, and provider-based inspection. Type fixtures compile the documented API usage.
  - Verify: `pnpm typecheck && pnpm exec prettier --check README.md docs/api.md docs/streaming-and-actions.md test/types/guides.tsx`; inspect examples against emitted declarations.
  - Files: `README.md`, `docs/api.md`, `docs/streaming-and-actions.md`, `test/types/guides.tsx`.
  - Dependencies: Task 7. Scope: Medium.
  - Evidence: README and streaming guide show hook-owned lifetime, direct placement, unsubscribe cleanup, shared transcript ownership, stable settings, latest callbacks, and explicit-engine alternatives. The API reference was completed during Task 6. Guide type fixtures compile the complete source-to-transcript flow. Typecheck and existing documentation assertions pass; targeted formatting is clean.

- [x] **Task 9: Record adoption and migration guidance**
  - Acceptance: Migration docs and unreleased changelog explain the additive APIs and retained provider/collection entry points. Documentation assertions match the public API. Package version/license remain unchanged.
  - Verify: `pnpm build && node --test test/unit/documentation.test.mjs && pnpm exec prettier --check docs/migration.md CHANGELOG.md test/unit/documentation.test.mjs`; `git diff --check`.
  - Files: `docs/migration.md`, `CHANGELOG.md`, `test/unit/documentation.test.mjs`.
  - Dependencies: Task 8. Scope: Medium.
  - Evidence: Migration guide explains hook ownership, source cleanup, direct/provider placement, callback updates, construction settings, and optional external messages; unreleased changelog records APIs and recovered fallback behavior. Existing public-export and documentation assertions pass, and targeted formatting/diff checks are clean. No new documentation-only tests were needed.

### Checkpoint C: Consumer examples ready

- [x] Example checks and guide type fixtures pass; stream examples include cleanup and app-owned placement.
- [x] Documentation accurately describes callback updates, configuration changes, and hook-owned versus application-owned disposal.

## Phase D: Final verification

- [x] **Task 10: Verify the package and complete module records**
  - Acceptance: Required package gates pass and packed Expo/bare consumers typecheck and bundle for iOS/Android using the new API. Declarations match documented root exports. Review the implementation against every spec success criterion; record results and mark the module complete only when verified.
  - Verify: `pnpm build && pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm example:check && pnpm pack:check && pnpm consumer:smoke`; `pnpm exec prettier --check SPEC-react-surface-api.md tasks/react-surface-api-plan.md tasks/react-surface-api-todo.md HANDOFF.md CAPABILITY-MAP.md`; `git diff --check`.
  - Files: `SPEC-react-surface-api.md`, `tasks/react-surface-api-plan.md`, `tasks/react-surface-api-todo.md`, `HANDOFF.md`, `CAPABILITY-MAP.md`.
  - Dependencies: Checkpoint C. Scope: Medium. If verification reveals a code defect, fix it in a focused slice and rerun the affected gates before recording completion.
  - Evidence: Build, typecheck, lint, formatting, all 169 tests, Expo example checks, and tarball verification pass. The tarball contains 160 files and is 97,743 bytes. Packed Expo and bare consumers typecheck and bundle for iOS/Android with the new hook/direct placement APIs; existing bundle isolation checks pass. Sandbox registry DNS failed on the first smoke attempt; the same required check passed with approved network access. Generated declarations match all three agreed public changes. Final correctness/architecture/security/performance review found no outstanding issue; two fallback/recovery bugs and the presenter stability regression were fixed with passing regression tests. No runtime dependency, protocol, package-version, or license change was introduced by this module.

### Checkpoint D: Module complete

- [x] All approved spec success criteria pass; tests and consumer results are recorded.
- [x] Packed native bundles use the public API and retain existing dependency isolation checks. Bundle checks are distinguished from device interaction tests.
- [x] Final diff and records are reviewed; every verified slice is committed on `codex/native-core`, ready for human review.

## Review decisions

The user approved the spec with “ok continue,” the plan with “next move,” and the task list with “ok start” on 2026-10-14. The scope adds only the three agreed public conveniences; components, source subscriptions, and transcript placement remain app-owned.
