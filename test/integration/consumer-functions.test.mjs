import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { z } from "zod";

import {
  A2UIActionSchema,
  A2UIDynamicStringSchema,
  A2UIProvider,
  A2UISurface,
  createA2UIEngine,
  defineA2UICatalog,
  defineA2UIFunction,
} from "../../lib/module/index.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function createFunctionCatalog(onLocalFunction = () => undefined) {
  return defineA2UICatalog({
    id: "urn:example:a2ui:consumer-functions:v1",
    components: {
      Text: {
        schema: z.object({ text: A2UIDynamicStringSchema }),
        presenter: ({ props }) =>
          React.createElement("NativeText", null, props.text),
      },
      Button: {
        schema: z.object({ label: z.string(), action: A2UIActionSchema }),
        presenter: ({ props, dispatch }) =>
          React.createElement(
            "NativeButton",
            { onPress: () => dispatch(props.action) },
            props.label,
          ),
      },
    },
    functions: [
      defineA2UIFunction({
        name: "uppercase",
        args: z.object({ value: z.string() }),
        returns: "string",
        execute: ({ value }) => value.toUpperCase(),
      }),
      defineA2UIFunction({
        name: "recordSelection",
        args: z.object({ value: z.string() }),
        returns: "unknown",
        execute: ({ value }) => onLocalFunction(value),
      }),
      defineA2UIFunction({
        name: "fail",
        args: z.object({}),
        returns: "unknown",
        execute: () => {
          throw new Error("consumer failure");
        },
      }),
    ],
  });
}

function applySurface(
  engine,
  catalog,
  components,
  dataModel,
  version = "v0.9",
) {
  engine.applyMessages([
    {
      version,
      createSurface: { surfaceId: "main", catalogId: catalog.id },
    },
    {
      version,
      updateDataModel: { surfaceId: "main", value: dataModel },
    },
    {
      version,
      updateComponents: { surfaceId: "main", components },
    },
  ]);
}

async function renderSurface(engine) {
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
  return renderer;
}

test("evaluates dynamic presenter functions against the latest data model", async () => {
  const catalog = createFunctionCatalog();
  const engine = createA2UIEngine({ catalogs: [catalog] });
  applySurface(
    engine,
    catalog,
    [
      {
        id: "root",
        component: "Text",
        text: {
          call: "uppercase",
          args: { value: { path: "/title" } },
          returnType: "string",
        },
      },
    ],
    { title: "first" },
  );
  const renderer = await renderSurface(engine);

  assert.deepEqual(renderer.toJSON().children, ["FIRST"]);

  await act(() => {
    engine.applyMessage({
      version: "v0.9",
      updateDataModel: { surfaceId: "main", path: "/title", value: "second" },
    });
  });

  assert.deepEqual(renderer.toJSON().children, ["SECOND"]);
});

test("resolves functions in event context before forwarding the action", async () => {
  const actions = [];
  const catalog = createFunctionCatalog();
  const engine = createA2UIEngine({
    catalogs: [catalog],
    onAction: (action) => actions.push(action),
  });
  applySurface(
    engine,
    catalog,
    [
      {
        id: "root",
        component: "Button",
        label: "Choose",
        action: {
          event: {
            name: "choose",
            context: {
              label: {
                call: "uppercase",
                args: { value: { path: "/selected" } },
                returnType: "string",
              },
            },
          },
        },
      },
    ],
    { selected: "apple" },
  );
  const renderer = await renderSurface(engine);

  await act(async () => {
    renderer.root.findByType("NativeButton").props.onPress();
    await Promise.resolve();
  });

  assert.equal(actions.length, 1);
  assert.equal(actions[0].context.label, "APPLE");
});

test("executes local function actions once without forwarding a user action", async () => {
  const localCalls = [];
  const actions = [];
  const catalog = createFunctionCatalog((value) => localCalls.push(value));
  const engine = createA2UIEngine({
    catalogs: [catalog],
    onAction: (action) => actions.push(action),
  });
  applySurface(
    engine,
    catalog,
    [
      {
        id: "root",
        component: "Button",
        label: "Record",
        action: {
          functionCall: {
            call: "recordSelection",
            args: { value: { path: "/selected" } },
            returnType: "any",
          },
        },
      },
    ],
    { selected: "banana" },
  );
  const renderer = await renderSurface(engine);

  await act(() => {
    renderer.root.findByType("NativeButton").props.onPress();
  });

  assert.deepEqual(localCalls, ["banana"]);
  assert.deepEqual(actions, []);
});

test("contains unknown presenter functions as structured renderer errors", async () => {
  const errors = [];
  const catalog = createFunctionCatalog();
  const engine = createA2UIEngine({
    catalogs: [catalog],
    onError: (error) => errors.push(error),
  });
  applySurface(
    engine,
    catalog,
    [
      {
        id: "root",
        component: "Text",
        text: { call: "missing", args: {}, returnType: "string" },
      },
    ],
    {},
  );
  const renderer = await renderSurface(engine);

  assert.equal(renderer.toJSON(), null);
  assert.equal(errors.at(-1).code, "FUNCTION_ERROR");
  assert.equal(errors.at(-1).surfaceId, "main");
  assert.equal(errors.at(-1).componentId, "root");
});

test("contains failing local function actions as structured renderer errors", async () => {
  const errors = [];
  const catalog = createFunctionCatalog();
  const engine = createA2UIEngine({
    catalogs: [catalog],
    onError: (error) => errors.push(error),
  });
  applySurface(
    engine,
    catalog,
    [
      {
        id: "root",
        component: "Button",
        label: "Fail",
        action: {
          functionCall: { call: "fail", args: {}, returnType: "any" },
        },
      },
    ],
    {},
  );
  const renderer = await renderSurface(engine);

  await act(() => {
    renderer.root.findByType("NativeButton").props.onPress();
  });

  assert.equal(errors.at(-1).code, "FUNCTION_ERROR");
  assert.equal(errors.at(-1).surfaceId, "main");
  assert.equal(errors.at(-1).componentId, "root");
});

for (const version of ["v0.9", "v0.9.1"]) {
  test(`${version} function actions reject invalid array arguments and recover with empty-name fields`, async () => {
    const calls = [];
    const actions = [];
    const errors = [];
    const catalog = createFunctionCatalog((value) => calls.push(value));
    const engine = createA2UIEngine({
      catalogs: [catalog],
      onAction: (action) => actions.push(action),
      onError: (error) => errors.push(error),
    });
    const button = (path) => ({
      id: "root",
      component: "Button",
      label: "Record",
      action: {
        functionCall: {
          call: "recordSelection",
          args: { value: { path } },
          returnType: "any",
        },
      },
    });
    applySurface(
      engine,
      catalog,
      [button("/items/length")],
      { items: ["A"], record: { "": "Chosen" } },
      version,
    );
    const renderer = await renderSurface(engine);
    try {
      await act(() => renderer.root.findByType("NativeButton").props.onPress());
      assert.deepEqual(calls, []);
      assert.deepEqual(actions, []);
      // Pointer failures retain the existing dispatch-level error category.
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
      assert.deepEqual(calls, ["Chosen"]);
      assert.deepEqual(actions, []);
    } finally {
      await act(() => renderer.unmount());
    }
  });
}
