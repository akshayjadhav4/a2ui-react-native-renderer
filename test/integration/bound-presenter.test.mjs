import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { z } from "zod";

import {
  A2UIChildListSchema,
  A2UIDynamicStringSchema,
  A2UIProvider,
  A2UISurface,
  createA2UIEngine,
  defineA2UICatalog,
  defineA2UIFunction,
} from "../../lib/module/index.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const catalog = defineA2UICatalog({
  id: "urn:example:a2ui:bound-presenter:v1",
  components: {
    Text: {
      schema: z.object({ text: A2UIDynamicStringSchema }),
      presenter: ({ props, scope }) =>
        React.createElement("NativeText", { scope }, props.text ?? "missing"),
    },
    Input: {
      schema: z.object({ value: A2UIDynamicStringSchema }),
      presenter: ({ props, scope }) =>
        React.createElement("NativeInput", {
          value: props.value,
          scope,
          onChangeText: props.setValue,
        }),
    },
    NestedInputs: {
      schema: z.object({
        rows: z.array(z.object({ value: A2UIDynamicStringSchema })),
      }),
      presenter: ({ props }) =>
        React.createElement(
          "NativeColumn",
          null,
          props.rows.map((row, index) =>
            React.createElement("NativeInput", {
              key: index,
              value: row.value,
              onChangeText: row.setValue,
            }),
          ),
        ),
    },
    Column: {
      schema: z.object({ children: A2UIChildListSchema }),
      presenter: ({ props, renderChild }) =>
        React.createElement(
          "NativeColumn",
          null,
          props.children.map((child) => renderChild(child.id, child.basePath)),
        ),
    },
  },
  functions: [
    defineA2UIFunction({
      name: "fixedLabel",
      args: z.object({}),
      returns: "string",
      execute: () => "From function",
    }),
    defineA2UIFunction({
      name: "numericLabel",
      args: z.object({}),
      returns: "number",
      execute: () => 42,
    }),
  ],
});

