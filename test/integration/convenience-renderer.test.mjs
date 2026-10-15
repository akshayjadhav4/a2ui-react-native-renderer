import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { z } from "zod";

import {
  A2UIChildListSchema,
  A2UIRenderer,
  createA2UIEngine,
  defineA2UICatalog,
} from "../../lib/module/index.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

test("external renderer observes imperative messages with no messages prop", async () => {
  const engine = createA2UIEngine({ catalogs: [catalog] });
  let ingestionCount = 0;
  const trackedEngine = {
    ...engine,
    applyMessages: (batch) => {
      ingestionCount += 1;
      engine.applyMessages(batch);
    },
  };
  let renderer;
  await act(() => {
    renderer = TestRenderer.create(
      React.createElement(A2UIRenderer, { engine: trackedEngine }),
    );
  });
  assert.equal(renderer.toJSON(), null);
  await act(() => {
    engine.applyMessages(
      createSurfaceMessages({
        id: "root",
        component: "Text",
        text: "Imperative",
      }),
    );
  });
  assert.deepEqual(renderer.toJSON().children, ["Imperative"]);
  const count = ingestionCount;
  await act(() => {
    renderer.update(
      React.createElement(A2UIRenderer, {
        engine: trackedEngine,
        diagnostics: "production",
      }),
    );
  });
  assert.equal(ingestionCount, count);
  assert.deepEqual(engine.getErrors(), []);
  await act(() => {
    renderer.unmount();
  });
  engine.dispose();
});

test("omitted messages retain the existing empty-collection transition semantics", async () => {
  const engine = createA2UIEngine({ catalogs: [catalog] });
  const batches = [];
  const trackedEngine = {
    ...engine,
    applyMessages: (batch) => {
      batches.push(batch);
      engine.applyMessages(batch);
    },
  };
  const initial = createSurfaceMessages({
    id: "root",
    component: "Text",
    text: "Initial",
  });
  let renderer;
  await act(() => {
    renderer = TestRenderer.create(
      React.createElement(A2UIRenderer, {
        engine: trackedEngine,
        messages: initial,
      }),
    );
  });
  await act(() => {
    renderer.update(
      React.createElement(A2UIRenderer, { engine: trackedEngine }),
    );
  });
  assert.deepEqual(batches[1], []);
  const update = {
    version: "v0.9",
    updateComponents: {
      surfaceId: "main",
      components: [{ id: "root", component: "Text", text: "After empty" }],
    },
  };
  await act(() => {
    renderer.update(
      React.createElement(A2UIRenderer, {
        engine: trackedEngine,
        messages: [update],
      }),
    );
  });
  assert.deepEqual(batches[2], [update]);
  assert.deepEqual(renderer.toJSON().children, ["After empty"]);
  await act(() => {
    renderer.unmount();
  });
  engine.dispose();
});

test("unmounting an external renderer does not dispose its engine", async () => {
  const engine = createA2UIEngine({ catalogs: [catalog] });
  let renderer;
  await act(() => {
    renderer = TestRenderer.create(
      React.createElement(A2UIRenderer, { engine, messages: [] }),
    );
  });
  await act(() => {
    renderer.unmount();
  });
  engine.applyMessages(
    createSurfaceMessages({
      id: "root",
      component: "Text",
      text: "Still usable",
    }),
  );
  assert.equal(
    engine.getSurface("main").components.root.props.text,
    "Still usable",
  );
  engine.dispose();
});

const catalog = defineA2UICatalog({
  id: "urn:example:a2ui:catalog:v1",
  components: {
    Row: {
      schema: z.object({ children: A2UIChildListSchema }),
      presenter: ({ props, renderChild }) =>
        React.createElement(
          "NativeRow",
          null,
          ...props.children.map((child) =>
            renderChild(child.id, child.basePath),
          ),
        ),
    },
    Text: {
      schema: z.object({ text: z.string() }),
      presenter: ({ props }) =>
        React.createElement("NativeText", null, props.text),
    },
    Button: {
      schema: z.object({ label: z.string(), action: z.record(z.unknown()) }),
      presenter: ({ props, dispatch }) =>
        React.createElement(
          "NativeButton",
          { onPress: () => dispatch(props.action) },
          props.label,
        ),
    },
  },
});

function createSurfaceMessages(component) {
  return [
    {
      version: "v0.9",
      createSurface: {
        surfaceId: "main",
        catalogId: catalog.id,
      },
    },
    {
      version: "v0.9",
      updateComponents: {
        surfaceId: "main",
        components: [component],
      },
    },
  ];
}

test("renders the README-level convenience API", async () => {
  const messages = createSurfaceMessages({
    id: "root",
    component: "Text",
    text: "Hello from A2UIRenderer",
  });

  let renderer;
  await act(() => {
    renderer = TestRenderer.create(
      React.createElement(A2UIRenderer, { catalogs: [catalog], messages }),
    );
  });

  assert.deepEqual(renderer.toJSON(), {
    type: "NativeText",
    props: {},
    children: ["Hello from A2UIRenderer"],
  });
});

