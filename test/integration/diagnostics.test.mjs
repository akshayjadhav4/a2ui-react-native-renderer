import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { z } from "zod";

import { A2UIErrorBoundary } from "../../lib/module/errors/ErrorBoundary.js";
import {
  formatA2UIDiagnostic,
  shouldShowDevelopmentDiagnostics,
} from "../../lib/module/errors/diagnostics.js";
import {
  A2UIChildListSchema,
  A2UIProvider,
  A2UIRenderer,
  A2UISurface,
  createA2UIEngine,
  defineA2UICatalog,
} from "../../lib/module/index.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

test("formats diagnostics without exposing messages, causes, or control characters", () => {
  const diagnostic = formatA2UIDiagnostic({
    code: "PRESENTER_ERROR",
    message: "secret message",
    severity: "error",
    surfaceId: "main\nforged",
    catalogId: "urn:example:catalog",
    componentId: "root",
    path: "/private/value",
    cause: new Error("secret cause"),
  });

  assert.equal(
    diagnostic,
    "A2UI PRESENTER_ERROR | surface=main forged | catalog=urn:example:catalog | component=root | path=/private/value",
  );
  assert.equal(diagnostic.includes("secret"), false);
});

test("resolves explicit and React Native development diagnostic modes", () => {
  const previous = globalThis.__DEV__;
  globalThis.__DEV__ = true;

  try {
    assert.equal(shouldShowDevelopmentDiagnostics("auto"), true);
    assert.equal(shouldShowDevelopmentDiagnostics("development"), true);
    assert.equal(shouldShowDevelopmentDiagnostics("production"), false);
  } finally {
    globalThis.__DEV__ = previous;
  }
});

test("contains render failures, reports once, and recovers after reset", async () => {
  const errors = [];
  const Broken = () => {
    throw new Error("presenter exploded");
  };

  let renderer;
  await act(() => {
    renderer = TestRenderer.create(
      React.createElement(
        A2UIErrorBoundary,
        {
          resetKey: 1,
          createError: (cause) => ({
            code: "PRESENTER_ERROR",
            message: "A2UI presenter failed to render",
            severity: "error",
            surfaceId: "main",
            componentId: "root",
            cause,
          }),
          reportError: (error) => errors.push(error),
          renderFallback: (error) =>
            React.createElement("Diagnostic", null, error.code),
        },
        React.createElement(Broken),
      ),
    );
  });

  assert.equal(errors.length, 1);
  assert.equal(errors[0].code, "PRESENTER_ERROR");
  assert.deepEqual(renderer.toJSON(), {
    type: "Diagnostic",
    props: {},
    children: ["PRESENTER_ERROR"],
  });

  await act(() => {
    renderer.update(
      React.createElement(
        A2UIErrorBoundary,
        {
          resetKey: 2,
          createError: () => {
            throw new Error("must not run");
          },
          reportError: () => {
            throw new Error("must not run");
          },
          renderFallback: () => null,
        },
        React.createElement("Recovered", null, "Ready"),
      ),
    );
  });

  assert.deepEqual(renderer.toJSON(), {
    type: "Recovered",
    props: {},
    children: ["Ready"],
  });
});

const catalog = defineA2UICatalog({
  id: "urn:example:a2ui:diagnostics:v1",
  components: {
    Column: {
      schema: z.object({ children: A2UIChildListSchema }),
      presenter: ({ props, renderChild }) =>
        React.createElement(
          "NativeColumn",
          null,
          props.children.map((child) => renderChild(child.id, child.basePath)),
        ),
    },
    Text: {
      schema: z.object({ text: z.string(), fail: z.boolean().optional() }),
      presenter: ({ props }) => {
        if (props.fail === true) {
          throw new Error("private presenter detail");
        }

        return React.createElement("NativeText", null, props.text);
      },
    },
  },
});

function createSurfaceMessages(components) {
  return [
    {
      version: "v0.9",
      createSurface: { surfaceId: "main", catalogId: catalog.id },
    },
    {
      version: "v0.9",
      updateComponents: { surfaceId: "main", components },
    },
  ];
}

async function renderA2UISurface(engine, props = {}) {
  let renderer;
  await act(() => {
    renderer = TestRenderer.create(
      React.createElement(
        A2UIProvider,
        { engine },
        React.createElement(A2UISurface, {
          surfaceId: "main",
          ...props,
        }),
      ),
    );
  });
  return renderer;
}

