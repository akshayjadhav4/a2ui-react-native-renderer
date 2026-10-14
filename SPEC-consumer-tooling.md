# Spec: Consumer Tooling

**Module id:** `consumer-tooling` in [CAPABILITY-MAP.md](CAPABILITY-MAP.md)

**Status:** Approved and implemented on 2026-10-14. See [verification](tasks/consumer-tooling-verification.md) and [completed tasks](tasks/consumer-tooling-todo.md).

## Assumptions

1. Developers need a small way to test their own catalog and surfaces using the
   actual renderer engine. They should keep their preferred test runner and
   React Native testing tools.
2. The streaming example should use an actual network connection. A deterministic
   local producer is sufficient to demonstrate streaming and action round trips;
   a hosted model, credentials, and inference are outside this module.
3. Testing utilities belong in an optional `/testing` entry. Socket client and
   server code belong in the example, and all presenters remain app-owned.
4. A private example server may add one WebSocket dependency, `ws`, pinned to a
   verified published version during planning. No runtime dependency is added to
   the renderer package. Approving this spec approves that example-only dependency.
5. Work continues on `codex/native-core`. Version, licensing, release, publication,
   and push remain deferred.

## Objective

Make the completed renderer easier to adopt and verify. A developer can test
their own catalog, inspect protocol results, exercise a presenter action, and
copy a working app-owned streaming integration without adopting another
framework or a bundled component catalog.

The existing Expo showcase remains useful for isolated fixtures. It currently
feeds preloaded messages using timers; it does not demonstrate network delivery
or sending a user action to a producer.

## Public testing contract

Add `createA2UITestHarness` at `a2ui-react-native-renderer/testing` with named
types `A2UITestHarnessOptions` and `A2UITestHarness`:

```ts
import type { A2UIEngine, A2UIEngineOptions, A2UIUserAction } from "./index.js";

export type A2UITestHarnessOptions = Pick<
  A2UIEngineOptions,
  "catalogs" | "limits"
>;

export interface A2UITestHarness {
  readonly engine: A2UIEngine;
  getActions(): readonly A2UIUserAction[];
}

export function createA2UITestHarness(
  options: A2UITestHarnessOptions,
): A2UITestHarness;
```

This illustrates the public types, not a required runtime import through the
native root. The implementation must import the engine directly.

- Construct a real engine with the provided app-owned catalogs and limits.
  Record successfully dispatched actions in delivery order through its
  `onAction` callback.
- Use existing `engine.applyMessage`, `applyMessages`, `getSurface`, `getErrors`,
  subscriptions, and `dispose`. Do not introduce a second message-processing API
  or convenience wrappers for methods already available on the engine.
- `getActions()` returns a stable record of actions at the time of the call:
  a fresh, frozen array that cannot change when later actions arrive. Preserve
  the engine's action payload semantics; do not mutate actions or introduce
  serialization and timestamp substitutions.
- The harness owns the action callback. It does not accept arbitrary callbacks,
  install assertions, mount React, or provide reset/replay/mocking APIs.
- Consumers mount `A2UISurface` with `harness.engine` using their chosen React
  test tools when checking resolved props, setters, functions, presenter errors,
  and dispatched actions. Headless ingestion alone cannot validate these
  render-time behaviors. Document this distinction explicitly.
- Consumers dispose the engine in their test cleanup. Each harness is isolated;
  it has no global action queue or retained catalog state shared across tests.
- Importing `/testing` in Node must not load React Native or require native
  transforms. The normal native entry must not import this utility. Its entry
  and declarations must be present in the published tarball.

## Streaming example contract

### App-owned transport

Add a clearly labelled local network demo to the existing Expo app. Use its
app-owned catalog and React Native's built-in `WebSocket`; do not add a renderer
transport abstraction or client dependency.

1. Let the developer configure the endpoint with
   `EXPO_PUBLIC_A2UI_DEMO_URL`, with documented local development setup. This
   public variable contains an endpoint, never credentials.
2. Provide explicit connect/disconnect controls and a visible connection/error
   state. A new connection starts a fresh engine/session. Do not automatically
   reconnect or replay messages into an existing surface.
3. Deliver each parsed incoming A2UI message to the engine as it arrives. Show
   app-owned pending UI before the root and referenced children arrive, then
   show the completed interactive surface.
4. Exercise a writable input and send the renderer's `A2UIUserAction` through
   the open socket. The producer replies with a data update that is visible
   in the same surface. Display the last dispatched action for inspection.
5. Include explicit recovery and deletion controls: a recoverable invalid A2UI
   message followed by a valid message must leave the connection usable;
   deletion removes the rendered surface.
6. Distinguish transport/JSON parse errors from structured renderer errors.
   Malformed frames must not crash the screen. Cleanup closes the socket,
   removes handlers, and prevents callbacks from a retired connection updating
   the next session or an unmounted screen.

### Local producer

Add a private `example/server` workspace package using Node ESM and `ws`.
Document it as a deterministic demo producer, not a live model integration.

- Send ordered v0.9.1 A2UI messages as separate frames with visible delays for
  initial surface creation, pending root, pending child, and eventual readiness.
- Accept a small documented demo command envelope for starting/recovering/
  deleting the demo, plus an action envelope containing the unmodified renderer
  action. These are example transport conventions, not A2UI protocol extensions.
- Validate incoming JSON, command names, and supported action shape before
  acting. Invalid input produces a bounded demo error response or close, never
  a process crash or evaluation of received code.
