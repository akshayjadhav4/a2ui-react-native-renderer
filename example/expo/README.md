# Expo Consumer Example

An Expo SDK 57 application that consumes `a2ui-react-native-renderer` through
its public package exports. The app owns its complete A2UI catalog, presenters,
fixtures, and placement UI.

## Run the Network Demo

From the repository root, install and build once:

```sh
pnpm install
pnpm build
```

Start the deterministic local producer in one terminal:

```sh
pnpm --filter a2ui-demo-server start
```

Start Expo in another terminal (host/iOS simulator endpoint):

```sh
EXPO_PUBLIC_A2UI_DEMO_URL=ws://localhost:8080 pnpm --filter a2ui-renderer-example start
```

Open **Network demo** in the fixture screen's navigation bar. You can edit the
endpoint on the network screen before connecting.

For an Android emulator:

```sh
EXPO_PUBLIC_A2UI_DEMO_URL=ws://10.0.2.2:8080 pnpm --filter a2ui-renderer-example start
```

Android documents `10.0.2.2` as the development machine's host-loopback alias in
its [network address guide](https://developer.android.com/studio/run/emulator-networking-address).

For a physical phone, put the phone and computer on the same reachable local
network and bind the producer to the computer's network interfaces:

```sh
A2UI_DEMO_HOST=0.0.0.0 pnpm --filter a2ui-demo-server start
```

Use `ws://YOUR_COMPUTER_LAN_IP:8080` in the app; `0.0.0.0` is a bind address,
not a client endpoint. Allow the development port through the computer's
firewall if needed. `A2UI_DEMO_PORT` changes the server port.

The producer uses cleartext `ws://`. Custom native builds may enforce network
restrictions; see [React Native networking](https://reactnative.dev/docs/0.86/network)
for iOS ATS and Android cleartext configuration. Use app-specific development
network permissions or put the producer behind a trusted TLS endpoint and
enter its `wss://` address. Certificates and network permissions belong to the
host app. Device/simulator interaction has not been verified for this module.

`EXPO_PUBLIC_A2UI_DEMO_URL` is a public endpoint, never a secret. Expo inlines
public variables; see its [environment variable guide](https://docs.expo.dev/guides/environment-variables/).

### Try the Flow

1. Connect. Separate v0.9.1 messages expose pending root and children before
   the form becomes ready.
2. Edit the rendered input and press **Send action**. The binding updates
   `/draft`; the producer receives the real action and replies with a data update.
3. After the form appears, press **Recover invalid update**. A rejected message
   produces a renderer error; the next valid update restores the surface.
4. **Delete surface** removes the form and cancels remaining producer sends.
5. Disconnect and connect again for a fresh engine and producer session.

The app reports connection, transport and renderer errors separately. It has
manual reconnection; leaving the screen retires socket callbacks and releases
the hook-owned engine. The producer cancels timers on disconnect/shutdown.

### Ownership and Backend Substitution

This is real network delivery from a deterministic fixture producer, with no
hosted model call. Its only dependency is `ws`; the native client uses its
built-in WebSocket, and the renderer has no transport dependency.

`src/catalog-contract.mjs` defines the schema shapes once, receiving Zod/common
schemas as arguments. `src/catalog.tsx` attaches native presenters; the producer
imports only the catalog ID and tests use these same schemas with test presenters.

Replace the producer with your backend while keeping app-owned ingestion:
parse incoming A2UI messages, call `engine.applyMessage`, and send `onAction`
payloads through your transport. Your backend selects the app catalog ID and
can use its exported schema document to guide a model.

The demo's text frames contain raw incoming A2UI JSON or a separate producer
error envelope, `{ "type": "demoError", "message": "..." }`. Outgoing controls
are `{ "type": "command", "command": "start" }`, with `recover` and `delete`
as the other supported commands. Actions use
`{ "type": "action", "action": A2UIUserAction }` with the unmodified action.
These envelopes are private demo conventions, not additions to A2UI.

## Fixture Showcase

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
