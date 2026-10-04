# Catalog Contract: Official Schema Audit

**Module:** `catalog-contract` · **Task:** 1 · **Date:** 2026-10-04

## Pinned source

The six [test-only schema fixtures](../test/fixtures/a2ui/README.md) come from the official A2UI repository at commit [`1444719acd8833eeb5e70529c7ac47bc50b7390c`](https://github.com/a2ui-project/a2ui/tree/1444719acd8833eeb5e70529c7ac47bc50b7390c). The fixture README records source paths, raw URLs, SHA-256 checksums, and upstream license. The [v0.9.1 protocol guide](https://github.com/a2ui-project/a2ui/blob/1444719acd8833eeb5e70529c7ac47bc50b7390c/specification/v0_9_1/docs/a2ui_protocol.md) describes a swappable `catalog.json` and requires common-type references for structural children.

## Compatibility findings

| Question        | Pinned-schema result                                                                                                                                                                         |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Common types    | v0.9 and v0.9.1 files are byte-identical. Both use `$id: https://a2ui.org/specification/v0_9/common_types.json`.                                                                             |
| Catalog shape   | Sample catalogs are byte-identical. Both use the v0.9 family common-type references and the same `$defs` layout.                                                                             |
| Server envelope | The sole difference is the `version` field in each of four message definitions: v0.9 requires `"v0.9"`; v0.9.1 permits `"v0.9"` and `"v0.9.1"`. All `catalog.json` references are identical. |
| Export API      | One generated catalog document can serve both supported versions. No version parameter is needed for this pinned contract.                                                                   |

The shared sample catalog is a JSON Schema draft 2020-12 document. Its `$id` and `catalogId` are the same identifier. It has top-level `components` and `functions` maps plus `$defs.CatalogComponentCommon`, `$defs.theme`, `$defs.anyComponent`, and `$defs.anyFunction`. The server envelope refers to `catalog.json#/$defs/anyComponent` and `catalog.json#/$defs/theme`; the common types refer to `catalog.json#/$defs/anyFunction`. All three definitions must exist even when an app owns no theme styling or functions. A generated catalog should choose a safe, explicit empty-functions form and an app-neutral theme schema rather than copying Basic Catalog behavior.

The sample's `anyComponent` is a `oneOf` over `#/components/<name>` references with `component` as discriminator. Each component schema combines the official `ComponentCommon` reference, an optional catalog-common schema for `weight`, and a properties object requiring `component` with a name-specific `const`. Marked single children reference `https://a2ui.org/specification/v0_9/common_types.json#/$defs/ComponentId`; child lists reference `.../ChildList`. Plain strings use `type: string`. Functions live under `functions.<name>` with a `call` const, `args` object, and a `returnType` const matching the declared return kind in the sample.

## Implementation implications

1. Use the v0.9 common-types URI for this v0.9/v0.9.1 export. Keep the generated `$id` and `catalogId` equal to the application's `catalog.id`.
2. Emit the three referenced `$defs` targets (`theme`, `anyComponent`, `anyFunction`) and the catalog-common definition needed by component entries. Empty function catalogs still need `anyFunction` to be a valid schema target.
3. Preserve official `ComponentId` and `ChildList` `$ref` identity. A generic Zod-to-JSON converter cannot replace those references with inline string or array schemas.
4. Validate the generated document with the pinned official server and common-types fixtures in Task 2 and the end-to-end parity task. Keep these fixtures out of the published package.
5. The function sample advertises a fixed `returnType`, but the current local evaluator parses an optional `returnType` without checking it against a function's declared `returns`. Task 6 must test this difference. If faithful function export requires changing runtime semantics, revise the spec and seek review before that code change.

No public API revision is needed based on the version comparison alone.

## Verification

Run `shasum -a 256 test/fixtures/a2ui/v0_9/*.json test/fixtures/a2ui/v0_9_1/*.json` and compare with the fixture README. `diff -q` confirms identical common-types and catalog files; a unified diff of the server envelopes shows only the four `version` constraints described above. All six files parse as JSON.
