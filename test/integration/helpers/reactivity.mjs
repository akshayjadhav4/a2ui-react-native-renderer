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
} from "../../../lib/module/index.js";

export const template = [
  {
    id: "root",
    component: "Column",
    children: { componentId: "item", path: "/items" },
  },
  { id: "item", component: "Input", value: { path: "name" } },
];
export const initialData = () => ({
  items: [{ name: "A" }, { name: "B" }, { name: "C" }],
  outside: "Initial",
});

export async function fixture({
  version = "v0.9.1",
  mode = "direct",
  data = initialData(),
  components = template,
  definitions = {},
  functions = [],
  onAction,
  wrap = (element) => element,
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
      wrap(
        mode === "convenience"
          ? React.createElement(A2UIRenderer, { engine })
          : mode === "provider"
            ? React.createElement(A2UIProvider, { engine }, surface)
            : surface,
      ),
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
