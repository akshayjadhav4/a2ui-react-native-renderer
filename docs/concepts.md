# Core Concepts

This document explains the public concepts proposed for
`a2ui-react-native-renderer`, what each one owns, and when an application needs
it.

The package has two levels of API:

1. **Simple:** pass A2UI messages and catalogs to `A2UIRenderer`.
2. **Advanced:** own an engine and render individual surfaces with
   `A2UIProvider` and `A2UISurface`.

Most applications should begin with the simple API. The advanced API exists for
streaming chat, multiple surfaces, custom placement, and explicit lifecycle
control.

## The Short Version

| Term           | Meaning                                                    | Usually created by           |
| -------------- | ---------------------------------------------------------- | ---------------------------- |
| A2UI message   | A protocol command that creates or updates UI              | Agent/server                 |
| Catalog        | The components an application permits                      | Application developer        |
| Schema         | The allowed properties for one catalog component           | Application developer        |
| Presenter      | The React Native component that draws it                   | Application developer        |
| Surface        | One independently updateable A2UI document                 | Agent/server                 |
| Engine         | Stateful runtime that processes messages and owns surfaces | Package or advanced consumer |
| `A2UIRenderer` | Simple all-in-one React component                          | Application                  |
| `A2UIProvider` | Makes an existing engine available to descendants          | Advanced application         |
| `A2UISurface`  | Renders and subscribes to one surface                      | Advanced application         |
| User action    | Typed event emitted by native UI                           | Renderer/package             |

## A2UI Message

An A2UI message is a protocol instruction. It is not React code and it is not a
complete screen specification that must be replaced on every update.

The v0.9 lifecycle includes messages such as:

- `createSurface`: start an independently updateable UI surface;
- `updateComponents`: provide or replace component definitions;
- `updateDataModel`: provide or update bound data;
- `deleteSurface`: remove the surface.

Example:

```ts
const messages: A2UIMessage[] = [
  {
    version: "v0.9",
    createSurface: {
      surfaceId: "welcome",
      catalogId: "urn:example:a2ui:catalog:v1",
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
```

The package processes these messages. It does not fetch them. They can arrive
through AG-UI, HTTP, WebSocket, local fixtures, an on-device model, or any other
transport.

## Surface

A surface is one independently managed A2UI document.

Every surface has a `surfaceId`. Later messages use this ID to update or delete
the correct UI without replacing unrelated UI.

Examples of separate surfaces in one chat are:

- a product carousel returned during one assistant turn;
- a reminder form returned during another turn;
- a leaderboard returned later.

Each surface can continue to exist after newer chat messages arrive. This is why
the protocol needs a stable `surfaceId` instead of treating generated UI as one
temporary React component.

## Catalog

A catalog is the application's allowlist of A2UI components and functions.

The package intentionally ships without a catalog. The consuming application
decides what components are safe, supported, and appropriate for its design
system.

```tsx
const catalog = defineA2UICatalog({
  id: "urn:example:a2ui:catalog:v1",
  components: {
    Text: TextComponent,
    Button: ButtonComponent,
  },
});
```

The catalog ID must match the `catalogId` used when the agent creates a surface.
This prevents a surface authored for one component contract from being rendered
through a different contract by accident.

A catalog contains definitions, not mounted React elements. It is immutable and
can be reused by multiple engine instances.

## Component Schema

A schema describes the properties accepted by an A2UI component.

```tsx
const TextSchema = z.object({
  text: z.string(),
  variant: z.enum(["body", "heading"]).optional(),
});
```

The schema provides three protections:

1. Invalid agent output is rejected before reaching the presenter.
2. The presenter receives inferred TypeScript properties.
3. The application has one explicit contract for what the component supports.

Schemas describe component-specific properties. Protocol properties such as
`id` and `component` remain owned by the A2UI engine.

`@a2ui/web_core` v0.9 uses Zod for component contracts, so the initial package
API uses compatible Zod v3 schemas rather than introducing a second validation
system.

## Presenter

A presenter is the React Native implementation of one catalog component.

```tsx
function TextPresenter({ props }: A2UIPresenterProps<TextProps>) {
  const fontSize = props.variant === "heading" ? 24 : 16;

  return <Text style={{ fontSize }}>{props.text}</Text>;
}
```

The schema answers **what properties are valid**. The presenter answers **how
those properties look and behave on this platform**.

Presenters may use:

- React Native core components;
- Expo UI;
- an application's design system;
- platform-specific `.ios.tsx` and `.android.tsx` files;
- native modules owned by the consuming application.

The renderer resolves A2UI data bindings before invoking a presenter. The
presenter should receive ordinary resolved values rather than parse JSON
pointers itself.

Catalog schemas describe the wire contract. Static fields use ordinary Zod
schemas. Fields that allow A2UI data bindings use the package's protocol
schemas:

