# Streaming And Actions

The renderer processes A2UI messages; it does not own the stream carrying them.
AG-UI, HTTP, WebSocket, SSE, local fixtures, and on-device inference can all feed
the same engine.

## Runnable Local Network Example

The repository's Expo example has a **Network demo** screen and a private
local fixture producer. From the repository root, run `pnpm install && pnpm build`,
then use two terminals:

```sh
pnpm --filter a2ui-demo-server start
```

```sh
EXPO_PUBLIC_A2UI_DEMO_URL=ws://localhost:8080 pnpm --filter a2ui-renderer-example start
```

For Android emulators use `ws://10.0.2.2:8080`; Android documents the
[host-loopback alias](https://developer.android.com/studio/run/emulator-networking-address).
For a phone, run the server with `A2UI_DEMO_HOST=0.0.0.0` and enter the computer's
reachable LAN IP instead of localhost. The editable endpoint is public
configuration. Custom native builds may need app-specific local network
permissions or a trusted `wss://` endpoint; see
[React Native networking](https://reactnative.dev/docs/0.86/network).

Connect to observe pending root/children and the streamed form. Edit its input
and send an action to see the reply. Controls demonstrate invalid-update
recovery, deletion, disconnect and fresh-session reconnection. Cleanup retires
old socket callbacks; transport errors and renderer errors appear separately.

This is an actual socket connection to a deterministic producer. Replace it
with your application backend using the same engine ingestion and action
callback; the renderer supplies neither client transport nor server. Use the
optional [testing harness](./testing.md) to verify the same catalog and messages.
The repository example README contains complete setup and demo-envelope details.

## Message Lifecycle

For v0.9 and v0.9.1, the runtime accepts:

1. `createSurface` to establish a surface and catalog ID;
2. `updateDataModel` to initialize or change bound data;
3. `updateComponents` to add or replace graph components;
4. `deleteSurface` to remove the surface.

Messages may arrive incrementally. Component definitions sent before `root` are
buffered. A surface renders as soon as its reserved `root` definition arrives;
present descendants render while missing child definitions stay pending. The
default pending output is `null`, or the app can pass `renderPending`.

## Simple Collection

Use `A2UIRenderer` when the application already holds one append-oriented
message array:

```tsx
<A2UIRenderer catalogs={[catalog]} messages={messages} />
```

If the new array retains the exact previous message objects as its prefix, only
the appended suffix is applied. Reusing the same array applies nothing. Replacing
or reordering earlier objects causes the current collection to be replayed, so
prefer immutable append semantics.

## React-Owned Engine With An App-Owned Stream

Create one engine in the mounted transcript owner. The hook keeps it stable and
disposes it after final unmount. Register your source in an effect so its
unsubscribe runs on cleanup. The source should deliver parsed A2UI message
objects; transport envelopes and transcript placement belong to the app.

```tsx
import { useEffect } from "react";
import { Text } from "react-native";
import {
  A2UISurface,
  useA2UIEngine,
  type A2UIMessage,
  type A2UIRendererError,
  type A2UIUserAction,
} from "a2ui-react-native-renderer";

type DisplayItem =
  | { kind: "surface"; id: string; surfaceId: string }
  | { kind: "message"; id: string; text: string };

type MessageSource = {
  onA2UIMessage(handler: (message: A2UIMessage) => void): () => void;
};

type Props = {
  source: MessageSource;
  items: readonly DisplayItem[];
  onAction: (action: A2UIUserAction) => void | Promise<void>;
  onError: (error: A2UIRendererError) => void;
};

// catalog is your app-owned component catalog.
export function Transcript({ source, items, onAction, onError }: Props) {
  const engine = useA2UIEngine({ catalogs: [catalog], onAction, onError });

  useEffect(
    () =>
      source.onA2UIMessage((message) => {
        engine.applyMessage(message);
      }),
    [source, engine],
  );

  return items.map((item) =>
    item.kind === "surface" ? (
      <A2UISurface
        key={item.id}
        engine={engine}
        surfaceId={item.surfaceId}
        renderPending={({ kind }) => <Text>Loading {kind}…</Text>}
        renderFallback={(error) => <Text>Unable to display: {error.code}</Text>}
      />
    ) : (
      <Text key={item.id}>{item.text}</Text>
    ),
  );
}
```

The transport-to-transcript bridge should record surface placement when it
observes `createSurface` and remove placement when it observes `deleteSurface`.
The engine owns surface content; the transcript owns where it appears.
The `Text` above is an app-owned React Native component.

Keep the catalog objects, their order, and effective resource limits unchanged
while mounted. New inline containers with equivalent values are accepted.
`onAction` and `onError` may change; future events use the latest callbacks.
Changing construction settings throws a configuration error. Remount the
transcript owner with a different key to create a fresh engine.

### Shared Context Or Longer Lifetime

For descendant components that call `useA2UISurface`, `useA2UIErrors`, or
`useA2UISurfaceIds`, mount `A2UIProvider` around them. Existing context hooks
continue to require a provider. An explicit surface engine takes precedence
over an outer provider and supplies its own context to app presenters.

Use `createA2UIEngine` when the engine's lifetime extends beyond a mounted React
feature; store it at that app-owned scope and dispose it when retired. A
provider or surface never disposes an external engine. An all-surface region
can simply render `<A2UIRenderer engine={engine} />`; omitted messages apply no
operations. Passing messages still uses the collection rules above.

## Progressive Components And Data

The producer may send children before their parent or send `root` before a
child. Each accepted `updateComponents` advances that surface's revision. A
created surface exposes `pendingComponentIds: ["root"]` until `root` arrives;
afterward the list contains distinct missing structural IDs reachable from
`root`. `useA2UISurface(surfaceId)` exposes this immutable snapshot. The
renderer uses the same pending state to call `renderPending` at a missing root
or at a child position requested through `renderChild`.

```tsx
<A2UISurface
  surfaceId="checkout"
  renderPending={({ componentId, kind }) => (
    <MySkeleton componentId={componentId} kind={kind} />
  )}
/>
```

The callback is optional and supplies no package-owned visuals. Missing bound
data resolves to `undefined` in a presenter; it is not listed among pending
component IDs. The app decides whether that value means loading or empty. The
protocol has no general completion signal, so an ID that never arrives stays
pending until the surface is updated or deleted. Timeout and retry behavior
belongs in the app transport.

## Batches And Recovery

`applyMessages` processes operations in order. Each valid message commits its
surface revision; an invalid message is reported and skipped. Later valid
messages still apply, including ones for the same surface. Subscribers receive
one final notification for the batch. A batch over the configured message
limit is rejected in full.

An unresolved nonempty child ID does not cause an error. Malformed components,
empty IDs, known cycles, excessive known depth, and resource-limit violations
still reject that one update atomically; a later valid update can recover the
surface. `onError` receives structured details if the app wants to send agent
feedback through its own transport.

Do not render raw operation JSON as assistant text. Parse the transport payload,
pass only message objects to the engine, and expose failures through `onError`.

## Action Round Trip

When a presenter dispatches an event action, the engine resolves context from
the current surface data model and calls `onAction` with an official
`A2UIUserAction`:

```tsx
const engine = createA2UIEngine({
  catalogs: [catalog],
  onAction(action) {
    agent.send({ forwardedProps: { a2ui: { action } } });
  },
});
```

The package does not prescribe the outer payload. The consumer may send an
AG-UI action turn, call an API route, execute an application command, or handle
the action locally.

Do not add a visible fake user message unless that is an intentional product
choice. Action-only turns can remain protocol events while the server responds
with text, data updates, component updates, or surface deletion.

## Lifetime

`useA2UIEngine` handles final engine cleanup, including Strict Mode effect
replay. Clean up your own source subscriptions in their effects. One surface
unmounting does not retire an engine owned by a still-mounted ancestor.

Call `engine.dispose()` when an application-owned engine will never be used
again. Disposal releases protocol state and package subscriptions.
Do not dispose an engine merely because one surface was deleted.
