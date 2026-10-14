# Tasks: Consumer Tooling

**Module id:** `consumer-tooling`

**Spec:** [SPEC-consumer-tooling.md](../SPEC-consumer-tooling.md)

**Plan:** [consumer-tooling-plan.md](consumer-tooling-plan.md)

**Status:** Approved and implemented on 2026-10-14 following the user’s “approve move”. All thirteen tasks and four checkpoints are complete; see [verification](consumer-tooling-verification.md).

Use the existing `codex/native-core` branch, with verified incremental commits.
Historical `tasks/plan.md` and `tasks/todo.md` remain untouched. Each task lists
up to five anticipated implementation files; update this record with evidence
as work completes. Checkpoint reviews must use actual test results, not merely
the presence of implementation files.

## Phase A: Optional Test Harness

- [x] **Task 1: Add the native-free testing entry**
  - Acceptance: `createA2UITestHarness` constructs the real engine from catalogs/limits; its public contract exposes only `engine` and `getActions`. Headless ingestion, invalid messages, limits, independent instances, subscriptions, and disposal retain engine semantics. `/testing` builds and imports in plain Node, with no runtime import from the native root.
  - Verify: Add failing behavior/type cases first; `pnpm build && pnpm typecheck && pnpm lint && node --test test/unit/testing-harness.test.mjs`; inspect emitted imports and declarations.
  - Files: `src/testing.ts`, `package.json`, `test/unit/testing-harness.test.mjs`, `test/types/testing.ts`.
  - Dependencies: Approved task list. Scope: Medium.
  - Evidence: Missing-entry test failed before implementation. All three headless tests, build, typecheck, and lint pass; the built entry imports in plain Node.

- [x] **Task 2: Exercise mounted bindings and action recording**
  - Acceptance: App-owned test presenters mounted through `A2UISurface` update a writable binding and dispatch a real action. The harness records ordered action payloads; returned arrays are frozen and remain unchanged after later dispatches. Unmount/dispose cleanup runs even on assertion failure.
  - Verify: `pnpm build && node --test test/integration/testing-harness.test.mjs test/integration/presenter-action.test.mjs test/integration/bound-presenter.test.mjs`; write action/snapshot assertions before adjusting the harness.
  - Files: `test/integration/testing-harness.test.mjs`, `src/testing.ts` if a demonstrated behavior failure needs correction.
  - Dependencies: Task 1. Scope: Small.
  - Evidence: Mounted binding writes and action dispatch preserve latest context, timestamps and ordering; frozen list snapshots remain detached and malformed actions are not recorded. All focused integration tests pass.

- [x] **Task 3: Prove packed entry availability and bundle isolation**
  - Acceptance: Pack checks require the testing entry/declarations/export. The installed tarball's `/testing` constructs an engine and ingests a fixture in plain Node. A harness-only sentinel is absent from normal Expo/bare native bundles; existing exporter/web-runtime exclusions remain intact.
  - Verify: `pnpm pack:check && pnpm consumer:smoke`; inspect changes to pack allowlists and bundle assertions. Do not merely test a source-relative import.
  - Files: `scripts/pack-check.mjs`, `scripts/consumer-smoke.mjs`, `src/testing.ts` if needed for a stable harness-only identifier.
  - Dependencies: Task 2. Scope: Medium.
  - Evidence: Pack check and packed Node ingestion passed; Expo/bare iOS/Android bundles exclude the harness sentinel (two verified smoke runs).

### Checkpoint A: Harness Consumer Path

- [x] Harness behavior/type checks pass; mounted actions use real renderer semantics.
- [x] Packed Node import and Expo/bare iOS/Android bundle isolation pass.
- [x] Review public entry against the spec; no test runner or runtime dependency was added.

## Phase B: Shared Contract and Local Producer

- [x] **Task 4: Share example schemas without native imports**
  - Acceptance: The catalog ID and four schema definitions come from a checked native-free factory receiving Zod/common schemas. Expo attaches the existing presenters with retained prop inference. The module lives in Expo source so isolated consumer copies resolve its JSDoc types without a sibling dependency installation.
  - Verify: `pnpm build && pnpm example:check`; a Node import/type fixture verifies the factory without native presenters; `pnpm consumer:smoke` verifies sibling-path resolution through the installed tarball.
  - Files: `example/expo/src/catalog-contract.mjs`, `example/expo/src/catalog.tsx`, `scripts/consumer-smoke.mjs`, `test/unit/demo-contract.test.mjs`; optionally `example/expo/src/catalog-contract.d.mts` if inference requires it.
  - Dependencies: Checkpoint A. Scope: Medium.
  - Evidence: A packed consumer reproduced unresolved sibling JSDoc imports. Moving the native-free factory into Expo source fixed resolution without type suppression; example type/lint, shared-contract test, and packed consumers pass.

