# Handoff: React Native A2UI Renderer

- **As of:** 2026-10-14
- **Checkout:** `/Users/akshayjadhav/Documents/Development/Mobile/GenUI/a2ui-react-native-renderer`
- **Branch:** `codex/native-core` (local branch, based on `main`; no upstream branch or PR)
- **State:** The first six capability-map modules are complete. The final `consumer-tooling` spec is approved; its implementation plan awaits review. No implementation is in progress.

## What the user wants

Make this the easy-to-use, go-to A2UI renderer for React Native and Expo. The
package renders app-owned components; it does not ship a Basic Catalog,
presenters, styling system, chat UI, transport, or model SDK. The application
owns those pieces. Keep protocol behavior compatible with A2UI v0.9 and v0.9.1.

The user chose an in-package protocol core instead of `@a2ui/web_core` and
asked to keep all work on one `codex/native-core` branch, without worktrees.
Commit small verified slices on that branch. The user raised a possible MIT
license change but explicitly deferred it. The package remains at `0.1.1` and
Apache-2.0; there has been no release, push, or PR for this branch. Revisit
versioning and licensing only when the user requests that work.

## Completed work

The [capability map](./CAPABILITY-MAP.md) is the initiative index. Its first
six modules are implemented, with approved specs, plans, and completed task
lists:

| Module                 | Outcome                                                                                                                                 | Records                                                                               |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `wire-compatibility`   | Package-owned A2UI v0.9/v0.9.1 protocol core; `@a2ui/web_core` and Lit removed from the native dependency graph.                        | [Spec](./SPEC-wire-compatibility.md), [tasks](./tasks/wire-compatibility-todo.md)     |
| `binding-semantics`    | Typed resolved values and optional setters for direct writable bindings.                                                                | [Spec](./SPEC-binding-semantics.md), [tasks](./tasks/binding-semantics-todo.md)       |
| `progressive-surfaces` | Pending root and child rendering, safe progressive updates, and structured recovery.                                                    | [Spec](./SPEC-progressive-surfaces.md), [tasks](./tasks/progressive-surfaces-todo.md) |
| `catalog-contract`     | One app-owned catalog supplies renderer validation and an exportable agent-facing JSON Schema document.                                 | [Spec](./SPEC-catalog-contract.md), [tasks](./tasks/catalog-contract-todo.md)         |
| `react-surface-api`    | Hook-owned engine lifetime, direct one-surface placement, and optional external renderer messages.                                      | [Spec](./SPEC-react-surface-api.md), [tasks](./tasks/react-surface-api-todo.md)       |
| `render-reactivity`    | Independently subscribed nodes preserve healthy presenters with unchanged observable inputs; stable setters/children and safe recovery. | [Spec](./SPEC-render-reactivity.md), [tasks](./tasks/render-reactivity-todo.md)       |

The reactivity module keeps functions resolving against accepted snapshots and
preserves full scope inputs, React state/context, current actions, stale setter
checks, and progressive child rendering. Its seven-fixture measurement harness
ran three times with identical results: a 499-item edit moved from 500 calls to
two, and an outside-scope update moved from four calls to one. All six target
cases pass. Notifications and resolution still visit mounted nodes; these
results do not establish device FPS. See the
[measurement record](./tasks/render-reactivity-measurements.md).

The React API module adds `useA2UIEngine(options)` with stable identity, latest
callbacks, fixed construction settings, and final cleanup through Strict Mode
effect replay. `A2UISurface` accepts an optional explicit `engine`, supplies
that engine's context to presenters, and recovers when the source changes.
External-engine `A2UIRenderer` permits omitted `messages`. Existing context
hooks still need a provider; the private reader was renamed to
`useA2UIEngineContext` to distinguish it from the public creation hook.
Pending/absent surface errors now refresh fallbacks without changing accepted
snapshots; rejected updates preserve healthy presenter rendering. Usage and
cleanup examples are in [Streaming And Actions](./docs/streaming-and-actions.md).

