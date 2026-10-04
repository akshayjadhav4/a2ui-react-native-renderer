import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import Ajv2020 from "ajv/dist/2020.js";
import { z } from "zod";

import { exportA2UICatalogSchema } from "../../lib/module/catalog-schema.js";
import {
  A2UIActionSchema,
  A2UIChildListSchema,
  A2UIComponentIdSchema,
  A2UIDataBindingSchema,
  A2UIDynamicBooleanSchema,
  A2UIDynamicNumberSchema,
  A2UIDynamicStringListSchema,
  A2UIDynamicStringSchema,
  A2UIDynamicValueSchema,
  defineA2UICatalog,
  defineA2UIComponent,
} from "../../lib/module/index.js";

const catalog = defineA2UICatalog({
  id: "https://example.com/a2ui/catalog/v1",
  components: {
    Label: defineA2UIComponent({
      schema: z.object({ text: z.string() }),
      description: "Shows one line of text",
      presenter: () => null,
    }),
  },
});

function officialSchema(version, name) {
  const file = path.join(process.cwd(), "test/fixtures/a2ui", version, name);
  return JSON.parse(readFileSync(file, "utf8"));
}

test("exports a detached, serializable app-owned catalog", () => {
  const document = exportA2UICatalogSchema(catalog);

  assert.equal(
    document.$schema,
    "https://json-schema.org/draft/2020-12/schema",
  );
  assert.equal(document.$id, catalog.id);
  assert.equal(document.catalogId, catalog.id);
  assert.deepEqual(Object.keys(document.components), ["Label"]);
  assert.deepEqual(document.functions, {});
  assert.deepEqual(document.$defs.anyComponent.oneOf, [
    { $ref: "#/components/Label" },
  ]);
  assert.equal(JSON.stringify(document).includes("presenter"), false);
  assert.equal(JSON.stringify(document).includes("execute"), false);
  assert.deepEqual(exportA2UICatalogSchema(catalog), document);
  assert.notEqual(exportA2UICatalogSchema(catalog), document);
});

for (const [version, wireVersion] of [
  ["v0_9", "v0.9"],
  ["v0_9_1", "v0.9.1"],
]) {
  test(`the ${wireVersion} envelope resolves the exported catalog`, () => {
    const document = exportA2UICatalogSchema(catalog);
    const ajv = new Ajv2020({ strict: false, validateFormats: false });
    ajv.addSchema(officialSchema(version, "common_types.json"));
    ajv.addSchema(document, "https://a2ui.org/specification/v0_9/catalog.json");
    const validate = ajv.compile(
      officialSchema(version, "server_to_client.json"),
    );

    assert.equal(
      validate({
        version: wireVersion,
        updateComponents: {
          surfaceId: "surface-1",
          components: [{ id: "root", component: "Label", text: "Hello" }],
        },
      }),
      true,
      JSON.stringify(validate.errors),
    );
    assert.equal(
      validate({
        version: wireVersion,
        updateComponents: {
          surfaceId: "surface-1",
          components: [{ id: "root", component: "Other", text: "Hello" }],
        },
      }),
      false,
    );
  });
}

test("converts ordinary nested Zod wire properties without losing constraints", () => {
  const formSchema = z
    .object({
      title: z.string().min(2).max(12).describe("Visible heading"),
      count: z.number().int().min(0).max(10),
      active: z.boolean(),
      tone: z.enum(["soft", "strong"]).optional(),
      kind: z.literal("form"),
      choice: z.union([z.literal("yes"), z.literal("no")]),
      tags: z.array(z.string()).min(1).max(3),
      details: z.object({ ready: z.boolean() }).strict(),
      note: z.string().nullable(),
      status: z.string().default("draft"),
    })
    .strict();
  const formCatalog = defineA2UICatalog({
    id: "https://example.com/a2ui/form/v1",
    components: {
      Form: defineA2UIComponent({
        schema: formSchema,
        presenter: () => null,
      }),
    },
  });

  const document = exportA2UICatalogSchema(formCatalog);
  const properties = document.components.Form.allOf[2];
  assert.deepEqual(properties.required, [
    "component",
    "title",
    "count",
    "active",
    "kind",
    "choice",
    "tags",
    "details",
    "note",
  ]);
  assert.deepEqual(properties.properties.title, {
    type: "string",
    minLength: 2,
    maxLength: 12,
    description: "Visible heading",
  });
  assert.deepEqual(properties.properties.count, {
    type: "integer",
    minimum: 0,
    maximum: 10,
  });
  assert.deepEqual(properties.properties.tone, {
    type: "string",
    enum: ["soft", "strong"],
  });
  assert.deepEqual(properties.properties.choice, {
    anyOf: [{ const: "yes" }, { const: "no" }],
  });
  assert.deepEqual(properties.properties.tags, {
    type: "array",
    items: { type: "string" },
    minItems: 1,
    maxItems: 3,
  });
  assert.deepEqual(properties.properties.details, {
    type: "object",
    properties: { ready: { type: "boolean" } },
    required: ["ready"],
    additionalProperties: false,
  });
  assert.deepEqual(properties.properties.note, {
    anyOf: [{ type: "string" }, { type: "null" }],
  });
  assert.deepEqual(properties.properties.status, {
    type: "string",
    default: "draft",
  });
  assert.equal(properties.additionalProperties, false);

  const ajv = new Ajv2020({ strict: false, validateFormats: false });
  ajv.addSchema(officialSchema("v0_9_1", "common_types.json"));
  ajv.addSchema(document, "https://a2ui.org/specification/v0_9/catalog.json");
  const validate = ajv.compile(
    officialSchema("v0_9_1", "server_to_client.json"),
  );
  const validProps = {
    title: "Hello",
    count: 2,
    active: true,
    kind: "form",
    choice: "yes",
    tags: ["one"],
    details: { ready: true },
    note: null,
  };
  const accepts = (props) =>
    validate({
      version: "v0.9.1",
      updateComponents: {
        surfaceId: "surface-1",
        components: [{ id: "root", component: "Form", ...props }],
      },
    });
  assert.equal(formSchema.safeParse(validProps).success, true);
  assert.equal(accepts(validProps), true, JSON.stringify(validate.errors));
  for (const invalidProps of [
    { ...validProps, title: "A" },
    { ...validProps, count: 1.5 },
    { ...validProps, tags: [] },
    { ...validProps, details: { ready: true, extra: true } },
    { ...validProps, extra: true },
  ]) {
    assert.equal(formSchema.safeParse(invalidProps).success, false);
    assert.equal(accepts(invalidProps), false);
  }
});

