# a2ui-react-native-renderer

A catalog-agnostic A2UI renderer and protocol runtime for React Native and
Expo.

The package is under active development and is not published yet. It includes
no UI component catalog: applications define their own Zod schemas and native
React presenters.

## Simple API

```tsx
import { Text } from "react-native";
import { z } from "zod";
import {
  A2UIDynamicStringSchema,
  A2UIRenderer,
  defineA2UICatalog,
  defineA2UIFunction,
  type A2UIMessage,
} from "a2ui-react-native-renderer";

const catalog = defineA2UICatalog({
  id: "urn:example:a2ui:catalog:v1",
  components: {
    Text: {
      schema: z.object({ text: A2UIDynamicStringSchema }),
      presenter: ({ props }) => <Text>{props.text}</Text>,
    },
  },
});

export function AgentUI({ messages }: { messages: A2UIMessage[] }) {
  return <A2UIRenderer catalogs={[catalog]} messages={messages} />;
}
```

`A2UIRenderer` owns one engine, incrementally applies appended messages, and
renders every active surface. Catalogs must remain stable while it is mounted.

Use ordinary Zod fields for static properties. Use the exported
`A2UIDynamic*Schema` primitives for properties that may bind to the A2UI data
model. Presenters receive resolved values; bound properties also receive typed
setters such as `setValue` for native input controls.

## Advanced API

Use an application-owned engine when surfaces need custom placement, such as
inside individual chat turns.

```tsx
const engine = createA2UIEngine({
  catalogs: [catalog],
  onAction: sendActionToAgent,
  onError: reportRendererError,
});

agentStream.onMessage((message) => engine.applyMessage(message));

function Surface({ surfaceId }: { surfaceId: string }) {
  return (
    <A2UIProvider engine={engine}>
      <A2UISurface surfaceId={surfaceId} />
    </A2UIProvider>
  );
}
```

Transport, chat state, persistence, and the component catalog remain owned by
the consuming application.

## Expo Example

[`example/expo`](./example/expo) is an Expo SDK 57 consumer that imports the
library through its public package exports. It owns its schemas and native
presenters and demonstrates simple rendering, incremental streaming, data
binding, actions, deletion, diagnostics, and recovery.

```sh
pnpm example:check
pnpm example:export
```

The export command builds standalone iOS and Android production bundles. No
Metro resolver alias points at package source.

## Actions

Use `A2UIActionSchema` for interactive component properties. A presenter calls
`dispatch(props.action)` when its native control is activated. The engine
resolves action context from that surface's latest data model and sends one
official `A2UIUserAction` to `onAction`; the application owns transport back to
the agent.

## Functions

Functions are consumer-owned catalog capabilities. Define each function with a
Zod argument schema and declared return kind, then register it in the catalog.

```tsx
const formatPrice = defineA2UIFunction({
  name: "formatPrice",
  args: z.object({ amount: z.number(), currency: z.string() }),
  returns: "string",
  execute: ({ amount, currency }) =>
    new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(amount),
});

const catalogWithFunctions = defineA2UICatalog({
  id: "urn:example:a2ui:catalog:with-functions:v1",
  components: catalog.components,
  functions: [formatPrice],
});
```

The engine evaluates function calls in dynamic presenter properties, action
context, and local function actions. Arguments may contain data bindings or
nested function calls. Unknown functions, invalid arguments, thrown
implementations, and invalid return values are contained as `FUNCTION_ERROR`
diagnostics.

The package bundles no built-ins. Functions used while rendering should be
deterministic and side-effect free. A local function action may perform an
explicit client-side effect because it runs only after presenter dispatch; it
is not forwarded through `onAction`.

## Validation And Limits

Messages are treated as untrusted input. Before updating visible state, the
engine validates component IDs, the reserved `root`, catalog schemas,
structural references, binding paths, graph cycles, and configured resource
limits. A failed update reports a structured error and preserves the last valid
surface revision.

```tsx
const engine = createA2UIEngine({
  catalogs: [catalog],
  limits: {
    maxComponentsPerSurface: 250,
    maxComponentDepth: 48,
    maxDataModelBytes: 512 * 1024,
    maxMessagesPerBatch: 500,
  },
});
```

Defaults are exported as `DEFAULT_A2UI_RESOURCE_LIMITS`: 500 components, 64
levels, 1 MiB of data per surface, and 1,000 messages per batch. Validation is
transactional per surface, so one invalid surface does not prevent independent
valid surfaces in the same batch from committing.

## Diagnostics And Recovery

Every validation, binding, function, action, and presenter failure is recorded
as an `A2UIRendererError`. The engine calls `onError` without allowing a failing
consumer callback to interrupt protocol processing.

Presenters run inside component-level error boundaries. A broken child can fall
back without removing healthy siblings, and a later valid surface revision
resets the boundary. An unexpected renderer failure is also contained at the
surface boundary.

```tsx
<A2UISurface
  surfaceId={surfaceId}
  diagnostics="production"
  renderFallback={(error) => (
    <SurfaceUnavailable accessibilityLabel={`UI error ${error.code}`} />
  )}
/>
```

`diagnostics` accepts `"auto"`, `"development"`, or `"production"` and defaults
to `"auto"`. Auto mode follows React Native's `__DEV__` global. Without a custom
fallback, development logs only the error code and sanitized surface, catalog,
component, and path identifiers; production renders `null`. Neither mode shows
raw A2UI messages, data models, exception messages, or causes.

`renderFallback` is optional and works in every mode. It lets the application
provide a native, accessible fallback without the renderer package imposing a
component library or visual design. `onError` still receives the structured
error for telemetry and recovery decisions.

## Performance And Subscriptions

The engine publishes immutable snapshots. Its top-level `revision` advances
whenever protocol processing publishes a change, while `surfaceIds` and
`failedSurfaceIds` retain their array identity until their membership or order
changes. This keeps `useSyncExternalStore` consumers from rerendering for an
unchanged collection.

`A2UISurface` subscribes directly to its requested surface. Updating or failing
one surface does not rerender presenters mounted for another surface. A change
inside a surface may rerender that surface's tree because dynamic component
properties can depend on its latest data model.

The default 500-component surface limit is covered by an integration fixture
that validates and renders the complete tree without a stack overflow or
crash. This is a correctness boundary, not a frame-time guarantee; applications
should choose lower limits when their presenters or target devices require it.
