# Tasks: Exportable App-Owned Catalog Contract

**Module id:** `catalog-contract`

**Spec:** [SPEC-catalog-contract.md](../SPEC-catalog-contract.md)

**Plan:** [catalog-contract-plan.md](catalog-contract-plan.md)

**Status:** Draft for human review on 2026-10-04. No implementation has started.

Tasks follow dependency order. Add a focused failing test or type fixture before each behavior change, then make it pass and record verification. Keep implementation on `codex/native-core`, commit each slice separately, and preserve the historical initial-release `tasks/plan.md` and `tasks/todo.md`.

## Phase A: Official contract and package entry

- [x] **Task 1: Pin and audit official v0.9-family catalog schemas**
  - Acceptance: Test-only fixtures pin the official v0.9 and v0.9.1 common-types, server-to-client, and sample catalog schema inputs with upstream commit and source URLs. An audit records required catalog fields, common-type reference URIs, function and theme shape, and whether one document works for both versions. If a version-specific public option is necessary, update the spec and obtain review before continuing.
  - Verify: Compare fixture checksums and `$id`/`catalogId`/`$ref` fields against the pinned upstream files; `git diff --check`.
  - Likely files: `test/fixtures/a2ui/`, `tasks/catalog-contract-schema-audit.md`.
  - Dependencies: Approved task list. Scope: Medium.
  - Evidence: Six official schema files are pinned to upstream commit `1444719acd8833eeb5e70529c7ac47bc50b7390c` with SHA-256 checksums and source URLs. Their common-types and sample catalogs are byte-identical; the server envelope differs only in its four version constraints. Both versions use one v0.9-family catalog document and common-type URI, so no public version option is needed. The schema shape and function returnType caveat are recorded in the audit. An independent JSON/checksum comparison, `pnpm format:check`, all 135 tests, `pnpm pack:check`, and `git diff --check` pass; upstream JSON stays pristine through a narrow Prettier exclusion.

- [ ] **Task 2: Expose a packed schema-export subpath**
  - Acceptance: `a2ui-react-native-renderer/catalog-schema` exports a typed `exportA2UICatalogSchema` from a dedicated built entry. One simple app-owned component produces a fresh, JSON-serializable document with matching `$id`/`catalogId` and a required component discriminator. Root imports do not load the converter. The approved `ajv` dependency is dev-only, and a packed Node consumer can import the subpath.
  - Verify: `pnpm build && pnpm typecheck && node --test test/unit/catalog-schema.test.mjs && pnpm pack:check`; inspect `lib/typescript/catalog-schema.d.ts`, package exports, and packed import.
  - Likely files: `package.json`, `pnpm-lock.yaml`, `src/catalog-schema.ts`, `src/catalog/exportCatalogSchema.ts`, `test/unit/catalog-schema.test.mjs`.
  - Dependencies: Task 1. Scope: Medium.

### Checkpoint A: Official and packaging boundary

- [ ] The generated one-component catalog passes the official envelope setup for both supported versions, or a documented spec revision resolves a real version split.
- [ ] The packed subpath imports in Node; the package root remains independent of it. `pnpm typecheck`, focused tests, and `git diff --check` pass.

## Phase B: Component schema fidelity

- [ ] **Task 3: Convert supported ordinary Zod wire properties**
  - Acceptance: Strings, numbers, booleans, literals, enums, nested objects, arrays, unions, and optional/nullable/default wrappers preserve required fields, supported bounds, defaults, descriptions, and representable unknown-key policy. Output is deterministic and detached from source definitions.
  - Verify: `pnpm build && node --test test/unit/catalog-schema.test.mjs && pnpm typecheck`; validate representative allowed and rejected objects with Ajv 2020 and the source Zod schema.
  - Likely files: `src/catalog/convertCatalogSchema.ts`, `src/catalog/exportCatalogSchema.ts`, `test/unit/catalog-schema.test.mjs`.
  - Dependencies: Checkpoint A. Scope: Medium.

- [ ] **Task 4: Reject lossy or unsupported Zod schemas**
  - Acceptance: Transforms, unrepresentable refinements, recursive schemas, and unsupported constraints fail with a `TypeError` naming the component or function and property path. The exporter never emits an empty permissive schema for these cases; catalog definitions remain unmodified.
  - Verify: `pnpm build && node --test test/unit/catalog-schema.test.mjs && pnpm typecheck`; inspect error paths and confirm repeat exports match exactly.
  - Likely files: `src/catalog/convertCatalogSchema.ts`, `src/catalog/exportCatalogSchema.ts`, `test/unit/catalog-schema.test.mjs`.
  - Dependencies: Task 3. Scope: Medium.

- [ ] **Task 5: Preserve A2UI marker references**
  - Acceptance: Marked `ComponentId`, `ChildList`, `Action`, and `Dynamic*` fields emit the exact official common-type `$ref`, including nested and optional/nullable/default forms. An ordinary `z.string()` remains a literal string; descriptions do not erase marker identity. Accepted and rejected child examples match renderer behavior.
  - Verify: `pnpm build && node --test test/unit/catalog-schema.test.mjs test/unit/schema-behavior.test.mjs test/unit/validation.test.mjs && pnpm typecheck`.
  - Likely files: `src/catalog/convertCatalogSchema.ts`, `src/catalog/exportCatalogSchema.ts`, `src/protocol/v0_9/behavior.ts`, `test/unit/catalog-schema.test.mjs`.
  - Dependencies: Task 4. Scope: Medium.

