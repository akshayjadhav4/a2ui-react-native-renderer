import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { A2UISurface } from "../../lib/module/index.js";
import { createA2UITestHarness } from "../../lib/module/testing.js";
import { demoCatalog } from "./helpers/demo-catalog.mjs";
import {
  SURFACE_ID,
  initialMessages,
  recoveryMessages,
  deleteMessage,
  responseMessage,
} from "../../example/server/fixtures.mjs";
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

test("demo fixtures use shared schemas for progressive rendering and interaction", async () => {
  const harness = createA2UITestHarness({ catalogs: [demoCatalog] });
  let renderer;
  try {
    harness.engine.applyMessage(initialMessages[0]);
    assert.equal(harness.engine.getSurface(SURFACE_ID).rootId, null);
    harness.engine.applyMessages(initialMessages.slice(1, 3));
    assert.deepEqual(
      harness.engine.getSurface(SURFACE_ID).pendingComponentIds,
      ["title", "input", "button", "response"],
    );
    await act(() => {
      renderer = TestRenderer.create(
        React.createElement(A2UISurface, {
          engine: harness.engine,
          surfaceId: SURFACE_ID,
          renderPending: ({ componentId }) =>
            React.createElement("Pending", { componentId }),
        }),
      );
    });
    assert.equal(renderer.root.findAllByType("Pending").length, 4);
    await act(() => harness.engine.applyMessages(initialMessages.slice(3)));
    assert.equal(renderer.root.findAllByType("Pending").length, 0);
    await act(() => renderer.root.findByType("Input").props.onChange("Edited"));
    await act(() => renderer.root.findByType("Button").props.onPress());
    assert.equal(harness.getActions()[0].context.value, "Edited");
    await act(() => harness.engine.applyMessage(responseMessage("Edited")));
    assert.equal(
      harness.engine.getSurface(SURFACE_ID).dataModel.response,
      "Received: Edited",
    );
    await act(() => harness.engine.applyMessages(recoveryMessages));
    assert.equal(harness.engine.getErrors().length, 1);
    assert.equal(
      harness.engine.getSurface(SURFACE_ID).dataModel.response,
      "Recovered after invalid message",
    );
    await act(() => harness.engine.applyMessage(deleteMessage));
    assert.equal(renderer.toJSON(), null);
  } finally {
    if (renderer) await act(() => renderer.unmount());
    harness.engine.dispose();
  }
});
