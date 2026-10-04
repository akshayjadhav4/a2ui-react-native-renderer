import assert from "node:assert/strict";
import test from "node:test";

import { z } from "zod";

import {
  A2UIActionSchema,
  A2UIChildListSchema,
  A2UIDynamicBooleanSchema,
  A2UIDynamicNumberSchema,
  A2UIDynamicStringSchema,
  A2UIDynamicStringListSchema,
  A2UIDynamicValueSchema,
} from "../../lib/module/index.js";
import {
  ActionSchema,
  ChildListSchema,
  DynamicStringSchema,
} from "../../lib/module/protocol/v0_9/commonSchemas.js";
import { inspectA2UISchemaBehavior } from "../../lib/module/protocol/v0_9/behavior.js";

test("recognizes existing public A2UI schema aliases inside component schemas", () => {
  const schema = z.object({
    content: z.object({
      label: A2UIDynamicStringSchema.nullable(),
      action: A2UIActionSchema.optional(),
    }),
    rows: z.array(z.object({ children: A2UIChildListSchema.optional() })),
  });

  const behavior = inspectA2UISchemaBehavior(schema);
  assert.equal(behavior.type, "OBJECT");
  assert.equal(behavior.shape.content.type, "OBJECT");
  assert.equal(behavior.shape.content.shape.label.type, "DYNAMIC");
  assert.equal(behavior.shape.content.shape.action.type, "ACTION");
  assert.equal(behavior.shape.rows.type, "ARRAY");
  assert.equal(behavior.shape.rows.element.shape.children.type, "STRUCTURAL");
});

test("recognizes new core schemas after wrapping and nesting", () => {
  const schema = z.object({
    title: DynamicStringSchema.optional(),
    action: ActionSchema.nullable(),
    children: ChildListSchema.default([]),
  });

  const behavior = inspectA2UISchemaBehavior(schema);
  assert.equal(behavior.shape.title.type, "DYNAMIC");
  assert.equal(behavior.shape.action.type, "ACTION");
  assert.equal(behavior.shape.children.type, "STRUCTURAL");
});

test("classifies typed and generic dynamic fields inside wrappers", () => {
  const behavior = inspectA2UISchemaBehavior(
    z.object({
      text: A2UIDynamicStringSchema.optional(),
      count: A2UIDynamicNumberSchema,
      enabled: A2UIDynamicBooleanSchema,
      names: A2UIDynamicStringListSchema,
      anything: A2UIDynamicValueSchema,
      custom: z.union([z.string(), z.object({ path: z.string() })]),
      ambiguous: z.union([
        z.string(),
        z.number(),
        z.object({ path: z.string() }),
      ]),
    }),
  );

  assert.equal(behavior.shape.text.kind, "string");
  assert.equal(behavior.shape.count.kind, "number");
  assert.equal(behavior.shape.enabled.kind, "boolean");
  assert.equal(behavior.shape.names.kind, "string-list");
  assert.equal(behavior.shape.anything.kind, "unknown");
  assert.equal(behavior.shape.custom.kind, "string");
  assert.equal(behavior.shape.ambiguous.kind, "unknown");
});
