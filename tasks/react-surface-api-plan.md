# Implementation Plan: React Surface API

**Module id:** `react-surface-api`

**Specification:** [SPEC-react-surface-api.md](../SPEC-react-surface-api.md)

**Status:** Approved for task breakdown on 2026-10-14 with “next move.”

Use the established per-module records on `codex/native-core`. The historical `tasks/plan.md` and `tasks/todo.md` remain historical records. The [module task list](react-surface-api-todo.md) contains the separately reviewed task breakdown.

## Outcome

A mounted React Native feature can use `useA2UIEngine(options)` to manage engine lifetime, apply messages through the existing engine methods, and place one `A2UISurface` with an explicit engine. An external-engine `A2UIRenderer` no longer requires a dummy message array. Existing collection and provider flows continue to work.

## Architecture decisions

### 1. Share the existing engine lifetime implementation

Extend `src/react/useStableEngine.ts` rather than creating a second ownership mechanism. Add `src/react/useA2UIEngine.ts` as a thin public hook accepting `A2UIEngineOptions` and returning `A2UIEngine`; export it through `src/index.ts`. It always creates and owns an engine. `A2UIRenderer` continues to use the shared mechanism for its existing owned/external modes.

Support `limits` for the public hook using `resolveA2UIResourceLimits`. Store resolved limits and a copied catalog list at creation, then compare catalog identities/order and effective limit values on subsequent renders. Equivalent inline arrays and limit objects must pass; changed construction settings must fail clearly. Copying initial construction settings prevents a caller-mutated array or object from disguising a change.

Keep callback forwarding through the existing latest-callback mechanism. Guard final disposal so Strict Mode effect replay keeps the engine usable and multiple scheduled cleanup checks do not call disposal more than once. Verify engine usability, retained state, and released subscriptions through public behavior, using a dispose spy only for the ownership count.

Preserve existing `A2UIRenderer` configuration error behavior. Hook errors should name `useA2UIEngine` so consumers know which configuration to fix.

### 2. Distinguish the public creation hook from the private context reader

The current `useA2UIEngine` in `A2UIProvider.tsx` is a private context reader, not a root export. Rename that private function to `useA2UIEngineContext` and update its internal imports before adding the new public creation hook. Public snapshot/error/ID hooks retain their current signatures and provider requirements.

This small internal rename should be a separate verified slice, avoiding ambiguity between creating an engine and reading context. No deep import becomes public.

### 3. Supply context for direct-engine surfaces

Split `A2UISurface` into its exported memoized placement wrapper and private rendering content. When the optional `engine` prop exists, the wrapper mounts `A2UIProvider` around that content. Otherwise, the content reads the existing nearest provider. The same content and subscriptions handle both paths.

This makes explicit-engine precedence apply consistently to the surface and any app presenter using the existing context hooks. The wrapper never creates or disposes an engine. Engine or surface-ID changes must release old subscriptions and observe the new source. Ensure a presenter failure from the old source does not survive a switch merely because both surfaces have the same revision; include engine and surface identity in the local error-boundary reset behavior.

Retain all current pending, fallback, diagnostics, absent-surface, and deletion behavior. Test direct placement without a provider, direct placement inside a different provider, and switching sources with equal revisions.

### 4. Keep omitted messages equivalent to an empty collection

Move `messages` out of the common renderer props: require it in owned-engine mode and make it optional in external-engine mode. Normalize omission to one module-level readonly empty array before the existing message effect. Retain the current append/replay algorithm and forbidden mixed configurations.

Omission does not ingest a message when external engine state updates. Explicit-message to omitted-message transitions follow the existing empty-array behavior. Reintroducing a collection follows the existing collection replay rules; this is not a new deduplication policy.

### 5. Exercise the API through the existing Expo showcase

Replace the showcase's engine initializer and manual disposal with `useA2UIEngine`. Move initial fixture ingestion out of React render and into an effect guarded against Strict Mode replay. Keep stream-run cancellation cleanup in the app because it owns the simulated source. Remove `NO_MESSAGES` and use the external renderer without messages.

The showcase demonstrates hook ownership and imperative updates; the complete one-surface transcript pattern belongs in README and streaming documentation. Update a packed bare-consumer fixture to import and typecheck the hook/direct-engine surface flow as well, so native smoke checks exercise the new root export.

### 6. Document which entry point fits each use

