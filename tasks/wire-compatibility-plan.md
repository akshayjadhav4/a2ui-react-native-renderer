# Implementation Plan: In-Package A2UI Protocol Core

**Module id:** `wire-compatibility`

**Specification:** [SPEC-wire-compatibility.md](../SPEC-wire-compatibility.md)

**Architecture decision:** [native-core-decision.md](native-core-decision.md)

**Status:** Approved and implemented on 2026-10-04. Verification is recorded in the task list.

**Task list:** [wire-compatibility-todo.md](wire-compatibility-todo.md)

The existing `tasks/plan.md` and `tasks/todo.md` describe the initial release and retain unchecked checkpoints. They remain historical work records. This file replaces the earlier `wire-compatibility` plan for the same module; its dependency trial evidence remains in the spec and task list.

## Outcome

The package directly implements the A2UI v0.9 and v0.9.1 wire behavior it needs for React Native. It accepts complete message sequences through the current engine API, retains app-owned component catalogs, reports structured errors, recovers after invalid individual messages, and emits the existing action callback shape. The final installed package has no `@a2ui/web_core` dependency or Basic Catalog/Lit runtime code.

Progressive references, binding setter design, and the simpler React API remain in their mapped modules. The license decision and publication are deferred. Public contract changes found during the migration will be documented for a future `0.2.0` release.

## Architecture decisions

### Use the official wire specification as the contract

Implement the four v0.9/v0.9.1 server messages and the required action/common types with Zod 3, which is already a peer dependency. Match the official JSON schemas' required fields, unknown-field handling, and version tags. Keep the existing public `A2UI*Schema`, `A2UIMessage`, and action aliases source compatible where possible. Run official protocol fixtures plus local catalog fixtures through the new parser. Do not adopt json-render's separate spec or its illustrative v0.8 A2UI example as the wire contract.

### One authoritative surface state

The current engine keeps immutable public snapshots and an upstream mutable surface model. The replacement stores surface ID, catalog ID, theme/sendDataModel metadata, component records, and data model in one in-package state. Each message is parsed and validated against the latest accepted state, staged without mutating it, then committed atomically. A failed message leaves the last valid revision intact. `applyMessages` preserves the batch-size limit and publishes once after processing all accepted-size messages.

Keep the public `createA2UIEngine`, snapshot, subscription, catalog, and React interfaces during this module. Internal implementation and schema aliases may change. Preserve `onAction` as a resolved action payload; transport envelopes and capability exchange are outside this module.

### Replace only the upstream facilities in use

The replacement covers the `MessageProcessor`/surface/component model behavior, protocol schemas/types, and the schema behavior inspection used for dynamic values and structural children. Reuse the package's existing pointer logic, graph validator, function evaluation, action resolver, limits, and presenters after checking their behavior against official fixtures.

The behavior inspector must recognize exported A2UI schema aliases after normal Zod wrapping (`optional`, `nullable`, `default`, nested object/array). Existing consumer component schemas should not need new metadata for this migration. A future explicit catalog contract can improve this seam separately.

### Keep the old implementation until cutover is proven

Build and test the new core behind an internal module while production continues using the existing adapter. Verify v0.9 parity and v0.9.1 fixtures directly against the new core. Switch the adapter/engine to the new core only when lifecycle, components, data, actions, and error handling have passing tests. Remove the dependency after the cutover and packed consumer checks; do not ship both processors.

## Dependency graph and build order

```text
Approved dependency trials and current 0.9.0 baseline
  -> official fixture + public contract inventory
  -> versioned schemas/types and schema behavior inspection
  -> internal atomic lifecycle/component/data state transitions
  -> outbound actions and local functions
  -> v0.9/v0.9.1 direct-core parity gate
  -> engine cutover with per-message recovery
  -> remove web_core, packed native consumers, documentation
```

## Delivery slices and checkpoints

### Slice 1: Contract and schema foundation

