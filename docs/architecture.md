# Architecture

The package has one job: process A2UI v0.9 messages and render their surfaces
through a consumer-owned native catalog.

```text
agent or server
  -> consumer transport
  -> A2UIMessage
  -> engine and v0.9 adapter
  -> validated surface snapshots
  -> React surface resolver
  -> consumer presenters
  -> A2UIUserAction
  -> consumer transport
```

## Layers

### Public React API

`A2UIRenderer` is the convenience composition. `A2UIProvider`, `A2UISurface`,
and the hooks support application-owned engines and custom placement. React
components subscribe through `useSyncExternalStore`; protocol state is not
duplicated in React state.

### Engine

Each `createA2UIEngine` call creates isolated state. An engine owns catalog
registration, surfaces, data models, revisions, actions, errors, and
subscriptions. There is no module-level engine, catalog registry, or mutable
global configuration.

### Protocol Adapter

The v0.9 adapter wraps `@a2ui/web_core/v0_9`. It parses official messages,
drives the upstream processor, and exposes renderer-owned immutable snapshots.
Other package layers do not depend directly on upstream contexts or mutable
models.

### Validation Transaction

Candidate updates are validated before becoming visible. Message shape,
catalog, component graph, Zod properties, pointers, cycles, and limits are
checked per affected surface. A failed transaction retains the last valid
revision; an independent valid surface in the same batch may still commit.

### Render Resolver

The resolver selects the surface catalog, resolves dynamic properties and
template scope, invokes the presenter, and recursively renders explicit child
references. Component and surface error boundaries prevent consumer presenter
failures from escaping into the host application.

## Invariants

- Engine state is instance-scoped.
- Catalog IDs are unique within an engine and match `createSurface.catalogId`.
- `root` is the reserved entry component for a renderable graph.
- Surface snapshots are immutable and revisioned.
- An invalid update does not erase a previous valid revision.
- A surface update does not notify unrelated surface subscribers.
- Action context is resolved from the latest data model at dispatch time.
- Production failures still reach `onError` even when no fallback is visible.
- No network, model, chat, persistence, timer, or background task is owned by
  the package.

## Dependency Boundary

Runtime dependencies are deliberately narrow:

- `@a2ui/web_core` provides the official v0.9 protocol processor.
- React provides rendering and subscriptions.
- React Native is the host platform peer; presenters decide which primitives to
  use.
- Zod is the shared catalog-schema peer.

Expo, AG-UI, TanStack AI, CopilotKit, Hono, SSE, WebSocket clients, styling
systems, and application stores belong outside the package.

## Simple And Advanced Ownership

With `A2UIRenderer`, the component owns engine creation and disposal. It is
appropriate when every active surface renders together.

With `createA2UIEngine`, the application owns lifetime, replay, and placement.
This is appropriate for chat transcripts and navigation trees where different
surfaces render in different locations.

Both paths use the same engine, validation, presenter resolution, and recovery
behavior. The simple API is composition, not a second runtime.
