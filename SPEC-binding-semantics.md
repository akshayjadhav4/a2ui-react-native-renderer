# Spec: Presenter Binding Semantics

**Module id:** `binding-semantics` in [CAPABILITY-MAP.md](CAPABILITY-MAP.md)

**Status:** Approved and implemented on 2026-10-04. See [verification results](tasks/binding-semantics-todo.md).

## Assumptions

1. Applications continue to own every component and decide whether a native control is editable. The renderer exposes binding state through presenter props; it does not choose native UI behavior.
2. A property is writable through a generated `setX` callback only when its current wire value is a direct data binding (`{ path: string }`). A literal and a function result are read-only. This is the proposed package API rule, inferred from the [A2UI v0.9.1 read/write contract](https://github.com/a2ui-project/a2ui/blob/main/specification/v0_9_1/docs/a2ui_protocol.md#two-way-binding--input-components); the protocol does not prescribe React presenter prop names.
3. A missing data path resolves to `undefined` and remains writable, because the next local input may create that path. The [v0.9.1 specification](https://github.com/a2ui-project/a2ui/blob/main/specification/v0_9_1/docs/a2ui_protocol.md#path-resolution--scope) allows paths to be unresolved while data is streaming.
4. Changing the public `A2UIResolvedProps` TypeScript shape is acceptable for the planned `0.2.0` release, with a migration guide. The engine, wire schemas, action payload, and `A2UIPresenterProps` wrapper remain stable.

## Objective

Make the values and setters received by app-owned React Native presenters reflect the current A2UI binding. A developer should be able to render a value, tell whether it can be edited, and write a valid native input without silent no-ops or misleading types.

This module supports both `v0.9` and `v0.9.1`. The [official protocol](https://github.com/a2ui-project/a2ui/blob/main/specification/v0_9_1/docs/a2ui_protocol.md#data-model-representation-binding-scope) defines absolute and template-relative JSON Pointer resolution and immediate local data-model updates for two-way bound inputs. The package implements that behavior without shipping any input component or transport.

## Current gap

- `resolvePresenterProps` currently creates `setX` for every dynamic field, even a literal or function call. Calling those setters silently does nothing.
- `A2UIResolvedProps` types every generated setter as present, despite that runtime no-op, and can type a missing bound value as a definite string/number/boolean.
- Nested dynamic object fields resolve at runtime, but the public mapped type does not describe their resolved values and setters recursively.
- Binding reads and presenter writes do not check that a resolved/written value matches a typed `A2UIDynamic*Schema` field. A wrong data-model type can reach a native presenter.

## Proposed presenter contract

For a component schema containing `value: A2UIDynamicStringSchema`:

| Wire value                    | Presenter `props.value`                    | Presenter `props.setValue` |
| ----------------------------- | ------------------------------------------ | -------------------------- |
| `"Fixed"`                     | `"Fixed"`                                  | absent                     |
| `{ call: "formatName", ... }` | evaluated string                           | absent                     |
| `{ path: "/form/name" }`      | model string, or `undefined` while missing | `(next: string) => void`   |

The public type is equivalent to `value: string | undefined` and `setValue?: (next: string) => void`. A presenter can use `props.setValue !== undefined` to decide whether to enable an input. The setter does not trigger network I/O; action forwarding remains the consumer's decision.

For nested object and array schemas, resolved value types and optional setters follow the same rule at the nesting level where the dynamic field appears. Existing static fields retain their inferred types. Generated setter names must not overwrite a real schema property; a conflicting catalog component definition is rejected clearly.

## Behavior and error rules

1. Resolve absolute paths from the surface data-model root and relative paths from the current template scope, including RFC 6901 escaping. Keep current array item isolation.
2. Leave an absent bound value as `undefined` without raising an error. A later server update or local setter call updates subscribed presenters. Do not coerce a missing value to a string or a default chosen by the renderer.
3. For typed dynamic fields, a present bound value or function result of the wrong type produces a structured `BINDING_ERROR` or `FUNCTION_ERROR` at the component boundary. The raw data model remains available for a later correcting update; no invalid value is passed to that presenter.
4. A generated setter checks its next value against the expected dynamic field type before writing. Invalid values produce a structured error and leave the data model and surface revision unchanged. A valid write changes only its surface and path, then notifies its subscribers.
5. No setter is supplied for a literal or function result. If a saved setter is called after its component is deleted or rebound to another path, it must not write to an obsolete path.
6. Existing `onError`, diagnostics, resource-limit, immutable snapshot, and action-context behavior continues to apply.

## Scope boundaries

- **In scope:** Dynamic string, number, boolean, string-list, and generic values; nested component schemas; absolute and relative bindings; presenter setter availability; runtime read/write validation; public inferred types; migration docs.
- **Deferred:** Pending component references and loading UI (`progressive-surfaces`), transport-level synchronization and `sendDataModel` metadata, catalog export (`catalog-contract`), React placement API (`react-surface-api`), and fine-grained rerender optimization (`render-reactivity`).
- **Excluded:** Basic Catalog components, app-owned form validation rules, implicit network requests, new runtime dependencies, and a license or package release change.

## Tech stack and project structure

- TypeScript 6 and Zod 3 schemas define public presenter types and runtime value checks.
- `src/catalog/types.ts` owns `A2UIResolvedProps` and generated setter types.
- `src/protocol/v0_9/behavior.ts`, `resolveProps.ts`, and `bindings.ts` own schema behavior, value resolution, and pointer scopes.
- `src/rendering/presenterAdapter.tsx` and engine internals report errors and route local writes.
- `test/types/` covers compile-time presenter contracts; `test/unit/` and `test/integration/` cover runtime behavior. `docs/catalogs.md`, `docs/api.md`, `docs/migration.md`, and `CHANGELOG.md` describe the consumer change.

## Commands

Run from the repository root:

```sh
pnpm build
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm pack:check
pnpm consumer:smoke
```

## Code style

Keep the runtime test explicit and narrow; do not infer writability from the resolved value:

```ts
const writable = isDataBinding(wireValue);
const resolved = writable
  ? readDataPointer(dataModel, resolveBindingPath(scopePath, wireValue.path))
  : resolveDynamicValue(wireValue);
```

Use existing `A2UI` names, strict TypeScript, immutable snapshots, and double quotes. Avoid a second data-model store or component-specific behavior inside the protocol core.

## Testing strategy

1. Preserve existing bound-presenter, template scope, action-context, subscription, and 500-component tests as the baseline.
2. Add runtime cases for literal/function read-only values, missing bound values, valid local writes, wrong-type reads/writes, and stale callbacks after rebind/deletion. Verify the error code, affected surface, snapshot identity, revision, and notifications.
3. Add type fixtures proving optional setters and `undefined` on bindable values, correct nested inference, and correct setter argument types. Keep static properties unchanged.
4. Run the package gates and packed Expo/bare React Native consumer checks after the public type migration.

## Boundaries

- **Always:** Preserve app-owned catalog control, use the current surface model as the only write target, validate untrusted data and native callback values, and document public type changes.
- **Ask first:** Add new public APIs beyond the proposed optional generated setter, change action or wire semantics, introduce dependencies, or move progressive rendering into this module.
- **Never:** Silently discard an attempted write, mutate another surface, call a transport from a setter, or ship a renderer-owned input component.

## Success criteria

1. A presenter receives a setter exactly when its current dynamic wire value is a data binding; the public type makes that setter optional.
2. Missing paths resolve as `undefined`, while wrong-type resolved values and writes report structured errors without passing an invalid value to a presenter or mutating state on a failed write.
3. Nested resolved props and setters match their TypeScript types. Setter naming collisions fail clearly.
4. Valid writes update only the bound path and surface; stale setters cannot write after a rebind or deletion.
5. Existing v0.9/v0.9.1 engine behavior, actions, resource limits, native bundles, and package checks remain green. Documentation includes a concise migration example.

## Review decision

The user approved the proposed **optional generated `setX` callback** contract by asking to proceed on 2026-10-04, then approved implementation with “start.” It is present for a direct `{ path }` binding and absent for a literal or function value. The implementation plan and verified task list are recorded under `tasks/`.
