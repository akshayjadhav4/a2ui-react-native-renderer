import assert from "node:assert/strict";
import test from "node:test";

import { z } from "zod";

import {
  A2UIChildListSchema,
  A2UIComponentIdSchema,
  A2UIDynamicStringSchema,
  DEFAULT_A2UI_RESOURCE_LIMITS,
  createA2UIEngine,
  defineA2UICatalog,
} from "../../lib/module/index.js";
import { validateComponentUpdate } from "../../lib/module/validation/validateGraph.js";
import { measureSerializedBytes } from "../../lib/module/validation/limits.js";

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
    Single: {
      schema: z.object({
        content: z.object({ child: A2UIComponentIdSchema }),
        title: z.string(),
      }),
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

test("measures serialized UTF-8 data without platform APIs", () => {
  assert.equal(measureSerializedBytes(undefined), 0);
  assert.equal(measureSerializedBytes("a"), 3);
  assert.equal(measureSerializedBytes("é"), 4);
  assert.equal(measureSerializedBytes("€"), 5);
  assert.equal(measureSerializedBytes("😀"), 6);
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

test("validates marked single-child references inside nested props", () => {
  const valid = validateGraph([
    {
      id: "root",
      component: "Single",
      content: { child: "label" },
      title: "plain literal",
    },
    { id: "label", component: "Text", text: "Present" },
  ]);
  const missing = validateGraph([
    {
      id: "root",
      component: "Single",
      content: { child: "absent" },
      title: "plain literal",
    },
  ]);

  assert.equal(valid.success, true);
  assert.equal(missing.success, true);
  assert.deepEqual(missing.pendingComponentIds, ["absent"]);
});

test("rejects duplicate ids and invalid properties", () => {
  const fixtures = [
    {
      updates: [
        { id: "root", component: "Text", text: "One" },
        { id: "root", component: "Text", text: "Two" },
      ],
      code: "INVALID_REFERENCE",
    },
    {
      updates: [{ id: "root", component: "Text" }],
      code: "INVALID_COMPONENT_PROPS",
    },
    {
      updates: [{ id: "root", text: "Missing type" }],
      code: "INVALID_REFERENCE",
    },
    {
      updates: [{ id: "root", component: "Unknown" }],
      code: "UNKNOWN_COMPONENT",
    },
  ];

  for (const fixture of fixtures) {
    const result = validateGraph(fixture.updates);
    assert.equal(result.success, false);
    assert.equal(result.error.code, fixture.code);
    assert.equal(typeof result.error.path, "string");
  }
});

test("keeps missing references pending but rejects component cycles", () => {
  const missing = validateGraph([
    { id: "root", component: "Row", children: ["missing"] },
  ]);
  const cycle = validateGraph([
    { id: "root", component: "Row", children: ["nested"] },
    { id: "nested", component: "Row", children: ["root"] },
  ]);

  assert.equal(missing.success, true);
  assert.deepEqual(missing.pendingComponentIds, ["missing"]);
  assert.equal(cycle.success, false);
  assert.equal(cycle.error.code, "INVALID_REFERENCE");
});

test("buffers pre-root definitions and reports only reachable pending ids", () => {
  const beforeRoot = validateGraph([
    { id: "a", component: "Row", children: ["c"] },
    { id: "unreachable", component: "Row", children: ["orphan"] },
  ]);
  assert.equal(beforeRoot.success, true);
  assert.deepEqual(beforeRoot.pendingComponentIds, ["root"]);

  const afterRoot = validateComponentUpdate({
    surfaceId: "main",
    catalog: graphCatalog,
    current: beforeRoot.components,
    updates: [{ id: "root", component: "Row", children: ["a", "b", "a"] }],
    limits: DEFAULT_A2UI_RESOURCE_LIMITS,
  });
  assert.equal(afterRoot.success, true);
  assert.deepEqual(afterRoot.pendingComponentIds, ["c", "b"]);
  assert.ok(Object.isFrozen(afterRoot.pendingComponentIds));
});

test("rejects empty and excessive distinct pending ids", () => {
  const empty = validateGraph([
    { id: "root", component: "Row", children: [""] },
  ]);
  const excessive = validateGraph(
    [{ id: "root", component: "Row", children: ["a", "b"] }],
    { maxComponentsPerSurface: 1 },
  );
  assert.equal(empty.success, false);
  assert.equal(empty.error.code, "INVALID_REFERENCE");
  assert.equal(excessive.success, false);
  assert.equal(excessive.error.code, "RESOURCE_LIMIT_EXCEEDED");
});

test("rejects a late cycle or excessive known depth without changing the graph", () => {
  const pending = validateGraph([
    { id: "root", component: "Row", children: ["child"] },
  ]);
  assert.equal(pending.success, true);

  const lateCycle = validateComponentUpdate({
    surfaceId: "main",
    catalog: graphCatalog,
    current: pending.components,
    updates: [{ id: "child", component: "Row", children: ["root"] }],
    limits: DEFAULT_A2UI_RESOURCE_LIMITS,
  });
  const lateDepth = validateComponentUpdate({
    surfaceId: "main",
    catalog: graphCatalog,
    current: pending.components,
    updates: [{ id: "child", component: "Text", text: "Too deep" }],
    limits: { ...DEFAULT_A2UI_RESOURCE_LIMITS, maxComponentDepth: 1 },
  });
  assert.equal(lateCycle.success, false);
  assert.equal(lateCycle.error.code, "INVALID_REFERENCE");
  assert.equal(lateDepth.success, false);
  assert.equal(lateDepth.error.code, "RESOURCE_LIMIT_EXCEEDED");
  assert.deepEqual(Object.keys(pending.components), ["root"]);
});

test("rejects invalid binding pointers", () => {
  const dynamic = validateGraph([
    { id: "root", component: "Text", text: { path: "/invalid~2path" } },
  ]);
  const structural = validateGraph([
    {
      id: "root",
      component: "Row",
      children: { componentId: "label", path: "/invalid~2path" },
    },
    { id: "label", component: "Text", text: "Label" },
  ]);

  assert.equal(dynamic.success, false);
  assert.equal(dynamic.error.code, "BINDING_ERROR");
  assert.equal(structural.success, false);
  assert.equal(structural.error.code, "BINDING_ERROR");
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

test("engine rejects invalid graph updates before mutating the last valid surface", () => {
  const errors = [];
  const engine = createA2UIEngine({
    catalogs: [graphCatalog],
    onError: (error) => errors.push(error),
  });
  engine.applyMessages([
    {
      version: "v0.9",
      createSurface: { surfaceId: "main", catalogId: graphCatalog.id },
    },
    {
      version: "v0.9",
      updateComponents: {
        surfaceId: "main",
        components: [
          { id: "root", component: "Row", children: ["label"] },
          { id: "label", component: "Text", text: "Before" },
        ],
      },
    },
  ]);
  const before = engine.getSurface("main");

  engine.applyMessage({
    version: "v0.9",
    updateComponents: {
      surfaceId: "main",
      components: [{ id: "root", component: "Row", children: ["root"] }],
    },
  });

  assert.equal(engine.getSurface("main"), before);
  assert.equal(errors.at(-1).code, "INVALID_REFERENCE");

  engine.applyMessage({
    version: "v0.9",
    updateComponents: {
      surfaceId: "main",
      components: [{ id: "label", component: "Text", text: "After" }],
    },
  });
  assert.equal(engine.getSurface("main")?.components.label.props.text, "After");
});

test("keeps valid updates before and after a rejected message", () => {
  const errors = [];
  const engine = createA2UIEngine({
    catalogs: [graphCatalog],
    onError: (error) => errors.push(error),
  });
  engine.applyMessages([
    {
      version: "v0.9",
      createSurface: { surfaceId: "one", catalogId: graphCatalog.id },
    },
    {
      version: "v0.9",
      updateComponents: {
        surfaceId: "one",
        components: [{ id: "root", component: "Text", text: "Stable" }],
      },
    },
  ]);
  engine.applyMessages([
    {
      version: "v0.9",
      updateComponents: {
        surfaceId: "one",
        components: [{ id: "root", component: "Text", text: "Uncommitted" }],
      },
    },
    {
      version: "v0.9",
      updateComponents: {
        surfaceId: "one",
        components: [{ id: "root", component: "Text" }],
      },
    },
    {
      version: "v0.9",
      updateComponents: {
        surfaceId: "one",
        components: [{ id: "root", component: "Text", text: "Recovered" }],
      },
    },
    {
      version: "v0.9",
      createSurface: { surfaceId: "two", catalogId: graphCatalog.id },
    },
    {
      version: "v0.9",
      updateComponents: {
        surfaceId: "two",
        components: [{ id: "root", component: "Text", text: "Committed" }],
      },
    },
  ]);

  assert.equal(
    engine.getSurface("one")?.components.root.props.text,
    "Recovered",
  );
  assert.equal(engine.getSurface("one")?.revision, 4);
  assert.equal(
    engine.getSurface("two")?.components.root.props.text,
    "Committed",
  );
  assert.equal(errors.at(-1).surfaceId, "one");
});

test("retains an accepted surface create after an invalid initial graph", () => {
  const engine = createA2UIEngine({ catalogs: [graphCatalog] });

  engine.applyMessages([
    {
      version: "v0.9",
      createSurface: { surfaceId: "main", catalogId: graphCatalog.id },
    },
    {
      version: "v0.9",
      updateComponents: {
        surfaceId: "main",
        components: [{ id: "root", component: "Text", text: 42 }],
      },
    },
  ]);

  assert.equal(engine.getSurface("main")?.rootId, null);
  assert.equal(engine.getSurface("main")?.revision, 1);
});

test("contains invalid surface lifecycle and data paths before core processing", () => {
  const errors = [];
  const engine = createA2UIEngine({
    catalogs: [graphCatalog],
    onError: (error) => errors.push(error),
  });
  engine.applyMessages([
    {
      version: "v0.9",
      createSurface: { surfaceId: "main", catalogId: graphCatalog.id },
    },
    {
      version: "v0.9",
      updateDataModel: { surfaceId: "main", value: { title: "text" } },
    },
    {
      version: "v0.9",
      updateComponents: {
        surfaceId: "main",
        components: [{ id: "root", component: "Text", text: "Stable" }],
      },
    },
  ]);
  const before = engine.getSurface("main");

  engine.applyMessage({
    version: "v0.9",
    createSurface: { surfaceId: "main", catalogId: graphCatalog.id },
  });
  assert.equal(errors.at(-1).code, "INVALID_MESSAGE");
  assert.equal(engine.getSurface("main"), before);

  engine.applyMessage({
    version: "v0.9",
    updateDataModel: {
      surfaceId: "main",
      path: "/title/nested",
      value: "invalid",
    },
  });
  assert.equal(errors.at(-1).code, "BINDING_ERROR");
  assert.equal(engine.getSurface("main"), before);

  engine.applyMessage({
    version: "v0.9",
    updateComponents: {
      surfaceId: "missing",
      components: [{ id: "root", component: "Text", text: "Missing" }],
    },
  });
  assert.equal(errors.at(-1).code, "INVALID_MESSAGE");
  assert.equal(engine.getSurface("missing"), undefined);
});
