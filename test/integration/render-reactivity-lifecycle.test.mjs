import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { act } from "react-test-renderer";
import { z } from "zod";
import {
  A2UIComponentIdSchema,
  A2UIDynamicStringSchema,
  A2UISurface,
} from "../../lib/module/index.js";
import { fixture, initialData, template } from "./helpers/reactivity.mjs";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const replace = async (f, components) => {
  await act(() => {
    f.engine.applyMessage({
      version: f.version,
      updateComponents: { surfaceId: "main", components },
    });
  });
};

test("template append, removal, reorder, and root replacement retain positional scope writes", async () => {
  const f = await fixture();
  await f.update("/items", [...initialData().items, { name: "D" }]);
  assert.deepEqual(
    f.inputs().map((node) => node.props.value),
    ["A", "B", "C", "D"],
  );
  await f.update("/items", [{ name: "D" }, { name: "A" }]);
  assert.deepEqual(
    f.inputs().map((node) => node.props.scope.path),
    ["/items/0", "/items/1"],
  );
  assert.deepEqual(
    f.inputs().map((node) => node.props.value),
    ["D", "A"],
  );
  await f.update("/", {
    items: [{ name: "X" }, { name: "Y" }],
    outside: "Replaced",
  });
  await act(() => {
    f.inputs()[1].props.onChangeText("Current position");
  });
  assert.deepEqual(f.engine.getSurface("main").dataModel.items, [
    { name: "X" },
    { name: "Current position" },
  ]);
  assert.deepEqual(f.engine.getErrors(), []);
  await f.close();
});

test("component replacement and rebind invalidate saved setters including nested bindings", async () => {
  const Nested = {
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
  };
  const item = {
    id: "item",
    component: "Nested",
    rows: [{ value: { path: "name" } }],
  };
  const f = await fixture({
    definitions: { Nested },
    components: [template[0], item],
  });
  const old = f.inputs()[1].props.onChangeText;
  await f.update("/outside", "Changed");
  assert.strictEqual(f.inputs()[1].props.onChangeText, old);
  await replace(f, [item]);
  const current = f.inputs()[1].props.onChangeText;
  assert.notStrictEqual(current, old);
  await act(() => {
    old("Stale");
  });
  assert.equal(f.engine.getSurface("main").dataModel.items[1].name, "B");
  assert.equal(f.engine.getErrors().at(-1).code, "BINDING_ERROR");
  await replace(f, [{ ...item, rows: [{ value: { path: "other" } }] }]);
  await act(() => {
    current("Stale rebind");
    f.inputs()[1].props.onChangeText("New pointer");
  });
  assert.equal(
    f.engine.getSurface("main").dataModel.items[1].other,
    "New pointer",
  );
  assert.equal(f.engine.getSurface("main").dataModel.items[1].name, "B");
  await f.close();
});

test("late child arrival and type replacement work beneath a preserved parent", async () => {
  const Label = {
    schema: z.object({ value: z.string() }),
    presenter: ({ props }) =>
      React.createElement("NativeLabel", null, props.value),
  };
  const f = await fixture({
    definitions: { Label },
    data: {},
    components: [
      { id: "root", component: "Column", children: ["late", "ready"] },
      { id: "ready", component: "Input", value: "Ready" },
    ],
  });
  await replace(f, [{ id: "late", component: "Input", value: "Arrived" }]);
  assert.equal(f.calls.get("root@/"), 1);
  assert.deepEqual(
    f.inputs().map((node) => node.props.value),
    ["Arrived", "Ready"],
  );
  await replace(f, [{ id: "late", component: "Label", value: "New type" }]);
  assert.equal(f.calls.get("root@/"), 1);
  assert.deepEqual(f.renderer.root.findByType("NativeLabel").children, [
    "New type",
  ]);
  assert.deepEqual(f.engine.getErrors(), []);
  await f.close();
});

