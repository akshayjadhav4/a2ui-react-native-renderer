# Spec: Progressive Surfaces

**Module id:** `progressive-surfaces` in [CAPABILITY-MAP.md](CAPABILITY-MAP.md)

**Status:** Approved for planning on 2026-10-04 when the user said “start work.” No implementation has started.

## Assumptions

1. The package continues to support both A2UI `v0.9` and `v0.9.1`, with app-owned catalogs, presenters, and transports. It will not ship a Basic Catalog, placeholder component, or network client.
2. An absent `root`, child component, or bound data path can mean “still streaming.” A2UI has no general end-of-stream marker that would let this renderer declare an unresolved reference permanently broken. This follows the [v0.9.1 protocol's incremental update rules](https://github.com/a2ui-project/a2ui/blob/main/specification/v0_9_1/docs/a2ui_protocol.md#component-definition-update) and [renderer guide](https://github.com/a2ui-project/a2ui/blob/main/docs/public/guides/renderer-development.md).
3. A surface becomes renderable as soon as its reserved `root` definition arrives. Available descendants render immediately; unresolved descendants render an optional app-owned placeholder or nothing. Components received before `root` remain buffered.
4. A missing data path continues to resolve to `undefined` as specified in [SPEC-binding-semantics.md](SPEC-binding-semantics.md). The presenter decides whether that means loading, empty, or another app-specific state.
5. A named schema marker is needed to distinguish a single child component ID from an ordinary string property. Adding a public `A2UIComponentIdSchema` is proposed here; existing `A2UIChildListSchema` continues to identify child lists.
6. The planned `0.2.0` release may add a readonly pending-ID snapshot field and an optional React placeholder callback. This spec does not change the current `0.1.1` package version or license.

## Objective

Let a React Native app display an A2UI surface while component definitions and data arrive in separate messages and in any order. The developer can supply their own loading treatment and receive structured errors for actual invalid messages. A valid pending reference must not break the surface or stop later messages from completing it.

The [A2UI v0.9.1 protocol](https://github.com/a2ui-project/a2ui/blob/main/specification/v0_9_1/docs/a2ui_protocol.md#component-definition-update) permits components to reference children or data that have not arrived. Its [renderer guide](https://github.com/a2ui-project/a2ui/blob/main/docs/public/guides/renderer-development.md) calls for buffering component definitions and rendering once `root` arrives. The protocol permits a placeholder or skipped missing child; this package proposes an app callback with a `null` default.

## Current gap

- `updateComponents` fails with `INVALID_ROOT` until a `root` definition exists, so children sent first cannot be buffered.
- Validation fails with `INVALID_REFERENCE` for an absent child, so a root sent before its children cannot render progressively.
- The snapshot and React API do not expose a pending child state. A missing component currently reaches the presenter adapter's error fallback.
- `A2UIChildListSchema` identifies child lists, but there is no public schema marker for one child ID. A plain `z.string()` cannot safely be assumed to be a component reference.
- Documentation says progressive references are unsupported, and tests enforce the current rejection behavior.

## Proposed public contract

### Component state

`A2UISurfaceSnapshot.rootId` remains `null` until the reserved `root` component is defined. A new `pendingComponentIds: readonly string[]` exposes unresolved renderable references:

- Before `root` arrives, the list is `["root"]`, regardless of buffered definitions.
- Once `root` exists, the list contains distinct unresolved IDs reachable from `root` through structural child references, in deterministic first-encounter order. An unresolved reference in an unreachable buffered component is omitted until it becomes reachable.
- The list is immutable. It becomes empty when all reachable component definitions are present. Data paths are not component IDs and are not included.

The snapshot remains the source of truth for `useA2UISurface` and `engine.getSurface`. A successful component update, including a pre-root update, advances only that surface's revision and notifies its subscribers. A rejected update leaves the snapshot and revision unchanged.

### App-owned pending UI

Add an optional `renderPending` prop to `A2UISurface` and `A2UIRenderer`:

```tsx
<A2UISurface
  surfaceId="checkout"
  renderPending={({ surfaceId, componentId, kind }) => (
    <MyLoadingView key={`${surfaceId}:${componentId}`} kind={kind} />
  )}
/>
```

The callback receives `{ surfaceId: string, componentId: string, kind: "root" | "component" }` and returns a React node. `kind: "root"` is used when a created surface has no `root`; `kind: "component"` is used at a missing structural child position requested by an app presenter through `renderChild`. The default return is `null`, so available siblings still render. A `renderChild` call for an ID absent from the validated structural graph remains `INVALID_REFERENCE`; the callback cannot hide a presenter bug. This callback is never called for a missing data value; presenters receive `undefined` and can choose their own loading view.

Add `A2UIComponentIdSchema` to the public schema exports for a single structural child reference. A catalog can use it as `child: A2UIComponentIdSchema` and render with `renderChild(props.child)`. A plain string remains a literal property. `A2UIChildListSchema` retains its current array and template forms. Nested schema fields are inspected recursively as today.

### Errors and recovery

An unresolved but syntactically valid root or child reference is pending, not an error. `onError` and `engine.getErrors()` continue to report malformed wire messages, invalid component props, unknown types, invalid data paths, duplicates, cycles among defined nodes, and resource-limit failures. Each rejected `updateComponents` message is atomic; later valid messages still apply. A later definition that completes a cycle or exceeds the depth limit is rejected without disturbing the previously renderable graph.

`A2UIRendererError` already has a code, message, surface ID, component ID, and path where applicable. Consumers may translate validation errors to the protocol's [`VALIDATION_FAILED` feedback](https://github.com/a2ui-project/a2ui/blob/main/specification/v0_9_1/docs/a2ui_protocol.md#error-handling) in their own transport. The renderer does not send feedback or infer stream completion. A consumer may implement a timeout or retry policy outside this package.

## Behavior rules

1. `createSurface` starts with an empty component graph, `rootId: null`, and `pendingComponentIds: ["root"]`.
2. `updateComponents` validates and stores each accepted batch even if `root` or referenced children have not arrived. As in the current core, a batch is one atomic message.
3. When `root` arrives, render it immediately. A presenter may call `renderChild` for an unresolved structural child and receive the optional pending UI. Other valid children render normally. A later accepted update replaces that pending position with the real presenter.
4. `A2UIComponentIdSchema` and `A2UIChildListSchema` mark graph edges. Ordinary strings and dynamic data bindings are not graph edges. References inside nested objects and arrays follow their marked schemas.
5. Validate known graph edges for cycles and depth, including buffered components not yet reachable from `root`. Treat an unresolved edge as a terminal for those checks. Enforce the existing component count, data size, and message limits. Limit the number of distinct unresolved IDs across the stored graph to `maxComponentsPerSurface` as well, so a small set of definitions cannot create unbounded pending state.
6. Invalid schema values, empty structural child IDs, duplicate IDs within a batch, unknown component types, malformed paths, and resource-limit violations remain immediate errors. A missing definition alone never produces `INVALID_ROOT` or `INVALID_REFERENCE`.
7. Missing bound data stays `undefined`; a later `updateDataModel` or local write updates the presenter through normal surface subscriptions. Present values of the wrong typed kind retain the existing `BINDING_ERROR` behavior.
8. `deleteSurface` removes buffered definitions and pending state. A new surface using the same ID starts clean.

## Scope boundaries

- **In scope:** Pre-root component buffering, pending structural references, progressive rendering, app-owned pending UI hook, single-child schema marker, immutable pending snapshot state, retained graph validation, error/recovery behavior, migration documentation, and tests for both protocol versions.
- **Deferred:** Higher-level message ingestion and one-surface placement ergonomics (`react-surface-api`), catalog export (`catalog-contract`), fine-grained rerender optimization (`render-reactivity`), and a full streaming consumer example (`consumer-tooling`).
- **Excluded:** Renderer-owned visual components, automatic timeout or stream-complete detection, automatic agent feedback transport, speculative component definitions, new dependencies, license changes, and package publishing.

## Tech stack and project structure

- TypeScript 6 and Zod 3 define the public schema marker and snapshot/callback types.
- `src/protocol/v0_9/` owns component buffering, schema behavior, and version-shared wire semantics.
- `src/validation/validateGraph.ts` owns structural reference discovery, cycle/depth checks, and resource limits.
- `src/engine/types.ts` owns the surface snapshot contract. `src/react/` and `src/rendering/` own React placement and presenter child rendering.
- `test/unit/`, `test/integration/`, and `test/types/` cover graph behavior, React output/recovery, and public typing. `docs/`, `README.md`, and `CHANGELOG.md` document the consumer contract.

## Commands

Run from the repository root:

```sh
pnpm build
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm pack:check
pnpm consumer:smoke
```

## Code style

Keep “defined” separate from “reachable” and “pending.” A missing ID is a rendering state, while a known cycle is an error:

```ts
const candidate = mergeValidatedComponents(current.components, updates);
const graphError = validateKnownGraph(candidate, limits);
if (graphError !== undefined) return { success: false, error: graphError };

const pendingComponentIds = collectPendingFromRoot(candidate);
```

Use existing `A2UI` names, strict TypeScript, immutable snapshots, and double quotes. Reuse the current graph and error model instead of adding a second component store.

## Testing strategy

1. Update the current missing-root and missing-child rejection tests to assert accepted pending state. Preserve duplicate ID, invalid props, invalid path, cycle, depth, count, malformed message, and batch recovery tests.
2. Test both message orders: children before `root`, and `root` before children. Verify snapshot contents, pending IDs, revisions, subscriber notifications, and eventual rendering. Include nested and single-child references, reachable versus unreachable pending refs, and sibling rendering.
3. Render `A2UISurface` and `A2UIRenderer` with and without `renderPending`. Verify root and child callback arguments, default `null` behavior, replacement by real presenters, and no `onError` for valid pending refs.
4. Test that a late child completing a cycle or exceeding depth is rejected atomically, and a following corrective message succeeds. Verify resource bounds for many distinct unresolved IDs.
5. Test missing data before and after `updateDataModel`, including a present wrong-type value retaining its structured error. Add a public type fixture for `A2UIComponentIdSchema` and the callback/snapshot types.
6. Run package gates and packed Expo/bare React Native consumer smoke checks because public exports and snapshot/React props change.

## Boundaries

- **Always:** Preserve app ownership of UI and transport, validate untrusted batches before commit, keep snapshots immutable, report actual failures with structured errors, and document changed missing-reference behavior.
- **Ask first:** Add any public API beyond `A2UIComponentIdSchema`, `pendingComponentIds`, and `renderPending`; change the callback shape; add a dependency; or broaden to transport/completion policy.
- **Never:** Treat a valid pending ID as an error, call an agent transport from rendering, silently accept a known cycle or resource violation, or ship a Basic Catalog placeholder.

## Success criteria

1. For both supported protocol versions, child-first and root-first streams are accepted; the surface renders as soon as `root` exists and fills missing child positions after their definitions arrive.
2. A developer can inspect deterministic pending IDs and supply native loading UI for a pending root or child without adopting package components. Missing data remains presenter-visible as `undefined`.
3. Valid pending references do not reach `onError`. Invalid updates still produce structured errors, leave prior state intact, and do not prevent later valid updates.
4. Single-child references are explicit in catalog schemas; ordinary strings are never interpreted as component IDs.
5. Existing limits, cycle/depth checks, bindings, actions, and native consumer builds remain green. Docs explain the migration from rejection to pending state with a concise app-owned presenter example.

## Review decisions

The user approved these API choices for planning on 2026-10-04:

1. Expose `pendingComponentIds` on the snapshot, including `["root"]` before the root arrives.
2. Offer one optional `renderPending` callback on both React entry points, defaulting to `null`.
3. Add `A2UIComponentIdSchema` for single-child references; leave ordinary strings literal.
4. Let presenters decide what `undefined` bound data means, with no renderer timeout or completion guess.
