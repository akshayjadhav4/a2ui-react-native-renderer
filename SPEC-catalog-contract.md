# Spec: Exportable App-Owned Catalog Contract

**Module id:** `catalog-contract` in [CAPABILITY-MAP.md](CAPABILITY-MAP.md)

**Status:** Approved for planning on 2026-10-04 when the user said “next.” No implementation has started.

## Assumptions

1. `defineA2UICatalog` remains the application's source of truth for component names, Zod property schemas, descriptions, and local functions. Applications continue to own presenters and every native UI component. This package will not provide a Basic Catalog.
2. The agent needs a serializable catalog contract derived from that same definition, without React presenters or executable function implementations. The application chooses where to store or send it; this package supplies no prompt builder, transport, or model SDK.
3. The export should be an A2UI v0.9-family JSON Schema catalog document, not a package-specific prompt format. The [v0.9.1 protocol](https://github.com/a2ui-project/a2ui/blob/main/specification/v0_9_1/docs/a2ui_protocol.md#the-protocol-schemas) describes swappable catalog schemas, and its [catalog rules](https://github.com/a2ui-project/a2ui/blob/main/specification/v0_9_1/docs/a2ui_protocol.md#validator-compliance-when-defining-catalogs) require explicit common-type references for structural children.
4. An export helper can be a separate package subpath so a mobile app that only imports the renderer does not include schema conversion code. The package stays at `0.1.1` during this module; version and license decisions remain separate.
5. The existing peer dependency on Zod 3 is sufficient. A small, explicit converter for supported schemas is preferable to adding a general converter to the mobile runtime. Unsupported Zod constructs must fail rather than produce a weaker schema.

## Objective

Make an app-owned catalog usable by an A2UI agent and a React Native renderer without maintaining two manually synchronized component contracts. A developer defines components once, exports a JSON document for the agent or server, and uses the original catalog for rendering and runtime validation. The exported schema must accurately describe allowed component names, wire properties, structural references, and declared functions.

The [A2UI v0.9.1 protocol](https://github.com/a2ui-project/a2ui/blob/main/specification/v0_9_1/docs/a2ui_protocol.md#catalog-identification--compatibility) identifies catalogs by `catalogId` and recommends matching `$id` and `catalogId` in the schema document. The [official catalog example](https://github.com/a2ui-project/a2ui/blob/main/specification/v0_9/catalogs/basic/catalog.json) places component and function schemas in separate maps. This module follows that contract while continuing to use the app's own definitions.

## Current gap

- The renderer validates against `catalog.components`, but developers must separately describe those components to an agent. The two descriptions can drift.
- `A2UIComponentIdSchema`, `A2UIChildListSchema`, dynamic value schemas, and `A2UIActionSchema` have runtime meaning, but there is no export preserving their official common-type references.
- A catalog's `description` fields are validated and retained locally, yet no public API turns them into serializable agent guidance.
- There is no documented server-side workflow for using the same catalog definition with an agent and the mobile renderer.

## Proposed public contract

Add one named export from a separate subpath:

```ts
import { exportA2UICatalogSchema } from "a2ui-react-native-renderer/catalog-schema";

const catalog = defineA2UICatalog({
  id: "https://example.com/a2ui/catalog/v1",
  components: { Card, Label },
});

const document = exportA2UICatalogSchema(catalog);
// JSON.stringify(document) can be stored or supplied to an agent by the app.
```

The helper returns a JSON-serializable A2UI v0.9-family catalog schema object. It has `$schema` set to JSON Schema draft 2020-12, `$id` and `catalogId` equal to `catalog.id`, and component and function entries keyed by the names registered in the catalog. Component entries require a `component` discriminator equal to their key; ordinary property schemas come from the same Zod objects that the renderer validates. Optional descriptions are copied into the appropriate schema entries. The output contains no presenter, `execute` callback, React object, or mutable reference to the original catalog.

The package root continues to export `defineA2UICatalog`, `defineA2UIComponent`, and `defineA2UIFunction` unchanged. The export helper is additive and does not change runtime catalog registration, parsing, or rendering. The separate subpath is intended for server or build-time code; the root React Native import must not import it.

### Schema conversion rules

1. Convert supported ordinary Zod wire-property shapes: strings, numbers, booleans, literals, enums, objects, arrays, unions, optional/nullable/default wrappers, and the bounds or descriptions that can be represented in draft 2020-12. Preserve required versus optional fields, nested objects, arrays, and unknown-field policy where expressible.
2. Emit official A2UI common-type `$ref` values for exported A2UI markers, including `ComponentId`, `ChildList`, `Action`, and `Dynamic*`. A plain `z.string()` stays a string and is never exported as a component link. The references must survive optional/nullable/default wrappers and nested placement.
3. Emit function call schemas from each catalog function's name, argument schema, declared return kind, and optional description. Do not serialize or infer behavior from `execute`. A function argument type that differs between wire input and resolved runtime arguments must be represented accurately or rejected with a precise error; the exporter must not silently claim that local execution rules are the wire schema.
4. Reject unsupported or lossy Zod constructs (for example, transforms or refinements whose constraints cannot be represented) with an error naming the component or function and property path. Do not emit `{}` or `unknown` as a quiet fallback.
5. Produce deterministic, plain JSON output for a fixed catalog. Export must not mutate or freeze the caller's schemas and must not evaluate presenters or functions.

The first implementation plan should verify the exact v0.9 and v0.9.1 reference URIs and envelope integration against official schema fixtures before locking the generated document shape. If the versions require distinct documents, the plan must add an explicit version option instead of silently choosing one.

## Scope boundaries

- **In scope:** One-way export from existing app-owned catalog definitions to a serializable A2UI catalog schema; supported Zod-to-JSON-Schema conversion; explicit A2UI references; component and function descriptions; clear unsupported-schema errors; documentation and compatibility tests.
- **Deferred:** Live catalog negotiation, a hosted catalog URL, automated agent prompt construction, catalog editing tools, transport synchronization, and consumer test harnesses (`consumer-tooling`).
- **Excluded:** Basic Catalog components, native visual code, bundled presenters, a model SDK, general-purpose Zod conversion for every feature, new runtime dependencies, license changes, and package publication.

## Tech stack and project structure

- TypeScript 6 and the existing Zod 3 peer dependency provide source schemas and public types.
- `src/catalog/` owns the export helper and schema conversion; a dedicated source entry and package export map expose only the server/build-time subpath.
- `src/protocol/v0_9/` retains the marker definitions and version-shared A2UI semantics. The exporter reads their tags without changing runtime validation.
- `test/unit/` checks conversion and failure paths; `test/types/` checks the public subpath. A fixture validates generated output against the official v0.9/v0.9.1 catalog/envelope shape where applicable.
- `docs/catalogs.md`, `docs/api.md`, `README.md`, and `CHANGELOG.md` show export and migration usage.

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

Keep conversion explicit, preserve A2UI marker identity, and fail at the first unsupported path:

```ts
if (marker === "ComponentId") {
  return { $ref: `${commonTypesUri}#/$defs/ComponentId` };
}
if (schema instanceof z.ZodObject) {
  return convertObject(schema, path);
}
throw new TypeError(`Unsupported catalog schema at ${path}`);
```

Use existing `A2UI` public names, strict TypeScript, double quotes, and stable output ordering. Avoid importing React or React Native from the export entry point.

## Testing strategy

1. Establish a representative app catalog with a plain string, enum, nested object, optional field, single child, child list, dynamic value, action, and local function. Assert the generated schema's exact structural references, required fields, descriptions, and discriminator.
2. Validate representative accepted and rejected component messages against both the renderer's Zod catalog and a JSON Schema validator using the generated document plus official A2UI common types. Confirm the exporter does not broaden the allowlist.
3. Test unsupported transforms/refinements and incompatible function argument shapes with errors that name the failing location. Test determinism, serializability, lack of executable values, and no mutation of source definitions.
4. Inspect packed artifacts and Expo/bare iOS/Android bundles to show the root renderer import does not pull in exporter code or a new dependency.

## Boundaries

- **Always:** Preserve app ownership of components and transports; match the existing runtime catalog; emit official structural references; fail on unsupported schemas; test both supported protocol versions.
- **Ask first:** Add a dependency, require descriptions on existing catalog definitions, change the package root API, add version-specific output parameters, or change runtime validation semantics.
- **Never:** Ship a Basic Catalog, infer structural references from ordinary strings, serialize executable callbacks, silently weaken exported constraints, or publish the package as part of this module.

## Success criteria

1. An app defines a catalog once and exports a deterministic JSON document whose ID, component names, property schemas, descriptions, and functions match that catalog.
2. A2UI single-child and child-list markers remain distinguishable from ordinary strings in the exported schema, including nested and wrapped fields.
3. Unsupported Zod behavior fails with a useful component/function path instead of producing a permissive or misleading agent contract.
4. Representative generated messages agree between exported-schema validation and renderer validation for both v0.9 and v0.9.1.
5. The installed renderer's root import and native bundles contain no Basic Catalog, server transport, model SDK, or schema-export converter code. Existing package tests and packed consumer checks pass.

## Review decision

The user's “next” after the spec review request approves planning with the proposed separate `catalog-schema` subpath. Function schemas are in scope only when the exporter can represent their wire contract accurately; otherwise export fails with a precise error. The implementation plan must resolve official schema shape and version details before implementation.
