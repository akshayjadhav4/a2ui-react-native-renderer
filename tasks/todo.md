# Tasks: a2ui-react-native-renderer

This checklist is the execution view of `tasks/plan.md`. Tasks are ordered by
dependency. Each task must be implemented, verified, committed, and checked off
before the next task begins.

## Phase 1: Publishable Skeleton

- [x] **Task 1: Scaffold the JavaScript library**
  - Acceptance: Strict TypeScript package builds with Bob and exports only a
    placeholder public entry point.
  - Acceptance: Package is still private and `npm pack --dry-run` contains only
    intended skeleton files.
  - Verify: `pnpm build && pnpm typecheck && pnpm lint && pnpm pack:check`
  - Likely files: `package.json`, `tsconfig.json`, `bob.config.js`,
    `src/index.ts`, `.gitignore`
  - Dependencies: None
  - Scope: Medium
  - Evidence: `pnpm release:check` passes. The dry-run package contains nine
    intended files: license, README, package metadata, ESM output, source maps,
    and declarations.

- [x] **Task 2: Define catalog and error contracts**
  - Acceptance: Consumer Zod schemas infer presenter props through
    `defineA2UIComponent` and `defineA2UICatalog`.
  - Acceptance: Empty/duplicate catalog definitions and invalid type fixtures
    fail deterministically.
  - Verify: `pnpm test && pnpm typecheck`
  - Likely files: `src/catalog/types.ts`, `src/catalog/defineCatalog.ts`,
    `src/errors/types.ts`, `test/unit/catalog.test.ts`, `test/types/catalog.tsx`
  - Dependencies: Task 1
  - Scope: Medium
  - Evidence: Six Node runtime tests pass. Type fixtures verify schema inference
    for helper-based and inline catalog definitions and reject invalid props and
    function return values.

### Checkpoint 1: Contracts

- [x] Build, typecheck, lint, catalog tests, and package inspection pass.
- [x] Generated declarations expose no unintended internal types.
- [x] Human approves the initial public catalog contract.

## Phase 2: Smallest End-To-End Renderer

- [x] **Task 3: Implement the minimal v0.9 engine path**
  - Acceptance: Official `createSurface` and `updateComponents` messages create
    one readable surface snapshot.
  - Acceptance: Invalid messages report structured errors and engine instances
    remain isolated.
  - Verify: `pnpm test && pnpm typecheck`
  - Likely files: `src/engine/engine.ts`, `src/engine/types.ts`,
    `src/protocol/v0_9/adapter.ts`, `src/types/messages.ts`,
    `test/unit/engine-minimal.test.ts`
  - Dependencies: Task 2
  - Scope: Medium
  - Evidence: Seven focused engine tests cover valid surface creation, stable
    snapshots, batch notifications, malformed input, unsupported versions,
    unknown and duplicate catalogs, and instance isolation.

- [x] **Task 4: Render one consumer component**
  - Acceptance: A test-only consumer presenter renders resolved props from the
    Task 3 surface.
  - Acceptance: Provider, catalog, and component failures remain contained and
    actionable.
  - Verify: `pnpm test -- surface-renderer && pnpm typecheck`
  - Likely files: `src/react/A2UIProvider.tsx`,
    `src/react/A2UISurface.tsx`, `src/rendering/presenterAdapter.tsx`,
    `src/react/hooks.ts`, `test/integration/surface-renderer.test.tsx`
  - Dependencies: Task 3
  - Scope: Medium
  - Evidence: Six integration tests cover validated consumer presenters,
    reactive surface updates, streaming surfaces awaiting their root, missing
    providers, unknown components, and invalid presenter props.

- [x] **Task 5: Add the simple `A2UIRenderer`**
  - Acceptance: One component owns a stable engine and renders active surfaces
    from a message collection.
  - Acceptance: Unchanged messages are not reapplied during React rerenders.
  - Verify: `pnpm test -- convenience-renderer && pnpm typecheck`
  - Likely files: `src/react/A2UIRenderer.tsx`, `src/react/useStableEngine.ts`,
    `src/index.ts`, `test/integration/convenience-renderer.test.tsx`
  - Dependencies: Task 4
  - Scope: Medium
  - Evidence: Five convenience-renderer tests cover the README API, stable
    message application, cumulative append updates, and current action/error
    callbacks without engine replacement. Type fixtures enforce owned versus
    external engine configuration.

