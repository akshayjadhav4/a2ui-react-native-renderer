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