test("forwards pending-root rendering through the convenience API", async () => {
  const create = createSurfaceMessages({
    id: "root",
    component: "Text",
    text: "Ready",
  });
  const calls = [];
  const renderPending = (pending) => {
    calls.push(pending);
    return React.createElement("NativeLoading", null, pending.kind);
  };

  let renderer;
  await act(() => {
    renderer = TestRenderer.create(
      React.createElement(A2UIRenderer, {
        catalogs: [catalog],
        messages: [create[0]],
        renderPending,
      }),
    );
  });
  assert.equal(renderer.toJSON()?.type, "NativeLoading");
  assert.deepEqual(calls, [
    { surfaceId: "main", componentId: "root", kind: "root" },
  ]);

  await act(() => {
    renderer.update(
      React.createElement(A2UIRenderer, {
        catalogs: [catalog],
        messages: create,
        renderPending,
      }),
    );
  });
  assert.equal(renderer.toJSON()?.type, "NativeText");
});

test("forwards pending-child rendering through the convenience API", async () => {
  const messages = createSurfaceMessages({
    id: "root",
    component: "Row",
    children: ["later"],
  });
  let renderer;
  await act(() => {
    renderer = TestRenderer.create(
      React.createElement(A2UIRenderer, {
        catalogs: [catalog],
        messages,
        renderPending: ({ componentId }) =>
          React.createElement("NativeLoading", null, componentId),
      }),
    );
  });
  assert.equal(renderer.toJSON()?.children?.[0]?.type, "NativeLoading");
});

test("does not reapply the same message collection", async () => {
  const engine = createA2UIEngine({ catalogs: [catalog] });
  const messages = createSurfaceMessages({
    id: "root",
    component: "Text",
    text: "Stable",
  });
  let notifications = 0;
  engine.subscribe(() => {
    notifications += 1;
  });

  let renderer;
  await act(() => {
    renderer = TestRenderer.create(
      React.createElement(A2UIRenderer, { engine, messages }),
    );
  });
  assert.equal(notifications, 1);

  await act(() => {
    renderer.update(React.createElement(A2UIRenderer, { engine, messages }));
  });

  assert.equal(notifications, 1);
});

test("applies only the appended suffix of a cumulative message collection", async () => {
  const engine = createA2UIEngine({ catalogs: [catalog] });
  const initial = createSurfaceMessages({
    id: "root",
    component: "Text",
    text: "First",
  });
  let notifications = 0;
  engine.subscribe(() => {
    notifications += 1;
  });

  let renderer;
  await act(() => {
    renderer = TestRenderer.create(
      React.createElement(A2UIRenderer, { engine, messages: initial }),
    );
  });

  const update = {
    version: "v0.9",
    updateComponents: {
      surfaceId: "main",
      components: [{ id: "root", component: "Text", text: "Second" }],
    },
  };
  await act(() => {
    renderer.update(
      React.createElement(A2UIRenderer, {
        engine,
        messages: [...initial, update],
      }),
    );
  });

  assert.equal(notifications, 2);
  assert.deepEqual(renderer.toJSON()?.children, ["Second"]);
});

test("uses the latest owned-engine action callback without resetting state", async () => {
  const messages = createSurfaceMessages({
    id: "root",
    component: "Button",
    label: "Choose",
    action: { event: { name: "choose", context: { value: "one" } } },
  });
  const firstActions = [];
  const secondActions = [];

  let renderer;
  await act(() => {
    renderer = TestRenderer.create(
      React.createElement(A2UIRenderer, {
        catalogs: [catalog],
        messages,
        onAction: (action) => firstActions.push(action),
      }),
    );
  });

  await act(() => {
    renderer.update(
      React.createElement(A2UIRenderer, {
        catalogs: [catalog],
        messages,
        onAction: (action) => secondActions.push(action),
      }),
    );
  });
  await act(async () => {
    renderer.root.findByType("NativeButton").props.onPress();
    await Promise.resolve();
  });

  assert.deepEqual(firstActions, []);
  assert.equal(secondActions.length, 1);
  assert.equal(secondActions[0].name, "choose");
  assert.equal(secondActions[0].surfaceId, "main");
  assert.equal(secondActions[0].sourceComponentId, "root");
});

test("uses the latest owned-engine error callback without replaying prior messages", async () => {
  const firstErrors = [];
  const secondErrors = [];
  const initial = createSurfaceMessages({
    id: "root",
    component: "Text",
    text: "Keep this surface",
  });

  let renderer;
  await act(() => {
    renderer = TestRenderer.create(
      React.createElement(A2UIRenderer, {
        catalogs: [catalog],
        messages: initial,
        onError: (error) => firstErrors.push(error),
      }),
    );
  });

  await act(() => {
    renderer.update(
      React.createElement(A2UIRenderer, {
        catalogs: [catalog],
        messages: [...initial, { version: "v1.0" }],
        onError: (error) => secondErrors.push(error),
      }),
    );
  });

  assert.deepEqual(firstErrors, []);
  assert.equal(secondErrors.length, 1);
  assert.equal(secondErrors[0].code, "UNSUPPORTED_VERSION");
  assert.deepEqual(renderer.toJSON()?.children, ["Keep this surface"]);
});
