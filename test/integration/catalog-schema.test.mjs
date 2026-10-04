import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import Ajv2020 from "ajv/dist/2020.js";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { z } from "zod";

import { exportA2UICatalogSchema } from "../../lib/module/catalog-schema.js";
import {
  A2UIActionSchema,
  A2UIChildListSchema,
  A2UIComponentIdSchema,
  A2UIDynamicStringSchema,
  A2UIProvider,
  A2UISurface,
  createA2UIEngine,
  defineA2UICatalog,
  defineA2UIComponent,
  defineA2UIFunction,
} from "../../lib/module/index.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function fixture(version, name) {
  return JSON.parse(
    readFileSync(
      path.join(process.cwd(), "test/fixtures/a2ui", version, name),
      "utf8",
    ),
  );
}

const catalog = defineA2UICatalog({
  id: "https://example.com/a2ui/shared-catalog/v1",
  components: {
    Panel: defineA2UIComponent({
      description: "A panel of app-owned components",
      schema: z.object({
        title: A2UIDynamicStringSchema,
        child: A2UIComponentIdSchema,
        children: A2UIChildListSchema.optional(),
        action: A2UIActionSchema.optional(),
        details: z.object({ tone: z.enum(["soft", "strong"]) }).strict(),
      }),
      presenter: () => null,
    }),
    Label: defineA2UIComponent({
      schema: z.object({ text: z.string().min(1) }),
      presenter: () => null,
    }),
  },
  functions: [
    defineA2UIFunction({
      name: "uppercase",
      args: z.object({ value: z.string() }),
      returns: "string",
      execute: ({ value }) => value.toUpperCase(),
    }),
  ],
});

const validComponents = [
  {
    id: "root",
    component: "Panel",
    title: {
      call: "uppercase",
      args: { value: { path: "/title" } },
      returnType: "string",
    },
    child: "label",
    children: ["label"],
    action: {
      event: { name: "select", context: { selected: { path: "/title" } } },
    },
    details: { tone: "soft" },
  },
  { id: "label", component: "Label", text: "Hello" },
];

for (const [fixtureVersion, wireVersion] of [
  ["v0_9", "v0.9"],
  ["v0_9_1", "v0.9.1"],
]) {
  test(`${wireVersion} shared catalog agrees with renderer validation`, async () => {
    const document = exportA2UICatalogSchema(catalog);
    const serialized = JSON.stringify(document);
    assert.equal(serialized, JSON.stringify(exportA2UICatalogSchema(catalog)));
    assert.equal(document.$id, catalog.id);
    assert.equal(document.catalogId, catalog.id);
    assert.deepEqual(Object.keys(document.components), ["Panel", "Label"]);
    assert.deepEqual(Object.keys(document.functions), ["uppercase"]);
    assert.equal(serialized.includes("presenter"), false);
    assert.equal(serialized.includes("execute"), false);

    const ajv = new Ajv2020({ strict: false, validateFormats: false });
    ajv.addSchema(fixture(fixtureVersion, "common_types.json"));
    ajv.addSchema(document, "https://a2ui.org/specification/v0_9/catalog.json");
    const validate = ajv.compile(
      fixture(fixtureVersion, "server_to_client.json"),
    );

    for (const [name, components, accepted] of [
      ["valid", validComponents, true],
      [
        "invalid child",
        [{ ...validComponents[0], child: "" }, validComponents[1]],
        false,
      ],
      [
        "invalid list",
        [{ ...validComponents[0], children: [1] }, validComponents[1]],
        false,
      ],
      [
        "invalid nested prop",
        [
          { ...validComponents[0], details: { tone: "soft", extra: true } },
          validComponents[1],
        ],
        false,
      ],
      [
        "unknown component",
        [{ ...validComponents[0], component: "Unknown" }, validComponents[1]],
        false,
      ],
    ]) {
      const wire = {
        version: wireVersion,
        updateComponents: { surfaceId: "main", components },
      };
      assert.equal(
        validate(wire),
        accepted,
        `${name}: ${JSON.stringify(validate.errors)}`,
      );

      const engine = createA2UIEngine({ catalogs: [catalog] });
      engine.applyMessage({
        version: wireVersion,
        createSurface: { surfaceId: "main", catalogId: catalog.id },
      });
      engine.applyMessage(wire);
      assert.equal(
        engine.getSurface("main").components.root !== undefined,
        accepted,
        name,
      );
    }

    const unknownFunctionWire = {
      version: wireVersion,
      updateComponents: {
        surfaceId: "main",
        components: [
          {
            ...validComponents[0],
            title: { call: "missing", args: { value: "hello" } },
          },
          validComponents[1],
        ],
      },
    };
    assert.equal(validate(unknownFunctionWire), false);
    const errors = [];
    const engine = createA2UIEngine({
      catalogs: [catalog],
      onError: (error) => errors.push(error),
    });
    engine.applyMessage({
      version: wireVersion,
      createSurface: { surfaceId: "main", catalogId: catalog.id },
    });
    engine.applyMessage(unknownFunctionWire);
    assert.ok(engine.getSurface("main").components.root);
    await act(() => {
      TestRenderer.create(
        React.createElement(
          A2UIProvider,
          { engine },
          React.createElement(A2UISurface, { surfaceId: "main" }),
        ),
      );
    });
    assert.equal(errors.at(-1)?.code, "FUNCTION_ERROR");

    document.components.Panel.description = "Changed export only";
    assert.equal(
      catalog.components.Panel.description,
      "A panel of app-owned components",
    );
    assert.equal(
      exportA2UICatalogSchema(catalog).components.Panel.description,
      "A panel of app-owned components",
    );
  });
}
