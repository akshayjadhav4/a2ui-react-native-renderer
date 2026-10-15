import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { z } from "zod";
import {
  A2UIDynamicStringSchema,
  A2UISurface,
  createA2UIEngine,
  defineA2UICatalog,
} from "../../lib/module/index.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const catalog = defineA2UICatalog({
  id: "form",
  components: {
    Input: {
      schema: z.object({ value: A2UIDynamicStringSchema }),
      presenter: ({ props }) =>
        React.createElement("NativeInput", {
          value: props.value,
          onChangeText: props.setValue,
        }),
    },
  },
});

for (const version of ["v0.9", "v0.9.1"]) {
  test(`${version} metadata contains full accepted input edits and remains stable`, async () => {
    const errors = [];
    const engine = createA2UIEngine({
      catalogs: [catalog],
      onError: (error) => errors.push(error),
    });
    engine.applyMessages([
      {
        version,
        createSurface: {
          surfaceId: "form",
          catalogId: catalog.id,
          sendDataModel: true,
        },
      },
      {
        version,
        updateDataModel: {
          surfaceId: "form",
          value: { name: "Ada", untouched: 2 },
        },
      },
      {
        version,
        updateComponents: {
          surfaceId: "form",
          components: [
            { id: "root", component: "Input", value: { path: "/name" } },
          ],
        },
      },
    ]);
    let renderer;
    await act(() => {
      renderer = TestRenderer.create(
        React.createElement(A2UISurface, { engine, surfaceId: "form" }),
      );
    });
    try {
      const setter = renderer.root.findByType("NativeInput").props.onChangeText;
      await act(() => setter("Grace"));
      const metadata = engine.getClientDataModel(["form"]);
      assert.deepEqual(metadata, {
        version,
        surfaces: { form: { name: "Grace", untouched: 2 } },
      });
      await act(() => setter(42));
      assert.equal(errors.at(-1).code, "BINDING_ERROR");
      assert.deepEqual(engine.getClientDataModel(["form"]), metadata);
      await act(() => setter("Lin"));
      assert.equal(metadata.surfaces.form.name, "Grace");
      assert.equal(
        engine.getClientDataModel(["form"]).surfaces.form.name,
        "Lin",
      );
      assert.throws(() => {
        metadata.surfaces.form.name = "bad";
      }, TypeError);
      await act(() =>
        engine.applyMessages([
          { version, deleteSurface: { surfaceId: "form" } },
          {
            version,
            createSurface: { surfaceId: "form", catalogId: catalog.id },
          },
        ]),
      );
      assert.equal(engine.getClientDataModel(["form"]), undefined);
      assert.equal(metadata.surfaces.form.name, "Grace");
    } finally {
      await act(() => renderer.unmount());
      engine.dispose();
    }
  });
}