Freeze representative v0.9 public outcomes and declaration shapes. Add official v0.9/v0.9.1 fixtures. Implement internal message/action/common schemas and behavior inspection while the existing adapter remains active.

**Checkpoint:** Both wire versions parse correctly in direct tests, malformed supported versions are classified as validation errors, public schema aliases retain their expected shape, and schema behavior inspection recognizes existing app-owned catalogs.

### Slice 2: Native state transitions

Implement lifecycle, component updates, data replacement/removal, and deletion as pure staged transitions. Validate catalog IDs, component schemas, graph/resource limits, pointers, and revision behavior before commit. Test the new core directly against official and local fixtures. Cover the old processor's partial-mutation failure mode with a component update containing a valid entry followed by an invalid one.

**Checkpoint:** Direct-core v0.9 parity and complete-graph v0.9.1 lifecycle tests pass. No rejected message changes committed state, even if validation fails after earlier entries in the same update.

### Slice 3: Actions and engine cutover

Replace remaining upstream action/function schemas. Verify event context uses current bound data, local functions execute locally, and outbound payloads match the existing callback contract. Wire the new core into the existing engine and process each message in order. Continue after parse, validation, and processing failures, including another message on the same surface. Publish one final batch notification.

**Checkpoint:** Existing v0.9 tests and public type fixtures pass, both versions complete engine-level flows, action callbacks match, and same-surface recovery leaves snapshots and core state aligned.

### Slice 4: Dependency removal and consumer proof

Remove `@a2ui/web_core` imports and dependency, update lockfile, inspect generated declarations, and run full checks on the package tarball in Expo and bare React Native for iOS and Android. Inspect Metro provenance and installed dependency graph. Document exact support, the deferred progressive-reference limitation, and batch recovery migration.

**Checkpoint:** `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm pack:check`, and `pnpm consumer:smoke` pass. The tarball has no `web_core` dependency and the native runtime graph has no Lit, Basic Catalog, or DOM module from this package.

## Verification strategy

- **Wire conformance:** Positive and negative cases from official v0.9/v0.9.1 JSON schemas and protocol examples; the four server message types, supported-version classification, and outbound action payloads.
- **State semantics:** Create, update, delete, data path replacement/removal, same-surface recovery, unrelated-surface progress, duplicate IDs, invalid props, missing root, cycles, resource limits, and immutable snapshots.
- **Compatibility:** Existing 91-test baseline, representative v0.9 differential outcomes against the current dependency-backed engine, public type fixtures, and generated declaration review.
- **Consumer packaging:** Pack/install into Expo and bare React Native fixtures, typecheck and bundle both platforms, and inspect source maps plus package dependency metadata.
- **Scope truthfulness:** Document that a child or root reference arriving later is not yet fully supported until `progressive-surfaces` ships.

## Risks and mitigations

| Risk                                                             | Impact                              | Mitigation                                                                                                             |
| ---------------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Protocol schema differs subtly from the official JSON schema     | Interoperability failures           | Derive cases from published schema/examples, test strictness and optional fields, and compare both supported versions. |
| Replacing `scrapeSchemaBehavior` changes custom catalog behavior | Missing bindings or child rendering | Test exported alias schemas through common Zod wrappers and nested catalog schemas before cutover.                     |
| An update mutates state before a later item fails                | Snapshot/core divergence            | Use pure staged transitions, commit only after full validation, and test a late failure in a multi-component update.   |
| Public inferred types narrow or widen unintentionally            | Consumer TypeScript breakage        | Compile current type fixtures and inspect declarations before switching exports; document unavoidable changes.         |
| Owning the core increases protocol maintenance                   | Future version drift                | Keep versioned protocol modules, official fixture provenance, and a repeatable packed-consumer gate.                   |

## Review decisions

The user approved v0.9 and v0.9.1 scope, app-owned components, and message-level recovery in the original spec. On 2026-10-04 the user chose an in-package implementation against the A2UI specification instead of depending on `web_core`, approved this revised plan, and authorized implementation. The completed checks are recorded in [the task list](wire-compatibility-todo.md).