- Keep sessions independent. Cancel scheduled sends on disconnect and shutdown,
  and close sockets on server shutdown. Integration tests may request an
  ephemeral port and controlled scheduling so they do not compete for a fixed
  port or wait through human-facing delays.
- Keep the catalog ID and schema definitions in native-free example code where
  useful, then attach native presenters in the app. Do not import native TSX
  presenters into the Node server. Verify the producer messages against the
  same app-owned schema contract rather than maintaining a second component
  catalog in the server.

## Tech Stack and Structure

Use existing TypeScript, Zod 3, React, React Native, Expo, Node's test runner,
Prettier, and ESLint versions. Keep the existing peer support ranges.

- `src/testing.ts`: optional harness entry using the package-owned engine.
- `test/unit` and `test/integration`: harness and real-socket behavioral checks.
- `test/types`: public testing entry and guide compilation fixtures.
- `example/expo/src`: app-owned catalog and network demo UI/client lifecycle.
- `example/server`: private demo producer, commands, and native-free fixtures.
- `docs/testing.md`: minimal headless and mounted examples with cleanup.
- `docs/streaming-and-actions.md` and `example/expo/README.md`: runnable network
  setup and transport ownership explanation.
- Packaging scripts: verify optional entry availability and native isolation.

Use existing naming/formatting conventions. For example, a consumer test feeds
messages directly and performs its own assertions:

```ts
const harness = createA2UITestHarness({ catalogs: [appCatalog] });

try {
  harness.engine.applyMessages(messages);
  assert.equal(harness.engine.getSurface("form")?.rootId, "root");
  assert.deepEqual(harness.engine.getErrors(), []);
} finally {
  harness.engine.dispose();
}
```

## Commands

Existing verification commands, executed from the repository root:

```sh
pnpm build
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm example:check
pnpm pack:check
pnpm consumer:smoke
pnpm exec prettier --check SPEC-consumer-tooling.md HANDOFF.md
```

The plan must establish these runnable demo commands (new private package name
`a2ui-demo-server`) and document endpoint configuration for local devices:

```sh
pnpm --filter a2ui-demo-server start
EXPO_PUBLIC_A2UI_DEMO_URL=ws://localhost:8080 pnpm --filter a2ui-renderer-example start
```

The localhost command is a host/simulator setup example; the guide must explain
how to use a reachable host address for Android emulators and physical devices,
and describe any development-build network configuration actually required.

## Testing Strategy

Use Node tests for independent harness instances, real ingestion and resource
limits, recorded actions, immutable action-list snapshots, and cleanup. Use
the existing React integration setup with app-owned presenters for a real
writable binding and action dispatch; do not simulate engine internals.

Use an actual local WebSocket for ordered streaming, pending-to-ready snapshots,
action/response round trips, invalid-message recovery, deletion, session isolation,
and disconnect/shutdown cleanup. Bound async tests with timeouts and deterministic
completion conditions. Test retired client callbacks separately with the smallest
app-owned transport lifecycle seam needed, without publishing that seam.

Compile public type/guide fixtures. Check the packed `/testing` entry in plain
Node, and retain Expo/bare React Native iOS/Android bundle checks for the normal
entry. Bundle the Expo network example. Record manual device verification
separately; successful bundling does not establish a working on-device socket.

## Boundaries

- **Always:** use the real engine and app-owned catalog; keep optional tooling
  out of the native root graph; clean up sockets and engine lifetimes; run
  behavioral and packaging checks before completing implementation commits.
- **Ask first:** additional public API beyond the harness above; dependencies
  beyond the one private server dependency; release/version/license changes;
  hosted service credentials; CI changes or new transport abstractions.
- **Never:** ship default presenters, a Basic Catalog, transport/model SDK,
  assertion framework, or demo server as renderer runtime dependencies; weaken
  existing tests or protocol validation to accommodate a demo; commit secrets.

## Success Criteria

1. A developer can create a harness from their catalog, feed messages, inspect
   snapshots/errors, exercise a mounted presenter action, and dispose it with
   the documented APIs and their own test runner.
2. Separate harnesses never share actions or surfaces. Previously returned
   action arrays remain unchanged after later dispatches.
3. `/testing` imports from the actual tarball in plain Node, while the native
   entry retains its isolation and has no added runtime dependencies.
4. The Expo app receives progressive messages through a real local WebSocket,
   sends an action back, displays its response, recovers from invalid input,
   deletes the surface, and safely disconnects/reconnects.
5. Producer fixtures are checked against the app's schema contract. The example
   documents actual run commands and how to replace its producer with an
   application backend without changing the renderer.
6. Existing tests, type/lint/format gates, packed consumer checks, and example
   checks pass. Test evidence and any unperformed device checks are recorded.

## Sources and Open Questions

- [React Native 0.86 networking](https://reactnative.dev/docs/0.86/network#websocket-support):
  built-in WebSocket client and lifecycle callbacks.
- [ws official repository](https://github.com/websockets/ws): Node server API;
  published version selection belongs to the implementation plan.
- [Expo environment variables](https://docs.expo.dev/guides/environment-variables/):
  public endpoint configuration using `EXPO_PUBLIC_` variables.

No unresolved blocker is assumed. The scope, new optional public entry, and
private server dependency were approved with this spec. Plan and task list were
subsequently approved; implementation and verification are complete.
