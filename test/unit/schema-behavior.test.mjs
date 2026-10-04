import assert from "node:assert/strict";
import test from "node:test";

import { z } from "zod";

import {
  A2UIActionSchema,
  A2UIChildListSchema,
  A2UIComponentIdSchema,
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
import {
  inspectA2UISchemaBehavior,
  matchesA2UIDynamicKind,
} from "../../lib/module/protocol/v0_9/behavior.js";
import { resolvePresenterProps } from "../../lib/module/protocol/v0_9/resolveProps.js";

test("keeps a marked single child as a presenter string", () => {
  const schema = z.object({
    content: z.object({ child: A2UIComponentIdSchema.optional() }),
    title: z.string(),
    children: A2UIChildListSchema,
  });
  const behavior = inspectA2UISchemaBehavior(schema);
  assert.equal(behavior.shape.content.shape.child.type, "COMPONENT_ID");
  assert.equal(behavior.shape.title.type, "STATIC");
  assert.equal(behavior.shape.children.type, "STRUCTURAL");

  const resolved = resolvePresenterProps(
    schema,
    { content: { child: "label" }, title: "literal", children: ["label"] },
    {},
    "/",
    () => undefined,
    [],
  );
  assert.equal(resolved.content.child, "label");
  assert.deepEqual(resolved.children, [{ id: "label", basePath: "/" }]);
});

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
      literal: z.union([z.literal("ready"), z.object({ path: z.string() })]),
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
  assert.equal(behavior.shape.literal.kind, "string");
  assert.equal(behavior.shape.ambiguous.kind, "unknown");
});

test("checks typed values and honors nullable dynamic wrappers", () => {
  const behavior = inspectA2UISchemaBehavior(
    z.object({
      count: A2UIDynamicNumberSchema,
      names: A2UIDynamicStringListSchema,
      optionalName: A2UIDynamicStringSchema.nullable(),
      literal: z.union([z.literal("ready"), z.object({ path: z.string() })]),
    }),
  );

  assert.equal(matchesA2UIDynamicKind(5, behavior.shape.count), true);
  assert.equal(
    matchesA2UIDynamicKind(Number.POSITIVE_INFINITY, behavior.shape.count),
    false,
  );
  assert.equal(matchesA2UIDynamicKind(["A", "B"], behavior.shape.names), true);
  assert.equal(matchesA2UIDynamicKind(["A", 3], behavior.shape.names), false);
  assert.equal(matchesA2UIDynamicKind(null, behavior.shape.optionalName), true);
  assert.equal(matchesA2UIDynamicKind(null, behavior.shape.count), false);
  assert.equal(matchesA2UIDynamicKind("ready", behavior.shape.literal), true);
  assert.equal(matchesA2UIDynamicKind("other", behavior.shape.literal), false);
});