### Checkpoint 2: First Usable Vertical Slice

- [x] Simple and advanced README-level examples compile and render.
- [x] Build, lint, typecheck, and focused tests pass.
- [x] Human verifies the package API remains smaller than the current app
      package.

## Phase 3: Complete Protocol Runtime

- [x] **Task 6: Complete surface lifecycle**
  - Acceptance: Multiple surfaces independently create, update, change roots,
    and delete.
  - Acceptance: Unrelated surface subscribers are not notified.
  - Verify: `pnpm test -- surface-lifecycle`
  - Likely files: `src/engine/engine.ts`, `src/engine/snapshot.ts`,
    `src/protocol/v0_9/adapter.ts`, `test/unit/surface-lifecycle.test.ts`,
    `test/integration/surface-subscriptions.test.tsx`
  - Dependencies: Task 5
  - Scope: Medium
  - Evidence: Five unit tests verify independent creation, incremental
    replacement, root type replacement, deletion, and recreation. Three React
    integration tests verify deletion output, presenter switching, and that an
    update does not rerender unrelated surfaces in either public API.

- [x] **Task 7: Add data models and bindings**
  - Acceptance: Literal, absolute, relative, escaped, array, update, and delete
    binding scenarios resolve correctly.
  - Acceptance: Template scope preserves both value and JSON pointer context.
  - Verify: `pnpm test -- bindings`
  - Likely files: `src/protocol/v0_9/bindings.ts`,
    `src/rendering/presenterAdapter.tsx`, `src/engine/engine.ts`,
    `test/unit/bindings.test.ts`, `test/integration/bound-presenter.test.tsx`
  - Dependencies: Task 6
  - Scope: Medium
  - Evidence: Nine unit tests cover RFC 6901 decoding, immutable object and
    array updates, deletion, root replacement, structural child paths, and
    per-surface model lifecycle. Four React integration tests cover absolute,
    escaped, updated, deleted, relative template, scope-value, and two-way
    binding behavior. Public type tests verify generated bound-value setters.

- [x] **Task 8: Add user action dispatch**
  - Acceptance: Presenter dispatch produces one official action with context
    resolved from the current surface model.
  - Acceptance: Updated callbacks are used without engine recreation and data
    cannot cross surfaces.
  - Verify: `pnpm test -- actions`
  - Likely files: `src/engine/actions.ts`, `src/engine/engine.ts`,
    `src/rendering/presenterAdapter.tsx`, `test/unit/actions.test.ts`,
    `test/integration/presenter-action.test.tsx`
  - Dependencies: Task 7
  - Scope: Medium
  - Evidence: Three unit tests verify official action construction, current,
    relative, absolute, and escaped context resolution, and malformed/local
    action rejection. Three React integration tests verify dispatch-time model
    reads, strict surface isolation, and contained presenter errors. Existing
    convenience-renderer coverage verifies updated callbacks without engine
    recreation, and public type tests enforce `A2UIActionSchema` dispatch.

- [x] **Task 9: Add consumer functions**
  - Acceptance: Consumer-defined functions evaluate with schema-validated
    arguments and no built-ins are bundled.
  - Acceptance: Unknown or failing functions produce contained structured
    errors.
  - Verify: `pnpm test -- functions`
  - Likely files: `src/catalog/defineFunction.ts`,
    `src/protocol/v0_9/functions.ts`, `src/errors/normalizeError.ts`,
    `test/unit/functions.test.ts`
  - Dependencies: Task 7
  - Scope: Medium
  - Evidence: Five focused unit tests cover schema-validated arguments, data
    bindings, nested calls, absent built-ins, thrown implementations, return
    validation, and frozen structured results. Five React integration tests
    cover reactive presenter values, function-derived event context, local
    action isolation, and structured presenter/action failures.

### Checkpoint 3: Protocol Behavior

- [ ] Lifecycle, bindings, actions, and functions pass official fixture tests.
- [x] Import boundary checks find no Expo, transport, chat, or app dependency.
  - Evidence: Source scan finds no TanStack, Hono, AG-UI, Expo Router,
    application runtime, or SSE imports.
- [ ] Human verifies behavior before hardening changes begin.

## Phase 4: Hardening