test("unsupported Zod behavior fails at the exact component property", () => {
  const cases = [
    ["transform", z.string().transform((value) => value.toUpperCase())],
    ["refine", z.string().refine((value) => value.startsWith("a"))],
    ["recursive", z.lazy(() => z.object({ recursive: z.string() }))],
    ["format", z.string().email()],
    ["coerce", z.coerce.number()],
    ["catchall", z.object({ known: z.string() }).catchall(z.string())],
    ["regex", z.string().regex(/a/g)],
    ["twoMins", z.string().min(5).min(2)],
    ["twoPatterns", z.string().regex(/a/).regex(/b/)],
    ["twoNumberMins", z.number().min(5).min(2)],
    ["twoMultiples", z.number().multipleOf(2).multipleOf(3)],
    ["negativeLength", z.string().min(-1)],
    ["infiniteBound", z.number().min(Number.POSITIVE_INFINITY)],
    ["zeroMultiple", z.number().multipleOf(0)],
    ["negativeArrayLength", z.array(z.string()).min(-1)],
  ];

  for (const [name, schema] of cases) {
    const unsupportedCatalog = defineA2UICatalog({
      id: "https://example.com/a2ui/unsupported/v1",
      components: {
        Form: defineA2UIComponent({
          schema: z.object({ nested: z.object({ [name]: schema }) }),
          presenter: () => null,
        }),
      },
    });
    assert.throws(
      () => exportA2UICatalogSchema(unsupportedCatalog),
      (error) =>
        error instanceof TypeError &&
        error.message.includes(`components.Form.nested.${name}`),
      name,
    );
  }
});

test("component root shapes that cannot match renderer props fail export", () => {
  for (const [name, schema] of [
    ["id", z.object({ id: z.string().optional() })],
    ["component", z.object({ component: z.string().optional() })],
    ["catchall", z.object({ label: z.string() }).catchall(z.string())],
  ]) {
    const invalidCatalog = defineA2UICatalog({
      id: "https://example.com/a2ui/invalid-root/v1",
      components: {
        Form: defineA2UIComponent({ schema, presenter: () => null }),
      },
    });
    assert.throws(
      () => exportA2UICatalogSchema(invalidCatalog),
      (error) =>
        error instanceof TypeError &&
        error.message.includes(`components.Form.${name}`),
      name,
    );
  }
});

