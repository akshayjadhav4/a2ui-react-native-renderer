# Migration Guide

This guide is for applications moving from an app-local A2UI renderer or a
simplified `spec` renderer to `a2ui-react-native-renderer`.

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

Use `A2UIRenderer` for one colocated active-surface region. Use an
application-owned `createA2UIEngine` plus `A2UIProvider` and `A2UISurface` when
surfaces belong to individual chat turns or screens.

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

Wire `onAction` at engine creation or in owned-engine `A2UIRenderer` mode. The
callback receives the official action with context resolved from the latest
surface model. Adapt that action to the selected transport outside the package.

## 8. Configure Production Recovery

Provide `onError`, select `diagnostics="production"` for release behavior, and
optionally provide an accessible `renderFallback`. Review and lower resource
limits for the application's presenters and target devices.

## 9. Remove Deep Imports And Bundled Assumptions

Import only from `a2ui-react-native-renderer`. The package does not include the
Basic Catalog, functions such as `openUrl`, or native controls. Define and
register every capability the application's A2UI producer may emit.

## Compatibility Notes

Plan to release these public type and schema changes in `0.2.0`; this working
tree does not change the package version or publish a release.

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
