# Handoff: React Native A2UI Renderer

- **As of:** 2026-10-14
- **Checkout:** `/Users/akshayjadhav/Documents/Development/Mobile/GenUI/a2ui-react-native-renderer`
- **Branch:** `codex/native-core` (local branch, based on `main`; no upstream branch or PR)
- **State:** The first four capability-map modules are complete. The `react-surface-api` spec and plan are approved; its task breakdown awaits review. No implementation is in progress.

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
four modules are implemented, with approved specs, plans, and completed task
lists:

| Module                 | Outcome                                                                                                          | Records                                                                               |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `wire-compatibility`   | Package-owned A2UI v0.9/v0.9.1 protocol core; `@a2ui/web_core` and Lit removed from the native dependency graph. | [Spec](./SPEC-wire-compatibility.md), [tasks](./tasks/wire-compatibility-todo.md)     |
| `binding-semantics`    | Typed resolved values and optional setters for direct writable bindings.                                         | [Spec](./SPEC-binding-semantics.md), [tasks](./tasks/binding-semantics-todo.md)       |
| `progressive-surfaces` | Pending root and child rendering, safe progressive updates, and structured recovery.                             | [Spec](./SPEC-progressive-surfaces.md), [tasks](./tasks/progressive-surfaces-todo.md) |
| `catalog-contract`     | One app-owned catalog supplies renderer validation and an exportable agent-facing JSON Schema document.          | [Spec](./SPEC-catalog-contract.md), [tasks](./tasks/catalog-contract-todo.md)         |

The most recent module added
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
`pnpm format:check`, `pnpm test` (149 tests), `pnpm pack:check`, and
`pnpm consumer:smoke` (Expo and bare, iOS and Android). The branch was clean
before this handoff document. The completed catalog module ends at commit
`a13076e`.

## Important behavior to preserve

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

`react-surface-api` is the next module in the approved capability map and
depends on the completed `progressive-surfaces` module. Its
[approved spec](./SPEC-react-surface-api.md) defines a lifecycle-managed
`useA2UIEngine` hook, an optional direct `engine` prop on `A2UISurface`, and
optional `messages` in external-engine `A2UIRenderer` mode. The user approved
the spec with “ok continue” on 2026-10-14. The
[approved plan](./tasks/react-surface-api-plan.md) was approved with “next move.”
The [draft task list](./tasks/react-surface-api-todo.md) needs review before
implementation under the user's requested `spec-driven-development` workflow.
No implementation exists for this module yet. `render-reactivity` is also eligible for
specification; `consumer-tooling` depends on `react-surface-api`.

After task-list approval, start Task 1 and follow dependency order. Use focused tests before
behavior changes and commit each verified slice on this branch. Do not assume
a release or publication is approved.

Start a new session by checking `git status --short --branch`, reading this
handoff and the capability map, and confirming the user's next requested
module. Do not recreate a worktree or cherry-pick the existing branch history.
