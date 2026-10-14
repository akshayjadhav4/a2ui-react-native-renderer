# Consumer Tooling Verification

**Module:** `consumer-tooling`

**Date:** 2026-10-14

**Branch:** `codex/native-core`

**Status:** Complete. All required automated gates passed.

## Delivered Contract

| Spec criterion                                 | Evidence                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Test own catalog through the real engine       | `/testing` exposes `createA2UITestHarness`, its engine, and recorded actions; headless and mounted tests exercise actual ingestion, writable bindings, and dispatch. The mounted guide compiles through published import paths.                                                                                                                    |
| Harness isolation and detached action lists    | Separate instances, preserved limits, ordered actions, frozen arrays, retained earlier snapshots, invalid dispatch rejection, and cleanup pass.                                                                                                                                                                                                    |
| Optional entry and native isolation            | Tarball contains entry/declarations. Installed-package Node check constructs a harness and accepts a v0.9.1 surface. Normal native bundles exclude `createA2UITestHarness`; root exports do not import it.                                                                                                                                         |
| Actual network integration                     | Four actual-localhost socket tests cover ordered progressive frames, a mounted presenter action/response, recovery, deletion, malformed/binary/oversized input, two-client isolation, disconnect and shutdown. Three client-adapter tests cover late callbacks and connection failures. Expo network screen typechecks and exports both platforms. |
| Shared app-owned catalog and runnable adoption | A checked native-free factory in `example/expo/src/catalog-contract.mjs` supplies app and test schemas. Producer imports its ID without native presenters. Producer and endpoint-configured Expo startup commands were exercised and stopped cleanly. Guides explain backend substitution and demo envelopes.                                      |
| Existing gates and honest limitations          | Full tests pass (212, zero skipped); build/type/lint/format, example checks, exports and tarball check pass. Device interaction was not performed; simulator inventory had no booted devices and adb listed none.                                                                                                                                  |

## Verification Results

- `pnpm build`: pass.
- `pnpm typecheck`: pass, including public testing types and the complete mounted guide snippet.
- `pnpm lint`: pass.
- `pnpm format:check`: pass.
- Explicit Prettier check of example source/server and module records: pass.
- `pnpm test`: **212 passed, 0 failed, 0 skipped**. Actual socket tests need
  localhost-listen permission in this sandbox and ran with escalation.
- `pnpm example:check`: pass.
- `pnpm example:export`: pass for iOS and Android.
- `pnpm pack:check`: pass, **169 files / 104908 bytes**, including final changelog edits.
- `pnpm consumer:smoke`: pass for installed-tarball Expo and bare React Native
  consumers, including iOS/Android bundles, plain Node harness ingestion,
  declarations, and native bundle exclusion checks.
- Producer `pnpm --filter a2ui-demo-server start`: readiness and SIGTERM cleanup pass.
- Expo `start --port 8181`, configured with `EXPO_PUBLIC_A2UI_DEMO_URL`: Metro
  readiness and process cleanup pass. No simulator was launched by this check.
- `pnpm install --lockfile-only --ignore-scripts --prefer-offline`: pass; final
  pnpm-generated lockfile adds `ws@8.22.0` only for the private example server,
  retaining existing transitive versions.
- `git diff --check`: pass.

## Review and Corrections

The author reviewed the accumulated module diff against correctness,
readability, architecture, input handling, and performance. Public runtime
changes are confined to the 30-line optional harness and its export. Existing
engine/protocol/render behavior is reused. The server and connection lifecycle
are example-owned; no renderer runtime dependency or default presenter was
added. Frame sizes, supported commands/actions, per-session timer ownership,
and callback retirement have concrete tests. No blocking finding remains from
this review; this is an author review, not independent review or merge approval.

Two verification failures were corrected without weakening checks:

1. Shared schemas initially lived beside the producer. Packed Expo typechecks
   could not resolve their sibling JSDoc imports. Moving the native-free factory
   into app source retained inferred presenter types and passed packed checks.
2. Concurrent commands both cleaned the generated `lib` directory, causing one
   pack operation to miss declarations. Final consumer verification was rerun
   alone. Build/pack operations must run sequentially in this checkout.

An incidental whole-lockfile formatting change was removed in a dedicated
commit. The final net dependency diff adds the private server importer and
`ws@8.22.0`; the lockfile was then generated/validated through pnpm.

## Practical Limits

- Actual network tests run on the host, with shared-schema test presenters.
  They do not establish native-device networking, screen appearance, or FPS.
- The producer is deterministic and local; no model inference, hosted service,
  authentication, automatic reconnect, or replay is supplied.
- Headless harness checks do not execute render-time bindings/functions or
  presenters; consumers mount surfaces in their chosen testing setup.
- Version remains `0.1.1`, license remains Apache-2.0. No release, push, tag,
  merge, PR, or publication was performed.

## Implementation Commits

- `2cff278`: optional testing harness and headless/type checks.
- `207af08`: real mounted binding/action recording checks.
- `7fec3cd`: packed testing entry/isolation and shared schema factory.
- `8cc41ae`: shared-schema progressive fixtures and interaction checks.
- `b635f24`: private WebSocket producer and actual socket tests.
- `cd0a031`: remove incidental lockfile formatting churn.
- `50ef9a5`: app-owned connection retirement/error checks.
- `88e6ff5`: Expo network screen and native stack navigation.
- `c73a20c`: testing guide and public-import compilation.
- `f263703`: network setup and backend ownership guide.