- [x] **Task 5: Validate progressive demo messages against shared schemas**
  - Acceptance: Native-free v0.9.1 fixtures cover pending root, pending children, ready interactive form, action response, invalid-update recovery, and deletion. Real-engine tests use the shared schema factory; resolved props and the writable input/action are exercised through test-owned presenters without a second catalog definition.
  - Verify: `pnpm build && node --test test/integration/demo-fixtures.test.mjs test/unit/demo-contract.test.mjs`; assert intermediate snapshots and rendered props, not only final readiness.
  - Files: `example/server/fixtures.mjs`, `test/integration/demo-fixtures.test.mjs`, `test/integration/helpers/demo-catalog.mjs`.
  - Dependencies: Task 4. Scope: Medium.
  - Evidence: Fixture test first failed for the missing module; progressive pending rendering, writable input/action, response, invalid-update recovery, and deletion now pass against shared schemas.

- [x] **Task 6: Stream fixtures through an actual socket**
  - Acceptance: Private `a2ui-demo-server` adds only pinned `ws@8.22.0` and updates the workspace lockfile. A server factory supports ephemeral ports, independent sessions, ordered progressive frames and a validated submit-action response. Existing renderer package dependencies remain unchanged.
  - Verify: Install through `pnpm install`; `pnpm build && node --test test/integration/demo-server.test.mjs`; use real sockets and the harness/shared-schema test catalog for a mounted action round trip, with bounded awaits and unconditional cleanup.
  - Files: `example/server/package.json`, `pnpm-lock.yaml`, `example/server/server.mjs`, `test/integration/demo-server.test.mjs`.
  - Dependencies: Task 5. Scope: Medium.
  - Evidence: Real localhost socket tests pass with ephemeral ports and a mounted writable input/action round trip. Lockfile retains pre-existing transitive versions; only the private server adds ws@8.22.0.

- [x] **Task 7: Complete producer recovery, input handling, and shutdown**
  - Acceptance: Recovery sends a rejected A2UI update followed by a valid update; deletion cancels scheduled sends. Malformed JSON, binary/oversized frames, invalid commands/actions, and duplicate start cannot crash the process. Disconnect/shutdown cancel timers and close sockets, with two-client isolation. CLI startup supports documented host/port settings and signal cleanup.
  - Verify: Add failing lifecycle/input cases before implementation; `pnpm build && node --test test/integration/demo-server.test.mjs`; launch `pnpm --filter a2ui-demo-server start`, verify readiness, then terminate and confirm exit.
  - Files: `example/server/server.mjs`, `example/server/start.mjs`, `example/server/package.json`, `test/integration/demo-server.test.mjs`.
  - Dependencies: Task 6. Scope: Medium.
  - Evidence: All four socket tests pass, covering invalid JSON/binary/oversized frames, duplicate start, bad actions, two clients, recovery, deletion, timer cancellation and shutdown. The documented pnpm start command and SIGTERM cleanup were exercised. Localhost listening requires sandbox escalation; no tests were skipped.

### Checkpoint B: Real Network Producer

- [x] Shared schemas retain Expo types and packed sibling-path resolution.
- [x] Actual socket tests prove progressive frames, mounted action/response, recovery, deletion, client isolation, and cleanup.
- [x] Review dependency and transport ownership; server modules/dependencies stay outside renderer consumers.

## Phase C: Expo Network Consumer

- [x] **Task 8: Add an app-owned socket lifecycle adapter**
  - Acceptance: The example adapter uses the built-in WebSocket via an injectable factory, forwards raw A2UI objects, distinguishes demo/parse/transport errors, and guards sends. Retirement marks the connection inactive before detaching handlers and closing; retained queued callbacks cannot deliver to a retired session. No adapter API is exported by the renderer.
  - Verify: `node --test test/unit/demo-connection.test.mjs`; cover constructor/send failures, malformed/binary frames, open/error/close transitions, cleanup, and retained callbacks with a minimal fake socket. Run `pnpm example:check` for adapter typing.
  - Files: `example/expo/src/demo-connection.mjs`, `test/unit/demo-connection.test.mjs`; optionally an example-only declaration if required for checked types.
  - Dependencies: Checkpoint B. Scope: Medium.
  - Evidence: Missing-module test failed first. Three adapter tests now pass for message/error handling, send failures, constructor/close failures, and retained callback isolation; Expo type/lint checks pass.

- [x] **Task 9: Add the interactive network screen**
  - Acceptance: The Expo app offers an explicit fixture/network choice. Configured endpoint, connection state, transport/renderer errors, last action, app-owned pending UI, and connect/disconnect/recover/delete controls are visible. Each connection has a fresh keyed hook-owned engine; effects retire sockets on unmount and actions use the current open connection.
  - Verify: `pnpm build && pnpm example:check && pnpm example:export`; inspect hook/effect ownership and disabled control states. Run manual network interaction if a simulator/device is available and record exactly what was performed.
  - Files: `example/expo/src/components/network-demo.tsx`, `example/expo/src/app/index.tsx`, `example/expo/src/demo-connection.mjs` if integration reveals a demonstrated issue.
  - Dependencies: Task 8. Scope: Medium.
  - Evidence: Native stack navigation exposes a separate network screen. Example type/lint and iOS/Android exports pass; keyed session and effect/socket cleanup reviewed. Physical-device interaction has not been performed.