test("saved child service observes updates made before the child is mounted", async () => {
  let saved;
  let parentCalls = 0;
  const Deferred = {
    schema: z.object({ child: A2UIComponentIdSchema }),
    presenter: function Deferred({ props, renderChild }) {
      parentCalls++;
      saved ??= renderChild;
      const [show, setShow] = React.useState(false);
      return React.createElement(
        "NativeDeferred",
        { show: () => setShow(true) },
        show ? saved(props.child) : null,
      );
    },
  };
  const f = await fixture({
    definitions: { Deferred },
    data: {},
    components: [
      { id: "root", component: "Deferred", child: "child" },
      { id: "child", component: "Input", value: "Old" },
    ],
  });
  await replace(f, [{ id: "child", component: "Input", value: "Latest" }]);
  assert.equal(parentCalls, 1);
  await act(() => {
    f.renderer.root.findByType("NativeDeferred").props.show();
  });
  assert.equal(f.inputs()[0].props.value, "Latest");
  await f.close();
});

test("delete and recreate in a batch invalidate old setters", async () => {
  const f = await fixture();
  const old = f.inputs()[1].props.onChangeText;
  await act(() => {
    f.engine.applyMessages([
      { version: f.version, deleteSurface: { surfaceId: "main" } },
      {
        version: f.version,
        createSurface: { surfaceId: "main", catalogId: f.catalog.id },
      },
      {
        version: f.version,
        updateDataModel: { surfaceId: "main", value: initialData() },
      },
      {
        version: f.version,
        updateComponents: { surfaceId: "main", components: template },
      },
    ]);
  });
  await act(() => {
    old("Retired");
  });
  assert.equal(f.engine.getSurface("main").dataModel.items[1].name, "B");
  assert.equal(f.engine.getErrors().at(-1).code, "BINDING_ERROR");
  await f.close();
});

test("batched recreation recovers presenter errors even when the surface revision repeats", async () => {
  let fail = true;
  const Recovering = {
    schema: z.object({}),
    presenter: () => {
      if (fail) throw new Error("Retired failure");
      return React.createElement("NativeRecovered");
    },
  };
  const components = [template[0], { id: "item", component: "Recovering" }];
  const f = await fixture({ definitions: { Recovering }, components });
  const revision = f.engine.getSurface("main").revision;
  fail = false;
  await act(() => {
    f.engine.applyMessages([
      { version: f.version, deleteSurface: { surfaceId: "main" } },
      {
        version: f.version,
        createSurface: { surfaceId: "main", catalogId: f.catalog.id },
      },
      {
        version: f.version,
        updateDataModel: { surfaceId: "main", value: initialData() },
      },
      {
        version: f.version,
        updateComponents: { surfaceId: "main", components },
      },
    ]);
  });
  assert.equal(f.engine.getSurface("main").revision, revision);
  assert.equal(f.renderer.root.findAllByType("NativeRecovered").length, 3);
  await f.close();
});

test("source switches release node subscriptions and preserve only current surface content", async () => {
  const first = await fixture();
  const second = await fixture({
    data: { items: [{ name: "Second engine" }] },
  });
  await act(() => {
    second.renderer.unmount();
  });
  const active = [0, 0];
  const track = (engine, index) => ({
    ...engine,
    subscribeSurface: (id, listener) => {
      active[index]++;
      const unsubscribe = engine.subscribeSurface(id, listener);
      return () => {
        active[index]--;
        unsubscribe();
      };
    },
  });
  const a = track(first.engine, 0);
  const b = track(second.engine, 1);
  await act(() => {
    first.renderer.update(
      React.createElement(A2UISurface, { engine: a, surfaceId: "main" }),
    );
  });
  assert.ok(active[0] > 0);
  await act(() => {
    first.renderer.update(
      React.createElement(A2UISurface, { engine: b, surfaceId: "main" }),
    );
  });
  assert.equal(active[0], 0);
  assert.ok(active[1] > 0);
  await first.update("/items/0/name", "Old source changed");
  assert.equal(first.inputs()[0].props.value, "Second engine");
  await act(() => {
    first.renderer.update(
      React.createElement(A2UISurface, { engine: b, surfaceId: "absent" }),
    );
  });
  assert.equal(first.renderer.toJSON(), null);
  await first.close();
  assert.deepEqual(active, [0, 0]);
  second.engine.dispose();
});