function createEngineWithSurface(components, dataModel, onError) {
  const engine = createA2UIEngine({ catalogs: [catalog], onError });
  engine.applyMessages([
    {
      version: "v0.9",
      createSurface: { surfaceId: "main", catalogId: catalog.id },
    },
    {
      version: "v0.9",
      updateDataModel: { surfaceId: "main", value: dataModel },
    },
    {
      version: "v0.9",
      updateComponents: { surfaceId: "main", components },
    },
  ]);
  return engine;
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

test("resolves absolute bindings and reacts to updates and deletes", async () => {
  const engine = createEngineWithSurface(
    [{ id: "root", component: "Text", text: { path: "/title" } }],
    { title: "First" },
  );
  const renderer = await renderSurface(engine);

  assert.deepEqual(renderer.toJSON().children, ["First"]);

  await act(() => {
    engine.applyMessage({
      version: "v0.9",
      updateDataModel: { surfaceId: "main", path: "/title", value: "Second" },
    });
  });
  assert.deepEqual(renderer.toJSON().children, ["Second"]);

  await act(() => {
    engine.applyMessage({
      version: "v0.9",
      updateDataModel: { surfaceId: "main", path: "/title" },
    });
  });
  assert.deepEqual(renderer.toJSON().children, ["missing"]);
});

test("resolves escaped bindings", async () => {
  const engine = createEngineWithSurface(
    [{ id: "root", component: "Text", text: { path: "/a~1b/m~0n" } }],
    { "a/b": { "m~n": "escaped" } },
  );
  const renderer = await renderSurface(engine);

  assert.deepEqual(renderer.toJSON().children, ["escaped"]);
});

test("renders structural templates with relative item scopes", async () => {
  const engine = createEngineWithSurface(
    [
      {
        id: "root",
        component: "Column",
        children: { componentId: "item", path: "/items" },
      },
      { id: "item", component: "Text", text: { path: "name" } },
    ],
    { items: [{ name: "Apple" }, { name: "Banana" }] },
  );
  const renderer = await renderSurface(engine);
  const texts = renderer.root.findAllByType("NativeText");

  assert.deepEqual(
    texts.map((text) => text.children[0]),
    ["Apple", "Banana"],
  );
  assert.deepEqual(
    texts.map((text) => text.props.scope),
    [
      { path: "/items/0", value: { name: "Apple" } },
      { path: "/items/1", value: { name: "Banana" } },
    ],
  );
});

test("writes through a relative two-way binding", async () => {
  const engine = createEngineWithSurface(
    [
      {
        id: "root",
        component: "Column",
        children: { componentId: "item", path: "/items" },
      },
      { id: "item", component: "Input", value: { path: "name" } },
    ],
    { items: [{ name: "Apple" }, { name: "Banana" }] },
  );
  const renderer = await renderSurface(engine);
  const inputs = renderer.root.findAllByType("NativeInput");

  await act(() => {
    inputs[1].props.onChangeText("Mango");
  });

  assert.deepEqual(engine.getSurface("main").dataModel, {
    items: [{ name: "Apple" }, { name: "Mango" }],
  });
  assert.equal(
    renderer.root.findAllByType("NativeInput")[1].props.value,
    "Mango",
  );
});

test("only direct bindings expose an input setter", async () => {
  const literalEngine = createEngineWithSurface(
    [{ id: "root", component: "Input", value: "Fixed" }],
    {},
  );
  const literalRenderer = await renderSurface(literalEngine);
  const literalInput = literalRenderer.root.findByType("NativeInput");
  assert.equal(literalInput.props.value, "Fixed");
  assert.equal(literalInput.props.onChangeText, undefined);

  const functionEngine = createEngineWithSurface(
    [
      {
        id: "root",
        component: "Input",
        value: { call: "fixedLabel", returnType: "string" },
      },
    ],
    {},
  );
  const functionRenderer = await renderSurface(functionEngine);
  const functionInput = functionRenderer.root.findByType("NativeInput");
  assert.equal(functionInput.props.value, "From function");
  assert.equal(functionInput.props.onChangeText, undefined);

  const boundEngine = createEngineWithSurface(
    [{ id: "root", component: "Input", value: { path: "/name" } }],
    {},
  );
  const boundRenderer = await renderSurface(boundEngine);
  const boundInput = boundRenderer.root.findByType("NativeInput");
  assert.equal(boundInput.props.value, undefined);
  assert.equal(typeof boundInput.props.onChangeText, "function");

  await act(() => boundInput.props.onChangeText("Created"));
  assert.deepEqual(boundEngine.getSurface("main").dataModel, {
    name: "Created",
  });
});

test("contains wrong-type bound reads and recovers after corrected data", async () => {
  const errors = [];
  const engine = createEngineWithSurface(
    [{ id: "root", component: "Input", value: { path: "/name" } }],
    { name: 42 },
    (error) => errors.push(error),
  );
  const renderer = await renderSurface(engine);

  assert.equal(renderer.toJSON(), null);
  assert.equal(errors.at(-1)?.code, "BINDING_ERROR");
  assert.equal(errors.at(-1)?.componentId, "root");

  await act(() => {
    engine.applyMessage({
      version: "v0.9",
      updateDataModel: { surfaceId: "main", path: "/name", value: "Ready" },
    });
  });

  assert.equal(renderer.root.findByType("NativeInput").props.value, "Ready");
});

test("contains a function result with the wrong dynamic field type", async () => {
  const errors = [];
  const engine = createEngineWithSurface(
    [
      {
        id: "root",
        component: "Input",
        value: { call: "numericLabel", returnType: "string" },
      },
    ],
    {},
    (error) => errors.push(error),
  );
  const renderer = await renderSurface(engine);

  assert.equal(renderer.toJSON(), null);
  assert.equal(errors.at(-1)?.code, "FUNCTION_ERROR");
  assert.equal(errors.at(-1)?.componentId, "root");
});

test("rejects invalid setter values without changing the surface", async () => {
  const errors = [];
  const engine = createEngineWithSurface(
    [{ id: "root", component: "Input", value: { path: "/name" } }],
    { name: "Before" },
    (error) => errors.push(error),
  );
  const renderer = await renderSurface(engine);
  const setter = renderer.root.findByType("NativeInput").props.onChangeText;
  const before = engine.getSurface("main");

  await act(() => setter(42));

  assert.strictEqual(engine.getSurface("main"), before);
  assert.equal(errors.at(-1)?.code, "BINDING_ERROR");
  assert.equal(errors.at(-1)?.componentId, "root");

  await act(() => {
    setter("First");
    setter("Second");
  });
  assert.deepEqual(engine.getSurface("main").dataModel, { name: "Second" });
});

test("saved setters cannot write after rebind or surface deletion", async () => {
  const errors = [];
  const engine = createEngineWithSurface(
    [{ id: "root", component: "Input", value: { path: "/name" } }],
    { name: "Before", other: "Other" },
    (error) => errors.push(error),
  );
  const renderer = await renderSurface(engine);
  const savedSetter =
    renderer.root.findByType("NativeInput").props.onChangeText;

  await act(() => {
    engine.applyMessage({
      version: "v0.9",
      updateComponents: {
        surfaceId: "main",
        components: [
          { id: "root", component: "Input", value: { path: "/other" } },
        ],
      },
    });
  });
  const rebound = engine.getSurface("main");

  await act(() => savedSetter("Stale"));
  assert.strictEqual(engine.getSurface("main"), rebound);
  assert.deepEqual(rebound.dataModel, { name: "Before", other: "Other" });
  assert.equal(errors.at(-1)?.code, "BINDING_ERROR");

  await act(() => {
    renderer.root.findByType("NativeInput").props.onChangeText("Current");
  });
  assert.deepEqual(engine.getSurface("main").dataModel, {
    name: "Before",
    other: "Current",
  });

  await act(() => {
    engine.applyMessage({
      version: "v0.9",
      deleteSurface: { surfaceId: "main" },
    });
  });
  await act(() => savedSetter("Deleted"));
  assert.equal(engine.getSurface("main"), undefined);
  assert.equal(errors.at(-1)?.code, "BINDING_ERROR");
});

test("nested setter paths stay bound to their own array item", async () => {
  const engine = createEngineWithSurface(
    [
      {
        id: "root",
        component: "NestedInputs",
        rows: [
          { value: { path: "/names/0" } },
          { value: { path: "/names/1" } },
        ],
      },
    ],
    { names: ["A", "B"] },
  );
  const renderer = await renderSurface(engine);
  const inputs = renderer.root.findAllByType("NativeInput");

  await act(() => inputs[1].props.onChangeText("Changed"));
  assert.deepEqual(engine.getSurface("main").dataModel, {
    names: ["A", "Changed"],
  });
});

test("a local write notifies only its bound surface", async () => {
  const engine = createEngineWithSurface(
    [{ id: "root", component: "Input", value: { path: "/name" } }],
    { name: "Main" },
  );
  engine.applyMessages([
    {
      version: "v0.9",
      createSurface: { surfaceId: "other", catalogId: catalog.id },
    },
    {
      version: "v0.9",
      updateDataModel: { surfaceId: "other", value: { name: "Other" } },
    },
    {
      version: "v0.9",
      updateComponents: {
        surfaceId: "other",
        components: [
          { id: "root", component: "Input", value: { path: "/name" } },
        ],
      },
    },
  ]);
  const otherBefore = engine.getSurface("other");
  let mainNotifications = 0;
  let otherNotifications = 0;
  engine.subscribeSurface("main", () => mainNotifications++);
  engine.subscribeSurface("other", () => otherNotifications++);
  const renderer = await renderSurface(engine);

  await act(() => {
    renderer.root.findByType("NativeInput").props.onChangeText("Updated");
  });

  assert.equal(mainNotifications, 1);
  assert.equal(otherNotifications, 0);
  assert.strictEqual(engine.getSurface("other"), otherBefore);
  assert.deepEqual(engine.getSurface("main").dataModel, { name: "Updated" });
});
