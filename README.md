# React Native A2UI Renderer

**`a2ui-react-native-renderer` is an A2UI renderer for React Native and Expo.**
Build interactive, agent-driven interfaces using your own React Native components
and design system. Supports A2UI `v0.9` and `v0.9.1`.

[A2UI](https://a2ui.org/) lets AI agents describe interactive interfaces as
declarative JSON instead of executable UI code. This library brings that flow to
React Native: your agent sends component descriptions and data, and the renderer
validates them against your catalog and renders the components you allow.
Stream UI updates, bind editable forms to data, and handle user actions with
TypeScript and Zod schemas.

**A2UI JSON → your catalog → your React Native UI**

New to A2UI? Start with the [quick start](#quick-start).
Already building? Jump to [features](#features-and-guides),
[streaming](#connect-a-message-stream), or the [API reference](./docs/api.md).

## Install

```sh
npm install a2ui-react-native-renderer 'zod@^3.25'
```

Requires React ≥18.2, React Native ≥0.76 (including Expo), and Zod ≥3.25 <4.
React and React Native come from your app. Repository development requires Node.js ≥20.

## Quick start

A **catalog** lists the components an agent may request. Each entry has a
**schema** for its allowed properties and a **presenter** that renders them.
Start with one text component:

```tsx
import { Text } from "react-native";
import { z } from "zod";
import {
  A2UIRenderer,
  defineA2UICatalog,
  type A2UIMessage,
} from "a2ui-react-native-renderer";

// Define once, outside your React component.
export const catalog = defineA2UICatalog({
  id: "urn:example:a2ui:catalog:v1",
  components: {
    Text: {
      schema: z.object({ text: z.string() }),
      presenter: ({ props }) => <Text>{props.text}</Text>,
    },
  },
});

// In a real app, these messages come from your backend.
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
      components: [{ id: "root", component: "Text", text: "Hello from A2UI" }],
    },
  },
];

export function AgentUI() {
  return <A2UIRenderer catalogs={[catalog]} messages={messages} />;
}
```

This displays **Hello from A2UI**. A **surface** is one independent interface:
`createSurface` creates it, and `updateComponents` supplies its components.
The entry component has the ID `root`; `catalogId` must match your catalog.
Use `version: "v0.9"` for a v0.9 producer.

`A2UIRenderer` owns the engine and renders all active surfaces. Append incoming
messages to the array to apply more updates. Keep the catalog definition stable
while mounted. See [core concepts](./docs/concepts.md) for the message lifecycle.

## Features and guides

| Feature                    | Use                                                    | Guide                                                                                    |
| -------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Custom components          | Zod schemas + native presenters                        | [Components](./docs/catalogs.md#define-components)                                       |
| Data binding               | `A2UIDynamic*Schema` helpers                           | [Bindings](./docs/catalogs.md#dynamic-values-and-bindings)                               |
| Editable inputs            | Direct bindings + generated setters such as `setValue` | [Editable values](./docs/catalogs.md#dynamic-values-and-bindings)                        |
| Layouts and lists          | `renderChild`, child IDs, and templates                | [Children](./docs/catalogs.md#children-and-templates)                                    |
| User actions               | Presenter `dispatch` + engine `onAction`               | [Actions](./docs/catalogs.md#actions)                                                    |
| Client functions           | `defineA2UIFunction`                                   | [Functions](./docs/catalogs.md#functions)                                                |
| Surface themes             | Catalog `themeSchema` + presenter `theme`              | [Themes](./docs/catalogs.md#surface-themes)                                              |
| Data model sharing         | `engine.getClientDataModel(surfaceIds)`                | [Model sharing](./docs/streaming-and-actions.md#attach-the-current-data-model)           |
| Surface placement          | `useA2UIEngine` + `A2UISurface`                        | [Streaming](./docs/streaming-and-actions.md)                                             |
| Loading states             | `renderPending`                                        | [Progressive rendering](./docs/streaming-and-actions.md#progressive-components-and-data) |
| Catalog schema export      | `exportA2UICatalogSchema`                              | [Schema export](./docs/catalogs.md#export-a-catalog-for-an-agent)                        |
| Errors and resource limits | `onError`, `renderFallback`, `limits`                  | [Errors and security](./docs/errors-and-security.md)                                     |
| Catalog testing            | `createA2UITestHarness` from the `/testing` entry      | [Testing](./docs/testing.md)                                                             |

**Actions are your app's contract.** You define event names and handle them in
`onAction`; the renderer does not invent business actions. Local functions are
registered separately and run on the client.

**Model sharing is explicit.** When a surface opts in with `sendDataModel: true`,
`getClientDataModel` can return its current model, including user edits. Your app
selects the destination's surface IDs and attaches the result to outgoing
messages as `metadata.a2uiClientDataModel`. The renderer does not send it itself.

## Connect a message stream

Your backend can send A2UI messages as they become available: create a surface,
add components, update their data, or delete the surface. Feed each incoming
message to `engine.applyMessage`; the visible UI updates automatically.

Here is a **WebSocket example**. Your app passes an already-connected
`backendSocket` whose text frames each contain one A2UI JSON message, plus the
`surfaceId` it wants to display. It reuses `catalog` from the quick start.

```tsx
import { useEffect } from "react";
import { A2UISurface, useA2UIEngine } from "a2ui-react-native-renderer";

export function AgentSurface({
  backendSocket,
  surfaceId,
}: {
  backendSocket: WebSocket;
  surfaceId: string;
}) {
  const engine = useA2UIEngine({
    catalogs: [catalog],
    onError: (error) => console.error("A2UI rendering failed", error),
  });

  useEffect(() => {
    function handleBackendMessage(event: { data?: unknown }) {
      if (typeof event.data !== "string") return;

      let a2uiMessage: unknown;
      try {
        a2uiMessage = JSON.parse(event.data);
      } catch {
        console.error("Backend sent invalid JSON");
        return;
      }
      engine.applyMessage(a2uiMessage);
    }

    backendSocket.addEventListener("message", handleBackendMessage);
    return () => {
      backendSocket.removeEventListener("message", handleBackendMessage);
    };
  }, [backendSocket, engine]);

  return <A2UISurface engine={engine} surfaceId={surfaceId} />;
}
```

The listener receives **A2UI JSON from your backend**, not individual LLM text
tokens. If your backend wraps messages in another envelope, extract the A2UI
message before passing it to the engine. HTTP streaming and other transports
use the same `applyMessage` call.

React removes this listener on cleanup; `useA2UIEngine` disposes its engine on
unmount. Your app owns opening, reconnecting, and closing the socket. Mount the
listener before your backend starts delivering messages. For several surfaces
in one conversation, keep one engine in the conversation owner and pass it to
each `A2UISurface`.

| Rendering need                              | API                                                                           |
| ------------------------------------------- | ----------------------------------------------------------------------------- |
| Render a message array                      | `<A2UIRenderer catalogs={[catalog]} messages={messages} />`                   |
| Render all surfaces from an existing engine | `<A2UIRenderer engine={engine} />`                                            |
| Place one surface                           | `<A2UISurface engine={engine} surfaceId="welcome" />`                         |
| Manage an engine outside React              | `createA2UIEngine`; call `dispose()` when finished                            |
| Read state in descendants                   | `A2UIProvider` with `useA2UISurface`, `useA2UISurfaceIds`, or `useA2UIErrors` |

Keep catalog objects/order and effective resource limits stable for a hook-owned
engine; remount to change them. Action/error callbacks may change on rerender.
See [streaming and actions](./docs/streaming-and-actions.md) for a complete
subscription, action replies, model sharing, and cleanup.

## Give your agent the catalog

Export your catalog as JSON Schema so your backend can tell an agent which
components, properties, functions, and theme values the app accepts:

```ts
import { exportA2UICatalogSchema } from "a2ui-react-native-renderer/catalog-schema";
import { catalog } from "./catalog";

const agentCatalog = exportA2UICatalogSchema(catalog);
const json = JSON.stringify(agentCatalog);
// Deliver this JSON through your own agent infrastructure.
```

Generate this in a build environment that can load your catalog module. If it
imports native components, serve the generated JSON artifact from your backend.
The export contains schemas, not native presenters or function implementations.
See [schema export](./docs/catalogs.md#export-a-catalog-for-an-agent) for supported
Zod shapes and catalog versioning.

## Before shipping

- **Handle errors:** provide `onError` for reporting and `renderFallback` for your
  error UI. With `diagnostics="production"`, the default error UI renders nothing.
- **Expect partial delivery:** `v0.9` and `v0.9.1` accept progressive component updates.
  Missing components can render through `renderPending`; your app owns timeout
  and retry decisions. Missing bound data reaches presenters as `undefined`.
- **Understand recovery:** invalid messages report structured errors and preserve
  the last valid revision when possible. Later messages in a batch still run;
  a batch exceeding its size limit is rejected in full.
- **Set appropriate limits:** incoming content is validated against message and
  catalog schemas, structural references, JSON pointers, cycles, and resource limits.

See [errors and security](./docs/errors-and-security.md) for error codes,
validation boundaries, and configuration.

## What your app owns

Your app supplies components, styling, networking, agent integration, and surface
placement. This lets you use your existing design system.

- No Basic Catalog or other visual catalog is bundled.
- No transport, agent, model, chat UI, persistence, or server integration is included.
- The package provides ESM and TypeScript declarations.

## Try the Expo demo

The [example app](./example/expo/README.md) includes local fixtures and a network
demo for both protocol versions: editable forms, actions, themes, model sharing,
progressive rendering, and error recovery.

From this repository:

```sh
pnpm install
pnpm build
pnpm --filter a2ui-renderer-example start
```

Press `i` for iOS or `a` for Android. For **Network demo**, also start
`pnpm --filter a2ui-demo-server start` in another terminal. See the
[demo instructions](./example/expo/README.md#run-the-network-demo) for emulator
and physical-device endpoints.

## Reference and contributing

- [API reference](./docs/api.md) — complete exports, options, and types
- [Architecture](./docs/architecture.md) — runtime internals and ownership
- [Migration guide](./docs/migration.md) — upgrading from the earlier API
- [Changelog](./CHANGELOG.md) — changes by version
- [Contributing](./CONTRIBUTING.md) — setup and development checks
- [Release process](./RELEASING.md) — package verification and publishing

## License

Apache-2.0
