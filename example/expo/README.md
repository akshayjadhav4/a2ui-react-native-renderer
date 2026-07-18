# Expo Consumer Example

An Expo SDK 57 application that consumes `a2ui-react-native-renderer` through
its public package exports. The app owns its complete A2UI catalog, presenters,
fixtures, and placement UI.

From the repository root:

```sh
pnpm install
pnpm --filter a2ui-renderer-example start
```

Static verification:

```sh
pnpm example:typecheck
pnpm example:export
```

The workspace dependency is intentional for this source example. Package
tarball installation is verified separately by the consumer smoke tests.