```tsx
const TextFieldComponent = defineA2UIComponent({
  schema: z.object({
    label: A2UIDynamicStringSchema,
    value: A2UIDynamicStringSchema,
  }),
  presenter: ({ props }) => (
    <TextInput
      accessibilityLabel={props.label}
      value={props.value}
      onChangeText={props.setValue}
    />
  ),
});
```

An incoming `{ path: "/form/name" }` is validated by the dynamic schema, read
from that surface's data model, and delivered as a string. The generated
`setValue` writes through the same binding. Relative paths are resolved against
the presenter's `scope.path`, which lets one template component render and edit
each item in a structural list without losing pointer context.

## `defineA2UIComponent`

`defineA2UIComponent` pairs a schema with its presenter while preserving
TypeScript inference.

```tsx
const TextComponent = defineA2UIComponent({
  schema: z.object({
    text: A2UIDynamicStringSchema,
    variant: z.enum(["body", "heading"]).optional(),
  }),
  presenter: TextPresenter,
});
```

It does not mount the presenter, create global state, or register anything by
itself. It is a typed definition consumed by `defineA2UICatalog`.

## `defineA2UICatalog`

`defineA2UICatalog` creates an immutable catalog from consumer-owned component
and function definitions.

```tsx
const catalog = defineA2UICatalog({
  id: "urn:example:a2ui:catalog:v1",
  components: {
    Text: TextComponent,
    Button: ButtonComponent,
  },
});
```

It verifies catalog-level invariants such as:

- a non-empty catalog ID;
- unique component names;
- valid component definitions;
- valid optional function definitions.

It does not create an engine. One catalog can be passed to many engines.

## `createA2UIEngine`

The engine is the stateful protocol runtime.

```tsx
const engine = createA2UIEngine({
  catalogs: [catalog],
  onAction: handleAction,
  onError: handleError,
});
```

It owns:

- registered catalogs;
- active surfaces;
- component definitions;
- data models;
- resolved binding contexts;
- protocol message application;
- action dispatch;
- structured errors;
- subscriptions used by React.

Messages change engine state:

```ts
engine.applyMessage(message);
engine.applyMessages(messageBatch);
```

The engine does not render React elements and does not know where a surface
belongs in the application. This separation allows the same engine to drive
surfaces placed in different chat messages or screens.

### Why Is The Engine Separate?

A2UI is incremental. A surface may be created now, receive data later, update
its component tree after that, and be deleted during a future turn.

React props alone can represent a static snapshot, but a long-lived engine is
better suited to:

- streaming updates;
- multiple independent surfaces;
- retaining earlier surfaces in chat;
- action context and current data models;
- updates that arrive outside a React render;
- subscribing only to the surface that changed.

Simple consumers do not need to create the engine manually because
`A2UIRenderer` can own one internally.

## `A2UIProvider`

`A2UIProvider` makes an existing engine available through React context.

```tsx
<A2UIProvider engine={engine}>
  <ChatScreen />
</A2UIProvider>
```

The provider does not:

- create an engine;
- process network events;
- store chat history;
- render a surface;
- duplicate engine state in React state.

It is dependency injection for the React tree. Descendants such as
`A2UISurface` and engine hooks can locate the same engine without passing it
through every component.

Use a provider when the application owns a long-lived engine. Do not add a
provider only because one appears in the advanced example.

## `A2UISurface`

`A2UISurface` renders one surface from the nearest `A2UIProvider`.

```tsx
<A2UISurface surfaceId="products-42" />
```

It:

- subscribes only to the requested surface;
- finds the surface's catalog;
- resolves the root component;
- renders the component tree through registered presenters;
- contains presenter failures through an error boundary.

It does not process chat messages or choose where the surface appears. The host
application controls placement.

This is the advanced primitive used by chat applications:

```tsx
function SurfaceMessage({ surfaceId }: { surfaceId: string }) {
  return (
    <View style={{ width: "100%" }}>
      <A2UISurface surfaceId={surfaceId} />
    </View>
  );
}
```

## `A2UIRenderer`

`A2UIRenderer` is the convenience API for consumers that do not need manual
surface placement or engine ownership.

```tsx
<A2UIRenderer
  catalogs={[catalog]}
  messages={messages}
  onAction={handleAction}
  onError={handleError}
/>
```

It composes the lower-level primitives:

```text
A2UIRenderer
  -> creates one stable internal engine
  -> applies each new message batch once
  -> provides the engine with A2UIProvider
  -> discovers active surface IDs
  -> renders each surface with A2UISurface
```

The renderer must not recreate its engine on every React render. It must not
reapply unchanged message arrays repeatedly.

Use `A2UIRenderer` when:

- the application has one message collection;
- all active surfaces can render together at the renderer location;
- the application does not need to insert surfaces at separate transcript
  positions;
- the package may own the engine lifecycle.

Do not use it as the top-level chat runtime when individual surfaces must appear
beside different assistant messages. Use the advanced API for that case.

## User Actions

A presenter may dispatch an A2UI user action when a native control is used.

