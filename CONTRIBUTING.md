# Contributing

Thank you for helping improve `a2ui-react-native-renderer`.

## Scope

The package is a catalog-agnostic React Native A2UI renderer. Changes should not
add a visual catalog, transport, AI SDK, chat runtime, persistence layer,
styling system, or application-specific behavior to the package.

## Setup

Requirements:

- Node.js 20 or newer
- pnpm 10.15.1
- iOS or Android tooling only when changing the Expo consumer

```sh
pnpm install
pnpm build
pnpm typecheck
pnpm test
```

## Development Rules

- Add or update focused tests before changing runtime behavior.
- Keep public imports at the package root; do not create undocumented deep
  entry points.
- Preserve instance isolation and transactional surface recovery.
- Treat generated A2UI as untrusted input.
- Keep React Native presenters in the example, not the package.
- Update `docs/api.md` for every public export change.
- Add a migration note for semver-relevant error, type, or behavior changes.

## Verification

Run the complete gate before requesting review:

```sh
pnpm release:check
```

This builds declarations and ESM output, typechecks examples, lints, checks
formatting, runs tests, inspects the packed artifact, installs the tarball into
isolated Expo and bare React Native consumers, and bundles iOS and Android.

## Commits And Pull Requests

Keep commits focused and use descriptive conventional commit messages. Explain
the user-visible contract, test evidence, and any compatibility impact in the
pull request. Do not include generated consumer bundles, local editor settings,
credentials, or npm tokens.

Publication changes require separate human approval and are not part of normal
pull request verification.
