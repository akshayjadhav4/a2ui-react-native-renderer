# Architecture

The package has one job: process A2UI v0.9 and v0.9.1 messages and render their
surfaces through a consumer-owned native catalog.

```text
agent or server
  -> consumer transport
  -> A2UIMessage
  -> engine and in-package protocol core
  -> validated surface snapshots
  -> React surface resolver
  -> consumer presenters
  -> A2UIUserAction
  -> consumer transport
```

## Layers

### Public React API

`A2UIRenderer` is the convenience composition. `useA2UIEngine` owns one engine
for a mounted feature, and `A2UISurface engine={engine}` places its surfaces
directly. `createA2UIEngine` and `A2UIProvider` support application-controlled
lifetimes and shared context. React
components subscribe through `useSyncExternalStore`; protocol state is not
duplicated in React state.

### Engine

Each `createA2UIEngine` call creates isolated state. An engine owns catalog
registration, actions, errors, and subscriptions. Its in-package protocol core
owns the authoritative surface, component, data-model, and revision state.
There is no module-level engine, catalog registry, or mutable global
configuration.

### Protocol Core

The core parses v0.9 and v0.9.1 messages, validates each transition against the
application's catalog, and publishes immutable surface snapshots. It contains
only the protocol behavior the native renderer needs: lifecycle, component
graphs, data models, bindings, and action values. React does not own a second
copy of protocol state.

### Validation Transaction

Candidate updates are validated before becoming visible. Message shape,
catalog, component graph, Zod properties, pointers, cycles, and limits are
checked for each message. A failed message retains the last valid revision;
later valid messages in the same batch may still commit, even on that surface.
Definitions may be buffered before `root`; nonempty unresolved structural
references are recorded as pending while known cycles and limits still fail.

### Render Resolver

The resolver selects the surface catalog, resolves dynamic properties and
template scope, renders the presenter as a React component, and recursively renders explicit child
references. Component and surface error boundaries prevent consumer presenter
failures from escaping into the host application.

## Presenter Reactivity

Each mounted component node subscribes to its engine's immutable surface
snapshot. A stable `renderChild` passes identifiers and scope paths rather than
capturing a surface snapshot, allowing descendants to observe updates even
when an ancestor presenter is preserved.

Resolution runs against each new accepted snapshot, including consumer function
evaluation. A private memoized host then compares complete healthy presenter
inputs. Full scope values use identity; ordinary resolved records/arrays use
conservative value comparison that includes function identity and own keys.
Unsupported objects, cycles, or excessive comparison work cause a render.
Setter callbacks are reused within their component/scope ownership and retain
live value/binding/stale-write checks.

Error recovery stays outside healthy presenter memoization. Its reset identity
includes the component and accepted revision, so batched deletion/recreation
can recover even if a revision number repeats. Actual presenters remain React
components whose local state and context subscriptions continue to work.

This reduces presenter calls, especially for unaffected template item scopes.
Surface notifications and resolution can still visit every mounted node; this
is not a path-specific subscription store, virtualization system, or native
frame-time guarantee. Public APIs and protocol notifications remain unchanged.

## Invariants

- Engine state is instance-scoped.
- Catalog IDs are unique within an engine and match `createSurface.catalogId`.
- `root` is the reserved entry component for a renderable graph; its absence is
  a pending state.
- Surface snapshots are immutable and revisioned.
- An invalid update does not erase a previous valid revision.
- A surface update does not notify unrelated surface subscribers.
- Action context is resolved from the latest data model at dispatch time.
- Production failures still reach `onError` even when no fallback is visible.
- No network, model, chat, persistence, timer, or background task is owned by
  the package.

## Dependency Boundary

Runtime dependencies are deliberately narrow:

- React provides rendering and subscriptions.
- React Native is the host platform peer; presenters decide which primitives to
  use.
- Zod is the shared catalog-schema peer.

The package does not depend on `@a2ui/web_core` or include Basic Catalog, Lit,
or DOM rendering modules.

Expo, AG-UI, TanStack AI, CopilotKit, Hono, SSE, WebSocket clients, styling
systems, and application stores belong outside the package.

## Public Entry Boundaries

- `a2ui-react-native-renderer`: engine, React APIs, catalog definitions and
  protocol schema helpers.
- `a2ui-react-native-renderer/catalog-schema`: exports the app catalog as a
  JSON Schema document for agent guidance or server validation tooling. Apps
  own delivery and server-side validation; exporting does not negotiate a
  schema over the network.
- `a2ui-react-native-renderer/testing`: optional real-engine harness with
  recorded user actions. It supplies no mounting or assertion framework.

The native root does not import either optional entry. Both optional entries
can load in Node; the app's own catalog module must also be compatible with
that environment. Native presenters can be attached separately or the app can
export a schema artifact during a compatible build step.

`example/server` and the Expo WebSocket client demonstrate app-owned transport.
They are outside the published package and the renderer's dependency graph.

## Engine Ownership And Surface Placement

With `A2UIRenderer`, the component owns engine creation and disposal. It is
appropriate when every active surface renders together.

With `useA2UIEngine`, a mounted conversation or feature owns placement while
the hook creates and disposes its engine. The engine survives rerenders and
Strict Mode effect replay; callbacks use their latest values. Catalog identity,
catalog order and effective limits remain fixed until the owner is remounted.
The app subscribes to its message source in an effect and returns its cleanup.

With `createA2UIEngine`, the application explicitly owns disposal, replay and
placement, including engines that outlive a mounted feature. Use a provider
for context hooks across a subtree, or pass the engine directly to each
surface. A direct surface supplies that context to its presenters and never
disposes its engine.

All paths use the same engine, validation, presenter resolution, and recovery
behavior. The simple API is composition, not a second runtime.
