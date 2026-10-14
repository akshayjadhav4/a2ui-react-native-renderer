# Implementation Plan: Consumer Tooling

**Module id:** `consumer-tooling`

**Spec:** [SPEC-consumer-tooling.md](../SPEC-consumer-tooling.md)

**Status:** Approved and implemented on 2026-10-14. See [verification](consumer-tooling-verification.md) and [completed tasks](consumer-tooling-todo.md).

Use the established per-module records. Historical `tasks/plan.md` and
`tasks/todo.md` contain unrelated unchecked work and remain untouched. After
plan approval, the module task list is [consumer-tooling-todo.md](consumer-tooling-todo.md).
The user approved the task list with “approve move”; implementation is complete.

## Outcome

Developers can test their own catalog through a small optional harness and
run an Expo example that receives progressive A2UI messages over a real socket,
sends a presenter action back, and handles recovery and disconnection.

## Architecture Decisions

### Optional testing entry

Implement `src/testing.ts` as the only new public entry. Import
`createA2UIEngine` directly from `src/engine/engine.ts` and use type-only
imports for its public contract. Keep it absent from `src/index.ts`.

The harness constructs an ordinary engine with its own `onAction` collector.
`getActions()` copies and freezes the array on each call. The engine retains
its existing validation, action payload, error, subscription, and disposal
semantics. Test assertions and mounting remain consumer responsibilities.

Add the `./testing` export with ESM/default and declaration targets following
the existing `/catalog-schema` pattern. Build with Bob; do not add a separate
compiler, test runtime dependency, or assertion API.

### One app-owned schema contract

Move the example catalog ID and its four schema definitions into a native-free
example module, `example/expo/src/catalog-contract.mjs`. Export a schema factory receiving
Zod and the existing A2UI common schemas as arguments, rather than importing
the native package root at runtime. Use checked JSDoc for typed parameters and
inferred schema results. Expo's existing `allowJs` support can consume this
module while preserving presenter prop inference.

The first packed smoke check exposed type-resolution failure for a sibling
server file: its JSDoc imports could not resolve the isolated Expo dependencies.
Keep the shared native-free module in Expo source instead, so the existing
copy preserves both types and runtime imports. The producer imports its ID
from that module without loading presenters. No extra consumer copy is needed.

The Expo app supplies Zod/common schemas and attaches its existing native
presenters. Node integration tests supply the same values from the built
package's native-free internal modules and attach test-owned presenters.
Repository tests may use those private module paths; consumer documentation
must use only published entries. The producer imports only the catalog ID and
fixture data and never constructs a native catalog.

Compile/typecheck this boundary early. If JavaScript inference cannot retain
the current presenter types, add an example-only declaration for the factory;
do not weaken presenter types or add a new public schema entry.

### Example transport contract

Use one JSON object per text WebSocket frame. Server-to-client frames are raw
A2UI messages, except a clearly distinguished demo error envelope:

```json
{ "type": "demoError", "message": "Unsupported demo command" }
```

Client-to-server frames use these example-only envelopes:

```json
{ "type": "command", "command": "start" }
{ "type": "command", "command": "recover" }
{ "type": "command", "command": "delete" }
{ "type": "action", "action": {} }
```

The action placeholder represents the complete, unmodified `A2UIUserAction`.
These envelopes are not changes to A2UI. Validate supported command names and
the expected demo submit action, surface ID, context value type/length, and
required fields before producing a reply. Reject binary/oversized frames and
malformed JSON through bounded errors or socket close. Do not expose arbitrary
data mutation commands.

### Private producer and progressive fixtures

Create private `a2ui-demo-server` under `example/server`, with the sole runtime
dependency `ws` pinned to **8.22.0**, verified using `npm view ws version --json`
on 2026-10-14. Update the workspace lockfile through pnpm. No optional native
WebSocket addons are needed. Native clients use their built-in WebSocket.

Keep fixtures native-free in `example/server/fixtures.mjs`. Starting a session
sends v0.9.1 surface creation, initial data, a root referencing missing
children, and then the children in separate frames. Use a fixed demo surface
ID within each independent connection. The form binds `/draft`; submitting
updates a separate response field so a round trip is visible.

`recover` sends an intentionally invalid A2UI update followed by a valid data
update to the same surface. `delete` cancels pending fixture sends and deletes
the surface. Reject repeated start on an active session; a fresh connection is
the supported reset. Ignore/reject actions when no ready surface exists.

Export an example-only server factory with `host`, `port`, and message-delay
options. Port zero supports isolated tests. Return its listening address and
an async close method. Cancel per-connection timers on delete/disconnect and
all timers on shutdown; terminate remaining sockets so close completes. Keep
CLI startup and signal handlers in `start.mjs`, separate from the factory.
Default development bind is localhost:8080; allow explicit host selection for
physical devices, documented as a local demo.

### Expo session ownership

Add `network-demo.tsx` alongside the existing fixture showcase and expose it
through an explicit screen/navigation choice. Each connection mounts a keyed
session component using `useA2UIEngine({ catalogs: [fixtureCatalog], ... })`.
Disconnect removes that session; reconnect constructs a fresh engine.

Put socket lifecycle code in example-only `demo-connection.mjs`, with checked
JSDoc and a minimal injectable socket factory for tests. It handles open,
message, error, close, guarded sends, JSON parsing, and retirement. Retiring
sets a guard before detaching handlers and closing the socket, so already
queued callbacks cannot affect an unmounted or newer session. Report send
failures and malformed frames without throwing through React callbacks.

