import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { z } from "zod";
import {
  A2UIActionSchema,
  A2UIChildListSchema,
  A2UIDynamicStringSchema,
  A2UIProvider,
  A2UIRenderer,
  A2UISurface,
  createA2UIEngine,
  defineA2UICatalog,
} from "../../lib/module/index.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const template = [
  {
    id: "root",
    component: "Column",
    children: { componentId: "item", path: "/items" },
  },
  { id: "item", component: "Input", value: { path: "name" } },
];
const initialData = () => ({
  items: [{ name: "A" }, { name: "B" }, { name: "C" }],
  outside: "Initial",
});

async function fixture({
  version = "v0.9.1",
  mode = "direct",
  data = initialData(),
  components = template,
  definitions = {},
  functions = [],
  onAction,
} = {}) {
  const calls = new Map();
  const count = (id, scope) => {
    const key = `${id}@${scope.path}`;
    calls.set(key, (calls.get(key) ?? 0) + 1);
  };
  const catalog = defineA2UICatalog({
    id: "urn:reactivity:test:v1",
    functions,
    components: {
      Column: {
        schema: z.object({ children: A2UIChildListSchema }),
        presenter: ({ props, renderChild, componentId, scope }) => {
          count(componentId, scope);
          return React.createElement(
            "NativeColumn",
            null,
            props.children.map((child) =>
              renderChild(child.id, child.basePath),
            ),
          );
        },
      },
      Input: {
        schema: z.object({
          value: A2UIDynamicStringSchema,
          action: A2UIActionSchema.optional(),
        }),
        presenter: ({ props, scope, componentId, dispatch }) => {
          count(componentId, scope);
          return React.createElement("NativeInput", {
            value: props.value,
            scope,
            onChangeText: props.setValue,
            onPress: () => dispatch(props.action),
          });
        },
      },
      ...definitions,
    },
  });
  const engine = createA2UIEngine({ catalogs: [catalog], onAction });
  engine.applyMessages([
    { version, createSurface: { surfaceId: "main", catalogId: catalog.id } },
    { version, updateDataModel: { surfaceId: "main", value: data } },
    { version, updateComponents: { surfaceId: "main", components } },
  ]);
  let renderer;
  await act(() => {
    const surface = React.createElement(A2UISurface, {
      surfaceId: "main",
      ...(mode === "direct" ? { engine } : {}),
    });
    renderer = TestRenderer.create(
      mode === "convenience"
        ? React.createElement(A2UIRenderer, { engine })
        : mode === "provider"
          ? React.createElement(A2UIProvider, { engine }, surface)
          : surface,
    );
  });
  const initialCalls = new Map(calls);
  return {
    engine,
    renderer,
    calls,
    catalog,
    version,
    inputs: () => renderer.root.findAllByType("NativeInput"),
    delta: () =>
      [...calls].reduce(
        (sum, [key, value]) => sum + value - (initialCalls.get(key) ?? 0),
        0,
      ),
    update: async (path, value) => {
      await act(() => {
        engine.applyMessage({
          version,
          updateDataModel: { surfaceId: "main", path, value },
        });
      });
    },
    close: async () => {
      await act(() => {
        renderer.unmount();
      });
      engine.dispose();
    },
  };
}

for (const version of ["v0.9", "v0.9.1"])
  for (const mode of ["direct", "provider", "convenience"]) {
    test(`one item edit preserves peers with ${version} ${mode}`, async () => {
      const f = await fixture({ version, mode });
      const setters = f.inputs().map((input) => input.props.onChangeText);
      await f.update("/items/1/name", "Changed");
      assert.equal(f.delta(), 2);
      assert.deepEqual(
        f.inputs().map((input) => input.props.value),
        ["A", "Changed", "C"],
      );
      assert.equal(f.calls.get("item@/items/0"), 1);
      assert.equal(f.calls.get("item@/items/2"), 1);
      f.inputs().forEach((input, index) =>
        assert.strictEqual(input.props.onChangeText, setters[index]),
      );
      assert.deepEqual(f.engine.getErrors(), []);
      await f.close();
    });
  }

test("outside scope updates preserve all item presenters", async () => {
  const f = await fixture();
  await f.update("/outside", "Changed");
  assert.equal(f.delta(), 1);
  assert.deepEqual(
    f.inputs().map((input) => input.props.value),
    ["A", "B", "C"],
  );
  await f.close();
});

test("local setters and scope-only updates invalidate only their item", async () => {
  const f = await fixture();
  await act(() => {
    f.inputs()[1].props.onChangeText("Changed");
  });
  assert.equal(f.delta(), 2);
  assert.equal(f.engine.getSurface("main").dataModel.items[1].name, "Changed");
  await f.update("/items/1/extra", "Scope changed");
  assert.equal(f.delta(), 4);
  assert.equal(f.inputs()[1].props.scope.value.extra, "Scope changed");
  assert.equal(f.calls.get("item@/items/0"), 1);
  await f.close();
});

test("one component replacement reaches a child under a preserved parent", async () => {
  const f = await fixture({
    data: { left: "L", right: "R" },
    components: [
      { id: "root", component: "Column", children: ["left", "right"] },
      { id: "left", component: "Input", value: { path: "/left" } },
      { id: "right", component: "Input", value: { path: "/right" } },
    ],
  });
  await act(() => {
    f.engine.applyMessage({
      version: f.version,
      updateComponents: {
        surfaceId: "main",
        components: [{ id: "left", component: "Input", value: "Changed" }],
      },
    });
  });
  assert.equal(f.delta(), 1);
  assert.deepEqual(
    f.inputs().map((input) => input.props.value),
    ["Changed", "R"],
  );
  await f.close();
});

test("499 item edit invokes only the root and changed presenter", async () => {
  const f = await fixture({
    data: {
      items: Array.from({ length: 499 }, (_, index) => ({
        name: `Item ${index}`,
      })),
    },
  });
  assert.equal(f.inputs().length, 499);
  await f.update("/items/1/name", "Changed");
  assert.equal(f.delta(), 2);
  assert.equal(f.inputs()[1].props.value, "Changed");
  assert.deepEqual(f.engine.getErrors(), []);
  await f.close();
});
