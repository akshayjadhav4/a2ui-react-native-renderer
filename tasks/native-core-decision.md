# Proposed Decision: Own the React Native Protocol Core

**Status:** Direction approved by the user on 2026-10-04. This changes the approved `wire-compatibility` dependency strategy; no runtime code or package dependency has been changed.

## Recommendation

Remove `@a2ui/web_core` as a runtime dependency after replacing its remaining responsibilities with a small protocol core owned by this package. Implement against the published [A2UI v0.9](https://github.com/a2ui-project/a2ui/blob/main/specification/v0_9/docs/a2ui_protocol.md) and [v0.9.1](https://github.com/a2ui-project/a2ui/blob/main/specification/v0_9_1/docs/a2ui_protocol.md) specifications. Use the upstream implementation as a behavioral reference and fixture source, not as a wholesale source copy or long-lived fork.

## Why this fits the renderer

- The current package already owns immutable public snapshots, graph validation, data binding, client function evaluation, action resolution, limits, and React rendering. The upstream processor maintains a second mutable surface model behind those snapshots.
- The available upstream `v0_9` export couples protocol schemas to Basic Catalog modules. `0.10.7` fails a bare React Native Metro bundle on Basic Catalog syntax; `0.12.0` bundles Lit and Basic Catalog code into the native runtime graph.
- Owning the narrow protocol boundary permits v0.9.1 support and progressive updates without requiring consumers to configure Babel or install browser presentation code.
- The [upstream renderer guide](https://github.com/a2ui-project/a2ui/blob/main/docs/public/guides/renderer-development.md) recommends `web_core` for web renderers. Its [Basic Catalog entrypoint proposal](https://github.com/a2ui-project/a2ui/issues/931) recognizes the headless bundle-size concern, but the published packages tested here do not provide the needed isolated v0.9 schema entrypoint.

## Responsibilities to replace

1. Versioned inbound and outbound schemas and the TypeScript aliases currently reexported from `web_core`.
2. `MessageProcessor`, `Catalog`, `SurfaceModel`, and `ComponentModel` behavior used by `src/protocol/v0_9/adapter.ts` and `src/engine/engine.ts`.
3. `scrapeSchemaBehavior` metadata used to find child references and dynamic properties in `src/validation/validateGraph.ts` and `src/protocol/v0_9/resolveProps.ts`.

The existing pointer, function, action, graph, snapshot, and React code should be retained where its behavior is correct. The new core should have one authoritative surface state and apply each accepted message atomically.

## Migration sequence

1. Freeze current public behavior with tests for v0.9, public types, errors, actions, and packed Expo/bare React Native consumers.
2. Define versioned schema and state contracts from the official v0.9/v0.9.1 specifications; preserve public schema aliases where possible.
3. Replace the processor behind the existing adapter and engine methods in small slices: lifecycle, components, data, actions, then schema behavior metadata. Keep React API stable during this work.
4. Add official v0.9.1 fixtures, per-message batch recovery, progressive-reference tests in its mapped module, and differential v0.9 tests against the current release.
5. Remove `@a2ui/web_core` only after typecheck, tests, package checks, packed iOS/Android bundles, and a runtime import-graph inspection pass.

## Acceptance boundary

- Applications still provide all components, styling, and transports. No Basic Catalog ships.
- v0.9 and v0.9.1 wire flows and outbound actions meet their official schemas.
- Rejected messages leave the last valid state intact; later valid messages continue.
- The installed React Native runtime graph contains no `web_core`, Lit, DOM globals, or Basic Catalog presenters.
- Public API changes have a documented `0.2.0` migration path; no release or license change is part of this decision.

## Cost and licensing

This adds responsibility for protocol upgrades, schema changes, and compatibility testing. It avoids maintaining a fork of web-focused rendering infrastructure. If upstream source code is copied or adapted, its [Apache-2.0 license](https://github.com/a2ui-project/a2ui/blob/main/LICENSE) and attribution conditions remain relevant even if the package license changes later. An independently written implementation against the public protocol specification keeps that future license decision simpler.

## Review outcome

The user confirmed that the renderer should implement the A2UI protocol directly instead of relying on `web_core`, then requested a plan. The revised wire-compatibility spec and plan record the implementation sequence.
