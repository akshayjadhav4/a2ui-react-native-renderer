# Core Concepts

A2UI describes UI through incremental messages. This library processes those
messages and renders them with your React Native components. Your app owns the
catalog, visual design, transport, backend and placement.

For a runnable introduction, start with the [README quick start](../README.md#quick-start).
For exact contracts, use the [API reference](./api.md).

## The Pieces

| Term      | Meaning                                                             |
| --------- | ------------------------------------------------------------------- |
| Message   | A protocol operation that creates, updates or deletes UI            |
| Catalog   | Your allowlist of components and functions                          |
| Schema    | Zod definition of a component's accepted wire properties            |
| Presenter | Your React component that renders resolved properties               |
| Surface   | One independently updateable UI document, identified by `surfaceId` |
| Engine    | Instance-scoped runtime holding catalogs, surfaces, data and errors |
| Binding   | A reference from a component property to surface data               |
| Action    | An interaction dispatched by a presenter and handled by your app    |

The flow is:

```text
your backend → your transport → A2UI messages → engine
  → resolved properties → your native presenters
  → user action → your transport → your backend
```

## Messages And Surfaces

Both A2UI `v0.9` and `v0.9.1` are supported:

- `createSurface` starts a surface using a registered `catalogId`.
- `updateComponents` supplies or replaces component definitions.
- `updateDataModel` updates data that components can bind to.
- `deleteSurface` removes the surface.

The reserved `root` component is the surface's entry point. Root and child
definitions may arrive later; valid unresolved references are pending, and
`renderPending` lets the app show loading UI. A surface's ID lets later messages
update it independently of other surfaces or chat turns.

See [Streaming And Actions](./streaming-and-actions.md) for progressive updates,
batch recovery, source cleanup and action round trips.

## Your Catalog And Components

Pair each component schema with a presenter using `defineA2UICatalog` and,
optionally, `defineA2UIComponent`. Register only capabilities your app permits.
Presenters are ordinary React components and may use your existing design system.

The incoming component name must match a catalog entry, and
`createSurface.catalogId` must match the catalog's ID. The catalog's own version
suffix, such as `:v1`, is separate from the message's A2UI protocol version.

`exportA2UICatalogSchema` derives a JSON Schema document from that same catalog
for agent guidance or server tooling. Your app handles delivery and configures
server validation. See [Catalogs](./catalogs.md) for schemas, presenters, dynamic
values, children, functions and schema export.

## Choose Engine Ownership

| Need                                                     | API                                             | Engine lifetime                           |
| -------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------- |
| Render all active surfaces together from a message array | `A2UIRenderer`                                  | Component creates and disposes its engine |
| Place surfaces individually within a mounted feature     | `useA2UIEngine` + `A2UISurface engine={engine}` | Hook creates and disposes the engine      |
| Manage an engine outside a mounted feature               | `createA2UIEngine` + surfaces                   | App explicitly calls `dispose()`          |

`A2UIProvider` shares an existing engine through context. It is optional for
direct-engine surfaces, which supply context to their presenters. Context
readers such as `useA2UISurface` need that context; `useA2UIEngine` creates an
engine instead of reading one.

Feed messages from event handlers or effects. Catalog objects/order and
effective limits remain fixed while a hook owner is mounted; remount it for
new construction settings. Keep message arrays immutable when using the
convenience renderer. See [API](./api.md) for ingestion/replay rules and
[Architecture](./architecture.md) for lifecycle and reactivity details.

## Bindings, Actions And Recovery

- Use `A2UIDynamic*Schema` helpers for values that may be literals, bindings or
  function calls. Presenters receive resolved values; missing data can resolve
  to `undefined`.
- Direct bound fields receive optional setters such as `setValue`. Literals
  and function results have no setter. Setters update local surface data;
  your app decides when to send an action or persist a change.
- A presenter uses `renderChild` for declared child references and `dispatch`
  from interaction handlers. Event context resolves against current surface
  data; your `onAction` callback chooses how to send the event.
- Register functions explicitly. Render-time functions should be deterministic
  and side-effect free. Local function actions run on dispatch and are not
  forwarded as user-action events.
- Invalid messages retain accepted state; later valid messages can recover.
  Use `onError` for diagnostics and an app-owned `renderFallback` when needed.
  Invalid construction settings throw synchronously.

See [Errors And Security](./errors-and-security.md) for validation, resource
limits and recovery. Use [Testing](./testing.md) to verify your catalog through
the real engine, including mounted binding, function and presenter behavior.
Existing consumers can follow the [Migration Guide](./migration.md).
