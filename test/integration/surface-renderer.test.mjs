import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { z } from "zod";

import {
  A2UIChildListSchema,
  A2UIComponentIdSchema,
  A2UIProvider,
  A2UISurface,
  createA2UIEngine,
  defineA2UICatalog,
} from "../../lib/module/index.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function createTextCatalog(onRender = () => undefined) {
  return defineA2UICatalog({
    id: "urn:example:a2ui:catalog:v1",
    components: {
      Text: {
        schema: z.object({ text: z.string() }),
        presenter: ({ props }) => {
          onRender(props);
          return React.createElement("NativeText", null, props.text);
        },
      },
    },
  });
}

function createProgressiveCatalog() {
  return defineA2UICatalog({
    id: "urn:example:a2ui:progressive:v1",
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
      Single: {
        schema: z.object({ child: A2UIComponentIdSchema }),
        presenter: ({ props, renderChild }) =>
          React.createElement("NativeRow", null, renderChild(props.child)),
      },
      Plain: {
        schema: z.object({ child: z.string() }),
        presenter: ({ props, renderChild }) =>
          React.createElement("NativeRow", null, renderChild(props.child)),
      },
      Text: {
        schema: z.object({ text: z.string() }),
        presenter: ({ props }) =>
          React.createElement("NativeText", null, props.text),
      },
    },
  });
}

