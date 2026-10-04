# Spec: A2UI Wire Compatibility

**Module id:** `wire-compatibility` in [CAPABILITY-MAP.md](CAPABILITY-MAP.md)

**Status:** Approved and implemented on 2026-10-04. See [verification results](tasks/wire-compatibility-todo.md).

## Assumptions

1. The first compatibility target is A2UI `v0.9` and `v0.9.1`. The upstream `v1.0` protocol remains a separate future decision.
2. Applications continue to own catalogs, presenters, and transports. This package will not include a Basic Catalog or a JSONL/network client.
3. The existing engine and React APIs remain usable for this module. Any necessary public type change is documented as part of the eventual `0.2.0` migration.
4. Replace `@a2ui/web_core` with an in-package A2UI protocol core. Implement against the official v0.9 and v0.9.1 specifications. The existing dependency remains installed until the replacement passes the package and native consumer checks.
5. Full progressive handling of references that arrive in later messages belongs to `progressive-surfaces`. Until that module ships, documentation must not claim full v0.9.1 renderer compliance.

## Objective

Accept the current production A2UI wire version (`v0.9.1`) while retaining `v0.9` behavior and the package's headless React Native boundary. A consumer should be able to pass complete, valid messages of either version to `createA2UIEngine` and receive the same surface snapshots and actions. Unsupported versions and malformed supported-version messages must be distinguished correctly. The installed package must no longer depend on `@a2ui/web_core` after the new core passes all checks.

