import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { z } from "zod";

import {
  A2UIActionSchema,
  A2UIProvider,
  A2UISurface,
  createA2UIEngine,
  defineA2UICatalog,
} from "../../lib/module/index.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const catalog = defineA2UICatalog({
  id: "urn:example:a2ui:presenter-actions:v1",
  components: {
    Button: {
      schema: z.object({ label: z.string(), action: A2UIActionSchema }),
      presenter: ({ props, surfaceId, dispatch }) =>
        React.createElement(
          "NativeButton",
          {
            surfaceId,
            onPress: () => dispatch(props.action),
          },
          props.label,
        ),
    },
  },
});

function applyButtonSurface(engine, surfaceId, value) {
  engine.applyMessages([
    {
      version: "v0.9",
      createSurface: { surfaceId, catalogId: catalog.id },
    },
    {
      version: "v0.9",
      updateDataModel: { surfaceId, value: { selected: value } },
    },
    {
      version: "v0.9",
      updateComponents: {
        surfaceId,
        components: [
          {
            id: "root",
            component: "Button",
            label: `Choose ${value}`,
            action: {
              event: {
                name: "choose",
                context: { selected: { path: "/selected" } },
              },
            },
          },
        ],
      },
    },
  ]);
}

test("resolves action context from the latest surface model at dispatch time", async () => {
  const actions = [];
  const engine = createA2UIEngine({
    catalogs: [catalog],
    onAction: (action) => actions.push(action),
  });
  applyButtonSurface(engine, "main", "old");

  let renderer;
  await act(() => {
    renderer = TestRenderer.create(
      React.createElement(
        A2UIProvider,
        { engine },
        React.createElement(A2UISurface, { surfaceId: "main" }),
      ),
    );
  });
  const originalPressHandler =
    renderer.root.findByType("NativeButton").props.onPress;

  await act(() => {
    engine.applyMessage({
      version: "v0.9",
      updateDataModel: {
        surfaceId: "main",
        path: "/selected",
        value: "current",
      },
    });
  });
  await act(async () => {
    originalPressHandler();
    await Promise.resolve();
  });

  assert.equal(actions.length, 1);
  assert.equal(actions[0].name, "choose");
  assert.equal(actions[0].surfaceId, "main");
  assert.equal(actions[0].sourceComponentId, "root");
  assert.equal(actions[0].context.selected, "current");
  assert.match(actions[0].timestamp, /^\d{4}-\d{2}-\d{2}T/);
});

test("never resolves action context from another surface", async () => {
  const actions = [];
  const engine = createA2UIEngine({
    catalogs: [catalog],
    onAction: (action) => actions.push(action),
  });
  applyButtonSurface(engine, "one", "apple");
  applyButtonSurface(engine, "two", "banana");

  let renderer;
  await act(() => {
    renderer = TestRenderer.create(
      React.createElement(
        A2UIProvider,
        { engine },
        React.createElement(
          React.Fragment,
          null,
          React.createElement(A2UISurface, { surfaceId: "one" }),
          React.createElement(A2UISurface, { surfaceId: "two" }),
        ),
      ),
    );
  });

  const buttons = renderer.root.findAllByType("NativeButton");
  await act(async () => {
    buttons.find((button) => button.props.surfaceId === "two").props.onPress();
    await Promise.resolve();
  });

  assert.equal(actions.length, 1);
  assert.equal(actions[0].surfaceId, "two");
  assert.equal(actions[0].context.selected, "banana");
});

test("contains malformed presenter actions as renderer errors", async () => {
  const errors = [];
  const unsafeCatalog = defineA2UICatalog({
    id: "urn:example:a2ui:unsafe-action:v1",
    components: {
      UnsafeButton: {
        schema: z.object({ label: z.string() }),
        presenter: ({ dispatch }) =>
          React.createElement("NativeButton", {
            onPress: () => dispatch({ event: {} }),
          }),
      },
    },
  });
  const engine = createA2UIEngine({
    catalogs: [unsafeCatalog],
    onError: (error) => errors.push(error),
  });
  engine.applyMessages([
    {
      version: "v0.9",
      createSurface: { surfaceId: "main", catalogId: unsafeCatalog.id },
    },
    {
      version: "v0.9",
      updateComponents: {
        surfaceId: "main",
        components: [{ id: "root", component: "UnsafeButton", label: "Bad" }],
      },
    },
  ]);

  let renderer;
  await act(() => {
    renderer = TestRenderer.create(
      React.createElement(
        A2UIProvider,
        { engine },
        React.createElement(A2UISurface, { surfaceId: "main" }),
      ),
    );
  });
  await act(() => {
    renderer.root.findByType("NativeButton").props.onPress();
  });

  assert.equal(errors.at(-1).code, "INVALID_MESSAGE");
  assert.equal(errors.at(-1).surfaceId, "main");
  assert.equal(errors.at(-1).componentId, "root");
});

for (const version of ["v0.9", "v0.9.1"]) {
  test(`${version} action context rejects invalid array reads and recovers with empty-name fields`, async () => {
    const actions = [];
    const errors = [];
    const engine = createA2UIEngine({
      catalogs: [catalog],
      onAction: (action) => actions.push(action),
      onError: (error) => errors.push(error),
    });
    const button = (path) => ({
      id: "root",
      component: "Button",
      label: "Choose",
      action: {
        event: { name: "choose", context: { selected: { path } } },
      },
    });
    engine.applyMessages([
      { version, createSurface: { surfaceId: "main", catalogId: catalog.id } },
      {
        version,
        updateDataModel: {
          surfaceId: "main",
          value: { items: ["A"], record: { "": "Selected" } },
        },
      },
      {
        version,
        updateComponents: {
          surfaceId: "main",
          components: [button("/items/length")],
        },
      },
    ]);
    let renderer;
    await act(() => {
      renderer = TestRenderer.create(
        React.createElement(
          A2UIProvider,
          { engine },
          React.createElement(A2UISurface, { surfaceId: "main" }),
        ),
      );
    });
    try {
      await act(() => renderer.root.findByType("NativeButton").props.onPress());
      assert.deepEqual(actions, []);
      assert.equal(errors.at(-1).code, "INVALID_MESSAGE");
      await act(() =>
        engine.applyMessage({
          version,
          updateComponents: {
            surfaceId: "main",
            components: [button("/record/")],
          },
        }),
      );
      await act(() => renderer.root.findByType("NativeButton").props.onPress());
      assert.equal(actions.length, 1);
      assert.equal(actions[0].context.selected, "Selected");
    } finally {
      await act(() => renderer.unmount());
    }
  });
}
