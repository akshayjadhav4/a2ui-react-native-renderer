# Catalogs

A catalog is the consuming application's explicit allowlist of native A2UI
capabilities. The package provides catalog contracts but no component catalog.

## Define Components

Each component combines a Zod object schema with a presenter:

```tsx
const Label = defineA2UIComponent({
  schema: z.object({
    text: A2UIDynamicStringSchema,
    tone: z.enum(["normal", "muted"]).optional(),
  }),
  presenter: ({ props }) => (
    <Text style={{ opacity: props.tone === "muted" ? 0.6 : 1 }}>
      {props.text}
    </Text>
  ),
  description: "Native text label",
});

const catalog = defineA2UICatalog({
  id: "urn:example:a2ui:catalog:v1",
  components: { Label },
});
```

The component name is the map key (`Label`). It must match the `component`
field emitted in `updateComponents`. The surface catalog ID must match
`catalog.id`.

Descriptions are optional runtime metadata. If provided, they cannot be empty.
The renderer does not automatically send descriptions or schemas to a model;
the consumer or server owns any catalog IDL used for generation.

## Presenter Contract

A presenter receives:

- `props`: schema-validated, dynamically resolved values;
- `surfaceId` and `componentId`: stable protocol identifiers;
- `scope`: current template value and absolute pointer path;
- `renderChild(componentId, scopePath?)`: renders an explicit child reference;
- `dispatch(action)`: emits an event or invokes a registered local function.

Presenters are ordinary React components. They may use React Native, Expo UI, a
design system, or application-specific native modules. Keep them deterministic
during render and perform effects through native callbacks.

## Dynamic Values And Bindings

Use `A2UIDynamicStringSchema`, `A2UIDynamicNumberSchema`,
`A2UIDynamicBooleanSchema`, `A2UIDynamicStringListSchema`, or
`A2UIDynamicValueSchema` when a property may be a literal, binding, or function
call.

```tsx
const Input = defineA2UIComponent({
  schema: z.object({ value: A2UIDynamicStringSchema }),
  presenter: ({ props }) => (
    <TextInput
      value={props.value ?? ""}
      editable={props.setValue !== undefined}
      onChangeText={props.setValue}
    />
  ),
});
```

If the wire value is `{ path: "/form/name" }`, the presenter receives the
resolved string or `undefined` when the path is missing, plus a generated
`setValue` setter. Literal and function values have no setter. Its public type
is optional: call `props.setValue?.(next)` or use its presence to control native
editability. The setter updates only that surface's data model; it does not send
a network message. JSON Pointer escaping follows RFC 6901 (`~0` for `~`, `~1`
for `/`).

Typed dynamic fields reject wrong-type bound reads, function results, and local
writes through `onError`. A saved setter cannot write after its component is
replaced or its surface is deleted. Nested object and array fields follow the
same resolved-value and optional-setter rules. A component schema cannot define
a real property with the same name as a generated setter for a sibling dynamic
field.

Relative paths resolve against the current template scope. This allows one
template component to read and write each repeated item without losing its
absolute pointer context.

## Children And Templates

Use `A2UIComponentIdSchema` for one structural child. The presenter receives a
string ID:

```tsx
const Card = defineA2UIComponent({
  schema: z.object({ child: A2UIComponentIdSchema }),
  presenter: ({ props, renderChild }) => (
    <View>{renderChild(props.child)}</View>
  ),
});
```

Use `A2UIChildListSchema` for a child list. Resolved children contain an ID and
base path:

```tsx
const Column = defineA2UIComponent({
  schema: z.object({ children: A2UIChildListSchema }),
  presenter: ({ props, renderChild }) => (
    <View>
      {props.children.map((child) => renderChild(child.id, child.basePath))}
    </View>
  ),
});
```

The wire form may be a static component-ID list or a structural template that
repeats one component against a data-model path. A plain `z.string()` remains a
literal property and is never treated as a child reference. Missing marked
children remain pending so a later update can fill them; known cycles, empty
IDs, excessive depth, and resource limits are rejected before commit.

## Actions

Use `A2UIActionSchema` in interactive component schemas. Call `dispatch` only
from an interaction handler:

```tsx
const Button = defineA2UIComponent({
  schema: z.object({
    label: A2UIDynamicStringSchema,
    action: A2UIActionSchema,
  }),
  presenter: ({ props, dispatch }) => (
    <Pressable onPress={() => dispatch(props.action)}>
      <Text>{props.label}</Text>
    </Pressable>
  ),
});
```

Event context bindings resolve at dispatch time, so the consumer receives the
latest form or template data. See [Streaming And Actions](./streaming-and-actions.md).

## Functions

Functions are catalog-owned and schema validated:

```tsx
const formatCount = defineA2UIFunction({
  name: "formatCount",
  args: z.object({ count: z.number() }),
  returns: "string",
  execute: ({ count }) => `${count} items`,
});

const catalog = defineA2UICatalog({
  id: "urn:example:a2ui:catalog:v1",
  components: { Label },
  functions: [formatCount],
});
```

Allowed return kinds are `string`, `number`, `boolean`, `object`, `array`, and
`unknown`. Arguments and returned values are validated. Unknown functions,
thrown implementations, and invalid results become `FUNCTION_ERROR`.

Rendering functions should be deterministic and side-effect free because they
may be evaluated again when data changes. A function-call action is local: it
runs after presenter dispatch and is not forwarded through `onAction`.

## Catalog Versioning

Treat a catalog ID as a contract version. If a component name or property
changes incompatibly, publish a new catalog ID and keep old surfaces paired with
their original catalog. Do not silently reinterpret an existing catalog ID.
