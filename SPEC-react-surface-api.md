# Spec: React Surface API

**Module id:** `react-surface-api` in [CAPABILITY-MAP.md](CAPABILITY-MAP.md)

**Status:** Draft for review on 2026-10-05. No implementation is authorized by this draft.

## Assumptions

1. An application may receive A2UI messages one at a time from its own HTTP, SSE, WebSocket, AG-UI, or local source. It should not have to retain a cumulative React array to render them.
2. An application decides where each surface appears, such as within a chat transcript. The package does not own transcript items, transport subscriptions, or surface placement records.
3. The app continues to supply every catalog component, loading view, and error view. This module adds no Basic Catalog, chat UI, model client, or network client.
4. Existing `A2UIRenderer` collection mode, `createA2UIEngine`, `A2UIProvider`, `A2UISurface`, and context hooks remain supported. The proposed API is additive, except that external-engine renderer mode makes `messages` optional.
5. This module does not change A2UI v0.9/v0.9.1 wire behavior, package version, license, or the separate `render-reactivity` work.

## Objective

Make the common React Native stream flow small and safe: create one engine for a mounted feature, apply each incoming A2UI message, and render a particular surface exactly where the app chooses. The developer should not need custom engine lifetime code, a provider for one isolated surface, or a dummy empty message array.

The app still controls the transport and transcript. The renderer owns only A2UI state and rendering. Both collection mode and advanced explicit-engine usage must keep working.

## Current gap

- `A2UIRenderer` is concise for an append-only message array, but always renders every active surface at its own position. It cannot place one surface among app-owned transcript items.
- A stream consumer must call `createA2UIEngine`, remember the engine across renders, dispose it on final unmount, and mount `A2UIProvider` before using `A2UISurface`. These steps are easy to get wrong in React Strict Mode.
- External-engine `A2UIRenderer` requires `messages`, even when the app already applies messages to the engine. The Expo showcase passes a constant empty array solely to satisfy this prop.
- The docs present the pieces separately but do not show one complete React component that owns a stream subscription, engine lifetime, and one-surface placement.

## Proposed public contract

### `useA2UIEngine(options)`

Export a React hook from the package root with the same options shape as `createA2UIEngine` and an `A2UIEngine` return value:

```tsx
const engine = useA2UIEngine({
  catalogs: [catalog],
  onAction: (action) => sendAction(action),
  onError: (error) => reportError(error),
});
```

The hook creates one engine for that mounted hook instance and returns the same engine on ordinary rerenders. It owns that engine and disposes it after final unmount, including React Strict Mode effect cleanup and remount behavior. It never applies messages, subscribes to a transport, or renders a surface. The app calls `engine.applyMessage(message)` or `engine.applyMessages(batch)` when data arrives.

`catalogs` and `limits` are construction settings. Their values must remain the same while the hook instance is mounted; a changed catalog list or limit value throws a clear configuration error instead of silently keeping stale validation. An inline array containing the same catalog objects is equivalent to the previous array. `onAction` and `onError` may change on rerender; the engine must call the latest callback. An app that intentionally changes construction settings remounts its owning React subtree with a new key.

`createA2UIEngine` remains available when ownership extends beyond a React subtree or the application wants explicit disposal.

### One-surface placement without a provider

Add an optional `engine: A2UIEngine` prop to `A2UISurface`:

```tsx
<A2UISurface
  engine={engine}
  surfaceId={item.surfaceId}
  renderPending={({ kind }) => <MyLoadingView kind={kind} />}
/>
```

With `engine`, the surface subscribes to that engine and needs no `A2UIProvider`. Without `engine`, it retains the current nearest-provider behavior and the current helpful error if no provider exists. If both are present, the explicit prop selects the engine for this surface. A missing or deleted `surfaceId` continues to render `null`, or an existing structured failure through `renderFallback`/diagnostics. Existing pending and fallback callbacks keep their current contracts. The surface never owns or disposes an explicit engine.

`A2UIProvider` and its context hooks remain the choice when several components need to inspect the same engine's surface IDs, snapshots, or errors. This module does not add direct-engine variants of those hooks.

### External-engine `A2UIRenderer`

Make `messages` optional only when `engine` is supplied. Omission means the renderer applies no messages; it still observes and renders all active surfaces from the supplied engine. `messages` remains required when `A2UIRenderer` creates its own engine, and its existing append/replay behavior remains unchanged. External mode still rejects `catalogs`, `onAction`, and `onError` because those belong to the supplied engine. `A2UIRenderer` never disposes an external engine.

### Complete stream use

The documentation should show an application-owned subscription with cleanup and transcript placement, using no package-owned UI or transport:

```tsx
function Transcript({ source, items }: Props) {
  const engine = useA2UIEngine({ catalogs: [catalog] });

  useEffect(
    () =>
      source.onA2UIMessage((message) => {
        engine.applyMessage(message);
      }),
    [source, engine],
  );

  return items.map((item) =>
    item.kind === "surface" ? (
      <A2UISurface key={item.id} engine={engine} surfaceId={item.surfaceId} />
    ) : (
      <ChatMessage key={item.id} item={item} />
    ),
  );
}
```

