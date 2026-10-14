# Implementation Plan: Render Reactivity

**Module id:** `render-reactivity`

**Spec:** [SPEC-render-reactivity.md](../SPEC-render-reactivity.md)

**Measurements:** [render-reactivity-measurements.md](render-reactivity-measurements.md)

**Status:** Approved with implementation authorized on 2026-10-14: “ok approve start work.”

Use the established per-module records on `codex/native-core`. After plan
approval, create `tasks/render-reactivity-todo.md` for the separately reviewed
task breakdown. Preserve historical `tasks/plan.md` and `tasks/todo.md`.

## Outcome

Unchanged template items and static component peers preserve their presenter
instances during updates to other nodes in the same surface. The existing
499-item fixture should move from 500 presenter calls to at most two after one
item edit. Scope data, actions, functions, pending children, errors, and local
React behavior stay current through the existing public API.

## Architecture decisions

### 1. Establish failing count and correctness tests first

Promote the six target fixtures into integration assertions in the same
measurable slice that changes node/presenter rendering, before writing that
slice's runtime changes.
Preserve the root-scoped fixture as a control: changing its full scope still
permits all three calls. Use the existing harness unchanged for before/after
measurements, retaining its final-output and engine-error assertions.

Add correctness cases alongside each mechanism rather than accepting count
reduction alone. The initial implementation may still resolve every mounted
node after each surface change. This plan promises presenter-call reduction,
not constant-time notifications or prop resolution.

### 2. Give each mounted node current surface state

Change the private `A2UIComponentNode` input from a full `surface` snapshot to
`surfaceId`, keeping its engine, component ID, scope path, recovery, and pending
callback inputs. Each mounted node subscribes to `engine.subscribeSurface` and
reads the same immutable `engine.getSurface` snapshot through
`useSyncExternalStore`. Update the private root-node call in `A2UISurface`.

This uses the existing engine store and notification contract. No component
store, protocol selector API, per-path event bus, or public hook is introduced.
The snapshot getter stays cheap and pure; it must not resolve props, evaluate
functions, allocate a fresh selected object, or report errors. Nodes may still
receive each accepted surface revision, even when their presenters can skip.

Make `renderChild` stable over engine, surface ID, caller scope, recovery, and
pending callback. It creates a child node with identifiers instead of capturing
the caller's surface snapshot. Thus an existing child receives new state even
when its parent presenter is preserved. A saved callback used in a later render
or local interaction creates a node that observes current state as well.

Keep the node's hooks unconditional when a surface disappears; return `null`
for a retired surface. Preserve pending versus invalid-reference behavior for
missing component IDs. Subscriptions must follow source changes and be released
on unmount. The existing surface wrapper continues to own root readiness and
source-identity boundary resets.

### 3. Keep binding services stable with explicit ownership

Extract the current setter write validation into a private node-owned helper
if needed for readability. Give each node a setter cache scoped to its engine,
surface ID, source component snapshot, and scope path. Reset that cache whenever
any owner changes. Every setter descriptor includes its nested property path,
wire binding path, resolved data path, and dynamic kind; an unchanged descriptor
can reuse the same function.

Add a private optional setter factory to the existing prop resolver, preserving
its default behavior for callers that do not supply one. The node's factory
returns stable callbacks for identical descriptors. The callback reads the
current engine state when invoked, validates its value, verifies the original
component identity and binding still match, then delegates to existing
`setDataValue`. It must not capture a data-model snapshot.

This cache is per mounted node and contains only that component's current
writable properties. Rebind/replacement/scope/source changes discard it. Saved
old setters retain their existing stale-write checks; cache reuse never grants
them access to a new component or pointer. Functions remain ordinary resolved
values with no generated setter.

### 4. Preserve healthy presenters after safe input comparison

Add a private memoized presenter host that creates the actual catalog presenter
as a React child component. It does not call the presenter as an ordinary
function. Compare the host's source component/definition, identifiers, full
scope path/value, resolved props, and `renderChild`/`dispatch` service identities.
Keep diagnostic/pending policy changes observable through the corresponding
services and boundary props.

Compare scope values with `Object.is`; do not inspect scope usage or ignore
unbound scope fields. For resolved props, compare primitives and functions by
`Object.is` and recursively compare arrays and ordinary property records.
Include own-key sets and distinguish missing fields from explicit `undefined`.
Use conservative inequality for unsupported object kinds, cyclic structures,
or comparison-budget exhaustion. Never serialize the full model to compare it,
and never treat unrelated functions as interchangeable. Add focused tests for
the equality helper's edge cases if extracting it.

The stable setters make function equality meaningful. Current resolution can
still build new nested prop containers; equal ordinary values should not force
a healthy presenter call solely because a container was allocated again.
Component replacement forces invalidation even when its resolved values match.

Retain per-node error boundaries outside the memoized healthy presenter host.
They still observe accepted surface revisions, so a previously failed presenter
can remount and retry. A healthy presenter can preserve its child output while
the boundary observes a new revision. Verify React state and app context updates
reach actual presenters independently of the host comparison.

### 5. Continue resolution and function evaluation before skipping

Keep prop resolution keyed by the current immutable surface snapshot. When an
accepted surface revision changes, resolve values and function calls normally,
then decide whether healthy presenter inputs changed. Do not cache functions
by arguments or scope: the package does not enforce purity. An absolute binding
outside a template scope must also be resolved from the current full model.

Resolution failures still use the existing structured error channel and fallback
path. Reporting an error does not change the accepted surface snapshot; keep
resolution/error-effect dependencies stable on that snapshot to avoid a report
loop. Corrected data or function results must leave fallback and render again.
Dispatch already reads current engine state; preserve that action behavior.