function createSurfaceMessages(component) {
  return [
    {
      version: "v0.9",
      createSurface: {
        surfaceId: "main",
        catalogId: "urn:example:a2ui:catalog:v1",
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

test("renders validated props through a consumer-owned presenter", async () => {
  const observedProps = [];
  const catalog = createTextCatalog((props) => observedProps.push(props));
  const engine = createA2UIEngine({ catalogs: [catalog] });
  engine.applyMessages(
    createSurfaceMessages({
      id: "root",
      component: "Text",
      text: "Hello from a consumer presenter",
    }),
  );

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

  assert.deepEqual(observedProps, [
    { text: "Hello from a consumer presenter" },
  ]);
  assert.deepEqual(renderer.toJSON(), {
    type: "NativeText",
    props: {},
    children: ["Hello from a consumer presenter"],
  });
});

test("rerenders only after the subscribed surface changes", async () => {
  let renderCount = 0;
  const catalog = createTextCatalog(() => {
    renderCount += 1;
  });
  const engine = createA2UIEngine({ catalogs: [catalog] });
  engine.applyMessages(
    createSurfaceMessages({
      id: "root",
      component: "Text",
      text: "First",
    }),
  );

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

  await act(() => {
    engine.applyMessage({
      version: "v0.9",
      updateComponents: {
        surfaceId: "main",
        components: [{ id: "root", component: "Text", text: "Updated" }],
      },
    });
  });

  assert.equal(renderCount, 2);
  assert.deepEqual(renderer.toJSON()?.children, ["Updated"]);
});

test("waits for a streaming surface root without reporting a false error", async () => {
  const errors = [];
  const catalog = createTextCatalog();
  const engine = createA2UIEngine({
    catalogs: [catalog],
    onError: (error) => errors.push(error),
  });
  engine.applyMessage({
    version: "v0.9",
    createSurface: {
      surfaceId: "main",
      catalogId: "urn:example:a2ui:catalog:v1",
    },
  });

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

  assert.equal(renderer.toJSON(), null);
  assert.deepEqual(errors, []);

  await act(() => {
    engine.applyMessage({
      version: "v0.9",
      updateComponents: {
        surfaceId: "main",
        components: [
          { id: "root", component: "Text", text: "Stream complete" },
        ],
      },
    });
  });

  assert.deepEqual(renderer.toJSON()?.children, ["Stream complete"]);
  assert.deepEqual(errors, []);
});

test("shows an app-owned pending root only after the surface is created", async () => {
  const catalog = createTextCatalog();
  const engine = createA2UIEngine({ catalogs: [catalog] });
  const calls = [];
  const renderPending = (pending) => {
    calls.push(pending);
    return React.createElement("NativeLoading", null, pending.componentId);
  };
  let renderer;
  await act(() => {
    renderer = TestRenderer.create(
      React.createElement(
        A2UIProvider,
        { engine },
        React.createElement(A2UISurface, { surfaceId: "main", renderPending }),
      ),
    );
  });
  assert.equal(renderer.toJSON(), null);
  assert.deepEqual(calls, []);

  await act(() => {
    engine.applyMessage(
      createSurfaceMessages({
        id: "root",
        component: "Text",
        text: "Ready",
      })[0],
    );
  });
  assert.deepEqual(calls, [
    { surfaceId: "main", componentId: "root", kind: "root" },
  ]);
  assert.equal(renderer.toJSON()?.type, "NativeLoading");

  await act(() => {
    engine.applyMessage(
      createSurfaceMessages({
        id: "root",
        component: "Text",
        text: "Ready",
      })[1],
    );
  });
  assert.equal(renderer.toJSON()?.type, "NativeText");
});

test("renders available siblings while replacing a pending child", async () => {
  const catalog = createProgressiveCatalog();
  const errors = [];
  const engine = createA2UIEngine({
    catalogs: [catalog],
    onError: (error) => errors.push(error),
  });
  engine.applyMessages([
    {
      version: "v0.9.1",
      createSurface: { surfaceId: "main", catalogId: catalog.id },
    },
    {
      version: "v0.9.1",
      updateComponents: {
        surfaceId: "main",
        components: [
          { id: "root", component: "Row", children: ["ready", "__proto__"] },
          { id: "ready", component: "Text", text: "Available" },
        ],
      },
    },
  ]);
  const calls = [];
  const renderPending = (pending) => {
    calls.push(pending);
    return React.createElement("NativeLoading", null, pending.componentId);
  };
  const view = (pending) =>
    React.createElement(
      A2UIProvider,
      { engine },
      React.createElement(A2UISurface, {
        surfaceId: "main",
        ...(pending ? { renderPending } : {}),
      }),
    );
  let renderer;
  await act(() => {
    renderer = TestRenderer.create(view(true));
  });
  assert.deepEqual(
    renderer.toJSON().children.map((child) => child.type),
    ["NativeText", "NativeLoading"],
  );
  assert.deepEqual(calls[0], {
    surfaceId: "main",
    componentId: "__proto__",
    kind: "component",
  });

  await act(() => {
    renderer.update(view(false));
  });
  assert.deepEqual(
    renderer.toJSON().children.map((child) => child.type),
    ["NativeText"],
  );

  await act(() => {
    engine.applyMessage({
      version: "v0.9.1",
      updateComponents: {
        surfaceId: "main",
        components: [{ id: "__proto__", component: "Text", text: "Arrived" }],
      },
    });
  });
  assert.deepEqual(
    renderer.toJSON().children.map((child) => child.type),
    ["NativeText", "NativeText"],
  );
  assert.deepEqual(errors, []);
});

test("uses marked single-child references but reports arbitrary missing ids", async () => {
  const catalog = createProgressiveCatalog();
  const errors = [];
  const engine = createA2UIEngine({
    catalogs: [catalog],
    onError: (error) => errors.push(error),
  });
  engine.applyMessages([
    {
      version: "v0.9",
      createSurface: { surfaceId: "main", catalogId: catalog.id },
    },
    {
      version: "v0.9",
      updateComponents: {
        surfaceId: "main",
        components: [{ id: "root", component: "Single", child: "later" }],
      },
    },
  ]);
  let renderer;
  await act(() => {
    renderer = TestRenderer.create(
      React.createElement(
        A2UIProvider,
        { engine },
        React.createElement(A2UISurface, {
          surfaceId: "main",
          renderPending: (pending) =>
            React.createElement("NativeLoading", null, pending.componentId),
        }),
      ),
    );
  });
  assert.equal(renderer.toJSON().children[0].type, "NativeLoading");
  assert.deepEqual(errors, []);

  await act(() => {
    engine.applyMessage({
      version: "v0.9",
      updateComponents: {
        surfaceId: "main",
        components: [{ id: "root", component: "Plain", child: "unknown" }],
      },
    });
  });
  assert.equal(errors.at(-1)?.code, "INVALID_REFERENCE");
  assert.equal(errors.at(-1)?.componentId, "unknown");
});

test("fails clearly when A2UISurface has no provider", async () => {
  await assert.rejects(
    async () =>
      act(() => {
        TestRenderer.create(
          React.createElement(A2UISurface, { surfaceId: "main" }),
        );
      }),
    /A2UISurface must be rendered inside A2UIProvider/,
  );
});

test("contains unknown components and reports a structured error", async () => {
  let presenterCalls = 0;
  const errors = [];
  const catalog = createTextCatalog(() => {
    presenterCalls += 1;
  });
  const engine = createA2UIEngine({
    catalogs: [catalog],
    onError: (error) => errors.push(error),
  });
  engine.applyMessages(
    createSurfaceMessages({
      id: "root",
      component: "NotRegistered",
      text: "Do not render",
    }),
  );

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

  assert.equal(renderer.toJSON(), null);
  assert.equal(presenterCalls, 0);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].code, "UNKNOWN_COMPONENT");
  assert.equal(errors[0].surfaceId, "main");
  assert.equal(errors[0].componentId, "root");
});

test("rejects invalid presenter props before invoking the presenter", async () => {
  let presenterCalls = 0;
  const errors = [];
  const catalog = createTextCatalog(() => {
    presenterCalls += 1;
  });
  const engine = createA2UIEngine({
    catalogs: [catalog],
    onError: (error) => errors.push(error),
  });
  engine.applyMessages(
    createSurfaceMessages({
      id: "root",
      component: "Text",
      text: 42,
    }),
  );

  await act(() => {
    TestRenderer.create(
      React.createElement(
        A2UIProvider,
        { engine },
        React.createElement(A2UISurface, { surfaceId: "main" }),
      ),
    );
  });

  assert.equal(presenterCalls, 0);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].code, "INVALID_COMPONENT_PROPS");
  assert.equal(errors[0].path, "/updateComponents/components/0/text");
});