The UI owns endpoint configuration, connection state, last action, transport
errors, renderer errors, connect/disconnect/recovery/deletion controls, and
pending/fallback UI. Send `start` on open. Forward parsed A2UI objects unchanged
to the engine; display demo error envelopes separately. The renderer remains
independent of sockets, environment variables, and server commands.

## Dependency Graph and Delivery Order

```text
testing entry → mounted harness checks → packed entry proof
shared example contract → producer fixtures → socket server
socket server + shared contract → Expo connection → interactive network screen
all paths → docs/guide compilation → complete consumer verification
```

Implement sequentially on `codex/native-core`, with small verified commits.
The detailed task breakdown will keep each task near five files or fewer.

| Slice | Deliverable                                                                 | Verification checkpoint                                                                                                       |
| ----- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1     | Optional harness, public types/export, headless ingestion/isolation tests   | Build, typecheck, focused unit tests; plain Node import                                                                       |
| 2     | Mounted writable binding/action tests and immutable action-array assertions | Existing React integration setup; errors and cleanup checked                                                                  |
| 3     | Packed entry/declarations and native bundle exclusion proof                 | Pack check; packed Node harness actually ingests a fixture; normal entry excludes a harness-only sentinel                     |
| 4     | Shared example schema factory and native-free progressive fixtures          | Expo typecheck retains presenter types; real engine checks pending root/children, props, readiness, recovery                  |
| 5     | Private server package/lockfile and command/action session lifecycle        | Actual socket integration using ephemeral ports; ordered frames, mounted action round trip, two-client isolation and shutdown |
| 6     | App-owned socket lifecycle adapter and regression tests                     | Retired callbacks, malformed JSON, send/error/close handling, cleanup with a minimal fake socket                              |
| 7     | Expo network screen and navigation                                          | Example type/lint checks; iOS/Android example export; correct hook/session ownership                                          |
| 8     | Testing guide, runnable network instructions, compiled guide examples       | Type fixtures and documentation/link checks; exact start commands exercised                                                   |
| 9     | Final review, migration records and changelog                               | Full tests/type/lint/format, pack check, packed Expo/bare consumer smoke; documented manual test status                       |

At the task-breakdown phase, split package/export edits, schema sharing, or
documentation across smaller tasks where their file count exceeds this limit.
Focused checks gate each commit; full consumer bundles gate packaging changes
and completion. Do not repeat expensive full checks for every documentation edit.

## Verification Details

- Unit tests: two independent harnesses, valid/invalid ingestion, supplied
  limits, subscriptions/disposal, and no shared state.
- Mounted tests: use real presenter setters and `dispatch`, inspect recorded
  actions and bound values, and unmount/dispose in `finally` cleanup.
- Socket tests: run the real producer and client, consume frames through the
  harness, mount the shared-schema test catalog for a real action, and await
  response/error/deletion events. Use bounded deadlines and timer cleanup;
  avoid assertions based solely on elapsed sleeps.
- Packaging: `/testing` is present in the tarball and works through an installed
  package specifier in Node. Extend existing native bundle exclusion checks
  with a harness-only identifier; retain exporter/web-runtime exclusions.
- Example: run its type/lint and both platform exports. Record actual manual
  simulator/device socket testing only if performed. Bundling is not evidence
  of device networking. Document reachable host addresses and any required
  development network configuration from official platform sources.

Completion commands from the repository root:

```sh
pnpm build
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm example:check
pnpm example:export
pnpm pack:check
pnpm consumer:smoke
pnpm exec prettier --check SPEC-consumer-tooling.md tasks/consumer-tooling-plan.md HANDOFF.md
```

Demo startup commands, with platform-specific reachable endpoint documented:

```sh
pnpm --filter a2ui-demo-server start
EXPO_PUBLIC_A2UI_DEMO_URL=ws://localhost:8080 pnpm --filter a2ui-renderer-example start
```

## Risks and Mitigations

| Risk                                                              | Mitigation                                                                                      |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Shared schema module accidentally loads native presenters in Node | Factory receives dependencies; Node test imports no native app module; early type/import checks |
| Tooling/server code leaks into renderer consumers                 | Separate export/import graph, tarball allowlist, packed native bundle exclusions                |
| Late socket events mutate a new session                           | Keyed engine owner, retirement guard before close, retained-callback tests                      |
| Timer tests hang or interfere across sessions                     | Ephemeral ports, bounded awaits, per-client cancellation, unconditional shutdown cleanup        |
| Harness is mistaken for full headless validation                  | Mounted binding/function/action examples and explicit guide limitations                         |
| Network demo appears to claim hosted AI behavior                  | Label deterministic local producer; document app-owned backend substitution                     |
| Device endpoint/platform differences block adoption               | Runnable setup instructions and honest manual-versus-automated verification record              |

## Review Gate and Open Questions

No additional public API or dependency is proposed beyond the approved spec.
The plan is approved under `spec-driven-development`. The user subsequently approved
[consumer-tooling-todo.md](consumer-tooling-todo.md) and its slices are complete. Its task split incorporates the shared-module location correction verified by
the packed Expo consumer setup.

Reference: [ws official server examples](https://github.com/websockets/ws#simple-server).