### 6. Measure the mechanism and retain only verified changes

After each substantive optimization, run the same harness and record all seven
before/after cases in the measurement ledger, including unsuccessful attempts.
Promote targets to exact regression checks in ordinary rendering, with output
assertions and zero unexpected errors. The six target cases must meet the
approved maximums; the scope control must keep current semantics.

Validate both wire versions and all three React entry paths. Document the
automatic improvement and full-scope limitation without implying device FPS or
constant-time model work. Run packed native consumer checks and inspect the
public declarations to confirm no export or prop contract changed.

## Dependency graph and delivery order

```text
Baseline controls and tested private comparison/setter helpers
  -> failing target fixtures
  -> independent node subscriptions, stable services, and presenter host
  -> correctness matrix and repeated before/after proof
  -> documentation, package verification, completion records
```

Deliver these changes sequentially on the requested branch. Tests can be grouped
by mechanism during task breakdown; no parallel agent work is needed. Internal
refactors should be separately verified where practical, and every committed
slice must leave existing behavior tests passing.

## Phases and checkpoints

### Phase A: Tested private foundations

- Preserve baseline fixtures and existing performance controls.
- Add focused tests for conservative comparison and optional setter-factory
  support, retaining default resolver behavior. Keep these internal helpers
  small and prepare them for the immediately dependent rendering slice.

**Checkpoint A:** Private helpers are tested; existing resolution and binding
behavior passes. These preparatory helpers justify retention only as part of
the subsequent measured improvement, not as an optimization claim by themselves.

### Phase B: Presenter preservation

- Add failing target assertions, then implement independent node subscriptions,
  stable child/setter services, and the memoized presenter host as one complete
  rendering path. The helpers prepared in Phase A keep this slice focused.
- Test healthy skips, scope-only changes, external absolute bindings, current
  function results, React state/context, and recovery after failures.

**Checkpoint B:** All six targets pass with correct output; root-scoped control
retains its full-scope behavior; existing render and error tests stay green.

### Phase C: Lifecycle and proof

- Verify template insertion/removal/reordering, root replacement, component
  replacement/type/rebind, saved setters/child callbacks, action context,
  deletion/recreation, and source-engine/surface-ID changes.
- Repeat the seven-case harness and record the measured result of each attempt.

**Checkpoint C:** Both versions and provider/direct/convenience rendering pass;
before/after counts meet the spec without hiding invalidation or recovery.

### Phase D: Documentation and packed verification

- Explain automatic presenter preservation and scope limits in existing guides
  and the unreleased changelog.
- Run all required gates, inspect unchanged public declarations/exports, review
  the diff, and update spec/plan/tasks/capability-map/handoff records.

**Checkpoint D:** Required package and native bundle checks pass; metrics and
their limits are documented; all slices are committed for human review.

## Verification

Use focused failing tests before each behavior change. The task breakdown will
assign exact test files to each slice. Core commands are:

```sh
pnpm build
node tasks/render-reactivity-baseline.mjs
node --test test/integration/performance-renderer.test.mjs test/integration/bound-presenter.test.mjs test/integration/surface-subscriptions.test.mjs
node --test test/integration/surface-renderer.test.mjs test/integration/consumer-functions.test.mjs test/integration/diagnostics.test.mjs
pnpm typecheck
git diff --check
```

At completion run:

```sh
pnpm build
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm example:check
pnpm pack:check
pnpm consumer:smoke
pnpm exec prettier --check SPEC-render-reactivity.md tasks/render-reactivity-plan.md tasks/render-reactivity-todo.md tasks/render-reactivity-measurements.md tasks/render-reactivity-baseline.mjs HANDOFF.md CAPABILITY-MAP.md
git diff --check
```

Use the same non-Strict-Mode conditions and three-run count comparison as the
baseline. Native smoke checks verify packed type imports and iOS/Android
bundling in Expo/bare consumers, not device frame rates.

## Risks and mitigations

| Risk                                             | Effect                                           | Mitigation                                                                                              |
| ------------------------------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Parent preservation freezes descendants          | Changed or late children never appear            | Subscribe mounted child nodes directly and remove snapshot capture from `renderChild`.                  |
| Callback equality conceals a stale setter        | A saved callback writes the wrong path/component | Cache by owner and complete binding descriptor; retain live validation and stale-write tests.           |
| Scope equality ignores public data               | Scope-only presenters stop updating              | Compare full scope value identity and test unbound scope-field changes.                                 |
| Nested equality becomes lossy or expensive       | Incorrect skips, stack growth, or wasted work    | Compare supported ordinary structures conservatively, include functions/keys, and bound recursion/work. |
| Function caching assumes deterministic execution | Changed output or recovery is missed             | Resolve functions on current snapshot revisions before presenter comparison.                            |
| Memoization blocks presenter state/context       | App interaction or theme updates stop rendering  | Keep actual React component identity and test its state/context independently.                          |
| Error boundaries skip retries                    | A corrected presenter remains in fallback        | Keep accepted-revision recovery outside the healthy host and test unchanged-peer/error cases.           |
| Count improvements are overstated                | JS metrics are presented as device FPS           | Record counts and retain explicit limits on notification/resolution and native timing claims.           |

## Task-list handoff

After plan approval, create `tasks/render-reactivity-todo.md` with slices of
roughly five files or fewer, ordered dependencies, acceptance criteria,
failing-test steps, measurement commands, and checkpoints. Separate subscription
work and presenter preservation in a complete measurable slice after tested
private helper preparation. Split safety matrices and docs separately as
needed. Keep incomplete count tests within their corresponding active
implementation slice; never commit a failing suite or disable assertions to
land preparatory work. Obtain task-list review before runtime implementation.
