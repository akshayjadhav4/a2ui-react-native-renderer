# Implementation Plan: Progressive Surfaces

**Module id:** `progressive-surfaces`

**Specification:** [SPEC-progressive-surfaces.md](../SPEC-progressive-surfaces.md)

**Status:** Approved for task breakdown on 2026-10-04 when the user said “start next.” No implementation has started.

The initial-release [plan.md](plan.md) and [todo.md](todo.md) contain historical unchecked checkpoints, so this module uses its own plan and [progressive-surfaces-todo.md](progressive-surfaces-todo.md). The completed wire-compatibility and binding-semantics records remain intact.

## Outcome

An app can apply valid A2UI component updates before or after `root`, render available subtrees immediately, inspect unresolved structural child IDs, and show its own pending UI. Missing data remains `undefined` for the app presenter. Invalid updates stay atomic and report structured errors. The public API adds only `A2UIComponentIdSchema`, `A2UISurfaceSnapshot.pendingComponentIds`, and an optional `renderPending` callback on both React entry points.

## Architecture decisions

### 1. Reuse the current surface and validator

The protocol core remains the only component store. `validateComponentUpdate` continues to merge and validate a candidate graph before commit. It will stop requiring `root` and stop rejecting an absent structural child. It will still reject malformed definitions, duplicate batch IDs, unknown types, invalid binding paths, known cycles, excessive known depth, too many defined components, and too many distinct unresolved IDs. An unresolved child does not add a level to known depth; a later definition can make the completed graph too deep and be rejected. A failed candidate never changes the stored graph or revision.

The validator will return the accepted components and their deterministic reachable pending-ID list together. It already discovers structural edges, so it can derive pending state without a second schema walk in the core. Reject empty structural child IDs immediately; only a nonempty missing ID can be pending.

### 2. Distinguish single-child IDs from child lists

`A2UIComponentIdSchema` will be a tagged, nonempty Zod string. The schema inspector will identify it as a distinct internal `COMPONENT_ID` behavior. Validation records a graph edge for its string value. Prop resolution leaves the string unchanged so the presenter can call `renderChild(props.child)` directly. Existing `STRUCTURAL` behavior continues to resolve `A2UIChildListSchema` to `A2UIResolvedChild[]`. An ordinary `z.string()` stays static and creates no graph edge.

This distinction applies recursively to nested objects and arrays. Optional or nullable wrappers should preserve the marker only for present string values. Existing child-list template behavior and scope paths remain unchanged.

### 3. Derive pending state from the accepted graph

`createSurface` starts with frozen `pendingComponentIds: ["root"]`. After each accepted component update, the core sets `rootId` from whether `components.root` exists and computes the pending list from references reachable from `root`. Traverse structural references in stable schema/list order and record each absent ID once, at first encounter. If `root` is absent, expose only `["root"]`, even when pre-root components have unresolved references. The validator separately counts distinct unresolved IDs across the whole stored graph for the resource limit.

A successful pre-root update advances the surface revision and notifies its subscribers. A later definition changes the pending list and causes the normal surface subscription to rerender. Existing `updateDataModel` changes preserve the component pending list identity because component reachability has not changed. Deletion drops all buffered and pending state.

### 4. Render pending positions at the React boundary

`A2UISurface` calls `renderPending` for a created surface without `root`; before `createSurface`, it retains the current absent-surface behavior. `A2UIRenderer` passes the same optional callback to each surface. At a presenter-requested child position, the adapter checks the snapshot's validated reachable pending IDs: a listed missing child calls `renderPending`, and a missing ID outside that list retains `INVALID_REFERENCE`. The callback defaults to `null`. This uses the existing presenter recursion and error boundary; it adds no package-owned visual component.

Each pending callback occurrence is independent, even if multiple parents reference one unresolved ID. The snapshot list remains deduplicated for inspection. Data bindings do not call this callback; a presenter sees `undefined` and may render its own loading state.

### 5. Keep error reporting transport-neutral

Actual validation failures continue through `A2UIRendererError`, `onError`, and `engine.getErrors()`. No pending reference emits an error. Documentation will show an app mapping relevant errors to agent feedback through its own transport, without a package network API. The older `INVALID_ROOT` code remains in the public error union for compatibility even though a missing root alone no longer emits it.

## Dependency graph and delivery order

```text
Baseline streaming and graph tests
  -> single-child schema marker and graph-edge interpretation
  -> pending graph validation with known-edge safety checks
  -> protocol core snapshot and lifecycle state
  -> React pending root/child rendering
  -> end-to-end recovery and data-binding checks
  -> migration docs and packed native consumer proof
```

