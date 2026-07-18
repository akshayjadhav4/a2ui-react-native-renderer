import assert from "node:assert/strict";
import test from "node:test";

import { createA2UIEngine, defineA2UICatalog } from "../../lib/module/index.js";
import {
  readDataPointer,
  resolveBindingPath,
  resolveStructuralChildren,
  updateDataPointer,
} from "../../lib/module/protocol/v0_9/bindings.js";
import { z } from "zod";

const catalog = defineA2UICatalog({
  id: "urn:example:a2ui:bindings:v1",
  components: {
    Text: {
      schema: z.object({ text: z.string() }),
      presenter: () => null,
    },
  },
});

function createSurface(engine, surfaceId = "main") {
  engine.applyMessage({
    version: "v0.9",
    createSurface: {
      surfaceId,
      catalogId: catalog.id,
    },
  });
}

test("resolves absolute and relative binding paths", () => {
  assert.equal(resolveBindingPath("/products/1", "/title"), "/title");
  assert.equal(resolveBindingPath("/products/1", "name"), "/products/1/name");
  assert.equal(resolveBindingPath("/products/1/", "."), "/products/1");
  assert.equal(resolveBindingPath("/", "title"), "/title");
});

test("reads escaped JSON pointer tokens and array indexes", () => {
  const data = {
    "a/b": { "m~n": "escaped" },
    items: [{ name: "first" }, { name: "second" }],
  };

  assert.equal(readDataPointer(data, "/a~1b/m~0n"), "escaped");
  assert.equal(readDataPointer(data, "/items/1/name"), "second");
  assert.equal(readDataPointer(data, "/missing"), undefined);
});

test("updates nested data immutably", () => {
  const original = {
    profile: { name: "Ada", role: "Engineer" },
    untouched: { stable: true },
  };
  const updated = updateDataPointer(original, "/profile/name", "Grace");

  assert.deepEqual(updated, {
    profile: { name: "Grace", role: "Engineer" },
    untouched: { stable: true },
  });
  assert.equal(original.profile.name, "Ada");
  assert.equal(updated.untouched, original.untouched);
});

test("replaces the root and deletes object properties", () => {
  assert.deepEqual(updateDataPointer({ old: true }, "/", { next: true }), {
    next: true,
  });
  assert.deepEqual(
    updateDataPointer(
      { title: "Draft", status: "pending" },
      "/status",
      undefined,
    ),
    { title: "Draft" },
  );
});

test("preserves array length when deleting an array index", () => {
  const updated = updateDataPointer(["a", "b", "c"], "/1", undefined);

  assert.equal(updated.length, 3);
  assert.equal(updated[1], undefined);
  assert.deepEqual(updated, ["a", undefined, "c"]);
});

test("builds structural child scopes from a relative list binding", () => {
  const children = resolveStructuralChildren(
    { sections: [{ items: [{ id: 1 }, { id: 2 }] }] },
    "/sections/0",
    "row-template",
    "items",
  );

  assert.deepEqual(children, [
    { id: "row-template", basePath: "/sections/0/items/0" },
    { id: "row-template", basePath: "/sections/0/items/1" },
  ]);
});

test("rejects malformed pointers and non-numeric array tokens", () => {
  assert.throws(
    () => readDataPointer({}, "/bad~2escape"),
    /Invalid JSON pointer/,
  );
  assert.throws(
    () => updateDataPointer([], "/name", "invalid"),
    /non-numeric array token/,
  );
});

test("stores immutable data-model snapshots per surface", () => {
  const engine = createA2UIEngine({ catalogs: [catalog] });
  createSurface(engine);
  engine.applyMessage({
    version: "v0.9",
    updateDataModel: {
      surfaceId: "main",
      path: "/",
      value: { profile: { name: "Ada" } },
    },
  });

  const first = engine.getSurface("main").dataModel;
  engine.applyMessage({
    version: "v0.9",
    updateDataModel: {
      surfaceId: "main",
      path: "/profile/name",
      value: "Grace",
    },
  });

  assert.deepEqual(first, { profile: { name: "Ada" } });
  assert.deepEqual(engine.getSurface("main").dataModel, {
    profile: { name: "Grace" },
  });
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.profile), true);
});

test("isolates, deletes, and resets surface data models", () => {
  const engine = createA2UIEngine({ catalogs: [catalog] });
  createSurface(engine, "one");
  createSurface(engine, "two");
  engine.applyMessage({
    version: "v0.9",
    updateDataModel: { surfaceId: "one", value: { value: 1 } },
  });

  assert.deepEqual(engine.getSurface("one").dataModel, { value: 1 });
  assert.deepEqual(engine.getSurface("two").dataModel, {});

  engine.applyMessage({
    version: "v0.9",
    deleteSurface: { surfaceId: "one" },
  });
  createSurface(engine, "one");

  assert.deepEqual(engine.getSurface("one").dataModel, {});
});
