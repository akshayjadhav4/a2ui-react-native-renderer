# Test Your Catalog and Surfaces

The optional `a2ui-react-native-renderer/testing` entry provides
`createA2UITestHarness({ catalogs, limits? })`. It uses the real engine and
records dispatched user actions. Bring your own assertions and mounting tools;
the package does not install a test runner or React testing framework.

## Headless Protocol Checks

The testing entry imports in plain Node. Keep the catalog supplied to a Node
test native-free too: share your app's schemas and attach test presenters,
rather than importing native components into Node without your usual transforms.

```ts
import assert from "node:assert/strict";
import { z } from "zod";
import { createA2UITestHarness } from "a2ui-react-native-renderer/testing";

const catalog = {
  id: "urn:test:catalog",
  components: {
    Text: { schema: z.object({ text: z.string() }), presenter: null },
  },
  functions: [],
};
const harness = createA2UITestHarness({ catalogs: [catalog] });

try {
  harness.engine.applyMessages([
    {
      version: "v0.9.1",
      createSurface: { surfaceId: "form", catalogId: catalog.id },
    },
    {
      version: "v0.9.1",
      updateComponents: {
        surfaceId: "form",
        components: [{ id: "root", component: "Text", text: "Hello" }],
      },
    },
  ]);
  assert.equal(harness.engine.getSurface("form")?.rootId, "root");
  assert.deepEqual(harness.engine.getErrors(), []);
} finally {
  harness.engine.dispose();
}
```

This checks protocol acceptance and snapshots. Bound-value resolution, consumer
function execution, generated setters, presenter errors, and action dispatch
need mounted rendering. An empty error list after ingestion does not prove
these render-time behaviors work.

## Mounted Binding and Action Check

Mount `A2UISurface` with the harness engine in your existing React test setup.
This example uses the repository's `react-test-renderer` setup and a test-owned
presenter; that test tool is deprecated in React 19. You can use your app's
React Native Testing Library setup to exercise the same real input and button
handlers instead. Neither testing tool is shipped by this library.

```ts
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
```

Each `getActions()` call returns a fresh frozen array. Previously returned
arrays do not grow when later actions arrive. Payloads and timestamps retain
the engine's normal semantics; this helper does not normalize or clone them.
Only successfully dispatched event actions are recorded. Function actions run
through the renderer's registered functions and are not user-action events.

Use `engine.getErrors()` for diagnostics and `engine.getSurface()` for data.
The harness owns the action callback and accepts only catalogs and limits.
Dispose each engine in test cleanup; create another harness for another test.

The [Expo network example](./streaming-and-actions.md#runnable-local-network-example) shares schema definitions
with its test catalog and exercises the same protocol through actual sockets.
