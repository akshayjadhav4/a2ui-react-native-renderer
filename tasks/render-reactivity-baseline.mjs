import assert from "node:assert/strict";

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { z } from "zod";

import {
  A2UIChildListSchema,
  A2UIDynamicStringSchema,
  A2UISurface,
  createA2UIEngine,
  defineA2UICatalog,
} from "../lib/module/index.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const version = "v0.9.1";

async function measure(scenario) {
  const counts = new Map();
  const count = (componentId, scope) => {
    const key = `${componentId}@${scope.path}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  };
  const catalog = defineA2UICatalog({
    id: "urn:measurement:reactivity:v1",
    components: {
      Column: {
        schema: z.object({ children: A2UIChildListSchema }),
        presenter: ({ componentId, scope, props, renderChild }) => {
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
        schema: z.object({ value: A2UIDynamicStringSchema }),
        presenter: ({ componentId, scope, props }) => {
          count(componentId, scope);
          return React.createElement("NativeInput", {
            value: props.value,
            scopeValue: scope.value,
            onChangeText: props.setValue,
          });
        },
      },
    },
  });
  const engine = createA2UIEngine({ catalogs: [catalog] });
  engine.applyMessages([
    { version, createSurface: { surfaceId: "main", catalogId: catalog.id } },
    { version, updateDataModel: { surfaceId: "main", value: scenario.data } },
    {
      version,
      updateComponents: { surfaceId: "main", components: scenario.components },
    },
  ]);
  let renderer;
  await act(() => {
    renderer = TestRenderer.create(
      React.createElement(A2UISurface, { engine, surfaceId: "main" }),
    );
  });
  const initial = new Map(counts);
  const inputsBefore = renderer.root
    .findAllByType("NativeInput")
    .map((input) => input.props);
  await act(() => {
    if (scenario.localWrite) {
      renderer.root
        .findAllByType("NativeInput")[1]
        .props.onChangeText("Changed");
    } else {
      engine.applyMessage(scenario.update);
    }
  });
  const delta = [...counts].map(([key, value]) => [
    key,
    value - (initial.get(key) ?? 0),
  ]);
  const inputsAfter = renderer.root
    .findAllByType("NativeInput")
    .map((input) => input.props);
  assert.deepEqual(engine.getErrors(), []);
  if (scenario.name === "outside template scope") {
    assert.equal(engine.getSurface("main").dataModel.outside, "Changed");
  } else if (
    scenario.name === "scope value changes with unchanged bound prop"
  ) {
    assert.equal(inputsAfter[1].scopeValue.extra, "Changed");
    assert.equal(inputsAfter[1].value, "B");
  } else {
    const changedIndex =
      scenario.name === "root-scoped absolute siblings" ||
      scenario.name === "one child definition replacement"
        ? 0
        : 1;
    assert.equal(inputsAfter[changedIndex].value, "Changed");
  }
  const result = {
    scenario: scenario.name,
    initialPresenterCalls: [...initial.values()].reduce(
      (sum, value) => sum + value,
      0,
    ),
    updatePresenterCalls: delta.reduce((sum, [, value]) => sum + value, 0),
    updatedInstances: delta
      .filter(([, value]) => value > 0)
      .map(([key]) => key),
    stableInputScopeValues: inputsBefore.filter(
      (input, index) => input.scopeValue === inputsAfter[index]?.scopeValue,
    ).length,
  };
  await act(() => {
    renderer.unmount();
  });
  engine.dispose();
  return result;
}

const itemData = {
  items: [{ name: "A" }, { name: "B" }, { name: "C" }],
  outside: "Initial",
};
const template = [
  {
    id: "root",
    component: "Column",
    children: { componentId: "item", path: "/items" },
  },
  { id: "item", component: "Input", value: { path: "name" } },
];
const staticChildren = [
  { id: "root", component: "Column", children: ["left", "right"] },
  { id: "left", component: "Input", value: { path: "/left" } },
  { id: "right", component: "Input", value: { path: "/right" } },
];
const dataUpdate = (path, value) => ({
  version,
  updateDataModel: { surfaceId: "main", path, value },
});
const scenarios = [
  {
    name: "root-scoped absolute siblings",
    data: { left: "L", right: "R" },
    components: staticChildren,
    update: dataUpdate("/left", "Changed"),
  },
  {
    name: "one relative template item",
    data: itemData,
    components: template,
    update: dataUpdate("/items/1/name", "Changed"),
  },
  {
    name: "outside template scope",
    data: itemData,
    components: template,
    update: dataUpdate("/outside", "Changed"),
  },
  {
    name: "local template input write",
    data: itemData,
    components: template,
    localWrite: true,
  },
  {
    name: "scope value changes with unchanged bound prop",
    data: itemData,
    components: template,
    update: dataUpdate("/items/1/extra", "Changed"),
  },
  {
    name: "one child definition replacement",
    data: { left: "L", right: "R" },
    components: staticChildren,
    update: {
      version,
      updateComponents: {
        surfaceId: "main",
        components: [{ id: "left", component: "Input", value: "Changed" }],
      },
    },
  },
  {
    name: "499 template items, one edit",
    data: {
      items: Array.from({ length: 499 }, (_, index) => ({
        name: `Item ${index}`,
      })),
    },
    components: template,
    update: dataUpdate("/items/1/name", "Changed"),
  },
];

for (const scenario of scenarios) {
  const runs = [];
  for (let run = 0; run < 3; run += 1) runs.push(await measure(scenario));
  assert.deepEqual(runs[1], runs[0]);
  assert.deepEqual(runs[2], runs[0]);
  const result = runs[0];
  console.log(
    JSON.stringify({
      ...result,
      updatedInstances:
        result.updatedInstances.length > 10
          ? `${result.updatedInstances.length} instances`
          : result.updatedInstances,
      identicalRuns: runs.length,
    }),
  );
}
