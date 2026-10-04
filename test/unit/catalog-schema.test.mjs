import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import Ajv2020 from "ajv/dist/2020.js";
import { z } from "zod";

import { exportA2UICatalogSchema } from "../../lib/module/catalog-schema.js";
import {
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
