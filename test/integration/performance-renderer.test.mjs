import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { z } from "zod";

import {
  A2UIChildListSchema,
  A2UIProvider,
  A2UIRenderer,
  A2UISurface,
  createA2UIEngine,
  defineA2UICatalog,
} from "../../lib/module/index.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function definePerformanceCatalog(renderCounts = {}) {
  return defineA2UICatalog({
    id: "urn:example:a2ui:render-performance:v1",
    components: {
      Column: {
        schema: z.object({ children: A2UIChildListSchema }),
        presenter: ({ props, renderChild }) =>
          React.createElement(
            "NativeColumn",
            null,
            props.children.map((child) =>
              renderChild(child.id, child.basePath),
            ),
          ),
      },
      Text: {
        schema: z.object({ text: z.string() }),
        presenter: ({ props, surfaceId }) => {
          renderCounts[surfaceId] = (renderCounts[surfaceId] ?? 0) + 1;
          return React.createElement("NativeText", null, props.text);
        },
      },
    },
  });
}

function createTextSurface(catalogId, surfaceId, text) {
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

test("an unrelated failed surface update does not rerender healthy presenters", async () => {
  const renderCounts = {};
  const catalog = definePerformanceCatalog(renderCounts);
  const engine = createA2UIEngine({ catalogs: [catalog] });
  const initialMessages = [
    ...createTextSurface(catalog.id, "first", "First"),
    ...createTextSurface(catalog.id, "second", "Second"),
  ];
  engine.applyMessages(initialMessages);

  let advancedRenderer;
  await act(() => {
    advancedRenderer = TestRenderer.create(
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
    engine.applyMessage({
      version: "v0.9",
      updateComponents: {
        surfaceId: "first",
        components: [{ id: "root", component: "Text", text: 42 }],
      },
    });
  });

  assert.deepEqual(renderCounts, { first: 1, second: 1 });
  assert.equal(advancedRenderer.root.findAllByType("NativeText").length, 2);

  const convenienceCounts = {};
  const convenienceCatalog = definePerformanceCatalog(convenienceCounts);
  let convenienceRenderer;
  await act(() => {
    convenienceRenderer = TestRenderer.create(
      React.createElement(A2UIRenderer, {
        catalogs: [convenienceCatalog],
        messages: initialMessages,
      }),
    );
  });
  await act(() => {
    convenienceRenderer.update(
      React.createElement(A2UIRenderer, {
        catalogs: [convenienceCatalog],
        messages: [
          ...initialMessages,
          {
            version: "v0.9",
            updateComponents: {
              surfaceId: "first",
              components: [{ id: "root", component: "Text", text: 42 }],
            },
          },
        ],
      }),
    );
  });

  assert.deepEqual(convenienceCounts, { first: 1, second: 1 });
});

test("validates and renders a 500-component surface", async () => {
  const renderCounts = {};
  const catalog = definePerformanceCatalog(renderCounts);
  const engine = createA2UIEngine({ catalogs: [catalog] });
  const textComponents = Array.from({ length: 499 }, (_, index) => ({
    id: `text-${String(index)}`,
    component: "Text",
    text: `Item ${String(index)}`,
  }));
  const components = [
    {
      id: "root",
      component: "Column",
      children: textComponents.map((component) => component.id),
    },
    ...textComponents,
  ];

  engine.applyMessages([
    {
      version: "v0.9",
      createSurface: { surfaceId: "stress", catalogId: catalog.id },
    },
    {
      version: "v0.9",
      updateComponents: { surfaceId: "stress", components },
    },
  ]);

  assert.deepEqual(engine.getErrors(), []);
  assert.equal(Object.keys(engine.getSurface("stress").components).length, 500);

  let renderer;
  await act(() => {
    renderer = TestRenderer.create(
      React.createElement(
        A2UIProvider,
        { engine },
        React.createElement(A2UISurface, { surfaceId: "stress" }),
      ),
    );
  });

  assert.equal(renderer.root.findAllByType("NativeText").length, 499);
  assert.equal(renderCounts.stress, 499);
});
