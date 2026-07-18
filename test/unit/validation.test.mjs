import assert from "node:assert/strict";
import test from "node:test";

import { z } from "zod";

import {
  A2UIChildListSchema,
  A2UIDynamicStringSchema,
  DEFAULT_A2UI_RESOURCE_LIMITS,
  createA2UIEngine,
  defineA2UICatalog,
} from "../../lib/module/index.js";
import { validateComponentUpdate } from "../../lib/module/validation/validateGraph.js";

const catalog = defineA2UICatalog({
  id: "urn:example:a2ui:validation:v1",
  components: {
    Text: {
      schema: z.object({ text: z.string() }),
      presenter: () => null,
    },
  },
});

const graphCatalog = defineA2UICatalog({
  id: "urn:example:a2ui:graph-validation:v1",
  components: {
    Row: {
      schema: z.object({ children: A2UIChildListSchema }),
      presenter: () => null,
    },
    Text: {
      schema: z.object({ text: A2UIDynamicStringSchema }),
      presenter: () => null,
    },
  },
});

function validateGraph(updates, limits = {}) {
  return validateComponentUpdate({
    surfaceId: "main",
    catalog: graphCatalog,
    current: {},
    updates,
    limits: { ...DEFAULT_A2UI_RESOURCE_LIMITS, ...limits },
  });
}

test("rejects invalid resource limit configuration", () => {
  assert.throws(
    () =>
      createA2UIEngine({
        catalogs: [catalog],
        limits: { maxMessagesPerBatch: 0 },
      }),
    /positive integer/,
  );
});

test("rejects oversized message batches without applying a partial batch", () => {
  const errors = [];
  const engine = createA2UIEngine({
    catalogs: [catalog],
    limits: { maxMessagesPerBatch: 1 },
    onError: (error) => errors.push(error),
  });

  engine.applyMessages([
    {
      version: "v0.9",
      createSurface: { surfaceId: "main", catalogId: catalog.id },
    },
    {
      version: "v0.9",
      updateComponents: {
        surfaceId: "main",
        components: [{ id: "root", component: "Text", text: "Hello" }],
      },
    },
  ]);

  assert.equal(engine.getSurface("main"), undefined);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].code, "RESOURCE_LIMIT_EXCEEDED");
});

test("rejects oversized data while preserving the last valid revision", () => {
  const errors = [];
  const engine = createA2UIEngine({
    catalogs: [catalog],
    limits: { maxDataModelBytes: 32 },
    onError: (error) => errors.push(error),
  });
  engine.applyMessages([
    {
      version: "v0.9",
      createSurface: { surfaceId: "main", catalogId: catalog.id },
    },
    {
      version: "v0.9",
      updateDataModel: { surfaceId: "main", value: { title: "valid" } },
    },
  ]);
  const before = engine.getSurface("main");

  engine.applyMessage({
    version: "v0.9",
    updateDataModel: {
      surfaceId: "main",
      value: { title: "this value is intentionally much too large" },
    },
  });

  assert.equal(engine.getSurface("main"), before);
  assert.deepEqual(engine.getSurface("main")?.dataModel, { title: "valid" });
  assert.equal(errors.at(-1).code, "RESOURCE_LIMIT_EXCEEDED");
});

test("accepts a valid component graph", () => {
  const result = validateGraph([
    { id: "root", component: "Row", children: ["label"] },
    { id: "label", component: "Text", text: { path: "/title" } },
  ]);

  assert.equal(result.success, true);
  assert.deepEqual(Object.keys(result.components), ["root", "label"]);
});

test("rejects duplicate ids, missing roots, and invalid properties", () => {
  const fixtures = [
    {
      updates: [
        { id: "root", component: "Text", text: "One" },
        { id: "root", component: "Text", text: "Two" },
      ],
      code: "INVALID_REFERENCE",
    },
    {
      updates: [{ id: "label", component: "Text", text: "No root" }],
      code: "INVALID_ROOT",
    },
    {
      updates: [{ id: "root", component: "Text" }],
      code: "INVALID_COMPONENT_PROPS",
    },
  ];

  for (const fixture of fixtures) {
    const result = validateGraph(fixture.updates);
    assert.equal(result.success, false);
    assert.equal(result.error.code, fixture.code);
    assert.equal(typeof result.error.path, "string");
  }
});

test("rejects missing references and component cycles", () => {
  const missing = validateGraph([
    { id: "root", component: "Row", children: ["missing"] },
  ]);
  const cycle = validateGraph([
    { id: "root", component: "Row", children: ["nested"] },
    { id: "nested", component: "Row", children: ["root"] },
  ]);

  assert.equal(missing.success, false);
  assert.equal(missing.error.code, "INVALID_REFERENCE");
  assert.equal(cycle.success, false);
  assert.equal(cycle.error.code, "INVALID_REFERENCE");
});

test("rejects invalid binding pointers", () => {
  const result = validateGraph([
    { id: "root", component: "Text", text: { path: "/invalid~2path" } },
  ]);

  assert.equal(result.success, false);
  assert.equal(result.error.code, "BINDING_ERROR");
});

test("enforces component count and graph depth limits", () => {
  const components = [
    { id: "root", component: "Row", children: ["label"] },
    { id: "label", component: "Text", text: "Hello" },
  ];
  const count = validateGraph(components, { maxComponentsPerSurface: 1 });
  const depth = validateGraph(components, { maxComponentDepth: 1 });

  assert.equal(count.success, false);
  assert.equal(count.error.code, "RESOURCE_LIMIT_EXCEEDED");
  assert.equal(depth.success, false);
  assert.equal(depth.error.code, "RESOURCE_LIMIT_EXCEEDED");
});