The official [v0.9](https://github.com/a2ui-project/a2ui/blob/main/specification/v0_9/docs/a2ui_protocol.md) and [v0.9.1](https://github.com/a2ui-project/a2ui/blob/main/specification/v0_9_1/docs/a2ui_protocol.md) protocols define the wire contract. The [A2A extension processing rules](https://github.com/a2ui-project/a2ui/blob/main/specification/v0_9/docs/a2ui_extension_specification.md) require sequential processing and continuation after an invalid individual message. The [renderer guide](https://github.com/a2ui-project/a2ui/blob/main/docs/public/guides/renderer-development.md) identifies v0.9.1 as current and describes renderer responsibilities. The existing `web_core@0.9.0` behavior is a regression reference for v0.9, not the new source of truth.

## Scope and contracts

- Inbound: `createSurface`, `updateComponents`, `updateDataModel`, and `deleteSurface` with `version: "v0.9" | "v0.9.1"` through the existing `applyMessage` and `applyMessages` methods.
- Outbound: retain the public `onAction` payload and structured `onError` callback. Validate generated action payloads against the official supported-version schemas. Preserve the callback's existing payload shape; any version-tagged transport envelope remains outside this module.
- Public types: `A2UIMessage` must admit valid `v0.9.1` messages. Reexported schema and type aliases must be checked for source and declaration compatibility; changes must be documented.
- Version errors: a message carrying a known supported version but invalid content reports a validation error; only other versions report `UNSUPPORTED_VERSION`.
- Validation: preserve resource limits and the last valid surface revision after a rejected message. Apply messages in stream order. A rejected message must not prevent a later independently valid message from applying, including when both address the same surface. This changes the current per-surface batch rejection behavior and requires a migration note.
- Core ownership: implement versioned message schemas, the surface/component state transition logic, and schema behavior inspection within this package. Keep one authoritative surface state and commit each accepted message atomically. Reuse existing binding, graph validation, function, action, and React code where its behavior matches the specification.
- Dependency: remove `@a2ui/web_core` from the final runtime dependency graph after replacement. Do not import browser presenters or require DOM globals in React Native execution. Do not bundle a package-owned Basic Catalog.

The [dependency decision](tasks/native-core-decision.md) records why the published `web_core` candidates were rejected. This module replaces only the upstream responsibilities actually used by the React Native renderer; it does not recreate the web renderer's Basic Catalog, DOM abstractions, or generic web APIs.

### Published-package audit (2026-10-04)

| Candidate | Isolated trial result                                                                                                                                                                                                                                                                                                                                                              |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0.10.7`  | Existing types and 91 tests pass. A direct `v0.9.1` create/update/data/delete sequence passes with an app-owned catalog. Packed Expo bundles pass, but the bare React Native iOS bundle fails on a static class block in `v0_9/basic_catalog/expressions/expression_parser.js`, reached through the public `v0_9` barrel.                                                          |
| `0.12.0`  | After the required trial-only `Catalog(id, "v0.9", components)` adjustment and an optional-args guard, existing types, 91 tests, the direct `v0.9.1` lifecycle, and packed Expo and bare React Native bundles pass. The bare iOS Metro source map contains 31 Basic Catalog and 22 Lit-family modules; the successful bundle therefore fails the headless runtime-graph criterion. |

The supported exports do not expose `v0_9` message schemas through a separate headless path. The `v0_9/universal` path exports Lit elements, while the root and `validation` paths do not export the required versioned schemas. Earlier `0.10.x` releases with a clean `v0_9` barrel accept only `v0.9`; releases with `v0.9.1` support reexport Basic Catalog. Neither selected candidate meets the approved dependency boundary. No production dependency or runtime code was changed during these trials.

### Deferred to other modules

- Tolerating valid but unresolved child references across separate updates, pending roots, and recovery is specified in `progressive-surfaces`.
- Presenter binding setter behavior belongs to `binding-semantics`.
- Simplifying React placement and ingestion belongs to `react-surface-api`.
- Exporting an agent-facing catalog contract belongs to `catalog-contract`.
- A2UI `v1.0`, Basic Catalog components, transport adapters, and server integration are outside this module.

## Tech stack and project structure

- TypeScript 6, React 19, React Native 0.86, Expo 57, Zod 3.
- `src/protocol/v0_9/` owns versioned schemas, types, behavior metadata, and message parsing. It no longer imports the upstream package after migration.
- `src/engine/` owns snapshots, actions, and the public engine contract.
- `src/validation/` validates untrusted messages and resource limits.
- `test/unit/` and `test/integration/` verify protocol and React behavior; `test/types/` verifies public declarations.
- `example/expo/` and `test/fixtures/bare-consumer/` exercise installed package bundling.
- `docs/` and the changelog explain supported versions and any migration impact.

## Commands

Run from the repository root:

```sh
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm consumer:smoke
pnpm pack:check
pnpm --filter a2ui-renderer-example start
```

The example command starts an interactive development server; automated verification uses `pnpm consumer:smoke`, which builds iOS and Android bundles for packed Expo and bare React Native consumers.

## Code style

Keep protocol version handling explicit and keep the core state behind the existing engine API. Follow the existing strict TypeScript style and immutable snapshot contract:

```ts
type SupportedWireVersion = "v0.9" | "v0.9.1";

function isSupportedWireVersion(
  version: string,
): version is SupportedWireVersion {
  return version === "v0.9" || version === "v0.9.1";
}
```

Use descriptive camelCase functions, `A2UI` prefixes for public types, and double quotes. Parse untrusted input at the boundary before updating state.

## Testing strategy

1. Establish a baseline with current `v0.9` unit, integration, type, and consumer smoke checks. On 2026-10-04, `pnpm typecheck`, `pnpm test` (91 tests), and `pnpm consumer:smoke` (packed Expo and bare iOS/Android bundles) passed with `web_core@0.9.0`.
2. Add protocol cases from the official v0.9.1 message specification using small app-owned test schemas: create/update/delete, data replacement and path deletion, action output, malformed supported-version messages, unsupported versions, and two independent surfaces in one batch.
3. Repeat representative complete-graph cases for `v0.9` to prove backward compatibility. Assert that rejected messages preserve the last valid revision and that later valid messages still apply on the same or another surface. Preserve one engine notification per `applyMessages` call where possible.
4. Compile public type fixtures accepting `v0.9.1` and rejecting `v1.0`. Inspect generated declarations for accidental upstream internal types and preserve the public schema aliases.
5. Compare representative v0.9 outcomes with the current dependency-backed release, then run packed Expo and bare React Native iOS/Android builds. Inspect installed dependencies and the native runtime import graph for `web_core`, Lit, Basic Catalog, and DOM imports; a successful build alone does not prove they were omitted.
6. Record forward-reference and pending-root behavior as a known progressive-rendering gap until its separate module is implemented.

## Boundaries

- **Always:** Keep the version decision explicit, validate untrusted input, preserve the existing resource limits, run the listed checks before considering the module complete, and document observable API changes. Write the core against the public specification and retain applicable attribution if any upstream source is adapted.
- **Ask first:** Change the public engine or React API, accept `v1.0` messages, introduce a new runtime dependency, copy substantial upstream source, or move progressive-rendering semantics into this module.
- **Never:** Ship Basic Catalog presenters, depend on DOM globals at React Native runtime, mutate the last valid snapshot after a rejected message, or claim full v0.9.1 compliance while forward references are rejected.

## Success criteria

1. The package has no `@a2ui/web_core` runtime dependency or import, and packed native consumers contain no Basic Catalog or Lit modules from this renderer.
2. Both supported wire versions complete create/update/data/delete flows with app-owned catalogs, and their action callbacks satisfy the official protocol contract.
3. Invalid `v0.9.1` content produces a validation error, while `v1.0` produces `UNSUPPORTED_VERSION`.
4. Public message types accept both supported versions; `pnpm typecheck`, `pnpm test`, `pnpm consumer:smoke`, and `pnpm pack:check` pass.
5. Documentation states the exact supported behavior and the pending progressive-rendering limitation; no browser presenter code is required in the React Native runtime graph.
6. A batch with a rejected message continues with a later valid message, and the migration guide explains the changed batch behavior.

## Review outcomes

- The user approved this spec with both `v0.9` and `v0.9.1` support and per-message batch recovery on 2026-10-04.
- The user authorized new module-specific plan files under `tasks/` on 2026-10-04. The initial-release plan and task list remain intact.
- The original dependency review preferred a candidate without Lit and rejected any candidate that pulled Basic Catalog or DOM code into React Native. The published candidate trials failed that criterion.
- After the dependency trials failed the headless boundary, the user approved building a narrow in-package core against the A2UI specification instead of using `web_core` and requested a revised plan on 2026-10-04. The prior candidate-selection rule is superseded by this decision.
