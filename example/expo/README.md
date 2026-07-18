# Expo Consumer Example

An Expo SDK 57 application that consumes `a2ui-react-native-renderer` through
its public package exports. The app owns its complete A2UI catalog, presenters,
fixtures, and placement UI.

The example catalog intentionally uses only React Native primitives. It shows:

- a complete consumer-owned catalog with layout, text, input, and button
  presenters;
- simple and incrementally streamed A2UI v0.9 surfaces;
- data-model binding and official user-action dispatch;
- surface deletion, contained validation failure, and recovery.

From the repository root:

```sh
pnpm install
pnpm --filter a2ui-renderer-example start
```

Static verification:

```sh
pnpm example:typecheck
pnpm example:check
pnpm example:export
```

`example:export` builds the package and then creates independent iOS and
Android production bundles. The example imports only the package name; it has
no Metro alias to package source.

The workspace dependency is intentional for this source example. Package
tarball installation is verified separately by the consumer smoke tests.