### Checkpoint C: Complete Example Flow

- [x] Example type/lint and iOS/Android exports pass, with fixture showcase retained.
- [x] Connection lifecycle regression tests pass; manual device evidence is separated from bundle evidence.
- [x] Review copyable integration: component catalog, socket lifetime, placement and errors are app-owned.

## Phase D: Adoption and Completion

- [x] **Task 10: Document consumer testing**
  - Acceptance: Testing guide includes headless ingestion and a mounted presenter binding/action example, own-runner assertions, cleanup, frozen action-array semantics, and explicit render-time validation limits. API/README link the optional entry; compiled fixtures use published import paths.
  - Verify: `pnpm typecheck && node --test test/unit/documentation.test.mjs`; targeted Prettier check for changed files and inspection against emitted declarations.
  - Files: `docs/testing.md`, `docs/api.md`, `README.md`, `test/types/testing.ts`, `test/unit/documentation.test.mjs` only if an existing documentation assertion needs extending.
  - Dependencies: Checkpoint C. Scope: Medium.
  - Evidence: Headless and mounted guide examples documented; actual mounted snippet compiles through public package imports. API/README links and existing documentation assertions pass. A separate type fixture was added to compile the complete snippet.

- [x] **Task 11: Document runnable streaming and backend substitution**
  - Acceptance: Example README and streaming guide contain exact producer/Expo commands, public endpoint configuration, host/emulator/device address guidance, and any development network configuration actually required. Explain demo envelopes and replacing the deterministic producer with an app backend. Compile relevant renderer examples; record manual verification limitations honestly.
  - Verify: `pnpm typecheck && pnpm example:check`; targeted Prettier check. Exercise the documented server start command and check Expo startup configuration. Verify platform-specific networking claims against official sources before documenting them.
  - Files: `example/expo/README.md`, `docs/streaming-and-actions.md`, `test/types/guides.tsx`, `example/server/README.md` if separate server instructions improve clarity.
  - Dependencies: Task 10. Scope: Medium.
  - Evidence: Network setup, host/emulator/device endpoints, transport envelopes, backend substitution and cleanup documented with official sources. Producer startup/signal cleanup passed; simulator inventory has no booted devices and adb lists none. Expo startup verification is recorded at final checkpoint.

- [x] **Task 12: Review and verify the complete package**
  - Acceptance: All spec success criteria have recorded evidence. Existing test gates, example exports, pack checks, and packed Expo/bare iOS/Android consumers pass; no public API expansion, dependency leak, lowered test bar, version/license change, or publication occurs. Record any unavailable device verification without claiming it passed.
  - Verify: `pnpm build && pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm example:check && pnpm example:export && pnpm pack:check && pnpm consumer:smoke`; explicit Prettier check of example `.mjs` modules, server files, and module records; `git diff --check`. Review the accumulated diff before marking complete; repair any finding in its own focused slice with concrete verification.
  - Files: `tasks/consumer-tooling-verification.md` (evidence); any demonstrated fix must be separately scoped before editing.
  - Dependencies: Task 11. Scope: Small for evidence; fixes scoped independently.
  - Evidence: All 212 tests pass with no skips; build/type/lint/format, example iOS/Android exports, pack and final isolated consumer checks pass. Author review found no remaining blocking issue. No device interaction was claimed.

- [x] **Task 13: Complete migration records**
  - Acceptance: The capability map marks all seven modules implemented; handoff, approved spec/plan status, and unreleased changelog accurately describe the tooling and network example. This task list records results and verified commits; release/version/license decisions remain deferred.
  - Verify: `pnpm exec prettier --check CAPABILITY-MAP.md HANDOFF.md SPEC-consumer-tooling.md tasks/consumer-tooling-plan.md tasks/consumer-tooling-todo.md tasks/consumer-tooling-verification.md CHANGELOG.md`; `git diff --check`; confirm a clean branch after committing.
  - Files: `CAPABILITY-MAP.md`, `HANDOFF.md`, `SPEC-consumer-tooling.md`, `tasks/consumer-tooling-plan.md`, `CHANGELOG.md`; task-list evidence is updated throughout the module.
  - Dependencies: Task 12. Scope: Medium.
  - Evidence: Capability map, handoff, spec/plan/task records and unreleased changelog updated. Module record formatting and diff checks pass; version/license and local branch ownership remain unchanged.

### Checkpoint D: Module Complete

- [x] Every task and spec success criterion has evidence; accumulated diff reviewed.
- [x] All required package, example, and consumer checks pass.
- [x] Migration records are current; branch remains `codex/native-core`, with no release or licensing action.

## Implementation Authorization

The user approved the task list with “approve move” on 2026-10-14.
Implementation proceeded in verified slices using the existing branch. The
[verification record](consumer-tooling-verification.md) covers test results,
corrections, author review, and practical limitations. Human review of the
completed work remains available; no merge or release is implied.
