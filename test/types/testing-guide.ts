/// <reference types="node" />
import assert from "node:assert/strict";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { z } from "zod";
import {
  A2UIActionSchema,
  A2UIDynamicStringSchema,
  A2UISurface,
  defineA2UICatalog,
} from "a2ui-react-native-renderer";
import { createA2UITestHarness } from "a2ui-react-native-renderer/testing";

const catalog = defineA2UICatalog({
  id: "urn:test:form",
  components: {
    Form: {
      schema: z.object({
        value: A2UIDynamicStringSchema,
        action: A2UIActionSchema,
      }),
      presenter: ({ props, dispatch }) =>
        React.createElement("TestForm", {
          testID: "form",
          value: props.value,
          onChange: props.setValue,
          onPress: () => dispatch(props.action),
        }),
    },
  },
});
const harness = createA2UITestHarness({ catalogs: [catalog] });
let mounted: ReturnType<typeof TestRenderer.create> | undefined;

try {
  harness.engine.applyMessages([
    {
      version: "v0.9.1",
      createSurface: { surfaceId: "form", catalogId: catalog.id },
    },
    {
      version: "v0.9.1",
      updateDataModel: { surfaceId: "form", value: { draft: "First" } },
    },
    {
      version: "v0.9.1",
      updateComponents: {
        surfaceId: "form",
        components: [
          {
            id: "root",
            component: "Form",
            value: { path: "/draft" },
            action: {
              event: { name: "submit", context: { value: { path: "/draft" } } },
            },
          },
        ],
      },
    },
  ]);
  await act(() => {
    mounted = TestRenderer.create(
      React.createElement(A2UISurface, {
        engine: harness.engine,
        surfaceId: "form",
      }),
    );
  });
  await act(() =>
    mounted!.root.findByProps({ testID: "form" }).props.onChange("Edited"),
  );
  await act(() =>
    mounted!.root.findByProps({ testID: "form" }).props.onPress(),
  );
  assert.equal(harness.getActions()[0]?.context.value, "Edited");
  assert.deepEqual(harness.engine.getErrors(), []);
} finally {
  if (mounted) await act(() => mounted!.unmount());
  harness.engine.dispose();
}
