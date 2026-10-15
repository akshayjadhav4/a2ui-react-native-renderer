# Migration Guide

This guide covers upgrading from `a2ui-react-native-renderer` 0.1.x to 1.0.0,
and moving from an app-local or simplified `spec` renderer. Existing package
users should review the binding, progressive rendering, batch recovery, and
surface deletion changes below.

## 1. Separate Catalog From Transport

Move native component schemas and presenters into an application catalog. Do
not move AG-UI parsing, server URLs, chat stores, or model prompts into the
renderer package.

```tsx
const catalog = defineA2UICatalog({
  id: "urn:your-app:a2ui:catalog:v1",
  components: { Text, Button, Card },
});
```

## 2. Use Official Messages

The renderer accepts v0.9 and v0.9.1 lifecycle messages, not a simplified
object such as:

```ts
// Not accepted directly:
{ components: [...], rootId: "root" }
```

Convert server output to `createSurface`, optional `updateDataModel`,
`updateComponents`, and `deleteSurface` messages before passing it to the
engine. Prefer updating the server contract rather than maintaining an
ambiguous client converter.

## 3. Choose Ownership

Use `A2UIRenderer` for one colocated active-surface region. Use the
`useA2UIEngine` hook in a mounted conversation or feature owner when surfaces belong
to individual chat turns or screens:

```tsx
const engine = useA2UIEngine({ catalogs: [catalog], onAction, onError });
return <A2UISurface engine={engine} surfaceId={surfaceId} />;
```

The hook handles final disposal, including Strict Mode effect replay. Apply
messages from event handlers or effects; return your source's unsubscribe from
the subscription effect. One conversation owner can share its engine with
several surfaces. See the complete [streaming example](./streaming-and-actions.md).

Existing `createA2UIEngine`, `A2UIProvider`, and context hooks remain supported.
Keep explicit creation for an engine that outlives a mounted feature. When
adopting the hook, remove manual disposal of that hook-owned engine. A direct
`A2UISurface.engine` selects its engine over a surrounding provider and supplies
that context to app presenters.

External renderer mode can omit `messages`: replace
`<A2UIRenderer engine={engine} messages={[]} />` with
`<A2UIRenderer engine={engine} />` when your source already applies operations.
Owned renderer mode still requires messages and retains collection replay rules.

The hook accepts new inline option containers with equivalent catalog objects
and effective limits. Changed catalog identities/order or limits throw; remount
the owning subtree with a new key to use new construction settings. Action/error
callbacks may change and use the latest values.

Do not create one engine during every React render. Store it at module,
provider, or stable component-instance scope according to the application's
lifetime.

## 4. Replace Component Contexts

Presenters receive all renderer services through `A2UIPresenterProps`:

- resolved `props` and generated binding setters;
- `renderChild` for component references;
- `dispatch` for A2UI actions;
- `scope`, `surfaceId`, and `componentId` identifiers.

Remove app-local renderer contexts that duplicate those capabilities. Keep
theme, localization, and domain providers if they are genuine application
concerns.

## 5. Handle Optional Binding Setters

Generated `setX` callbacks are now present only for direct `{ path }` bindings.
Literal and function values are read-only, and a missing bound path resolves to
`undefined`. Update presenters that called setters unconditionally:

```tsx
<TextInput
  value={props.value ?? ""}
  editable={props.setValue !== undefined}
  onChangeText={props.setValue}
/>
```

For a manual write, use `props.setValue?.(next)`. Dynamic fields nested in
objects or arrays follow the same rule. Invalid bound values and local writes
report structured errors. A setter saved before a component rebind or deletion
cannot update the old path.

Data paths now preserve trailing and repeated `/` separators. Previously,
`/record/` was incorrectly treated as `/record`, which could replace the whole
object during an update. It now addresses the field named `""` inside `record`.
If you intended the whole object, use `/record` explicitly. A2UI's `/`
whole-model convention remains unchanged.

Array reads now validate item numbers just like writes: addresses such as
`/items/length` or `/items/01` report errors rather than exposing JavaScript
array properties. Valid missing fields/items still return `undefined`.
Object reads no longer expose inherited JavaScript properties; explicitly
stored JSON fields with those names remain accessible.

## 6. Handle Progressive Components

