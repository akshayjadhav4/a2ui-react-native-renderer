import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { z } from "zod";

import {
  A2UIProvider,
  A2UISurface,
  defineA2UICatalog,
  useA2UIEngine,
} from "../../lib/module/index.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const catalog = defineA2UICatalog({
  id: "urn:example:hook:v1",
  components: {
    Text: {
      schema: z.object({ text: z.string() }),
      presenter: ({ props }) =>
        React.createElement("NativeText", null, props.text),
    },
    Button: {
      schema: z.object({ action: z.record(z.unknown()) }),
      presenter: ({ props, dispatch }) =>
        React.createElement("NativeButton", {
          onPress: () => dispatch(props.action),
        }),
    },
  },
});

function messages(text = "Hello") {
  return [
    {
      version: "v0.9.1",
      createSurface: { surfaceId: "main", catalogId: catalog.id },
    },
    {
      version: "v0.9.1",
      updateComponents: {
        surfaceId: "main",
        components: [{ id: "root", component: "Text", text }],
      },
    },
  ];
}

function Probe({ options, capture }) {
  const engine = useA2UIEngine(options);
  capture(engine);
  return React.createElement(
    A2UIProvider,
    { engine },
    React.createElement(A2UISurface, { surfaceId: "main" }),
  );
}

test("hook keeps engine state across rerenders and isolates mounted instances", async () => {
  let first;
  let second;
  const captureFirst = (engine) => {
    first = engine;
  };
  let renderer;
  await act(() => {
    renderer = TestRenderer.create(
      React.createElement(Probe, {
        options: { catalogs: [catalog] },
        capture: captureFirst,
      }),
    );
  });
  const original = first;
  await act(() => {
    first.applyMessages(messages());
  });
  const snapshot = first.getSurface("main");
  await act(() => {
    renderer.update(
      React.createElement(Probe, {
        options: { catalogs: [catalog] },
        capture: captureFirst,
      }),
    );
  });
  assert.strictEqual(first, original);
  assert.strictEqual(first.getSurface("main"), snapshot);
  assert.deepEqual(renderer.toJSON().children, ["Hello"]);

  let other;
  await act(() => {
    other = TestRenderer.create(
      React.createElement(Probe, {
        options: { catalogs: [catalog] },
        capture: (engine) => {
          second = engine;
        },
      }),
    );
  });
  assert.notStrictEqual(first, second);
  assert.equal(second.getSurface("main"), undefined);
  await act(() => {
    renderer.unmount();
    other.unmount();
  });
});

test("hook uses latest action and error callbacks without resetting the surface", async () => {
  let engine;
  const firstActions = [];
  const latestActions = [];
  const firstErrors = [];
  const latestErrors = [];
  const capture = (value) => {
    engine = value;
  };
  let renderer;
  await act(() => {
    renderer = TestRenderer.create(
      React.createElement(Probe, {
        capture,
        options: {
          catalogs: [catalog],
          onAction: (a) => firstActions.push(a),
          onError: (e) => firstErrors.push(e),
        },
      }),
    );
  });
  await act(() => {
    engine.applyMessages([
      messages()[0],
      {
        version: "v0.9.1",
        updateComponents: {
          surfaceId: "main",
          components: [
            {
              id: "root",
              component: "Button",
              action: { event: { name: "choose", context: {} } },
            },
          ],
        },
      },
    ]);
  });
  const snapshot = engine.getSurface("main");
  await act(() => {
    renderer.update(
      React.createElement(Probe, {
        capture,
        options: {
          catalogs: [catalog],
          onAction: (a) => latestActions.push(a),
          onError: (e) => latestErrors.push(e),
        },
      }),
    );
  });
  await act(async () => {
    renderer.root.findByType("NativeButton").props.onPress();
    engine.applyMessage({ version: "unsupported" });
  });
  assert.deepEqual(firstActions, []);
  assert.deepEqual(firstErrors, []);
  assert.equal(latestActions[0].name, "choose");
  assert.equal(latestErrors[0].code, "UNSUPPORTED_VERSION");
  assert.strictEqual(engine.getSurface("main"), snapshot);
  await act(() => {
    renderer.unmount();
  });
});

test("hook applies initial resource limit overrides", async () => {
  let engine;
  let renderer;
  await act(() => {
    renderer = TestRenderer.create(
      React.createElement(Probe, {
        options: { catalogs: [catalog], limits: { maxMessagesPerBatch: 1 } },
        capture: (value) => {
          engine = value;
        },
      }),
    );
  });
  await act(() => {
    engine.applyMessages(messages());
  });
  assert.equal(engine.getSurface("main"), undefined);
  assert.equal(engine.getErrors()[0].code, "RESOURCE_LIMIT_EXCEEDED");
  await act(() => {
    renderer.unmount();
  });
});