The example's `source.onA2UIMessage` returns an unsubscribe function. The app's source or transcript adapter records placement on `createSurface` and removes it on `deleteSurface`. The package does not infer placement from engine IDs.

## Behavior rules

1. One hook instance has one stable engine. Two hook instances have independent engines, even with the same catalog.
2. Rerendering with new callbacks changes future `onAction` and `onError` delivery without recreating or resetting the engine.
3. A changed catalog object/order/count or effective resource limit fails with a clear error. Equivalent inline arrays and limit objects do not fail.
4. Final unmount disposes a hook-owned engine once. React Strict Mode's development cleanup/remount sequence must leave the active engine usable. A component consuming an external engine never disposes it.
5. A direct-engine surface reacts to accepted updates, pending resolution, errors, and deletion exactly as a provider-backed surface does. Its React subscriptions follow the engine and surface ID passed in props.
6. Omitting external-engine renderer `messages` is equivalent to passing a stable empty array. No message is replayed because unrelated props or engine state change.
7. Invalid wire messages and callbacks retain the existing engine error and recovery semantics; this module does not reinterpret transport payloads.

## Scope boundaries

- **In scope:** Public engine hook, direct-engine one-surface prop, optional external-engine renderer messages, documentation and Expo example updates, type fixtures, React integration tests, and consumer package checks.
- **Deferred:** Fine-grained rerender measurements and optimization (`render-reactivity`), a full end-to-end transport example or starter (`consumer-tooling`), and release/version work.
- **Excluded:** Basic Catalog, visual components, transport SDK, automatic transcript placement, automatic stream completion, message queue, new dependency, license change, publishing, and a breaking removal of existing entry points.

## Tech stack and project structure

- TypeScript 6, React 18.2+ peer types, React Native 0.76+, and the existing package-owned engine.
- `src/react/` owns the hook, provider/explicit-engine selection, and surface rendering. `src/engine/` keeps the engine contract and state; protocol code should not change.
- `src/index.ts` owns root exports. `test/integration/` covers React lifecycle and rendering; `test/types/` covers valid and rejected public props. `docs/`, `README.md`, and `example/expo/` demonstrate usage.

## Commands

Run from the repository root:

```sh
pnpm build
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm example:check
pnpm pack:check
pnpm consumer:smoke
```

## Code style

Use existing `A2UI` names, strict TypeScript, immutable engine snapshots, and double quotes. Keep React ownership separate from protocol logic. A consumer should be able to write:

```tsx
const engine = useA2UIEngine({ catalogs: [catalog] });
return <A2UISurface engine={engine} surfaceId="checkout" />;
```

Avoid a second runtime store or a transport-specific wrapper. Preserve typed invalid-prop combinations in the `A2UIRendererProps` union.

## Testing strategy

1. Add public type fixtures for `useA2UIEngine`, direct-engine `A2UISurface`, optional external `messages`, still-required owned `messages`, and forbidden mixed engine/catalog/callback props.
2. Verify hook engine identity across rerenders; separate hook instances; latest action/error callbacks; equivalent inline catalog/limit values; changed construction settings; final unmount disposal; and Strict Mode replay.
3. Render the same surface through provider and explicit engine. Verify initial, pending, resolved, failed, and deleted states; switching surface IDs or engines; and behavior when an explicit engine is nested under a different provider.
4. Verify an external `A2UIRenderer` with omitted `messages` observes imperative `applyMessage` calls without replay. Preserve collection-mode append behavior and external-engine non-disposal.
5. Update the Expo showcase and run typecheck/lint plus packed Expo and bare React Native iOS/Android smoke checks. The documentation example must show subscription cleanup and app-owned placement.

## Boundaries

- **Always:** Keep app ownership of components, transport, and placement; preserve existing API behavior; dispose only engines owned by the new hook; update public docs and type tests; run package gates before commits.
- **Ask first:** Add any other public helper or prop, change the existing context hooks, alter message replay semantics, add dependencies, or broaden into transport/tooling.
- **Never:** Ship a Basic Catalog, silently replace a mounted engine, dispose an external engine, apply a message during React render, or publish from this module.

## Success criteria

1. A streaming React Native consumer can create a stable engine, apply each incoming message, and place one surface with the hook and direct-engine surface API shown above, without manual disposal or a provider.
2. Existing provider-based surfaces and collection-based renderer code remain valid. External-engine renderer code compiles and works with no dummy `messages={[]}` prop.
3. Callback updates, config changes, final unmount, and Strict Mode behavior are explicit and covered by meaningful tests.
4. Docs give one complete stream-to-surface example with app-owned subscription cleanup, placement, native UI, and action/error handling guidance.
5. Build, typecheck, lint, formatting, tests, Expo example checks, package checks, and packed native consumer smoke checks pass.

## Open questions for review

1. Is the proposed three-part public change (`useA2UIEngine`, optional `A2UISurface.engine`, and optional external renderer `messages`) the right level of convenience for this module?
2. Should direct `A2UISurface.engine` take precedence over a surrounding provider, as proposed?
