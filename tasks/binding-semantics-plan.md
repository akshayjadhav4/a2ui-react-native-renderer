# Implementation Plan: Presenter Binding Semantics

**Module id:** `binding-semantics`

**Specification:** [SPEC-binding-semantics.md](../SPEC-binding-semantics.md)

**Task list:** [binding-semantics-todo.md](binding-semantics-todo.md)

**Status:** Approved and implemented on 2026-10-04. Verification is recorded in the task list.

The initial-release `tasks/plan.md` and `tasks/todo.md` and the completed wire-compatibility records remain intact. This plan is specific to the next module in [CAPABILITY-MAP.md](../CAPABILITY-MAP.md).

## Outcome

Consumer presenters receive a correctly typed resolved value and an optional `setX` callback only when the current wire value is a direct data binding. Missing paths remain editable, wrong-type values are contained as structured errors, and stale or invalid setters cannot corrupt the surface data model. Components, native editability, and transport remain application-owned.

## Architecture decisions

### Keep the current presenter shape

Retain `props.value` and generated `props.setValue` names so existing app-owned presenters need only account for an optional setter. `A2UIResolvedProps` becomes recursive for nested objects and arrays and includes `undefined` for a dynamic value that may be an unresolved binding. Avoid a new binding wrapper object or separate public hook. Type fixtures cover simple, optional, nested, and array values before changing runtime behavior.

### Classify dynamic values from component schemas

Extend the internal Zod behavior inspection with the expected literal kind for the package's `A2UIDynamicString`, `Number`, `Boolean`, `StringList`, and generic helpers. For an untagged consumer union, infer a kind only when its literal branch is unambiguous; otherwise use an unknown kind and do not guess a primitive type. This descriptor drives both read and write checks and remains internal. A direct `{ path }` wire value is the only writable form. The resolved value itself never determines writability.

### Resolve first, validate at the presenter boundary

Use the existing JSON Pointer and template-scope functions. Missing paths return `undefined` without error. A present value that violates a typed dynamic field raises a binding-resolution error before invoking the presenter; a mismatched function result remains a `FUNCTION_ERROR`. `presenterAdapter` reports these through the current `onError` and fallback path. The engine keeps the raw data model so a later correcting server update can recover the component. Static fields and the generic dynamic helper retain their existing semantics.

### Guard local writes against current state

The setter closes over its component ID, nested property location, scope, and expected value kind. On invocation, validate the next value, then check the current engine snapshot to confirm that the component still exists and its current wire property is bound to the same path. Report `BINDING_ERROR` for an invalid or stale write; never silently ignore it. Only then call the engine's existing internal data setter, which owns resource limits, immutable commit, revisions, and surface notifications. Do not reject a saved setter just because an unrelated data update advanced the surface revision; native controls may emit successive events before React rerenders.

### Reject generated-name collisions at catalog definition

Before freezing an app-owned component definition, inspect nested object schemas for a real property named like a generated setter for a sibling dynamic field, such as `value` and `setValue`. Reject that catalog definition with a clear `TypeError`. This prevents the resolver from replacing a valid consumer property. Keep the check scoped to dynamic fields; ordinary static `setX` names are valid.

## Dependency graph and delivery order

```text
Baseline presenter/type fixtures
  -> recursive public resolved-prop types
  -> dynamic kind metadata and name-collision guard
  -> optional runtime setter and missing-value reads
  -> typed read/function-result checks
  -> validated and current-state-checked writes
  -> migration docs and packed native verification
```

Each slice has a focused red test or type fixture first, then the smallest implementation needed to pass it. Keep the package buildable at each checkpoint.

## Tasks and checkpoints

### Phase 1: Public contract and schema metadata

- **Task 1:** Record current literal/binding/function presenter behavior and type fixtures, including a nested dynamic field. Confirm the baseline before behavior changes.
- **Task 2:** Make `A2UIResolvedProps` recursive and generated setters optional. Add compile-time positive and negative cases, preserving static property inference.

**Checkpoint A:** Public type fixtures compile with `value | undefined`, optional `setX`, and nested resolved types; existing runtime tests still pass.

- **Task 3:** Add expected dynamic kinds to the internal behavior inspector and reject generated setter name collisions when defining a component.

**Checkpoint B:** Tagged helpers and unambiguous custom unions classify correctly. Conflicting schema properties fail at catalog definition; existing catalogs still register.

### Phase 2: Runtime read and write behavior

- **Task 4:** Emit setters only for direct bindings and preserve `undefined` for missing paths. Test literal/function read-only values and relative template writes.
- **Task 5:** Validate typed bound reads and function results before presentation. Route the right structured error to the existing component fallback and verify recovery after a corrected data update.

**Checkpoint C:** A presenter never receives an invalid typed dynamic value; a missing path remains available for local input. Existing action and render-subscription tests pass.

- **Task 6:** Validate setter arguments and reject saved callbacks after rebind or deletion, without invalidating successive events merely because the data revision changed. Test wrong type, stale callback, valid local write, cross-surface isolation, and error reporting.

**Checkpoint D:** A rejected write preserves snapshot identity and revision; a valid write changes only its bound surface and notifies the right subscribers.

### Phase 3: Consumer migration and package proof

- **Task 7:** Update catalog/API/migration docs, changelog, and the Expo example to show optional setters and explicit native editability. Run full package checks and packed iOS/Android consumer smoke builds.

**Checkpoint E:** All spec criteria pass; generated declarations contain the intended optional setter contract; installed Expo and bare React Native consumers still bundle without browser modules.

## Verification

Run focused `pnpm build && node --test` cases and `pnpm typecheck` at each relevant slice. Before marking the module complete, run:

```sh
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm pack:check
pnpm consumer:smoke
```

Inspect the public declaration for `A2UIResolvedProps`, check `git diff --check`, and verify the packed manifest has no new runtime dependency. The existing 500-component integration test is the current performance regression signal; only expand performance testing if that test exposes a concrete issue.

## Risks and mitigations

| Risk                                                     | Effect                       | Mitigation                                                                                                               |
| -------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Optional setter type breaks a consumer's direct call     | TypeScript migration needed  | Document `props.setValue?.(next)` or guard it; show `editable={props.setValue !== undefined}` in the example.            |
| Generic or custom Zod unions cannot be classified safely | Incorrect runtime type check | Fall back to unknown kind rather than guessing; test tagged and unambiguous unions separately.                           |
| A bound path is missing while streaming                  | Premature fallback           | Preserve `undefined` without error and keep the setter available for local creation.                                     |
| A stale native callback writes after rebind              | Data corruption              | Compare the current component's wire binding before writing, rather than only the captured render revision.              |
| Validation work increases render cost                    | Slower large surfaces        | Reuse one schema behavior descriptor per component resolution where possible and run the 500-component integration test. |

## Review decisions

The spec's optional setter contract was approved when the user said “ok next” on 2026-10-04, and the plan and task list were approved when the user said “start.” The implementation followed these checkpoints. No Basic Catalog, transport, license, publication, or progressive-reference work is included.
