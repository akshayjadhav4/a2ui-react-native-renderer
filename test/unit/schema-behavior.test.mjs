import assert from "node:assert/strict";
import test from "node:test";

import { z } from "zod";

import {
  A2UIActionSchema,
  A2UIChildListSchema,
  A2UIDynamicStringSchema,
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
