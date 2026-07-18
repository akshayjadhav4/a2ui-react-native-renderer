# a2ui-react-native-renderer

A catalog-agnostic A2UI v0.9 renderer and protocol runtime for React Native and
Expo.

The package turns official A2UI messages into consumer-owned native React
presenters. It does not bundle a component catalog, visual design system, chat
UI, model SDK, or transport.

> **Status:** The package is under active development and is not published to
> npm yet. The public API is being prepared for the first `0.1.0` release.

## Requirements

- React 18.2 or newer
- React Native 0.76 or newer, including Expo projects
- Zod 3.25
- Node.js 20 or newer for development and package tooling
- A2UI messages using protocol version `v0.9`

## Installation

After the first npm release:

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

const catalog = defineA2UICatalog({
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
    version: "v0.9",
    createSurface: {
      surfaceId: "welcome",
      catalogId: catalog.id,
    },
  },
  {
    version: "v0.9",
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
turn that created it. In that case, let the application own the engine and
render individual surfaces where they belong.

```tsx
import {
  A2UIProvider,
  A2UISurface,
  createA2UIEngine,
  type A2UIMessage,
  type A2UIUserAction,
} from "a2ui-react-native-renderer";

const engine = createA2UIEngine({
  catalogs: [catalog],
  onAction: (action: A2UIUserAction) => sendActionToAgent(action),
  onError: (error) => reportRendererError(error),
});

export function acceptA2UIMessage(message: A2UIMessage) {
  engine.applyMessage(message);
}

export function ChatSurface({ surfaceId }: { surfaceId: string }) {
  return (
    <A2UIProvider engine={engine}>
      <A2UISurface surfaceId={surfaceId} />
    </A2UIProvider>
  );
}
```

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
function calls. Bound presenter properties receive typed setters such as
`setValue`, allowing native controls to update the surface data model.

See [Catalogs](./docs/catalogs.md) for components, children, bindings, actions,
and functions.

## Errors And Untrusted Input

A2UI messages must be treated as untrusted input. Before a surface revision is
published, the engine validates message shape, catalog IDs, component schemas,
the reserved `root`, references, cycles, JSON pointers, and configured resource
limits. An invalid update reports a structured `A2UIRendererError` and keeps the
last valid surface revision when possible.

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

| Area               | Main exports                                                     |
| ------------------ | ---------------------------------------------------------------- |
| Catalogs           | `defineA2UICatalog`, `defineA2UIComponent`, `defineA2UIFunction` |
| Simple rendering   | `A2UIRenderer`                                                   |
| Advanced rendering | `createA2UIEngine`, `A2UIProvider`, `A2UISurface`                |
| React state        | `useA2UISurface`, `useA2UISurfaceIds`, `useA2UIErrors`           |
| Protocol schemas   | `A2UIActionSchema`, `A2UIChildListSchema`, `A2UIDynamic*Schema`  |
| Validation         | `DEFAULT_A2UI_RESOURCE_LIMITS`                                   |

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

- Only A2UI `v0.9` messages are accepted.
- No Basic Catalog or other visual catalog is bundled.
- No transport, agent, model, chat UI, persistence, or server integration is
  included.
- Catalogs cannot be changed on an internally owned engine after
  `A2UIRenderer` mounts; recreate the renderer to replace them.
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
