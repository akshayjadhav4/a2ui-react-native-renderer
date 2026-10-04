# Implementation Plan: Exportable App-Owned Catalog Contract

**Module id:** `catalog-contract`

**Specification:** [SPEC-catalog-contract.md](../SPEC-catalog-contract.md)

**Status:** Approved for task breakdown on 2026-10-04 when the user said “approved next.” No implementation has started.

The initial-release [plan.md](plan.md) and [todo.md](todo.md) still contain historical unchecked items. This module follows the approved per-module convention and uses this plan and [catalog-contract-todo.md](catalog-contract-todo.md); those historical files remain untouched.

## Outcome

An application continues to register one app-owned `A2UICatalog` with the React Native renderer and can export a serializable A2UI catalog schema for its agent or server. The export preserves component names, supported Zod wire properties, structural and dynamic common-type references, descriptions, and faithfully representable functions. Unsupported schemas fail with a path. The mobile package root and native bundles do not load the exporter.

## Architecture decisions

### 1. Check the official schema boundary before coding

Pin the official v0.9 and v0.9.1 common-types, server-to-client, and sample catalog schema files as test-only fixtures, recording the upstream commit and source URLs. Compare their `$id`, `catalogId`, `components`, `functions`, `$defs`, and `catalog.json` reference requirements. Confirm whether both wire versions use one catalog document and one common-types URI. If they differ in a way that changes the public export API, revise the spec and obtain review before implementation.

Use a draft 2020-12 validator in development tests to check generated output against representative official envelopes. The plan proposes `ajv` as a **dev-only** dependency for this independent check; it will not be imported by shipped code or installed as a runtime dependency. This dependency is part of the plan review because the spec requires asking before adding one.

### 2. Keep export code off the React Native entry path

Add `src/catalog-schema.ts` as a dedicated entry that exports `exportA2UICatalogSchema`. Add `./catalog-schema` to `package.json` exports, pointing to `lib/module/catalog-schema.js` and its generated declaration. `src/index.ts`, React components, engine code, and common schema markers must never import the exporter. The exporter may use type-only imports from `src/catalog/types.ts` and runtime Zod inspection, but no React, React Native, native module, presenter, or function implementation.

First prove the built subpath imports from a packed package in Node and that the root import remains unchanged. Inspect Metro output from packed Expo and bare consumers for an exporter-only sentinel to confirm tree isolation rather than relying on package metadata alone.

### 3. Convert a supported Zod subset without silent widening

Create a small converter under `src/catalog/` for the supported Zod 3 shapes in the spec. Traverse the schema tree with a component/function property path, detect unsupported transforms, refinements, recursion, and constraints that cannot be expressed, then throw a `TypeError` at that path. Preserve optional and nullable wrappers, defaults, required fields, array bounds, string/number limits, enums/literals, unions, nested objects, and object unknown-key policy to the extent JSON Schema can express it. Do not use `{}` as an unsupported fallback or change `defineA2UICatalog` validation.

Recognize the existing A2UI marker tags before generic conversion. Emit the exact official common-type `$ref` for `ComponentId`, `ChildList`, `Action`, and dynamic value schemas. Preserve wrapper semantics around a marker. A plain string is an ordinary string. For catalog components, add the required `component` discriminator and existing common component fields in the official catalog shape, while copying optional descriptions.

The converter must generate a fresh, deterministic JSON value. It must not call `safeParse` to manufacture agent guidance from sample values, execute a function, render a presenter, or mutate the input catalog.

### 4. Export function schemas only with wire/runtime parity

For each `A2UIFunctionDefinition`, inspect `args` and `returns` separately from `execute`. At the wire boundary, each direct argument can be a literal, binding, or nested function call; the current evaluator resolves these before applying the function's Zod args schema. The exporter must model that boundary rather than copying the post-resolution args schema unchanged. It must also verify how the official catalog represents `returnType`, including the package's `unknown` return kind.

Use parity tests for literal args, bound args, nested calls, optional args, wrong types, and mismatched `returnType`. If a function's contract cannot be represented without changing runtime semantics, fail export with its function name and argument path. A runtime behavior change or extra public option requires a spec revision and human review. No executable `execute` value appears in output.

### 5. Validate the actual consumer flow

Generate a document from one small app-owned catalog used by the renderer, then validate accepted and rejected sample messages through both the generated schema plus official common types and the renderer's current validation. Include single child, child list, dynamic binding, action, nested fields, functions, and both wire versions. Check stable `JSON.stringify`, detached output, matching `$id`/`catalogId`, and no presenter or callback serialization.

