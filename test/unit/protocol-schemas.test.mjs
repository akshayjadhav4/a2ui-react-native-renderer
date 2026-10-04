import assert from "node:assert/strict";
import test from "node:test";

import {
  A2UIWireMessageSchema,
  A2UIWireActionEnvelopeSchema,
} from "../../lib/module/protocol/v0_9/wireSchemas.js";
import {
  ActionSchema,
  ChildListSchema,
  DynamicStringSchema,
  FunctionCallSchema,
} from "../../lib/module/protocol/v0_9/commonSchemas.js";

for (const version of ["v0.9", "v0.9.1"]) {
  test(`${version} accepts all four server messages`, () => {
    const messages = [
      { version, createSurface: { surfaceId: "s", catalogId: "app" } },
      {
        version,
        updateComponents: {
          surfaceId: "s",
          components: [{ id: "root", component: "Text", text: "Hi" }],
        },
      },
      {
        version,
        updateDataModel: { surfaceId: "s", path: "/name", value: "Ada" },
      },
      { version, deleteSurface: { surfaceId: "s" } },
    ];

    for (const message of messages) {
      assert.equal(A2UIWireMessageSchema.safeParse(message).success, true);
    }
  });

  test(`${version} accepts an outbound action envelope`, () => {
    const message = {
      version,
      action: {
        name: "submit",
        surfaceId: "s",
        sourceComponentId: "root",
        timestamp: "2026-10-04T00:00:00.000Z",
        context: { name: "Ada" },
      },
    };
    assert.equal(A2UIWireActionEnvelopeSchema.safeParse(message).success, true);
  });
}

test("rejects unsupported versions, extra operations, and malformed payloads", () => {
  const invalid = [
    { version: "v1.0", createSurface: { surfaceId: "s", catalogId: "app" } },
    {
      version: "v0.9.1",
      createSurface: { surfaceId: "s", catalogId: "app", extra: 1 },
    },
    {
      version: "v0.9.1",
      createSurface: { surfaceId: "s", catalogId: "app" },
      deleteSurface: { surfaceId: "s" },
    },
    { version: "v0.9.1", updateComponents: { surfaceId: "s", components: [] } },
    { version: "v0.9.1", updateDataModel: { path: "/name", value: "Ada" } },
  ];

  for (const message of invalid) {
    assert.equal(A2UIWireMessageSchema.safeParse(message).success, false);
  }
});

test("common value schemas accept bindings, typed values, and app-owned child references", () => {
  assert.equal(DynamicStringSchema.safeParse("Hello").success, true);
  assert.equal(DynamicStringSchema.safeParse({ path: "/title" }).success, true);
  assert.equal(
    DynamicStringSchema.safeParse({ call: "title", returnType: "string" })
      .success,
    true,
  );
  assert.equal(DynamicStringSchema.safeParse(42).success, false);
  assert.equal(FunctionCallSchema.safeParse({ call: "title" }).success, true);
  assert.equal(ChildListSchema.safeParse(["first", "second"]).success, true);
  assert.equal(
    ChildListSchema.safeParse({ componentId: "item", path: "/items" }).success,
    true,
  );
  assert.equal(
    ActionSchema.safeParse({ event: { name: "tap", context: { id: 1 } } })
      .success,
    true,
  );
  assert.equal(
    ActionSchema.safeParse({ event: { name: "tap", extra: 1 } }).success,
    false,
  );
});