Show collection rendering with `A2UIRenderer`, React-owned live ingestion with `useA2UIEngine` plus direct `A2UISurface`, and explicit engine/provider ownership when several components inspect engine state. Include stream unsubscribe cleanup, app-owned placement, callback updates, stable catalogs/limits, and keyed remounts for configuration changes.

Update README, public API, streaming guide, migration notes, and unreleased changelog in focused documentation slices. No version or license decision is part of this module.

## Dependency graph and delivery order

```text
Private context-reader rename
  -> public engine hook and shared lifetime/configuration checks
  -> direct-engine surface placement
  -> external renderer messages optional
  -> Expo and packed consumer usage
  -> documentation and full verification
```

Each behavior slice adds focused failing tests before implementation and leaves the build and typecheck passing. Direct placement and optional messages could be developed independently once the shared engine helper is stable, but delivery will remain sequential on the requested branch.

## Phases and checkpoints

### Phase A: React engine ownership

- Rename the private context reader without changing its behavior.
- Add the public creation hook and extend shared configuration/lifetime handling.
- Verify stable identity, independent instances, current callbacks, effective limits, changed configuration, Strict Mode replay, and final cleanup.

**Checkpoint A:** Existing convenience renderer tests and new hook tests pass; public types expose the hook with `A2UIEngineOptions`.

### Phase B: Surface placement and renderer props

- Add the direct-engine surface wrapper and verify its context/subscription behavior.
- Make external renderer messages optional while preserving collection ingestion.

**Checkpoint B:** Provider and direct-engine rendering agree on pending/resolved/error/deleted states. Equal-revision source changes recover correctly. Owned mode still requires messages, and mixed external configuration remains rejected by types.

### Phase C: Consumer usage and documentation

- Update the Expo showcase and packed bare-consumer fixture.
- Document stream registration/cleanup and one-surface placement, including lifecycle and configuration rules.

**Checkpoint C:** Example checks pass and documentation shows a complete React integration with app-owned source and views.

### Phase D: Package verification and handoff

- Run the required package and consumer gates.
- Inspect emitted declarations and packed native entry usage, review the final diff against the spec, and update module records and handoff.

**Checkpoint D:** All success criteria pass; record test counts and consumer results before the final module commit.

## Verification

Focused commands after the corresponding behavior slices:

```sh
pnpm build
node --test test/integration/engine-hook.test.mjs test/integration/convenience-renderer.test.mjs
node --test test/integration/surface-renderer.test.mjs test/integration/surface-subscriptions.test.mjs
pnpm typecheck
git diff --check
```

The new hook test file is introduced during implementation. Run existing relevant tests after the private rename. At completion run:

```sh
pnpm build
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm example:check
pnpm pack:check
pnpm consumer:smoke
git diff --check
```

The smoke checks bundle packed Expo and bare React Native consumers for iOS and Android; they are bundle checks, not device interaction tests. No test threshold or existing assertion is weakened.

## Risks and mitigations

| Risk                                                | Effect                                       | Mitigation                                                                                  |
| --------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Strict Mode cleanup disposes an active engine       | Messages stop updating the mounted UI        | Test effect replay and retained state; defer final cleanup and guard disposal count.        |
| Mutable or freshly allocated construction options   | Missed configuration changes or false errors | Copy initial catalogs and compare normalized limit values, not container identities.        |
| Direct engine differs from the surrounding provider | Presenters read the wrong engine             | Provide the explicit engine around the full rendering subtree and test presenter context.   |
| Switching sources preserves an old presenter error  | New surface stays in fallback                | Test equal revisions and reset the local boundary on engine/surface identity changes.       |
| Optional messages alters replay semantics           | Duplicate operations or lost updates         | Use a stable empty sentinel and retain the existing append/replay implementation and tests. |
| Showcase initialization runs during render or twice | Duplicate create errors in development       | Move ingestion to a guarded effect; test Strict Mode ownership before consumer updates.     |

## Task-list handoff

After plan approval, split delivery into tasks of roughly five files or fewer in `tasks/react-surface-api-todo.md`, with acceptance criteria, exact focused verification commands, dependencies, and checkpoints. Separate internal renaming, hook implementation, integration coverage, direct placement, renderer props, consumer updates, and documentation as needed to keep each commit reviewable. The task list receives its own review before implementation under the requested spec-driven workflow.