- [x] **Task 10: Add graph and resource validation**
  - Acceptance: Invalid roots, duplicate IDs, references, cycles, schemas, and
    configured limits reject the affected update with documented error codes.
  - Acceptance: Invalid updates preserve the last valid revision.
  - Verify: `pnpm test -- validation && pnpm test:coverage`
  - Likely files: `src/validation/validateMessages.ts`,
    `src/validation/validateGraph.ts`, `src/validation/limits.ts`,
    `src/engine/engine.ts`, `test/unit/validation.test.ts`
  - Dependencies: Tasks 8-9
  - Scope: Medium
  - Evidence: Thirteen validation tests cover configuration, UTF-8 sizing,
    batch and data limits, valid graphs, duplicate and missing IDs, roots,
    schemas, unknown components, references, cycles, dynamic and structural
    pointers, depth, atomic recovery, mixed-surface batches, and invalid
    lifecycle transitions. The full 74-test suite and coverage run pass.

- [x] **Task 11: Add diagnostics and production recovery**
  - Acceptance: Presenter and surface failures cannot escape React boundaries.
  - Acceptance: Development diagnostics are safe and production emits errors
    without showing internal details.
  - Verify: `pnpm test -- diagnostics`
  - Likely files: `src/errors/ErrorBoundary.tsx`,
    `src/errors/DevelopmentFallback.tsx`, `src/react/A2UISurface.tsx`,
    `src/engine/errors.ts`, `test/integration/diagnostics.test.tsx`
  - Dependencies: Task 10
  - Scope: Medium
  - Evidence: Eight diagnostics tests cover sanitized output, mode selection,
    reset behavior, invalid initial surfaces, production silence, convenience
    rendering, component-local containment, and recovery after a valid revision.
    The full 82-test suite, 94.42% line coverage, 90.30% branch coverage, and
    npm package dry run pass.

- [x] **Task 12: Harden subscriptions and render performance**
  - Acceptance: Snapshots remain referentially stable and unrelated surfaces do
    not rerender.
  - Acceptance: A 500-component fixture completes without stack overflow or
    crash.
  - Verify: `pnpm test -- performance && pnpm test:coverage`
  - Likely files: `src/engine/snapshot.ts`, `src/react/hooks.ts`,
    `src/rendering/treeRenderer.tsx`, `test/integration/rerenders.test.tsx`,
    `test/unit/stress.test.ts`
  - Dependencies: Task 11
  - Scope: Medium
  - Evidence: Four focused tests verify stable active/failed surface collection
    identities, identity changes only when membership changes, presenter
    isolation after an unrelated invalid surface update through both public
    APIs, and successful validation/rendering of a 500-component surface. The
    full 86-test suite passes with 94.66% line coverage and 90.62% branch
    coverage. The complete release check passes and the npm dry-run produces a
    55.0 kB package containing 117 intended files.

### Checkpoint 4: Runtime Release Candidate

- [x] Full tests and coverage gates pass.
- [x] Development and production error modes are verified independently.
- [ ] Human reviews performance evidence and public errors.

## Phase 5: Consumer And Distribution Proof

- [x] **Task 13: Build the Expo consumer example**
  - Acceptance: The example owns its complete fixture catalog and demonstrates
    simple rendering, streaming, actions, deletion, and errors.
  - Acceptance: iOS and Android exports bundle without workspace aliases.
  - Verify: `pnpm example:export`
  - Likely files: `example/expo/package.json`, `example/expo/app/index.tsx`,
    `example/expo/src/catalog.tsx`, `example/expo/src/fixtures.ts`,
    root workspace config
  - Dependencies: Task 12
  - Scope: Medium
  - Evidence: An Expo SDK 57 / React Native 0.86 app imports the built package
    through its public workspace dependency and owns four Zod-backed native
    presenters. Its fixtures demonstrate simple and staged streaming surfaces,
    two-way binding, official actions, deletion, contained invalid components,
    and recovery. TypeScript, Expo lint, all 18 Expo Doctor checks, and explicit
    iOS and Android production exports pass without Metro source aliases.