test("shows a consumer fallback for an invalid initial surface", async () => {
  const errors = [];
  const engine = createA2UIEngine({
    catalogs: [catalog],
    onError: (error) => errors.push(error),
  });
  engine.applyMessages(
    createSurfaceMessages([
      { id: "root", component: "Missing", text: "Invalid" },
    ]),
  );

  const renderer = await renderA2UISurface(engine, {
    diagnostics: "development",
    renderFallback: (error) =>
      React.createElement("Diagnostic", null, error.code),
  });

  assert.equal(errors.length, 1);
  assert.equal(errors[0].code, "UNKNOWN_COMPONENT");
  assert.deepEqual(renderer.toJSON(), {
    type: "Diagnostic",
    props: {},
    children: ["UNKNOWN_COMPONENT"],
  });
});

test("renders no internal diagnostic for an invalid production surface", async () => {
  const engine = createA2UIEngine({ catalogs: [catalog] });
  engine.applyMessages(
    createSurfaceMessages([
      { id: "root", component: "Missing", text: "Invalid" },
    ]),
  );

  const renderer = await renderA2UISurface(engine, {
    diagnostics: "production",
  });

  assert.equal(renderer.toJSON(), null);
  assert.equal(engine.getErrors().at(-1).code, "UNKNOWN_COMPONENT");
});

test("renders an invalid initial surface through the convenience API", async () => {
  const messages = createSurfaceMessages([
    { id: "root", component: "Missing", text: "Invalid" },
  ]);

  let renderer;
  await act(() => {
    renderer = TestRenderer.create(
      React.createElement(A2UIRenderer, {
        catalogs: [catalog],
        messages,
        diagnostics: "development",
        renderFallback: (error) =>
          React.createElement("Diagnostic", null, error.surfaceId),
      }),
    );
  });

  assert.deepEqual(renderer.toJSON(), {
    type: "Diagnostic",
    props: {},
    children: ["main"],
  });
});

test("contains a failing child presenter without removing healthy siblings", async () => {
  const errors = [];
  const engine = createA2UIEngine({
    catalogs: [catalog],
    onError: (error) => errors.push(error),
  });
  engine.applyMessages(
    createSurfaceMessages([
      {
        id: "root",
        component: "Column",
        children: ["healthy", "broken"],
      },
      { id: "healthy", component: "Text", text: "Still visible" },
      { id: "broken", component: "Text", text: "Hidden", fail: true },
    ]),
  );

  const originalConsoleError = globalThis.console.error;
  globalThis.console.error = () => undefined;
  let renderer;
  try {
    renderer = await renderA2UISurface(engine, {
      diagnostics: "development",
      renderFallback: (error) =>
        React.createElement("Diagnostic", null, error.componentId),
    });
  } finally {
    globalThis.console.error = originalConsoleError;
  }

  assert.equal(errors.length, 1);
  assert.equal(errors[0].code, "PRESENTER_ERROR");
  assert.equal(errors[0].componentId, "broken");
  assert.deepEqual(renderer.toJSON(), {
    type: "NativeColumn",
    props: {},
    children: [
      { type: "NativeText", props: {}, children: ["Still visible"] },
      { type: "Diagnostic", props: {}, children: ["broken"] },
    ],
  });
});

test("recovers a failed presenter after a valid surface revision", async () => {
  const engine = createA2UIEngine({ catalogs: [catalog] });
  engine.applyMessages(
    createSurfaceMessages([
      { id: "root", component: "Text", text: "Broken", fail: true },
    ]),
  );

  const originalConsoleError = globalThis.console.error;
  globalThis.console.error = () => undefined;
  let renderer;
  try {
    renderer = await renderA2UISurface(engine, {
      diagnostics: "production",
    });
  } finally {
    globalThis.console.error = originalConsoleError;
  }
  assert.equal(renderer.toJSON(), null);

  await act(() => {
    engine.applyMessage({
      version: "v0.9",
      updateComponents: {
        surfaceId: "main",
        components: [
          { id: "root", component: "Text", text: "Recovered", fail: false },
        ],
      },
    });
  });

  assert.deepEqual(renderer.toJSON(), {
    type: "NativeText",
    props: {},
    children: ["Recovered"],
  });
});
