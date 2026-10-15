import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { act } from "react-test-renderer";
import { z } from "zod";
import { A2UISurface, defineA2UIFunction } from "../../lib/module/index.js";
import { fixture, initialData, template } from "./helpers/reactivity.mjs";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

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

test("root scopes and external absolute bindings stay observable", async () => {
  const root = await fixture({
    data: { left: "L", right: "R" },
    components: [
      { id: "root", component: "Column", children: ["left", "right"] },
      { id: "left", component: "Input", value: { path: "/left" } },
      { id: "right", component: "Input", value: { path: "/right" } },
    ],
  });
  await root.update("/left", "Changed");
  assert.equal(root.delta(), 3);
  assert.equal(root.inputs()[1].props.scope.value.left, "Changed");
  await root.close();

  const absolute = await fixture({
    data: { ...initialData(), shared: "Shared" },
    components: [
      template[0],
      { id: "item", component: "Input", value: { path: "/shared" } },
    ],
  });
  await absolute.update("/shared", "Changed");
  assert.equal(absolute.delta(), 4);
  assert.deepEqual(
    absolute.inputs().map((input) => input.props.value),
    ["Changed", "Changed", "Changed"],
  );
  await absolute.close();
});

test("escaped relative bindings preserve unaffected item scopes", async () => {
  const f = await fixture({
    data: { items: [{ "a/b": { name: "A" } }, { "a/b": { name: "B" } }] },
    components: [
      template[0],
      { id: "item", component: "Input", value: { path: "a~1b/name" } },
    ],
  });
  await f.update("/items/1/a~1b/name", "Changed");
  assert.equal(f.delta(), 2);
  assert.deepEqual(
    f.inputs().map((input) => input.props.value),
    ["A", "Changed"],
  );
  await f.close();
});

test("function results reevaluate and recover even with unchanged arguments and item scopes", async () => {
  let result = "First";
  let evaluations = 0;
  const label = defineA2UIFunction({
    name: "label",
    args: z.object({}),
    returns: "string",
    execute: () => {
      evaluations++;
      if (result === "fail") throw new Error("Temporary failure");
      return result;
    },
  });
  const f = await fixture({
    functions: [label],
    components: [
      template[0],
      {
        id: "item",
        component: "Input",
        value: { call: "label", returnType: "string" },
      },
    ],
  });
  assert.equal(evaluations, 3);
  result = "Second";
  await f.update("/outside", "Change 1");
  assert.equal(evaluations, 6);
  assert.deepEqual(
    f.inputs().map((input) => input.props.value),
    ["Second", "Second", "Second"],
  );
  result = "fail";
  await f.update("/outside", "Change 2");
  assert.equal(evaluations, 9);
  assert.equal(f.inputs().length, 0);
  assert.equal(f.engine.getErrors().at(-1).code, "FUNCTION_ERROR");
  result = "Recovered";
  await f.update("/outside", "Change 3");
  assert.equal(evaluations, 12);
  assert.deepEqual(
    f.inputs().map((input) => input.props.value),
    ["Recovered", "Recovered", "Recovered"],
  );
  await f.close();
});

test("binding errors recover while healthy item presenters stay preserved", async () => {
  const f = await fixture();
  await f.update("/items/1/name", 42);
  assert.equal(f.inputs().length, 2);
  assert.equal(f.engine.getErrors().at(-1).code, "BINDING_ERROR");
  assert.equal(f.calls.get("item@/items/0"), 1);
  await f.update("/items/1/name", "Recovered");
  assert.deepEqual(
    f.inputs().map((input) => input.props.value),
    ["A", "Recovered", "C"],
  );
  assert.equal(f.calls.get("item@/items/0"), 1);
  await f.close();
});

test("saved action callbacks use current model context after a presenter skip", async () => {
  const actions = [];
  const f = await fixture({
    onAction: (action) => actions.push(action),
    components: [
      template[0],
      {
        ...template[1],
        action: {
          event: {
            name: "choose",
            context: { name: { path: "name" }, outside: { path: "/outside" } },
          },
        },
      },
    ],
  });
  const press = f.inputs()[1].props.onPress;
  await f.update("/outside", "Latest");
  assert.strictEqual(f.inputs()[1].props.onPress, press);
  await act(async () => {
    press();
  });
  assert.deepEqual(actions[0].context, { name: "B", outside: "Latest" });
  await f.close();
});

test("presenter local state and app context update through the memoized host", async () => {
  const Theme = React.createContext("default");
  let presenterCalls = 0;
  const Counter = {
    schema: z.object({}),
    presenter: function Counter() {
      presenterCalls++;
      const theme = React.useContext(Theme);
      const [value, setValue] = React.useState(0);
      return React.createElement(
        "NativeCounter",
        { onPress: () => setValue((n) => n + 1) },
        `${theme}:${value}`,
      );
    },
  };
  const f = await fixture({
    definitions: { Counter },
    components: [template[0], { id: "item", component: "Counter" }],
    wrap: (element) =>
      React.createElement(Theme.Provider, { value: "light" }, element),
  });
  assert.equal(presenterCalls, 3);
  await f.update("/outside", "Changed");
  assert.equal(presenterCalls, 3);
  await act(() => {
    f.renderer.root.findAllByType("NativeCounter")[0].props.onPress();
  });
  assert.equal(presenterCalls, 4);
  await act(() => {
    f.renderer.update(
      React.createElement(
        Theme.Provider,
        { value: "dark" },
        React.createElement(A2UISurface, {
          engine: f.engine,
          surfaceId: "main",
        }),
      ),
    );
  });
  assert.equal(presenterCalls, 7);
  assert.deepEqual(
    f.renderer.root
      .findAllByType("NativeCounter")
      .map((node) => node.children[0]),
    ["dark:1", "dark:0", "dark:0"],
  );
  await act(() => {
    f.engine.applyMessage({
      version: f.version,
      updateComponents: {
        surfaceId: "main",
        components: [{ id: "item", component: "Counter" }],
      },
    });
  });
  assert.deepEqual(
    f.renderer.root
      .findAllByType("NativeCounter")
      .map((node) => node.children[0]),
    ["dark:1", "dark:0", "dark:0"],
  );
  await f.close();
});

test("presenter boundaries retry on accepted updates even when protocol props are unchanged", async () => {
  let fail = true;
  const Recovering = {
    schema: z.object({}),
    presenter: () => {
      if (fail) throw new Error("Temporary presenter failure");
      return React.createElement("NativeRecovered", null, "Ready");
    },
  };
  const f = await fixture({
    definitions: { Recovering },
    components: [template[0], { id: "item", component: "Recovering" }],
  });
  assert.equal(f.renderer.root.findAllByType("NativeRecovered").length, 0);
  assert.equal(f.engine.getErrors().at(-1).code, "PRESENTER_ERROR");
  fail = false;
  await f.update("/outside", "Retry");
  assert.equal(f.renderer.root.findAllByType("NativeRecovered").length, 3);
  await f.close();
});
