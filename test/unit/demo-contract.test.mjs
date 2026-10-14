import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import {
  createDemoSchemas,
  FIXTURE_CATALOG_ID,
} from "../../example/expo/src/catalog-contract.mjs";
import {
  ActionSchema,
  ChildListSchema,
  DynamicStringSchema,
} from "../../lib/module/protocol/v0_9/commonSchemas.js";

test("shared example factory keeps marked schemas and validates component props", () => {
  const schemas = createDemoSchemas({
    z,
    A2UIActionSchema: ActionSchema,
    A2UIChildListSchema: ChildListSchema,
    A2UIDynamicStringSchema: DynamicStringSchema,
  });
  assert.equal(FIXTURE_CATALOG_ID, "urn:example:a2ui:catalog:v1");
  assert.equal(schemas.InputSchema.shape.value, DynamicStringSchema);
  assert.equal(schemas.ButtonSchema.shape.action, ActionSchema);
  assert.equal(schemas.ColumnSchema.shape.children, ChildListSchema);
  assert.ok(
    schemas.InputSchema.safeParse({ value: { path: "/draft" } }).success,
  );
  assert.equal(schemas.TextSchema.safeParse({ text: 5 }).success, false);
  assert.equal(
    schemas.ButtonSchema.safeParse({ label: "Submit", action: {} }).success,
    false,
  );
});
