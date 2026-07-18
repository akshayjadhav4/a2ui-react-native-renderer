import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { z } from "zod";

import {
  A2UIProvider,
  A2UIRenderer,
  A2UISurface,
  createA2UIEngine,
  defineA2UICatalog,
} from "../../lib/module/index.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function createCatalog(renderCounts) {
  return defineA2UICatalog({
    id: "urn:example:a2ui:catalog:v1",
    components: {
      Text: {
        schema: z.object({ text: z.string() }),
        presenter: ({ props, surfaceId }) => {
          renderCounts[surfaceId] = (renderCounts[surfaceId] ?? 0) + 1;
          return React.createElement("NativeText", { surfaceId }, props.text);
        },
      },
      Badge: {
        schema: z.object({ label: z.string() }),
        presenter: ({ props, surfaceId }) =>
          React.createElement("NativeBadge", { surfaceId }, props.label),
      },
    },
  });
}

function createSurfaceMessages(catalogId, surfaceId, text) {
  return [
    {
      version: "v0.9",
      createSurface: { surfaceId, catalogId },
    },
    {
      version: "v0.9",
      updateComponents: {
        surfaceId,
        components: [{ id: "root", component: "Text", text }],
      },
    },
  ];
}

function updateText(surfaceId, text) {
  return {
    version: "v0.9",
    updateComponents: {
      surfaceId,
      components: [{ id: "root", component: "Text", text }],
    },
  };
}

test("advanced surfaces rerender only for their own lifecycle", async () => {
  const renderCounts = {};
  const catalog = createCatalog(renderCounts);
  const engine = createA2UIEngine({ catalogs: [catalog] });
  engine.applyMessages([
    ...createSurfaceMessages(catalog.id, "first", "First"),
    ...createSurfaceMessages(catalog.id, "second", "Second"),
  ]);

  let renderer;
  await act(() => {
    renderer = TestRenderer.create(
      React.createElement(
        A2UIProvider,
        { engine },
        React.createElement(
          React.Fragment,
          null,
          React.createElement(A2UISurface, { surfaceId: "first" }),
          React.createElement(A2UISurface, { surfaceId: "second" }),
        ),
      ),
    );
  });

  await act(() => {
    engine.applyMessage(updateText("first", "First updated"));
  });
  assert.deepEqual(renderCounts, { first: 2, second: 1 });

  await act(() => {
    engine.applyMessage({
      version: "v0.9",
      deleteSurface: { surfaceId: "first" },
    });
  });

  assert.deepEqual(renderCounts, { first: 2, second: 1 });
  assert.deepEqual(renderer.toJSON(), {
    type: "NativeText",
    props: { surfaceId: "second" },
    children: ["Second"],
  });
});

test("convenience renderer preserves unrelated presenter renders", async () => {
  const renderCounts = {};
  const catalog = createCatalog(renderCounts);
  const initialMessages = [
    ...createSurfaceMessages(catalog.id, "first", "First"),
    ...createSurfaceMessages(catalog.id, "second", "Second"),
  ];

  let renderer;
  await act(() => {
    renderer = TestRenderer.create(
      React.createElement(A2UIRenderer, {
        catalogs: [catalog],
        messages: initialMessages,
      }),
    );
  });
  await act(() => {
    renderer.update(
      React.createElement(A2UIRenderer, {
        catalogs: [catalog],
        messages: [...initialMessages, updateText("first", "First updated")],
      }),
    );
  });

  assert.deepEqual(renderCounts, { first: 2, second: 1 });
});

test("replacing the root type switches to the matching presenter", async () => {
  const catalog = createCatalog({});
  const engine = createA2UIEngine({ catalogs: [catalog] });
  engine.applyMessages(createSurfaceMessages(catalog.id, "main", "Text root"));

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
        components: [{ id: "root", component: "Badge", label: "Badge root" }],
      },
    });
  });

  assert.deepEqual(renderer.toJSON(), {
    type: "NativeBadge",
    props: { surfaceId: "main" },
    children: ["Badge root"],
  });
});
