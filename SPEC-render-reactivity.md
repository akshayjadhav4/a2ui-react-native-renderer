# Spec: Render Reactivity

**Module id:** `render-reactivity` in [CAPABILITY-MAP.md](CAPABILITY-MAP.md)

**Status:** Draft for review on 2026-10-14. Runtime implementation follows spec, plan, and task-list review.

## Assumptions

1. The goal is to reduce unnecessary catalog presenter calls within one surface using the existing public API. Apps should receive this improvement without adding selectors, component flags, or renderer settings.
2. A presenter may observe resolved props, identifiers, `scope.path`, the full `scope.value`, child rendering, actions, React state, and app context. The optimization must preserve all of these inputs and behaviors.
3. An unchanged bound string does not mean an unchanged presenter input when its scope value changes. Root-scoped presenters may rerender after any root-model change; template siblings offer more precise scope boundaries.
4. Presenter-call counts are the primary deterministic metric for this module. Device FPS or frame-time claims require separate device measurements and are outside this acceptance contract.
5. Existing v0.9/v0.9.1 validation, snapshot revisions, subscriptions, bindings, functions, error recovery, and React API behavior remain supported. Version and licensing work stays deferred.

## Objective

Keep unchanged presenter instances stable during accepted updates to other
components or template items in the same A2UI surface. A changed input must
still render promptly; reducing calls must never hide data, pending children,
errors, action context, or writable binding changes.

No new public API is proposed. App-owned catalogs, components, and transport
continue to work as they do today.

## Measured gap

The reproducible [measurement record](tasks/render-reactivity-measurements.md)
and [harness](tasks/render-reactivity-baseline.mjs) establish the baseline on
the completed React API implementation:

- Editing one of three template item names invokes the root and all three
  item presenters, although two item scope values retain their references.
- Editing an unrelated field outside those item scopes also invokes all four
  presenters.
- Editing one of 499 template names invokes all 500 presenters. The proposed
  target is the root plus the changed item, or two calls.
- Replacing one static child definition invokes the parent and both children,
  although the other child's component and scope values are unchanged.

Each baseline case ran three times with identical counts. The adapter currently
passes each new full surface snapshot through the tree; prop resolution,
generated setters, and child callbacks are tied to that snapshot.

## Behavior contract

### Preserve observable presenter inputs

Skip a healthy presenter only when its definition, component identity and
scope, resolved values, binding capabilities, and rendering services remain
equivalent. Scope values must remain current. A change to an unbound field
inside a template item's scope must still update a presenter that reads that
field through `scope.value`.

Keep stable generated setter and child-callback identities where their
capabilities remain unchanged. A skipped ancestor must still allow an updated
or newly arrived child to render. An ancestor's saved `renderChild` service must
use current child state; it must not retain an obsolete surface snapshot.

Maintain the actual presenter as a React component. Its local state and app
context changes must continue to render even if protocol-derived inputs are
unchanged. The renderer must not call presenters outside React or infer that a
presenter ignores scope or context.

### Invalidation and correctness

1. Accepted remote data updates and valid local setter writes follow the same
   render rules. Relative/absolute bindings, escaped paths, nested setters,
   and missing values retain their existing semantics.
2. A component replacement, type change, rebind, scope change, or source-engine
   change invalidates the affected presenter and its stale services. Saved
   setters must still fail after replacement, rebind, or surface deletion.
3. Template append, removal, reordering, root-model replacement, and item
   replacement update every affected position using the current positional
   JSON-pointer scopes. No semantic item key is invented.
4. Changes to an absolute binding outside an item's relative scope still reach
   that item. Relative scope equality alone is insufficient for skipping.
5. Consumer functions continue to evaluate with current arguments and error
   handling on accepted surface updates. This module introduces no function
   purity requirement or caching based solely on unchanged arguments. Changed
   function results and corrections after a function/binding error must render.
6. Progressive child arrival, root readiness, error fallbacks, and deletion
   remain observable after ancestor skips. Presenter error boundaries retain
   recovery on accepted updates; failed presenters may retry even when healthy
   peers can be preserved.
7. Existing surface/engine subscribers still receive the same committed
   revisions and batch notifications. No protocol operation is dropped because
   its resolved display value appears equal.

### Measurable targets

For the existing measurement fixtures in ordinary rendering, require these
post-update presenter-call maximums:

| Fixture                                      | Baseline | Target |
| -------------------------------------------- | -------: | -----: |
| One of three relative template items changes |        4 |      2 |
| Field outside three item scopes changes      |        4 |      1 |
| Local setter edits one of three items        |        4 |      2 |
| Unbound field in one item scope changes      |        4 |      2 |
| One static child definition is replaced      |        3 |      1 |
| One of 499 relative template items changes   |      500 |      2 |

