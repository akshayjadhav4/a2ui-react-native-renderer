import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { z } from "zod";
import {
  A2UISurface,
  createA2UIEngine,
  defineA2UICatalog,
} from "../../lib/module/index.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

for (const version of ["v0.9", "v0.9.1"]) {
  test(`${version} presenters receive isolated themes and fresh recreation values`, async () => {
    const renders = {};
    const catalog = defineA2UICatalog({
      id: "mounted-theme",
      themeSchema: z.object({ color: z.string() }),
      components: {
        Box: {
          schema: z.object({}),
          presenter: ({ renderChild }) => renderChild("label", "/stable"),
        },
        Label: {
          schema: z.object({ text: z.string() }),
          presenter: ({ props, theme, surfaceId }) => {
            renders[surfaceId] = (renders[surfaceId] ?? 0) + 1;
            return React.createElement(
              "NativeLabel",
              { color: theme?.color ?? "fallback", surfaceId },
              props.text,
            );
          },
        },
      },
    });
    const engine = createA2UIEngine({ catalogs: [catalog] });
    const create = (surfaceId, color) => [
      {
        version,
        createSurface: {
          surfaceId,
          catalogId: catalog.id,
          ...(color === undefined ? {} : { theme: { color } }),
        },
      },
      { version, updateDataModel: { surfaceId, value: { stable: "same" } } },
      {
        version,
        updateComponents: {
          surfaceId,
          components: [
            { id: "root", component: "Box" },
            { id: "label", component: "Label", text: "Hello" },
          ],
        },
      },
    ];
    engine.applyMessages([...create("one", "red"), ...create("two", "blue")]);
    let renderer;
    await act(() => {
      renderer = TestRenderer.create(
        React.createElement(
          React.Fragment,
          null,
          React.createElement(A2UISurface, { engine, surfaceId: "one" }),
          React.createElement(A2UISurface, { engine, surfaceId: "two" }),
        ),
      );
    });
    const colors = () =>
      renderer.root
        .findAllByType("NativeLabel")
        .map((node) => node.props.color);
    try {
      assert.deepEqual(colors(), ["red", "blue"]);
      await act(() =>
        engine.applyMessage({
          version,
          updateDataModel: {
            surfaceId: "one",
            path: "/unrelated",
            value: true,
          },
        }),
      );
      // The label scope and theme remain unchanged by this unrelated write.
      const before = { ...renders };
      await act(() =>
        engine.applyMessage({
          version,
          updateDataModel: {
            surfaceId: "one",
            path: "/unrelated",
            value: true,
          },
        }),
      );
      assert.deepEqual(renders, before);
      for (const color of ["green", undefined]) {
        await act(() =>
          engine.applyMessages([
            { version, deleteSurface: { surfaceId: "one" } },
            ...create("one", color),
          ]),
        );
        assert.deepEqual(colors(), [color ?? "fallback", "blue"]);
      }
      assert.equal(renders.two, 1);
    } finally {
      await act(() => renderer.unmount());
      engine.dispose();
    }
  });
}