```tsx
const ButtonComponent = defineA2UIComponent({
  schema: z.object({
    label: A2UIDynamicStringSchema,
    action: A2UIActionSchema,
  }),
  presenter: ButtonPresenter,
});

function ButtonPresenter({ props, dispatch }: A2UIPresenterProps<ButtonProps>) {
  return (
    <Pressable onPress={() => dispatch(props.action)}>
      <Text>{props.label}</Text>
    </Pressable>
  );
}
```

The engine resolves the action context against the current data model and sends
the resulting official A2UI action to the consumer callback. Resolution happens
when the interaction occurs, so a long-lived native handler cannot send stale
form or template data:

```tsx
const engine = createA2UIEngine({
  catalogs: [catalog],
  onAction(action) {
    transport.send({ a2ui: { action } });
  },
});
```

The package produces the action. The consumer decides how to transport it back
to an agent.

## Functions

A2UI functions are catalog-owned computations used by bindings, formatting,
conditions, or actions.

```tsx
const formatPrice = defineA2UIFunction({
  name: "formatPrice",
  args: z.object({ amount: z.number(), currency: z.string() }),
  returns: "string",
  execute({ amount, currency }) {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(amount);
  },
});

const catalogWithFunctions = defineA2UICatalog({
  id: "urn:example:a2ui:catalog:with-functions:v1",
  components: catalog.components,
  functions: [formatPrice],
});
```

The package ships no application functions. Consumers register only the
functions their catalog supports.

The engine validates each call, resolves data bindings and nested function
arguments, validates the consumer function's arguments, and validates its
declared return kind. Unknown, invalid, or thrown functions become contained
`FUNCTION_ERROR` diagnostics.

Functions used by presenter properties or event context should be deterministic
and side-effect free because they may be reevaluated when surface data changes.
A local function action is different: it runs once after presenter dispatch and
may perform an intentional client-side effect. Local function actions are not
forwarded to the engine's `onAction` callback.

## Validation And Resource Limits

The engine validates every candidate surface graph before forwarding messages
to the protocol core. Validation covers component IDs and schemas, the reserved
`root`, structural references, JSON pointer syntax, cycles, and resource
limits. Messages for each surface form a transaction: if one fails, none of
that surface's messages in the batch commit. Other valid surfaces remain
independent.

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

Unspecified limits use `DEFAULT_A2UI_RESOURCE_LIMITS`. Invalid limit values are
rejected when the engine is created. At runtime, limit failures use
`RESOURCE_LIMIT_EXCEEDED`; graph, schema, and binding failures use their
specific structured error codes and preserve the last valid revision.

## Errors And Fallbacks

A2UI input is generated remotely and must be considered untrusted.

Every validation, protocol, binding, or presenter failure produces a structured
error through `onError` and the engine error API.

```tsx
<A2UIRenderer
  catalogs={[catalog]}
  messages={messages}
  onError={(error) => logger.capture(error)}
/>
```

### Development

The package shows an actionable diagnostic fallback containing safe identifiers
such as surface ID, catalog ID, component ID, and error code.

### Production

The package does not display internal diagnostics. An invalid initial surface
renders nothing or a consumer-provided fallback. An invalid update preserves
the last valid surface revision when possible. `onError` still runs.

Production errors must never be swallowed silently, and raw A2UI JSON must not
be shown to end users.

## Simple Versus Advanced API

Choose based on ownership, not perceived sophistication.

### Use `A2UIRenderer`

```tsx
<A2UIRenderer catalogs={[catalog]} messages={messages} />
```

Choose this when:

- one component can own the renderer lifecycle;
- surfaces render together;
- messages are already collected in an array;
- minimal setup is the priority.

### Use Engine + Provider + Surface

```tsx
const engine = createA2UIEngine({ catalogs: [catalog] });

engine.applyMessages(messages);

<A2UIProvider engine={engine}>
  <A2UISurface surfaceId="main" />
</A2UIProvider>;
```

Choose this when:

- messages arrive incrementally;
- surfaces appear in different chat turns;
- the application controls replay or persistence;
- actions need current engine data;
- more than one screen consumes the same engine;
- precise surface subscriptions matter.

## What The Package Does Not Do

The package does not:

- call an LLM;
- connect to a server;
- parse AG-UI streams;
- choose when an agent should generate UI;
- provide chat components;
- persist conversations;
- ship a visual design system;
- implement the Basic Catalog;
- decide how actions are sent back to an agent.

These remain consumer responsibilities so the renderer can work with any
transport, model, backend, and component library.

## Mental Model

The complete model is:

```text
Catalog = what the application permits
Schema = what properties are valid
Presenter = how one component renders natively
Message = what the agent wants to create or update
Surface = one updateable UI document
Engine = current protocol state
Provider = engine access for React descendants
A2UISurface = renderer for one surface
A2UIRenderer = convenient composition of engine + provider + surfaces
Action = native interaction returned to the consumer
```

The separation exists to keep the package simple for static rendering while
remaining correct for incremental, long-lived A2UI applications.
