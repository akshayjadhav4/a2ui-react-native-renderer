# Public API

Renderer imports come from `a2ui-react-native-renderer`. Catalog schema export
uses `a2ui-react-native-renderer/catalog-schema`; optional testing tools use
`a2ui-react-native-renderer/testing`. Other deep
imports are not public API. Runtime values and TypeScript types are grouped
below; related symbols share examples in the linked guides.

## Catalog Values

### `defineA2UICatalog`

Creates an immutable catalog from a non-empty ID, consumer component
definitions, optional consumer functions, and an optional `themeSchema`. Duplicate function names and
invalid definitions throw during catalog creation. See [Catalogs](./catalogs.md).

### `defineA2UIComponent`

Pairs one Zod object schema with one React Native presenter while preserving
inferred resolved-property and binding-setter types. The helper is optional;
component definitions may also be written inline in `defineA2UICatalog`. An
optional second theme type parameter supports reusable themed presenters.

### `defineA2UIFunction`

Defines a named, schema-validated consumer function with a declared return kind.
Functions are registered through a catalog; the package provides no built-ins.

### `exportA2UICatalogSchema`

Import from `a2ui-react-native-renderer/catalog-schema` in server or build-time
code. `exportA2UICatalogSchema(catalog)` returns a fresh, JSON-serializable A2UI
v0.9-family catalog schema document for the same catalog used by the mobile
renderer. `$id` and `catalogId` equal `catalog.id`; component and function
entries use the catalog's registered names. `$defs.theme` describes the optional
custom theme schema, or a generic object when none is configured. The output excludes presenters and
function implementations. Supported property schemas and A2UI marker
references are described in [Catalogs](./catalogs.md#export-a-catalog-for-an-agent).
Unsupported conversion throws a path-specific `TypeError`. The application
decides where to store or send the document, and should version its catalog ID
when its contract changes incompatibly.

## Testing Entry

Import `createA2UITestHarness`, `A2UITestHarnessOptions`, and `A2UITestHarness`
from `a2ui-react-native-renderer/testing`. Options accept catalogs and optional
resource limits. The returned harness exposes its real `engine` and
`getActions(): readonly A2UIUserAction[]`, returning a fresh frozen array of
successfully dispatched actions in delivery order. It owns the action callback;
use `engine.getErrors()` for errors and `engine.dispose()` for cleanup.
No mounting, assertions, mocks, reset, or transport are supplied. See
[Testing](./testing.md) for headless versus mounted checks.

## Runtime Values

### `createA2UIEngine`

Creates an isolated stateful A2UI v0.9/v0.9.1 runtime. The engine applies messages,
owns surface state and data models, dispatches actions, reports errors, and
publishes external-store subscriptions. Call `dispose()` when an
application-owned engine is permanently retired.

| Method                                        | Contract                                                                                                                       |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `applyMessage(message: unknown)`              | Validate and process one incoming operation                                                                                    |
| `applyMessages(messages: readonly unknown[])` | Process in order; invalid operations retain valid state and later operations still run; subscribers are notified for the batch |
| `getSnapshot()`                               | Read the stable engine snapshot, including active/failed IDs and error count                                                   |
| `getSurface(surfaceId)`                       | Read an immutable accepted surface snapshot or `undefined`                                                                     |
| `getClientDataModel(surfaceIds)`              | Prepare full current models for explicitly selected opted-in surfaces, or `undefined`; never sends data                        |
| `getErrors()`                                 | Read the immutable historical error collection                                                                                 |
| `subscribe(listener)`                         | Observe engine publications; returns unsubscribe                                                                               |
| `subscribeSurface(surfaceId, listener)`       | Observe publications affecting one surface; returns unsubscribe                                                                |
| `dispose()`                                   | Permanently release surface state and subscriptions; repeated disposal is safe                                                 |

Invalid messages report through `onError` and `getErrors()`; invalid
construction settings, including duplicate catalog IDs, throw synchronously.
Batch processing is not an all-or-nothing transaction. Dispose only after the
app has stopped sources and unmounted consumers; the engine cannot be reused.

`getClientDataModel` returns a detached, deeply frozen `A2UIClientDataModel`
value for transport metadata `a2uiClientDataModel`. Selection is required; only
active surfaces with `sendDataModel: true` are included. The caller selects IDs
owned by the receiving backend. It throws `TypeError` for mixed included creation
versions or included models that are not JSON objects, without partial output
or engine mutations. See the [shared sending example](./streaming-and-actions.md#action-round-trip).

### `useA2UIEngine`

Creates one React-owned engine from `A2UIEngineOptions` and disposes it after
final unmount. The engine stays stable across rerenders and React Strict Mode
effect replay. Apply incoming messages through its existing `applyMessage` or
`applyMessages` methods; the hook does not register a source or ingest data.
`onAction` and `onError` use the latest callbacks. Catalog objects/order and
effective resource limits must remain stable while mounted; equivalent inline
arrays and limit objects are accepted. Remount the owning subtree with a new
key to change construction settings. See [Streaming And Actions](./streaming-and-actions.md).

### `A2UIRenderer`

Convenience React component that creates a stable internal engine or accepts an
external engine, applies supplied `messages`, and renders all active surfaces. Owned
engine mode accepts `catalogs`, `onAction`, and `onError`; external engine mode
does not, because those belong to the supplied engine. Both modes accept
`renderPending` for app-owned root and child loading UI.
`messages` is required in owned-engine mode and optional with an external
engine. Omission applies no messages, so `<A2UIRenderer engine={engine} />`
observes imperative updates without a dummy empty collection.

For collection ingestion, an unchanged array is not replayed. When the new
array retains the previous message objects as its prefix, only appended
messages are applied. A shortened, reordered, or recreated prefix replays the
supplied collection into the existing engine; it does not clear that engine.
Keep messages immutable and retain object identity when appending. Use a
keyed owner for a deliberate fresh session. Catalog identity/order, owned
versus external mode, and external engine identity cannot change while this
renderer remains mounted. Callbacks in owned mode may change.

### `A2UIProvider`

Provides an existing `A2UIEngine` through React context. It does not create an
engine, apply messages, or render surfaces.

### `A2UISurface`

Subscribes to and renders one `surfaceId`. Supply an optional `engine` prop for
direct placement, or omit it to use the nearest `A2UIProvider`. An explicit
engine takes precedence over a surrounding provider and supplies context to
the app's presenters. The surface never disposes an engine. Changing engine
or surface ID switches subscriptions and clears old presenter failures.
Supports diagnostic mode selection, a consumer error fallback, and an optional
`renderPending({ surfaceId, componentId, kind })` callback. `kind` is `"root"`
before the root definition arrives or `"component"` at an unresolved child
position. The default pending output is `null`.

### `useA2UISurface`

Returns the current immutable `A2UISurfaceSnapshot` for one ID, or `undefined`
when the surface does not exist. `pendingComponentIds` is `["root"]` before the
root definition arrives; later it lists distinct missing structural IDs
reachable from root. Missing data paths are not in this list. Must run below
`A2UIProvider`.

### `useA2UISurfaceIds`

Returns a referentially stable array of active surface IDs. Must run below
`A2UIProvider`.

### `useA2UIErrors`

Returns the engine's immutable historical error collection. Must run below
`A2UIProvider`.

## Protocol Schema Values

These package-owned Zod schemas describe the v0.9/v0.9.1 value shapes used by
the runtime. Use them inside consumer component schemas.

| Export                        | Purpose                                          |
| ----------------------------- | ------------------------------------------------ |
| `A2UIActionSchema`            | Event actions and local function-call actions    |
| `A2UIChildListSchema`         | Static or structurally repeated child references |
| `A2UIComponentIdSchema`       | A single structural child component ID           |
| `A2UIDataBindingSchema`       | A2UI JSON-pointer data binding                   |
| `A2UIDynamicBooleanSchema`    | Boolean literal, binding, or function call       |
| `A2UIDynamicNumberSchema`     | Number literal, binding, or function call        |
| `A2UIDynamicStringSchema`     | String literal, binding, or function call        |
| `A2UIDynamicStringListSchema` | String-list literal, binding, or function call   |
| `A2UIDynamicValueSchema`      | Any supported dynamic value form                 |

### `DEFAULT_A2UI_RESOURCE_LIMITS`

Frozen defaults used by new engines: 500 components per surface, depth 64,
1 MiB serialized data model per surface, and 1,000 messages per batch. Override
individual values through `createA2UIEngine({ limits })`.
`useA2UIEngine({ catalogs, limits })` accepts the same overrides. The convenience
renderer has no `limits` prop; supply a configured engine when limits differ.

## Catalog Types

| Export                     | Contract                                                                                  |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| `A2UIBindingScope`         | Current template value and absolute JSON-pointer path                                     |
| `A2UICatalog`              | Immutable normalized catalog returned by `defineA2UICatalog`                              |
| `A2UICatalogDefinition`    | Input contract accepted by `defineA2UICatalog`                                            |
| `A2UIChildRenderer`        | Presenter callback for rendering a referenced child in an optional scope                  |
| `A2UIComponentAction`      | Action value a presenter may dispatch                                                     |
| `A2UIComponentDefinition`  | One Zod schema, presenter, and optional description                                       |
| `A2UIComponentDefinitions` | Component-name to definition map inferred from schemas                                    |
| `A2UIComponentSchemas`     | Component-name to Zod object schema map                                                   |
| `A2UIFunctionDefinition`   | Named function schema, return kind, implementation, and description                       |
| `A2UIFunctionReturnKind`   | Allowed declared return kinds                                                             |
| `A2UIFunctionReturnMap`    | Type mapping from return kind to runtime value                                            |
| `A2UIPresenter`            | React presenter function for resolved component properties                                |
| `A2UIPresenterProps`       | Presenter input: props, optional readonly theme, IDs, scope, child renderer, and dispatch |
| `A2UIResolvedChild`        | Resolved child component ID and template base path                                        |
| `A2UIResolvedProps`        | Recursively maps wire properties to presenter values and optional typed setters           |

A dynamic presenter value can be `undefined` when its data path is missing.
Generated `setX` exists only while that property is directly bound; it is
absent for literals and function results. The setter reports invalid values or
stale calls through the engine's structured error channel.

## Protocol Types

| Export                  | Contract                                                    |
| ----------------------- | ----------------------------------------------------------- |
| `A2UIMessage`           | A2UI v0.9/v0.9.1 server-to-client message union             |
| `A2UIUserAction`        | Official resolved client action sent to consumer `onAction` |
| `A2UIAction`            | Wire action accepted in a component schema                  |
| `A2UIChildList`         | Wire child-list value                                       |
| `A2UIDataBindingValue`  | Wire JSON-pointer binding value                             |
| `A2UIDynamicBoolean`    | Inferred value accepted by `A2UIDynamicBooleanSchema`       |
| `A2UIDynamicNumber`     | Inferred value accepted by `A2UIDynamicNumberSchema`        |
| `A2UIDynamicString`     | Inferred value accepted by `A2UIDynamicStringSchema`        |
| `A2UIDynamicStringList` | Inferred value accepted by `A2UIDynamicStringListSchema`    |
| `A2UIDynamicValue`      | Inferred value accepted by `A2UIDynamicValueSchema`         |
| `A2UIFunctionCallValue` | Wire function-call value used by dynamic properties         |

## Engine Types

| Export                  | Contract                                                                                           |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| `A2UIEngine`            | Public message, snapshot, subscription, error, and disposal methods                                |
| `A2UIEngineOptions`     | Catalogs, callbacks, and resource-limit overrides                                                  |
| `A2UIEngineSnapshot`    | Engine revision plus active/failed IDs and error count                                             |
| `A2UISurfaceSnapshot`   | Immutable surface state: creation version/policy, optional theme, components, data and pending IDs |
| `A2UIClientDataModel`   | Readonly version and selected surface-to-JSON-object model map for outgoing metadata               |
| `A2UIComponentSnapshot` | Immutable component ID, type, and wire-property snapshot                                           |
| `A2UIResourceLimits`    | Complete resource-limit configuration                                                              |

## Error And React Types

| Export                      | Contract                                                                       |
| --------------------------- | ------------------------------------------------------------------------------ |
| `A2UIRendererError`         | Structured, identifier-rich runtime failure                                    |
| `A2UIRendererErrorCode`     | Stable union of public error codes                                             |
| `A2UIRendererErrorSeverity` | `"warning"` or `"error"`                                                       |
| `A2UIFallbackRenderer`      | Consumer callback from structured error to `ReactNode`                         |
| `A2UIDiagnosticsMode`       | `"auto"`, `"development"`, or `"production"`                                   |
| `A2UIProviderProps`         | Props accepted by `A2UIProvider`                                               |
| `A2UIRendererProps`         | Discriminated owned-engine or external-engine renderer props                   |
| `A2UISurfaceProps`          | Optional engine, surface ID, diagnostics, fallback, and pending renderer props |

## Compatibility Notes

- Public error codes and root exports are semver-relevant after `0.1.0`.
- Protocol types describe v0.9 and v0.9.1 messages, including progressive
  component updates.
- Types may reference React, React Native, and Zod peer contracts, but no Expo or
  transport type is part of this API.
- Internal protocol state, JSON-pointer utilities, error boundaries, and mutable
  records are intentionally unavailable through deep imports.
