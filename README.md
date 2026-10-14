# a2ui-react-native-renderer

A catalog-agnostic A2UI v0.9 and v0.9.1 renderer and protocol runtime for React
Native and Expo.

The package turns official A2UI messages into consumer-owned native React
presenters. It does not bundle a component catalog, visual design system, chat
UI, model SDK, or transport.

## Requirements

- React 18.2 or newer
- React Native 0.76 or newer, including Expo projects
- Zod 3.25
- Node.js 20 or newer for development and package tooling
- A2UI messages using protocol version `v0.9` or `v0.9.1`

## Installation

```sh
pnpm add a2ui-react-native-renderer zod
```

React and React Native are peer dependencies and should already be installed by
the host application.

## Quick Start

Define the components your application permits, pair each Zod schema with a
native presenter, and render official A2UI messages.

```tsx
import { Text } from "react-native";
import { z } from "zod";
import {
  A2UIRenderer,
  defineA2UICatalog,
  type A2UIMessage,
} from "a2ui-react-native-renderer";

export const catalog = defineA2UICatalog({
  id: "urn:example:a2ui:catalog:v1",
  components: {
    Text: {
      schema: z.object({ text: z.string() }),
      presenter: ({ props }) => <Text>{props.text}</Text>,
    },
  },
});

const messages: A2UIMessage[] = [
  {
    version: "v0.9.1",
    createSurface: {
      surfaceId: "welcome",
      catalogId: catalog.id,
    },
  },
  {
    version: "v0.9.1",
    updateComponents: {
      surfaceId: "welcome",
      components: [
        {
          id: "root",
          component: "Text",
          text: "Hello from A2UI",
        },
      ],
    },
  },
];

export function AgentUI() {
  return <A2UIRenderer catalogs={[catalog]} messages={messages} />;
}
```

`A2UIRenderer` creates one stable engine, applies appended messages, and renders
all active surfaces at its location. Keep `catalogs` stable while the renderer
is mounted.

## Streaming And Custom Placement

Chat applications often need each A2UI surface to remain beside the assistant
turn that created it. Use `useA2UIEngine` for a mounted feature and render
individual surfaces where they belong. The hook handles engine disposal;
your app handles the message source and its cleanup.

```tsx
import { Text } from "react-native";
import { useEffect } from "react";
import {
  A2UISurface,
  useA2UIEngine,
  type A2UIMessage,
  type A2UIUserAction,
} from "a2ui-react-native-renderer";

type MessageSource = {
  onA2UIMessage(handler: (message: A2UIMessage) => void): () => void;
};

export function ChatSurface({
  source,
  surfaceId,
}: {
  source: MessageSource;
  surfaceId: string;
}) {
  const engine = useA2UIEngine({
    catalogs: [catalog],
    onAction: (action: A2UIUserAction) => sendActionToAgent(action),
    onError: (error) => reportRendererError(error),
  });
  useEffect(
    () =>
      source.onA2UIMessage((message) => {
        engine.applyMessage(message);
      }),
    [source, engine],
  );

  return (
    <A2UISurface
      engine={engine}
      surfaceId={surfaceId}
      renderPending={({ kind }) => <Text>Loading {kind}…</Text>}
    />
  );
}
```

`source.onA2UIMessage` is an app-owned subscription that returns an unsubscribe
function; React runs it during cleanup. The catalog and action/error handlers
also come from your app. For a transcript with several surfaces, create one
hook-owned engine in the transcript owner and pass it to each surface. See the
complete example in [Streaming And Actions](./docs/streaming-and-actions.md).

The pending callback receives `surfaceId`, `componentId`, and
`kind: "root" | "component"`. Without
it, missing positions render nothing while available components keep rendering.
An absent bound data path reaches the presenter as `undefined`, so the presenter
chooses its own loading or empty state.

Keep catalog objects/order and effective limits stable while mounted; equivalent
inline arrays and objects are accepted. Action/error callbacks can change on
rerender. Remount the owning feature with a new key to change construction
settings. Use `createA2UIEngine` for an engine that outlives a React feature, and
`A2UIProvider` when descendant components need the snapshot/error/ID hooks.
To render all surfaces from an existing engine, use
`<A2UIRenderer engine={engine} />` without an empty message array.

The host application decides how messages arrive, where surfaces appear, how
long they remain, and how `A2UIUserAction` values return to the agent. The
renderer imports no AG-UI, TanStack AI, HTTP, WebSocket, Expo Router, or chat
runtime code.

## Catalog Ownership

The renderer deliberately ships no built-in components. A catalog is an
application-owned allowlist:

- **Schema:** validates the A2UI properties accepted by a component.
- **Presenter:** renders those validated properties with React Native, Expo UI,
  or another native component library.
- **Function:** optionally evaluates a catalog-defined computation.

Use ordinary Zod fields for static values. Use the exported
`A2UIDynamic*Schema` helpers for values that may be literals, data bindings, or
function calls. Directly bound presenter properties receive optional typed
setters such as `setValue`, allowing app-owned native controls to update the
surface data model. Literal and function values have no setter.

