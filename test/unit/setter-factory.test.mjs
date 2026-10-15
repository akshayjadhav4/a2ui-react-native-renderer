import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { A2UIDynamicStringSchema } from "../../lib/module/index.js";
import { resolvePresenterProps } from "../../lib/module/protocol/v0_9/resolveProps.js";

test("private setter factory receives complete nested and relative binding descriptors", () => {
  const schema = z.object({
    rows: z.array(z.object({ value: A2UIDynamicStringSchema })),
  });
  const descriptors = [];
  const setter = () => {};
  const props = resolvePresenterProps(
    schema,
    { rows: [{ value: { path: "name" } }] },
    { items: [{ name: "A" }, { name: "B" }] },
    "/items/1",
    () => {
      throw new Error("Default setter must not run");
    },
    [],
    (binding) => {
      descriptors.push(binding);
      return setter;
    },
  );
  assert.equal(props.rows[0].value, "B");
  assert.strictEqual(props.rows[0].setValue, setter);
  assert.equal(descriptors.length, 1);
  assert.equal(descriptors[0].path, "/items/1/name");
  assert.equal(descriptors[0].bindingPath, "name");
  assert.deepEqual(descriptors[0].propertyPath, ["rows", 0, "value"]);
  assert.equal(descriptors[0].behavior.type, "DYNAMIC");
});

test("default factory retains write payload and literal setter absence", () => {
  const writes = [];
  const schema = z.object({
    value: A2UIDynamicStringSchema,
    literal: A2UIDynamicStringSchema,
  });
  const props = resolvePresenterProps(
    schema,
    { value: { path: "/title" }, literal: "Fixed" },
    { title: "Initial" },
    "/",
    (write) => writes.push(write),
    [],
  );
  props.setValue("Next");
  assert.equal(props.setLiteral, undefined);
  assert.equal(writes[0].path, "/title");
  assert.equal(writes[0].value, "Next");
  assert.deepEqual(writes[0].propertyPath, ["value"]);
});