Document an app pattern: define once, use the catalog on mobile, export its schema in server/build-time code, and hand it to any agent through app-owned infrastructure. Show how unsupported Zod syntax reports a named path and how a catalog ID change should be versioned. Keep the Basic Catalog, prompt builders, transport, and model SDK outside this package.

## Dependency graph and delivery order

```text
Official fixture and export-shape audit
  -> subpath contract and packed import proof
  -> ordinary Zod component export
  -> A2UI marker references
  -> function wire-schema export
  -> end-to-end schema/runtime parity
  -> docs and packed native proof
```

The first vertical slice exports one ordinary component through the packed subpath. The second adds nested properties and A2UI markers. The third adds representable functions. Each slice receives focused tests first and leaves the build and typecheck green.

## Phases and checkpoints

### Phase A: Official contract and packaging

- Pin official fixtures, determine exact shared or versioned reference URIs, and define the generated document's required shape.
- Add the independent development-time JSON Schema validator and prove the dedicated subpath works in a packed Node consumer.

**Checkpoint A:** A one-component generated catalog is accepted by the official envelope setup; the mobile root import does not load the export entry.

### Phase B: Component schema conversion

- Convert the agreed Zod subset with path-aware failure for unsupported constructs.
- Preserve common-type references for nested and wrapped markers and distinguish an ordinary string from a structural child.

**Checkpoint B:** The renderer and exported schema agree on representative accepted/rejected components. Required fields, bounds, descriptions, child references, and unknown-key behavior are checked explicitly.

### Phase C: Functions and parity

- Export function call schemas only when direct wire arguments, resolved runtime arguments, and return-kind constraints are compatible.
- Verify bound and nested call arguments, rejected types, and the absence of serialized executable code.

**Checkpoint C:** Function fixtures validate against the generated schema and match runtime behavior. Unsupported function definitions produce a named path rather than a permissive schema.

### Phase D: Consumer documentation and release proof

- Add concise server/build-time usage to README, API/catalog docs, and changelog, including app-owned components and catalog ID versioning.
- Run all package gates, inspect declarations and packed contents, and build packed Expo/bare iOS and Android consumers.

**Checkpoint D:** All spec success criteria pass; native bundles contain no export-converter code, Basic Catalog, prompt client, or new runtime dependency.

## Verification

Use a failing focused unit or type test before each behavior change. At each checkpoint, run the relevant built-output Node tests plus `pnpm typecheck` and `git diff --check`. At module completion run:

```sh
pnpm build
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm pack:check
pnpm consumer:smoke
git diff --check
```

Also inspect the generated subpath declaration, packed package `exports`, direct Node import, and Metro source maps or bundles for the exporter-only sentinel. Check that `package.json` has no new runtime dependency, retains version `0.1.1` and Apache-2.0, and exposes no Basic Catalog.

## Risks and mitigations

| Risk                                                       | Effect                                            | Mitigation                                                                                                       |
| ---------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| v0.9 and v0.9.1 need different catalog references          | One document is incompatible with one version     | Pin official fixtures first; revise the public contract before coding if a version option is required.           |
| Zod accepts values that JSON Schema rejects, or vice versa | Agent contract drifts from renderer validation    | Test both validators with the same accepted/rejected examples; fail unsupported constructs rather than widening. |
| Marker descriptions are overwritten by `.describe()`       | Structural links become plain data in export      | Inspect underlying marker tags through wrappers; test nested, optional, and customized descriptions.             |
| Function args are validated after binding resolution       | Exported wire schema misstates valid calls        | Model direct wire arg alternatives and compare with evaluator behavior; reject unrepresentable functions.        |
| Converter enters native bundle through a root import       | Larger mobile bundle and unnecessary maintenance  | Isolate the package subpath and inspect packed Metro output in Expo and bare consumers.                          |
| Official fixture or dev validator drifts                   | Green tests stop reflecting the intended protocol | Pin fixture source commit and validator version; keep fixtures out of the published package.                     |

## Task-list handoff

The [module task list](catalog-contract-todo.md) contains focused tasks of roughly five files or fewer, dependencies, acceptance criteria, verification commands, and checkpoints A–D. Preserve the historical `tasks/plan.md` and `tasks/todo.md`. No implementation begins until the task list is reviewed under the spec-driven workflow.

## Review decisions

The user approved the spec for planning with “next,” then approved this plan for task breakdown with “approved next.” That approval includes one dev-only `ajv` dependency for independent draft 2020-12 validation during implementation. All app-owned component and transport boundaries remain intact.