See [Catalogs](./docs/catalogs.md) for components, children, bindings, actions,
and functions.

## Give An Agent The Same Catalog

The catalog used by `A2UIRenderer` can also produce an A2UI JSON Schema
document for your agent. Export it during your app's build or in a server
environment that can import your catalog definition:

```ts
import { exportA2UICatalogSchema } from "a2ui-react-native-renderer/catalog-schema";
import { catalog } from "./catalog";

const agentCatalog = exportA2UICatalogSchema(catalog);
const json = JSON.stringify(agentCatalog);
// Store or send json through your own agent infrastructure.
```

Use the same `catalog` with the mobile renderer. The separate import keeps
schema conversion out of apps that only import the renderer. The exported
document contains component and function contracts, not presenters or
implementations. If the catalog module imports native components, generate the
JSON in a build environment that can load that module, then deliver the JSON
artifact from your server. Keep the document's `catalogId` in sync with the
surface's catalog ID; give breaking changes a new ID. See
[Catalogs](./docs/catalogs.md#export-a-catalog-for-an-agent) for supported Zod
shapes and error handling.

## Errors And Untrusted Input

A2UI messages must be treated as untrusted input. Before a surface revision is
published, the engine validates message shape, catalog IDs, component schemas,
structural IDs, known cycles, JSON pointers, and configured resource limits.
A root or child definition that has not arrived yet is pending, not invalid.
An invalid update reports a structured `A2UIRendererError` and keeps the last
valid surface revision when possible.

Messages in a batch apply in order. An invalid message is reported and skipped;
later valid messages continue, including messages for that same surface. A
batch exceeding `maxMessagesPerBatch` is rejected before any message applies.

```tsx
<A2UIRenderer
  catalogs={[catalog]}
  messages={messages}
  diagnostics="production"
  onError={(error) => telemetry.capture(error)}
  renderFallback={() => <Text>Interface unavailable</Text>}
/>
```

Development diagnostics expose sanitized identifiers only. Production renders
nothing unless the consumer provides `renderFallback`; `onError` still runs in
both modes. Raw messages, data models, causes, and component properties are not
rendered by the default fallback.

See [Errors And Security](./docs/errors-and-security.md) for recovery behavior,
error codes, limits, and trust boundaries.

## Public API

| Area               | Main exports                                                                             |
| ------------------ | ---------------------------------------------------------------------------------------- |
| Catalogs           | `defineA2UICatalog`, `defineA2UIComponent`, `defineA2UIFunction`                         |
| Schema export      | `exportA2UICatalogSchema` from `a2ui-react-native-renderer/catalog-schema`               |
| Simple rendering   | `A2UIRenderer`                                                                           |
| React engine       | `useA2UIEngine`                                                                          |
| Advanced rendering | `createA2UIEngine`, `A2UIProvider`, `A2UISurface`                                        |
| React state        | `useA2UISurface`, `useA2UISurfaceIds`, `useA2UIErrors`                                   |
| Protocol schemas   | `A2UIActionSchema`, `A2UIChildListSchema`, `A2UIComponentIdSchema`, `A2UIDynamic*Schema` |
| Validation         | `DEFAULT_A2UI_RESOURCE_LIMITS`                                                           |

The complete value and type reference is in [Public API](./docs/api.md).

## Documentation

- [Core Concepts](./docs/concepts.md)
- [Architecture](./docs/architecture.md)
- [Catalogs](./docs/catalogs.md)
- [Streaming And Actions](./docs/streaming-and-actions.md)
- [Errors And Security](./docs/errors-and-security.md)
- [Migration Guide](./docs/migration.md)
- [Contributing](./CONTRIBUTING.md)
- [Changelog](./CHANGELOG.md)
- [Release Process](./RELEASING.md)

## Expo Example

[`example/expo`](./example/expo) is an Expo SDK 57 consumer that owns its entire
catalog. It demonstrates simple rendering, staged streaming, two-way binding,
actions, surface deletion, development diagnostics, and recovery.

```sh
pnpm install
pnpm --dir example/expo start
```

Press `i` for iOS or `a` for Android. Production bundle verification is also
available:

```sh
pnpm example:export
```

## Limitations

- A2UI `v0.9` and `v0.9.1` accept progressive component updates. The protocol
  does not tell the renderer when an unresolved reference will never arrive;
  the application owns any timeout or retry policy.
- No Basic Catalog or other visual catalog is bundled.
- No transport, agent, model, chat UI, persistence, or server integration is
  included.
- Catalog objects/order and effective resource limits are construction settings
  for `useA2UIEngine`; catalogs are construction settings for owned
  `A2UIRenderer`. Remount the owner to change them.
- Resource limits protect correctness and memory boundaries, but the package
  does not promise a frame-time SLA for consumer presenters.
- The package currently provides ESM and TypeScript declaration output.

## Development

```sh
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm release:check
```

`release:check` also packs the real npm tarball and installs it into isolated
Expo and bare React Native consumers before bundling iOS and Android.

## License

Apache-2.0