The catalog module added
`exportA2UICatalogSchema(catalog)` through the separate
`a2ui-react-native-renderer/catalog-schema` package subpath. It exports
supported Zod property shapes, official A2UI marker references, and
representable function calls without presenters or executable callbacks.
Unsupported shapes fail with a path-specific `TypeError`. The application
chooses how to deliver the JSON document to an agent. Usage is in
[Catalogs](./docs/catalogs.md#export-a-catalog-for-an-agent) and the
[public API](./docs/api.md).

## Current code and evidence

- Package root: [src/index.ts](./src/index.ts). Schema-only entry:
  [src/catalog-schema.ts](./src/catalog-schema.ts). The root does not import
  the schema exporter.
- Core and wire schemas: [src/protocol/v0_9](./src/protocol/v0_9). Catalog
  conversion: [src/catalog](./src/catalog). Renderer engine and native React
  entry points: [src/engine](./src/engine), [src/react](./src/react).
- Official schema fixtures are pinned to upstream commit
  `1444719acd8833eeb5e70529c7ac47bc50b7390c`; source URLs and SHA-256
  hashes are in [test/fixtures/a2ui/README.md](./test/fixtures/a2ui/README.md).
  The [catalog schema audit](./tasks/catalog-contract-schema-audit.md) explains
  why one export document works for both supported wire versions.
- [test/unit/catalog-schema.test.mjs](./test/unit/catalog-schema.test.mjs)
  covers conversion and fail-closed errors. The shared-catalog test in
  [test/integration/catalog-schema.test.mjs](./test/integration/catalog-schema.test.mjs)
  checks official JSON Schema validation and renderer behavior for both
  versions.
- [scripts/pack-check.mjs](./scripts/pack-check.mjs) verifies package metadata
  and contents. [scripts/consumer-smoke.mjs](./scripts/consumer-smoke.mjs)
  installs the tarball into Expo and bare React Native consumers, imports the
  schema subpath, bundles iOS and Android, and checks that native bundles
  exclude exporter code and web renderer modules.

The last full verification passed: `pnpm build`, `pnpm typecheck`, `pnpm lint`,
`pnpm format:check`, `pnpm test` (199 tests), `pnpm example:check`, `pnpm pack:check`, and
`pnpm consumer:smoke` (Expo and bare, iOS and Android). The branch was clean
before the final module record update. Native consumer checks verify types,
bundles, and dependency isolation; they are not device interaction tests.
The initial sandboxed smoke install failed registry DNS; the same check passed
with approved network access. The catalog module ends at `a13076e`; the React
API implementation and checked usage fixtures end at `9b42ada`. Reactivity
implementation and review corrections end at `f0ab843`, followed by completion records.

## Important behavior to preserve

- Presenter skips must compare the full scope value as well as resolved props
  and services. A root scope exposes the entire model. Consumer functions
  reevaluate on accepted snapshots; do not introduce an unreviewed purity or
  cache contract. Mutable/shared or unusual objects and unsafe comparisons
  must fall back to rendering.
- Component-node boundary reset includes component identity to recover after
  batched deletion/recreation when a revision repeats. Healthy state is retained.
  The private setter factory is not a public API. Setter caches remain owned by
  their engine/component/scope and must retain current-binding/stale-write checks.
- App-owned components remain the only renderable component catalog. A plain
  `z.string()` is literal text; structural children use
  `A2UIComponentIdSchema` or `A2UIChildListSchema`.
- The exported function `returnType` default describes the catalog's declared
  return kind. The current evaluator accepts a different wire `returnType`
  value and checks the actual result against the catalog declaration. Do not
  silently enforce the wire field without revising the spec and reviewing that
  runtime change with the user.
- The exported schema rejects an unknown function call immediately. The engine
  accepts the component graph and reports `FUNCTION_ERROR` when rendering
  evaluates that call. The integration test records this timing difference.
- A catalog schema can be exported only from a build or server environment
  that can import the application's catalog module. If that module imports
  native presenters, generate JSON in a compatible build environment and
  deliver the artifact through app-owned infrastructure.
- The exporter handles an explicit Zod subset. Check
  [docs/catalogs.md](./docs/catalogs.md#export-a-catalog-for-an-agent)
  before extending it; unsupported constructs should fail with a named path
  instead of becoming a permissive schema.
- The historical initial-release [tasks/plan.md](./tasks/plan.md) and
  [tasks/todo.md](./tasks/todo.md) have old unchecked items. Do not use or
  overwrite them as the current module tracker.

## Suggested next step

`consumer-tooling` is the final module in the approved capability map: a small
catalog/surface test harness and real streaming example with app-owned
components. [SPEC-consumer-tooling.md](./SPEC-consumer-tooling.md) was approved
by the user's “ok move next” on 2026-10-14. It specifies an optional `/testing`
harness using the real engine and a
local WebSocket Expo demo with a private producer. The spec also proposes one
example-only `ws` dependency; no renderer runtime dependency is proposed.
[tasks/consumer-tooling-plan.md](./tasks/consumer-tooling-plan.md) is drafted for
review, with `ws@8.22.0` verified as the published dependency. It uses the
established per-module file convention and leaves historical plan/todo files
untouched. There is no task list yet. Obtain plan approval before preparing
`tasks/consumer-tooling-todo.md` and implementing, following the requested workflow.

Use the requested `spec-driven-development` workflow and preserve reviewed
module contracts. The user explicitly authorized reactivity implementation
with “ok approve start work” after approving its spec; its task breakdown
executed that direction. Do not assume a release or publication is approved.

Start a new session by checking `git status --short --branch`, reading this
handoff and the capability map, and confirming the user's next requested
module. Do not recreate a worktree or cherry-pick the existing branch history.