The root-scoped absolute-sibling fixture may retain all three calls because
its full scope value changes. Initial rendering must still produce all required
presenters. These are limits on protocol-driven calls for the specified
fixtures, not limits on React Strict Mode, app-context, or local-state renders.

Do not claim O(1) resolution or notifications from these counts. Internal
selection, validation, and resolution work may remain proportional to mounted
nodes. Record that work separately if an implementation adds a new performance
claim. Keep changes only when the measured targets and correctness tests pass.

## Scope boundaries

- **In scope:** Internal presenter/node reactivity, stable services, safe
  invalidation, deterministic before/after measurements, regression coverage,
  and documentation of the scope boundary.
- **Deferred:** Public selector APIs, component dependency flags, dependency
  tracking proxies, function memoization, virtualized lists, device profiling,
  and the separate `consumer-tooling` module.
- **Excluded:** Changes to wire semantics, public presenter inputs, app-owned
  catalog policy, transports, dependencies, Basic Catalog, version, license,
  publishing, or weakened correctness/performance tests.

## Tech stack and project structure

- TypeScript 6, the existing React/React Native peer contracts, and Zod 3.
- `src/rendering/presenterAdapter.tsx` owns node resolution and presenter
  services; `src/react/` owns placement and external-store integration.
- `src/protocol/v0_9/resolveProps.ts` and binding utilities supply existing value
  and setter semantics. Any internal adjustment must preserve their public
  behavior and error checks.
- `test/integration/` holds deterministic render and behavior tests;
  `test/unit/` retains protocol validation. `tasks/render-reactivity-measurements.md`
  records attempts. README and `docs/` explain guarantees and limits.

## Commands

Run from the repository root:

```sh
pnpm build
node tasks/render-reactivity-baseline.mjs
node --test test/integration/performance-renderer.test.mjs test/integration/bound-presenter.test.mjs test/integration/surface-subscriptions.test.mjs
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm example:check
pnpm pack:check
pnpm consumer:smoke
git diff --check
```

## Code style

Keep the existing immutable snapshots, `A2UI` names, strict TypeScript, and
double quotes. Treat the full scope as an input when comparing a presenter:

```ts
const scopeValue = readDataPointer(surface.dataModel, scopePath);
// An unchanged bound label does not justify ignoring changed scope data.
const scopeUnchanged = Object.is(previous.scopeValue, scopeValue);
```

Use the smallest internal mechanism that meets the measurements. Avoid global
component caches or full-model JSON serialization for equality. Preserve all
function-valued services and their invalidation rules in comparisons.

## Testing strategy

1. Turn the measured targets into failing integration cases before runtime
   changes. Verify output and engine state alongside counts; run the identical
   harness before/after and log kept/reverted attempts.
2. Cover both wire versions and provider, direct-engine, and convenience
   rendering. Preserve existing unrelated-surface render guarantees.
3. Add scope-only reads, external absolute bindings, nested/escaped paths,
   generated setter identity, stale setters, and local writes. Test template
   append/removal/reordering and root-model replacement for correct scopes.
4. Test child arrival/definition replacement under preserved parents, type
   changes, deletion/recreation, and engine/surface-ID changes without stale
   closures or subscriptions.
5. Verify changed function results and binding/function/presenter failures
   recover. Verify app context and presenter local state still render.
6. Use exact call-count checks on deterministic fixtures, not machine-dependent
   timing thresholds. Run all required package and packed native gates before
   declaring completion; bundle checks do not establish device FPS.

## Boundaries

- **Always:** Measure before and after, preserve every observable input and
  protocol update, retain immutable current state, record attempts, and test
  stale-service/error recovery paths.
- **Ask first:** Add a public API, alter scope/function semantics, add a
  dependency, change resource limits, or expand into virtualization/device work.
- **Never:** Ignore changed scope values, cache arbitrary consumer functions
  as if pure, capture old child state to skip parents, suppress context/state
  renders, weaken existing tests, or promise native FPS from JS call counts.

## Success criteria

1. All six target fixtures meet the specified maximum presenter counts in
   repeated runs with correct output/data and no unexpected errors.
2. Scope reads, bindings, setters, functions, children, actions, React context,
   state, errors, and lifecycle tests preserve current semantics.
3. Before/after results and optimization decisions are reproducible and
   recorded, with clear limits on claims about internal work or device speed.
4. Apps receive the improvement through their existing API and catalog.
5. Required package checks, examples, and packed native consumer gates pass.

## Review decision

Review the safe scope-based targets and the proposal to keep this module
entirely internal before planning. Narrower root-field rendering would require
a separate explicit dependency contract rather than silently ignoring scope.
