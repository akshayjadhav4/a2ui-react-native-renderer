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

The message's `version` is the A2UI wire version (`v0.9` or `v0.9.1`). A
suffix such as `:v1` in the catalog ID versions the app's own component
contract; it is independent of the wire version.

Descriptions are optional runtime metadata. If provided, they cannot be empty.

## Surface Themes

Optionally describe your app's theme in the catalog. Inline presenters infer
its fields and receive the validated theme separately from component props:

```tsx
const themeSchema = z.object({
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  spacing: z.number().min(0).default(12),
});

const catalog = defineA2UICatalog({
  id: "urn:example:a2ui:themed:v1",
  themeSchema,
  components: {
    Label: {
      schema: z.object({ text: z.string() }),
      presenter: ({ props, theme }) => (
        <Text style={{ color: theme?.primaryColor ?? "#222222" }}>
          {props.text}
        </Text>
      ),
    },
  },
});
```

The server supplies theme values when creating a surface:

```json
{
  "version": "v0.9.1",
  "createSurface": {
    "surfaceId": "main",
    "catalogId": "urn:example:a2ui:themed:v1",
    "theme": { "primaryColor": "#3366FF" }
  }
}
```

The example's accepted theme includes `spacing: 12` because the supplied object
is parsed through the schema. If the entire theme is omitted, it remains
`undefined`: the schema is not run. Your presenters choose their fallback styles.
The same behavior applies to `v0.9`.

Themes contain static JSON values and are detached and deeply frozen on
acceptance. Data/component updates preserve the theme; delete/recreate starts
with the new theme or `undefined`. Bindings and functions inside theme fields
are not evaluated. Styling, native controls and device-theme detection remain
app responsibilities.

Reusable components can explicitly declare their theme type:

```tsx
const labelSchema = z.object({ text: z.string() });
const Label = defineA2UIComponent<
  typeof labelSchema,
  z.output<typeof themeSchema>
>({
  schema: labelSchema,
  presenter: ({ props, theme }) => (
    <Text style={{ color: theme?.primaryColor ?? "#222222" }}>
      {props.text}
    </Text>
  ),
});
```

Register it in a catalog with a compatible `themeSchema`. Existing components
without explicit theme typing remain usable. Without a custom schema, a supplied
theme object is accepted as a generic readonly record with unknown field values.
`engine.getSurface(id)?.theme` also exposes a generic readonly record because an
engine can hold surfaces from different catalogs. Narrow fields before using
them, or validate against your known catalog schema for typed host access.

`exportA2UICatalogSchema(catalog)` includes the theme rules at `$defs.theme`.
Existing exporter restrictions apply: unsupported transforms/refinements fail
with the theme field path. Runtime parsing follows Zod defaults and unknown-key
rules. Invalid supplied themes reject creation through `onError` with
`INVALID_MESSAGE` and a path under `/createSurface/theme`; later valid messages
can recover. Scalar, array and null themes are rejected even without a schema.
The renderer does not automatically send descriptions or schemas to a model.

## Export A Catalog For An Agent

Use the same catalog definition for mobile rendering and agent guidance:

```ts
import { exportA2UICatalogSchema } from "a2ui-react-native-renderer/catalog-schema";

const document = exportA2UICatalogSchema(catalog);
const json = JSON.stringify(document);
// The application stores or sends json to its agent through its own infrastructure.
```

The document is an A2UI v0.9-family JSON Schema catalog for both `v0.9` and
`v0.9.1`. Its `$id` and `catalogId` equal `catalog.id`. Component names and
descriptions, supported Zod properties, marked structural references, and
representable functions come from the catalog. The document contains no
presenter or `execute` callback. The `catalog-schema` import is separate from
the React Native package root; use it during a build or on a server that can
load the app's catalog module. If that module imports native components,
generate a JSON artifact in a compatible build environment and let the server
deliver the artifact. The app owns that delivery.

Sharing this document keeps agent guidance derived from the client's schema,
but does not automatically enforce validation on the server or negotiate a
catalog with the client. The app configures its agent/validator and supplies
any referenced official common-type schemas needed by its JSON Schema tool.
The client's engine still validates received messages against its registered
catalog. Keep catalog IDs aligned and version incompatible contract changes.

The exporter supports strings, numbers, booleans, literals, enums, nested
objects, arrays, unions, optional and nullable fields, JSON defaults,
representable bounds, and descriptions. `A2UIComponentIdSchema`,
`A2UIChildListSchema`, `A2UIActionSchema`, `A2UIDataBindingSchema`, and the
`A2UIDynamic*Schema` helpers export official A2UI common-type references.
An ordinary `z.string()` remains a literal string. Unsupported transforms,
refinements, coercion, unsupported formats, recursive schemas, and defaults
that cannot be encoded as JSON throw a `TypeError` such as
`Unsupported catalog schema at components.Card.title`. Fix that field or use
another representable schema before delivering the document to an agent.

For functions, a direct wire argument may be a compatible literal, a data
binding, or a nested function call. The exporter rejects argument shapes that
the official wire schema or local resolver cannot describe faithfully, with a
path such as `functions.formatCount.args.count`. The generated `returnType`
property shows the declared return kind as its default. The renderer checks
the actual function result against the declared kind; a `returnType` value on
the wire is advisory and does not control that check. Runtime errors such as
unknown functions are reported when the function is evaluated during render.

## Presenter Contract

A presenter receives:

- `props`: schema-validated, dynamically resolved values;
- `theme`: optional validated readonly values from surface creation;
- `surfaceId` and `componentId`: stable protocol identifiers;
- `scope`: current template value and absolute pointer path;
- `renderChild(componentId, scopePath?)`: renders an explicit child reference;
- `dispatch(action)`: emits an event or invokes a registered local function.

Presenters are ordinary React components. They may use React Native, Expo UI, a
design system, or application-specific native modules. Keep them deterministic
during render and perform effects through native callbacks.

### Reactive Updates

- The renderer automatically preserves healthy presenters when their component,
  resolved props, identifiers, full scope value, and services are unchanged.
  Template siblings with unchanged item scopes can remain mounted without
  another protocol-driven presenter call. A root scope `/` exposes the whole
  model, so any changed root data remains observable even when one bound prop
  is unchanged.
- Generated setters and `renderChild` stay stable while their ownership and
  capabilities are unchanged. Children subscribe to current surface state, so
  child updates and progressive arrival work when the parent is preserved.
  Component replacement/rebind still invalidates old setters; app context and
  local presenter state still update through normal React behavior.

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

Addresses preserve empty field names: `/record/` reads the field named `""`
inside `record`, while `/record` reads the whole object. Repeated separators
also preserve empty fields. A2UI uses `/` for the whole model; an empty path
passed to a data update is also a root alias. A relative empty path or `.`
binding refers to its current scope.

Array addresses must use canonical item numbers such as `/items/0`.
`/items/length`, `/items/01` and `/items/-` are invalid and report structured
errors. Valid missing fields or list items still resolve to `undefined`.
Object fields named `length` or `01` remain valid; reads only use own fields.

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