Earlier package behavior rejected an `updateComponents` message without `root`
or with a child definition that had not arrived. These valid intermediate states
now commit. Check `surface.pendingComponentIds` when the app needs to know which
reachable definitions are missing. It contains `["root"]` before root arrives
and becomes empty after all reachable definitions are present.

Use `A2UIComponentIdSchema` for a single child ID; a plain `z.string()` is a
literal. For app-owned loading UI, pass `renderPending` to `A2UISurface` or
`A2UIRenderer`:

```tsx
<A2UISurface
  surfaceId={surfaceId}
  renderPending={({ kind }) => <Text>Loading {kind}…</Text>}
/>
```

Without the callback, missing child positions render nothing and present
siblings remain visible. Missing bound data still reaches a presenter as
`undefined`. Since the protocol has no general completion signal, any timeout
or retry policy belongs to the app.

## 7. Forward Actions

Wire `onAction` through `useA2UIEngine`, explicit engine creation, or owned-engine `A2UIRenderer` mode. The
callback receives the official action with context resolved from the latest
surface model. Adapt that action to the selected transport outside the package.

## 8. Configure Production Recovery

Provide `onError`, select `diagnostics="production"` for release behavior, and
optionally provide an accessible `renderFallback`. Review and lower resource
limits for the application's presenters and target devices.

## 9. Remove Deep Imports And Bundled Assumptions

Import renderer APIs from `a2ui-react-native-renderer`; schema export uses the
public `a2ui-react-native-renderer/catalog-schema` subpath. Optional test tooling
uses `a2ui-react-native-renderer/testing`. Other deep imports
are private. The package does not include the
Basic Catalog, functions such as `openUrl`, or native controls. Define and
register every capability the application's A2UI producer may emit.

## Compatibility Notes

These changes are included in the 1.0.0 release candidate. The license remains
Apache-2.0. Preparing this candidate does not publish it.

- Surface snapshots now expose readonly creation `version` and `sendDataModel`
  (`false` when omitted). `engine.getClientDataModel(surfaceIds)` prepares
  opted-in full current models for app-owned transport. Existing `onAction`
  callbacks are unchanged. Use a shared sending function for actions and chat
  messages; see [streaming and actions](./streaming-and-actions.md#action-round-trip).
- Catalogs can now define an optional `themeSchema`. Presenters receive a
  deeply readonly optional `theme`, and surface snapshots expose it as a generic
  readonly record. Existing no-theme definitions need no changes. The schema
  exporter includes custom theme rules at `$defs.theme`.
- Supplied themes must be JSON objects and match the catalog's theme schema
  when configured. Invalid themes now reject creation through `onError` with
  `INVALID_MESSAGE`. Omitted themes stay `undefined`; field defaults apply only
  inside a supplied object. The renderer does not apply styles automatically.

- Both v0.9 and v0.9.1 progressive component graphs are accepted. A missing
  root or child is pending; invalid schemas, known cycles, and configured limits
  still reject an update atomically. Apps that previously retried a rejected
  missing-child update can stop doing so.
- From this version, a bad message in `applyMessages` leaves earlier valid
  messages committed and does not stop later valid messages, even for the same
  surface. Applications that depended on per-surface batch rollback should
  group operations and handle rollback in their own transport layer.
- `@a2ui/web_core` is no longer a runtime dependency. Public imports remain at
  the package root; Zod schemas and the `A2UIMessage` type are now package-owned.
- `A2UIResolvedProps` now models optional binding setters, missing values, and
  nested resolved properties. A TypeScript consumer may need to guard `setX`
  calls and handle `undefined` values.
- Zod 3.25 is a peer contract; Zod 4 schemas are not supported.
- React Native Web is not a guaranteed initial target.
- There is no native module, so both React Native architectures can consume the
  JavaScript package when peer versions are satisfied.

### Delete Only Existing Surfaces

`deleteSurface` now reports `INVALID_MESSAGE` through `onError` when the target
surface does not currently exist. This includes a never-created ID, an ID whose
creation failed, and a second deletion after the first succeeded. Avoid sending
duplicate cleanup messages for the same active surface.

Valid deletion still removes only its target. Creating the same ID again starts
fresh components and data and clears its current surface error. An invalid
deletion does not prevent later valid messages in the batch from being applied.