- [x] **Task 14: Verify the packed package as a consumer**
  - Acceptance: Expo and bare React Native smoke consumers install the tarball,
    resolve declarations, and bundle both platforms.
  - Acceptance: Package inspection finds no local paths or unpublished files.
  - Verify: `pnpm pack:check && pnpm example:export`
  - Likely files: `scripts/pack-check.mjs`, `scripts/consumer-smoke.mjs`,
    `package.json`, `test/fixtures/bare-consumer/package.json`
  - Dependencies: Task 13
  - Scope: Medium
  - Evidence: `pack:check` creates and extracts the real npm tarball, permits
    only `lib`, license, README, and package metadata, verifies every public
    entrypoint, and rejects local dependency specifiers, symlinks, and absolute
    repository paths. `consumer:smoke` installs that tarball into isolated
    temporary Expo SDK 57 and bare React Native 0.86 consumers, confirms the
    installed package cannot resolve to workspace source, typechecks both, and
    produces iOS and Android bundles through Expo and bare Metro.

- [x] **Task 15: Complete documentation**
  - Acceptance: Every public export and limitation is documented with compiling
    examples.
  - Acceptance: Concepts, architecture, streaming, catalog, error, migration,
    contribution, and security docs match implementation.
  - Verify: `pnpm typecheck && pnpm release:check`
  - Likely files: `README.md`, `docs/concepts.md`, `docs/architecture.md`,
    `docs/catalogs.md`, `docs/errors.md`
  - Dependencies: Task 14
  - Scope: Medium, split into separate documentation commits if needed
  - Evidence: README onboarding and advanced-placement examples compile as
    strict consumer type fixtures. Focused API, architecture, catalog,
    streaming/action, diagnostics/security, migration, and contribution guides
    document every package-root export and the v0.9/no-bundled-catalog boundary.
    Documentation contract tests pass, the packed artifact includes all linked
    guides, and the complete release check passes with 88 tests plus isolated
    Expo and bare React Native iOS/Android bundles.

### Checkpoint 5: Package Candidate

- [x] Fresh consumer instructions work against the tarball.
  - Evidence: The inspected 128-file tarball installs into isolated Expo SDK 57
    and bare React Native 0.86 consumers; strict typechecks and both platform
    bundles pass.
- [x] Documentation and generated declarations agree.
  - Evidence: Type fixtures compile README and guide examples, and a contract
    test requires every root export to appear in `docs/api.md`.
- [ ] Human reviews package contents and onboarding flow.

## Phase 6: Release Preparation And Publication

- [x] **Task 16: Defer hosted CI and release automation**
  - Decision: This is currently a single-maintainer reference package. Hosted
    CI, trusted publishing, and provenance are deferred until repository usage
    or outside contributions justify them.
  - Acceptance: No workflow or npm credential is added, and the complete local
    `release:check` remains the mandatory quality gate.
  - Evidence: The maintainer explicitly approved deferral on 2026-07-18. The
    repository contains no publish workflow or long-lived npm token.

- [ ] **Task 17: Prepare and approve npm publication**
  - Acceptance: Repository metadata, changelog, manual release policy, npm 2FA
    requirements, and package visibility are correct.
  - Acceptance: Version `0.1.0` publishes only after an explicit human approval.
  - Verify: `pnpm release:check`, manually inspect tarball, then verify
    `npm view a2ui-react-native-renderer` after approved publication.
  - Likely files: `package.json`, `CHANGELOG.md`, `RELEASING.md`
  - Dependencies: Task 15 and GitHub owner input
  - Scope: Medium
  - Preparation evidence: `CHANGELOG.md` and `RELEASING.md` document the manual
    release process; `prepublishOnly` requires an explicit approval variable,
    stable version, public package flag, repository metadata, matching dated
    changelog, clean worktree, and the complete local release gate.
  - Verification evidence: `pnpm release:check` passes 90 tests, verifies the
    128-file tarball, and builds isolated Expo SDK 57 and bare React Native 0.86
    consumers for iOS and Android.
  - Remaining approval gate: provide the final public GitHub URL, verify npm 2FA,
    approve version `0.1.0`, set `private` to `false`, and explicitly authorize
    publication. No package has been published.

### Checkpoint 6: Release

- [ ] All success criteria in `tasks/spec.md` pass.
- [ ] npm displays the correct public repository metadata.
- [x] npm provenance is explicitly deferred with hosted release automation.
- [ ] Manual publication is protected by npm 2FA.
- [ ] Registry installation works in a clean consumer application.

## Deferred Input

- [ ] Record the GitHub owner and final public repository URL before Task 17.
- [x] Recheck the npm package name immediately before release preparation.
  - Evidence: `pnpm view a2ui-react-native-renderer version --json` returned
    registry `E404` on 2026-07-18, so no published package currently uses the
    name. Availability is not reserved and must be checked again before publish.
