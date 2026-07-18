import assert from "node:assert/strict";
import test from "node:test";

import { z } from "zod";

import { createA2UIEngine, defineA2UICatalog } from "../../lib/module/index.js";

const catalog = defineA2UICatalog({
  id: "urn:example:a2ui:validation:v1",
  components: {
    Text: {
      schema: z.object({ text: z.string() }),
      presenter: () => null,
    },
  },
});

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