The first vertical slice will prove an accepted pre-root definition later renders when `root` arrives. The second will prove root-first child placeholders and replacement. Error and resource-limit cases follow each slice rather than being postponed to the end. Each slice should leave the package buildable and its focused tests passing.

## Phases and checkpoints

### Phase A: Structural contract

- Capture the current rejection behavior in focused tests, then change those expectations to the approved pending contract.
- Add and type-check the public single-child schema marker. Confirm a marked string is a graph edge and stays a string in presenter props; an unmarked string remains literal.

**Checkpoint A:** Graph extraction handles child lists, single IDs, nested schemas, and ordinary strings without changing existing binding or template behavior.

### Phase B: Protocol state

- Accept pre-root and unresolved-child batches while retaining atomic validation of known components and edges.
- Add deterministic, frozen pending IDs and correct `rootId` transitions to surface snapshots. Verify revisions, subscriptions, deletion/recreation, and both protocol versions.

**Checkpoint B:** Child-first and root-first message sequences converge to the same complete graph. A late cycle, depth violation, or excess pending count is rejected without mutating the previous snapshot; a subsequent corrective message succeeds.

### Phase C: React rendering

- Add the optional pending callback to `A2UISurface` and pass it through `A2UIRenderer`.
- Render an app-owned placeholder at a pending root or child position; render available siblings; replace placeholders when definitions arrive. Keep invalid arbitrary `renderChild` IDs on the existing error path.

**Checkpoint C:** Pending references produce no errors, callbacks receive exact IDs/kinds, default rendering omits only missing positions, and existing presenter fallback behavior remains intact.

### Phase D: Migration and package proof

- Update README, API/catalog/streaming/migration/error docs, changelog, and doc assertions that currently say progressive references are unsupported. Show a small app-owned loading example and explain that an absent data path is `undefined`.
- Run the complete package gates and packed Expo/bare React Native consumer smoke builds. Inspect declarations and package contents for the new public contract and no new dependencies.

**Checkpoint D:** All approved spec success criteria pass in both protocol versions, including streaming order, recovery, bindings, and native consumer builds.

## Verification

Use red tests or type fixtures before behavior changes in each slice. Focused Node tests run against built output:

```sh
pnpm build
node --test test/unit/schema-behavior.test.mjs test/unit/validation.test.mjs test/unit/core-components.test.mjs
node --test test/integration/surface-renderer.test.mjs test/integration/convenience-renderer.test.mjs test/integration/bound-presenter.test.mjs
pnpm typecheck
```

At module completion run:

```sh
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm pack:check
pnpm consumer:smoke
git diff --check
```

Also inspect the generated declaration for `A2UIComponentIdSchema`, `pendingComponentIds`, and both `renderPending` props, and confirm `package.json` still has no new runtime dependency. Existing 500-component and multi-surface tests provide baseline performance and isolation coverage; only add a benchmark if they expose a concrete regression.

## Risks and mitigations

| Risk                                                       | Effect                                  | Mitigation                                                                                                                              |
| ---------------------------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Single-child IDs accidentally resolve like child lists     | Presenter receives wrong type           | Use a distinct `COMPONENT_ID` behavior and a public type fixture before rendering work.                                                 |
| Missing IDs hide a real presenter mistake                  | Silent blank UI                         | Only IDs in the validated reachable pending list use `renderPending`; arbitrary missing `renderChild` calls retain `INVALID_REFERENCE`. |
| Late definitions create a cycle or excessive depth         | Recursive render or resource exhaustion | Validate all known graph edges before commit, including buffered unreachable components; test late completion and recovery.             |
| Unreachable pending references accumulate                  | Memory growth                           | Count distinct unresolved IDs across the entire candidate graph against `maxComponentsPerSurface`; test the boundary.                   |
| New pending list triggers unnecessary rerenders            | Performance regression                  | Freeze and reuse unchanged lists for data updates; retain existing surface subscriptions and 500-component test.                        |
| Changed missing-reference behavior surprises current users | Migration confusion                     | Document the old errors and new pending states, including app-owned loading and timeout policy.                                         |

## Task-list handoff

The [module task list](progressive-surfaces-todo.md) contains focused tasks of no more than about five likely files each, explicit acceptance and verification steps, dependencies, and checkpoints A–D. The historical `tasks/plan.md` and `tasks/todo.md` remain untouched.

## Review decisions

The user approved the plan by saying “start next” on 2026-10-04. It uses the exact public API approved in the spec, including a separate `COMPONENT_ID` schema behavior that keeps single-child presenter props as strings while recording graph edges. No new public API, dependency, transport, or package-owned UI is proposed.
