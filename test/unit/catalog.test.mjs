import assert from "node:assert/strict";
import test from "node:test";

import { z } from "zod";

import {
  defineA2UICatalog,
  defineA2UIComponent,
  defineA2UIFunction,
} from "../../lib/module/index.js";

const TextComponent = defineA2UIComponent({
  schema: z.object({ text: z.string() }),
  presenter: () => null,
});

test("defines an immutable catalog without mutating consumer input", () => {
  const input = {
    id: "urn:example:a2ui:catalog:v1",
    components: { Text: TextComponent },
  };

  const catalog = defineA2UICatalog(input);

  assert.equal(catalog.id, input.id);
  assert.notEqual(catalog, input);
  assert.notEqual(catalog.components, input.components);
  assert.equal(catalog.components.Text, TextComponent);
  assert.deepEqual(catalog.functions, []);
  assert.ok(Object.isFrozen(catalog));
  assert.ok(Object.isFrozen(catalog.components));
  assert.ok(Object.isFrozen(catalog.functions));
});

test("rejects an empty catalog id", () => {
  assert.throws(
    () =>
      defineA2UICatalog({
        id: "   ",
        components: { Text: TextComponent },
      }),
    { name: "TypeError", message: "A2UI catalog id must not be empty" },
  );
});

test("rejects an empty component registry", () => {
  assert.throws(
    () =>
      defineA2UICatalog({
        id: "urn:example:a2ui:catalog:v1",
        components: {},
      }),
    {
      name: "TypeError",
      message: "A2UI catalog must define at least one component",
    },
  );
});

test("rejects invalid component names", () => {
  assert.throws(
    () =>
      defineA2UICatalog({
        id: "urn:example:a2ui:catalog:v1",
        components: { " ": TextComponent },
      }),
    { name: "TypeError", message: "A2UI component name must not be empty" },
  );
});

test("rejects duplicate function names", () => {
  const first = defineA2UIFunction({
    name: "formatPrice",
    args: z.object({ amount: z.number() }),
    returns: "string",
    execute: ({ amount }) => String(amount),
  });
  const second = defineA2UIFunction({
    name: "formatPrice",
    args: z.object({ value: z.number() }),
    returns: "string",
    execute: ({ value }) => String(value),
  });

  assert.throws(
    () =>
      defineA2UICatalog({
        id: "urn:example:a2ui:catalog:v1",
        components: { Text: TextComponent },
        functions: [first, second],
      }),
    {
      name: "TypeError",
      message: 'A2UI catalog contains duplicate function "formatPrice"',
    },
  );
});

test("freezes component and function definitions", () => {
  const component = defineA2UIComponent({
    schema: z.object({ text: z.string() }),
    presenter: () => null,
  });
  const fn = defineA2UIFunction({
    name: "isVisible",
    args: z.object({ value: z.boolean() }),
    returns: "boolean",
    execute: ({ value }) => value,
  });

  assert.ok(Object.isFrozen(component));
  assert.ok(Object.isFrozen(fn));
});
