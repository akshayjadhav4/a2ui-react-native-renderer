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

Choose `v0.9` or `v0.9.1` before connecting. Repeat this checklist with both
versions (disconnect before changing versions):

| Step                        | Expected result                                                                                                                                                |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Connect                     | Progressive root/children appear, then a teal-bordered form. Model sharing is on.                                                                              |
| Edit the rendered input     | The input edits `/record/` (the empty-name field); **Preserved sibling** stays visible.                                                                        |
| Send action                 | The server reply contains `model: YOUR EDIT` and `sibling: Preserved sibling`. Last sent payload contains the full model under `metadata.a2uiClientDataModel`. |
| Send chat with current form | The same edited model arrives without a button action. The reply starts with `chat`.                                                                           |
| Invalid list path           | The input reports `BINDING_ERROR` for `/items/length`. Other healthy children remain.                                                                          |
| Restore input               | The input returns with your previous edit and the sibling intact.                                                                                              |
| Invalid theme               | The form is deleted; a creation with a numeric color is rejected with `INVALID_MESSAGE`.                                                                       |
| Recreate form               | A fresh teal form appears, current error recovers and model sharing turns on. Input values reset.                                                              |
| No theme                    | The form is recreated without theme values; app default colors replace teal. Model sharing is on.                                                              |
| Opt out of model sharing    | A fresh form appears with sharing off. Action/chat replies say **metadata omitted**; last sent payload has no model metadata.                                  |
| Delete surface (try twice)  | First click removes the form; second click reports `INVALID_MESSAGE`. Recreate form restores it.                                                               |
| Recover invalid update      | A malformed update is rejected, then a valid reply displays **Recovered after invalid message**.                                                               |
| Disconnect/reconnect        | A fresh engine and producer session start.                                                                                                                     |

“Last renderer error” is historical and intentionally stays visible after a
successful recovery. Invalid-theme, invalid-list-path, malformed-update and
second-deletion controls intentionally generate errors. Use **Recreate form**
to reset the fixture; it also turns sharing back on. Recreating a form does
not preserve edits. Use **Restore input** when you want to retain the edit.

The app reports connection, transport and renderer errors separately. It has
manual reconnection; leaving the screen retires socket callbacks and releases
the hook-owned engine. The producer cancels timers on disconnect/shutdown.
Automated tests cover these scenarios over real local sockets and mounted
presenters; native device interaction remains a manual check.

### Ownership and Backend Substitution

This is real network delivery from a deterministic fixture producer, with no
hosted model call. Its only dependency is `ws`; the native client uses its
built-in WebSocket, and the renderer has no transport dependency.

`src/catalog-contract.mjs` defines the schema shapes once, receiving Zod/common
schemas as arguments. `src/catalog.tsx` attaches native presenters; the producer
imports only the catalog ID and tests use these same component/theme schemas
with test presenters.

Replace the producer with your backend while keeping app-owned ingestion:
parse incoming A2UI messages, call `engine.applyMessage`, and route actions and
chat messages through one sending function. That function calls
`engine.getClientDataModel(["network-demo"])`; the library checks opt-in without
the app tracking flags. Your backend selects the app catalog ID and
can use its exported schema document to guide a model.

The demo's text frames contain raw incoming A2UI JSON or a separate producer
error envelope, `{ "type": "demoError", "message": "..." }`. These are private
demo conventions, not additions to A2UI:

- Start: `{ type: "command", command: "start", version, sendDataModel: true }`.
  Defaults are `v0.9.1` and true. Other commands are `recover`, `delete`,
  `recreate`, `without-theme`, `opt-out`, `invalid-path` and `restore-path`,
  plus `invalid-theme`.
- Action: `{ type: "action", version, action, metadata? }`.
- Chat: `{ type: "chat", version, text, metadata? }`.
- When opted in, metadata is `{ a2uiClientDataModel: { version, surfaces } }`.
  The server requires only its own surface, matching version, edited field and
  intact sibling. Missing/mismatched metadata produces a separate transport
  error instead of a success reply. Opted-out sends must omit model metadata.

The actual A2UI action envelope is `{ version, action }`; `type` and the outer
transport metadata are demo-specific. Command controls are fixture instructions,
not outgoing A2A conversation messages. User actions and chat share the model
metadata path. The producer remains deterministic and has no LLM or credentials.

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
