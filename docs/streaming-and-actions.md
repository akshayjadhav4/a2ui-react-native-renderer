# Streaming And Actions

The renderer processes A2UI messages; it does not own the stream carrying them.
AG-UI, HTTP, WebSocket, SSE, local fixtures, and on-device inference can all feed
the same engine.

## Message Lifecycle

For v0.9 and v0.9.1, the runtime accepts:

1. `createSurface` to establish a surface and catalog ID;
2. `updateDataModel` to initialize or change bound data;
3. `updateComponents` to add or replace graph components;
4. `deleteSurface` to remove the surface.

Messages may arrive incrementally. A surface is renderable after a valid
reserved `root` component resolves; until then `A2UISurface` returns `null`.

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

## Application-Owned Stream

Use an engine when placement and lifecycle are application concerns:

```tsx
const engine = createA2UIEngine({ catalogs: [catalog] });

transport.onA2UIMessage((message) => {
  engine.applyMessage(message);
});
```

Mount one provider around the region that renders surfaces:

```tsx
<A2UIProvider engine={engine}>
  {items.map((item) =>
    item.kind === "surface" ? (
      <A2UISurface key={item.id} surfaceId={item.surfaceId} />
    ) : (
      <ChatMessage key={item.id} item={item} />
    ),
  )}
</A2UIProvider>
```

The transport-to-transcript bridge should record surface placement when it
observes `createSurface` and remove placement when it observes `deleteSurface`.
The engine owns surface content; the transcript owns where it appears.

## Batches And Recovery

`applyMessages` processes operations in order. Each valid message commits its
surface revision; an invalid message is reported and skipped. Later valid
messages still apply, including ones for the same surface. Subscribers receive
one final notification for the batch. A batch over the configured message
limit is rejected in full.

Component updates currently need a complete resolvable graph. A reference to
a child that arrives in a later message is rejected; the next valid update can
recover the surface.

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

Call `engine.dispose()` when an application-owned engine will never be used
again. Disposal releases protocol state and package subscriptions.
Do not dispose an engine merely because one surface was deleted.
