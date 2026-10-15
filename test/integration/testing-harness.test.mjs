import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { z } from "zod";
import {
  A2UIActionSchema,
  A2UIDynamicStringSchema,
  A2UISurface,
  defineA2UICatalog,
} from "../../lib/module/index.js";
import { createA2UITestHarness } from "../../lib/module/testing.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

test("harness records real mounted actions after writable binding changes", async () => {
  const catalog = defineA2UICatalog({
    id: "urn:test:harness:mounted",
    components: {
      Form: {
        schema: z.object({
          value: A2UIDynamicStringSchema,
          action: A2UIActionSchema,
        }),
        presenter: ({ props, dispatch }) =>
          React.createElement("Form", {
            value: props.value,
            onChange: props.setValue,
            onPress: () => dispatch(props.action),
            onInvalid: () => dispatch({ event: {} }),
          }),
      },
    },
  });
  const harness = createA2UITestHarness({ catalogs: [catalog] });
  const other = createA2UITestHarness({ catalogs: [catalog] });
  let renderer;
  try {
    harness.engine.applyMessages([
      {
        version: "v0.9.1",
        createSurface: { surfaceId: "form", catalogId: catalog.id },
      },
      {
        version: "v0.9.1",
        updateDataModel: { surfaceId: "form", value: { draft: "First" } },
      },
      {
        version: "v0.9.1",
        updateComponents: {
          surfaceId: "form",
          components: [
            {
              id: "root",
              component: "Form",
              value: { path: "/draft" },
              action: {
                event: {
                  name: "submit",
                  context: { value: { path: "/draft" } },
                },
              },
            },
          ],
        },
      },
    ]);
    await act(() => {
      renderer = TestRenderer.create(
        React.createElement(A2UISurface, {
          engine: harness.engine,
          surfaceId: "form",
        }),
      );
    });
    const empty = harness.getActions();
    await act(() => renderer.root.findByType("Form").props.onChange("Edited"));
    assert.equal(renderer.root.findByType("Form").props.value, "Edited");
    await act(() => renderer.root.findByType("Form").props.onPress());
    const first = harness.getActions();
    assert.equal(first[0].context.value, "Edited");
    assert.equal(first[0].name, "submit");
    assert.equal(first[0].surfaceId, "form");
    assert.equal(first[0].sourceComponentId, "root");
    assert.match(first[0].timestamp, /^\d{4}-\d{2}-\d{2}T/);
    assert.ok(Object.isFrozen(first));
    assert.throws(() => first.push(first[0]), TypeError);
    await act(() => {
      renderer.root.findByType("Form").props.onChange("Second");
    });
    await act(() => renderer.root.findByType("Form").props.onPress());
    assert.deepEqual(
      harness.getActions().map((a) => a.context.value),
      ["Edited", "Second"],
    );
    assert.equal(first.length, 1);
    assert.deepEqual(empty, []);
    assert.deepEqual(other.getActions(), []);
    await act(() => renderer.root.findByType("Form").props.onInvalid());
    assert.equal(harness.getActions().length, 2);
    assert.equal(harness.engine.getErrors().at(-1).code, "INVALID_MESSAGE");
  } finally {
    if (renderer) await act(() => renderer.unmount());
    harness.engine.dispose();
    other.engine.dispose();
  }
});
