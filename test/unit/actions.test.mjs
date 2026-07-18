import assert from "node:assert/strict";
import test from "node:test";

import { resolveA2UIUserAction } from "../../lib/module/engine/actions.js";

test("creates an official user action and resolves current context bindings", () => {
  const action = resolveA2UIUserAction({
    surfaceId: "products",
    sourceComponentId: "add-button",
    scopePath: "/items/1",
    action: {
      event: {
        name: "add_to_cart",
        context: {
          productId: { path: "id" },
          cartId: { path: "/cart/id" },
          source: "recommendation",
        },
      },
    },
    dataModel: {
      cart: { id: "cart-1" },
      items: [{ id: "apple" }, { id: "banana" }],
    },
    timestamp: "2026-07-18T10:00:00.000Z",
  });

  assert.deepEqual(action, {
    name: "add_to_cart",
    surfaceId: "products",
    sourceComponentId: "add-button",
    timestamp: "2026-07-18T10:00:00.000Z",
    context: {
      productId: "banana",
      cartId: "cart-1",
      source: "recommendation",
    },
  });
  assert.equal(Object.isFrozen(action), true);
  assert.equal(Object.isFrozen(action.context), true);
});

test("resolves escaped context pointers", () => {
  const action = resolveA2UIUserAction({
    surfaceId: "main",
    sourceComponentId: "root",
    scopePath: "/",
    action: {
      event: {
        name: "select",
        context: { value: { path: "/a~1b/m~0n" } },
      },
    },
    dataModel: { "a/b": { "m~n": "escaped" } },
    timestamp: "2026-07-18T10:00:00.000Z",
  });

  assert.equal(action.context.value, "escaped");
});

test("rejects malformed and local function actions", () => {
  assert.throws(
    () =>
      resolveA2UIUserAction({
        surfaceId: "main",
        sourceComponentId: "root",
        scopePath: "/",
        action: { event: { context: {} } },
        dataModel: {},
      }),
    /invalid A2UI action/,
  );

  assert.throws(
    () =>
      resolveA2UIUserAction({
        surfaceId: "main",
        sourceComponentId: "root",
        scopePath: "/",
        action: {
          functionCall: { call: "openUrl", args: {}, returnType: "void" },
        },
        dataModel: {},
      }),
    /registered client function/,
  );
});