test("defaults remain JSON-safe and detached from their source values", () => {
  const sourceDefault = { label: "Ready", tags: ["one"] };
  const defaultCatalog = defineA2UICatalog({
    id: "https://example.com/a2ui/default/v1",
    components: {
      Form: defineA2UIComponent({
        schema: z.object({
          options: z
            .object({ label: z.string(), tags: z.array(z.string()) })
            .default(sourceDefault),
        }),
        presenter: () => null,
      }),
    },
  });

  const first = exportA2UICatalogSchema(defaultCatalog);
  const second = exportA2UICatalogSchema(defaultCatalog);
  assert.deepEqual(first, second);
  first.components.Form.allOf[2].properties.options.default.tags.push("two");
  assert.deepEqual(sourceDefault.tags, ["one"]);
  assert.deepEqual(
    second.components.Form.allOf[2].properties.options.default.tags,
    ["one"],
  );

  const cyclic = {};
  cyclic.self = cyclic;
  for (const [name, schema] of [
    ["date", z.string().default(new Date("2020-01-01T00:00:00Z"))],
    [
      "undefined",
      z.object({ value: z.string().optional() }).default({ value: undefined }),
    ],
    ["nonfinite", z.number().default(Number.POSITIVE_INFINITY)],
    ["cyclic", z.object({}).default(cyclic)],
  ]) {
    const badCatalog = defineA2UICatalog({
      id: "https://example.com/a2ui/default/v1",
      components: {
        Form: defineA2UIComponent({
          schema: z.object({ [name]: schema }),
          presenter: () => null,
        }),
      },
    });
    assert.throws(
      () => exportA2UICatalogSchema(badCatalog),
      (error) =>
        error instanceof TypeError &&
        error.message.includes(`components.Form.${name}`),
      name,
    );
  }
});

test("exports nested and wrapped A2UI markers as official references", () => {
  const markerSchema = z.object({
    child: A2UIComponentIdSchema.describe("Single child").optional(),
    children: A2UIChildListSchema.default([]),
    action: A2UIActionSchema.nullable(),
    label: A2UIDynamicStringSchema.describe("Bound label").optional(),
    count: A2UIDynamicNumberSchema,
    active: A2UIDynamicBooleanSchema,
    names: A2UIDynamicStringListSchema,
    value: A2UIDynamicValueSchema,
    binding: A2UIDataBindingSchema,
    literal: z.string(),
    nested: z.object({ items: z.array(A2UIComponentIdSchema) }),
  });
  const markerCatalog = defineA2UICatalog({
    id: "https://example.com/a2ui/markers/v1",
    components: {
      Panel: defineA2UIComponent({
        schema: markerSchema,
        presenter: () => null,
      }),
    },
  });
  const document = exportA2UICatalogSchema(markerCatalog);
  const props = document.components.Panel.allOf[2].properties;
  const ref = (name) => ({
    $ref: `https://a2ui.org/specification/v0_9/common_types.json#/$defs/${name}`,
  });
  assert.deepEqual(props.child, {
    ...ref("ComponentId"),
    minLength: 1,
    description: "Single child",
  });
  assert.deepEqual(props.children, { ...ref("ChildList"), default: [] });
  assert.deepEqual(props.action, {
    anyOf: [ref("Action"), { type: "null" }],
  });
  assert.deepEqual(props.label, {
    ...ref("DynamicString"),
    description: "Bound label",
  });
  for (const [key, name] of [
    ["count", "DynamicNumber"],
    ["active", "DynamicBoolean"],
    ["names", "DynamicStringList"],
    ["value", "DynamicValue"],
    ["binding", "DataBinding"],
  ]) {
    assert.deepEqual(props[key], ref(name));
  }
  assert.deepEqual(props.literal, { type: "string" });
  assert.deepEqual(props.nested.properties.items.items, {
    ...ref("ComponentId"),
    minLength: 1,
  });

  const ajv = new Ajv2020({ strict: false, validateFormats: false });
  ajv.addSchema(officialSchema("v0_9_1", "common_types.json"));
  ajv.addSchema(document, "https://a2ui.org/specification/v0_9/catalog.json");
  const validate = ajv.compile(
    officialSchema("v0_9_1", "server_to_client.json"),
  );
  const valid = {
    child: "item",
    children: ["item"],
    action: null,
    count: { path: "/count" },
    active: true,
    names: ["one"],
    value: "ready",
    binding: { path: "/title" },
    literal: "ordinary text",
    nested: { items: ["item"] },
  };
  const accepts = (propsValue) =>
    validate({
      version: "v0.9.1",
      updateComponents: {
        surfaceId: "surface-1",
        components: [{ id: "root", component: "Panel", ...propsValue }],
      },
    });
  assert.equal(markerSchema.safeParse(valid).success, true);
  assert.equal(accepts(valid), true, JSON.stringify(validate.errors));
  for (const rejected of [
    { ...valid, child: "" },
    { ...valid, children: [1] },
    { ...valid, nested: { items: [""] } },
  ]) {
    assert.equal(markerSchema.safeParse(rejected).success, false);
    assert.equal(accepts(rejected), false);
  }
});

test("rejects a modified marker when its reference would lose a constraint", () => {
  const modifiedCatalog = defineA2UICatalog({
    id: "https://example.com/a2ui/modified-marker/v1",
    components: {
      Panel: defineA2UIComponent({
        schema: z.object({ child: A2UIComponentIdSchema.min(2) }),
        presenter: () => null,
      }),
    },
  });
  assert.throws(
    () => exportA2UICatalogSchema(modifiedCatalog),
    (error) =>
      error instanceof TypeError &&
      error.message.includes("components.Panel.child"),
  );
});