### Checkpoint B: Component contract

- [ ] Generated component schemas and renderer Zod validation agree on representative accepted/rejected values, including required fields, bounds, unknown keys, structural IDs, bindings, and nested properties.
- [ ] Unsupported constructs fail at named paths; `pnpm test`, `pnpm typecheck`, and `git diff --check` pass before function export work.

## Phase C: Functions and validation parity

- [ ] **Task 6: Export representable function call schemas**
  - Acceptance: Functions export their names, descriptions, direct wire-argument alternatives, and return-kind rules without `execute`. Literal, bound, nested-call, optional, invalid, and mismatched-returnType cases are compared with the runtime evaluator. Any function contract that cannot be represented faithfully fails with its function/argument path; a required runtime semantic change triggers spec review before coding it.
  - Verify: `pnpm build && node --test test/unit/catalog-schema.test.mjs test/unit/functions.test.mjs test/integration/consumer-functions.test.mjs && pnpm typecheck`.
  - Likely files: `src/catalog/convertFunctionSchema.ts`, `src/catalog/exportCatalogSchema.ts`, `test/unit/catalog-schema.test.mjs`, `test/integration/consumer-functions.test.mjs`.
  - Dependencies: Checkpoint B. Scope: Medium.

- [ ] **Task 7: Prove generated-schema and renderer agreement**
  - Acceptance: A small app-owned catalog shared by exporter and renderer validates representative v0.9/v0.9.1 messages through Ajv with official common types and through the renderer. It covers nested properties, children, bindings, actions, functions, rejected values, stable JSON serialization, and detached output. No presenter or callback value appears in exported JSON.
  - Verify: `pnpm build && node --test test/integration/catalog-schema.test.mjs test/unit/catalog-schema.test.mjs && pnpm typecheck`.
  - Likely files: `test/integration/catalog-schema.test.mjs`, `test/unit/catalog-schema.test.mjs`, `test/fixtures/a2ui/`, `src/catalog/exportCatalogSchema.ts`.
  - Dependencies: Task 6. Scope: Medium.

### Checkpoint C: Shared catalog proof

- [ ] Component and representable function fixtures pass both validators for v0.9 and v0.9.1; unsupported function shapes fail clearly.
- [ ] `pnpm test`, `pnpm typecheck`, and `git diff --check` pass with no runtime dependency or renderer behavior change.

## Phase D: Adoption and native package proof

- [ ] **Task 8: Document the single-source catalog workflow**
  - Acceptance: README, API/catalog docs, and changelog show one app-owned catalog used for mobile rendering and server/build-time schema export, explain the separate import, unsupported-schema errors, catalog ID versioning, and app ownership of delivery to the agent. Documentation assertions include the new public subpath. No Basic Catalog or transport is introduced.
  - Verify: `pnpm exec prettier --check README.md docs/api.md docs/catalogs.md CHANGELOG.md && pnpm test`; inspect examples against generated declarations.
  - Likely files: `README.md`, `docs/api.md`, `docs/catalogs.md`, `CHANGELOG.md`, `test/unit/documentation.test.mjs`.
  - Dependencies: Checkpoint C. Scope: Medium.

- [ ] **Task 9: Verify packed native isolation and complete the module**
  - Acceptance: The packed `catalog-schema` subpath resolves and the root import's Expo/bare React Native iOS/Android bundles contain no exporter-only sentinel or new runtime package. Generated declarations and package contents match the documented API. Version `0.1.1`, Apache-2.0, app-owned components, and unpublished status remain unchanged.
  - Verify: `pnpm build && pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm pack:check && pnpm consumer:smoke`; `pnpm exec prettier --check SPEC-catalog-contract.md tasks/catalog-contract-plan.md tasks/catalog-contract-todo.md`; `git diff --check`.
  - Likely files: `scripts/pack-check.mjs`, `scripts/consumer-smoke.mjs`, `test/unit/catalog-schema.test.mjs`, `tasks/catalog-contract-todo.md`.
  - Dependencies: Task 8. Scope: Medium.

### Checkpoint D: Module complete

- [ ] All approved spec success criteria pass for a single app-owned catalog shared by agent schema and renderer, including fail-closed unsupported cases.
- [ ] The packed schema subpath works; native root bundles exclude conversion code, Basic Catalog, transport, model SDK, and new runtime dependencies.
- [ ] Final package gates pass; docs and declarations match; no package release or license change is included.

## Review decisions

The approved plan authorizes a dev-only Ajv validator. Review this task order, the official-schema audit gate, and the function parity boundary before implementation. If the audit exposes incompatible versioned schema shapes, or function export requires changing runtime semantics, revise the spec and obtain review instead of silently expanding the public API.
