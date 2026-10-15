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
  assert.equal(resolveBindingPath("/products/1/", "."), "/products/1/");
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

test("preserves empty tokens, root aliases and single-pass escaping", () => {
  const original = { record: { "": { "": "old" }, keep: "yes" }, "~1": "once" };
  assert.equal(readDataPointer(original, "/record//"), "old");
  const updated = updateDataPointer(original, "/record//", "new");
  assert.deepEqual(updated.record, { "": { "": "new" }, keep: "yes" });
  assert.deepEqual(updateDataPointer(updated, "/record//", undefined).record, {
    "": {},
    keep: "yes",
  });
  assert.equal(original.record[""][""], "old");
  assert.equal(readDataPointer(original, "/~01"), "once");
  assert.equal(readDataPointer(original, "/"), original);
  assert.equal(readDataPointer(original, ""), original);
  assert.equal(resolveBindingPath("/record/", "name"), "/record//name");
  assert.equal(resolveBindingPath("/record/", ""), "/record/");
  assert.deepEqual(
    resolveStructuralChildren(
      { record: { "": [1, 2] } },
      "/",
      "row",
      "/record/",
    ),
    [
      { id: "row", basePath: "/record//0" },
      { id: "row", basePath: "/record//1" },
    ],
  );
});

test("rejects invalid array addresses on reads and writes, preserving object keys", () => {
  for (const token of [
    "length",
    "map",
    "",
    "01",
    "-1",
    "+1",
    "1.0",
    "1e0",
    "1\n",
    "-",
    "4294967295",
    "9007199254740993",
  ]) {
    assert.throws(
      () => readDataPointer({ items: ["a"] }, `/items/${token}`),
      TypeError,
      token,
    );
    assert.throws(
      () => updateDataPointer({ items: ["a"] }, `/items/${token}`, "bad"),
      TypeError,
      token,
    );
    const object = Object.fromEntries([[token, "field"]]);
    // A single slash is A2UI's root alias, so nest the object for an empty key.
    assert.equal(readDataPointer({ object }, `/object/${token}`), "field");
    assert.equal(
      readDataPointer(
        updateDataPointer({ object }, `/object/${token}`, "updated"),
        `/object/${token}`,
      ),
      "updated",
    );
  }
  assert.equal(readDataPointer(["a"], "/4294967294"), undefined);
  assert.equal(readDataPointer({}, "/missing/length"), undefined);
  assert.equal(readDataPointer(["a"], "/2"), undefined);
  assert.deepEqual(updateDataPointer({}, "/items/0", "created"), {
    items: ["created"],
  });
});

test("reads only own fields and writes special names without changing prototypes", () => {
  for (const name of ["__proto__", "constructor", "toString"]) {
    assert.equal(readDataPointer({}, `/${name}`), undefined);
    const original = JSON.parse(`{"${name}":{"value":"old"},"keep":"yes"}`);
    assert.equal(readDataPointer(original, `/${name}/value`), "old");
    const replaced = updateDataPointer(original, `/${name}`, { value: "new" });
    assert.equal(Object.getPrototypeOf(replaced), Object.prototype);
    assert.equal(Object.hasOwn(replaced, name), true);
    assert.equal(readDataPointer(replaced, `/${name}/value`), "new");
    assert.equal(original[name].value, "old");
    assert.deepEqual(updateDataPointer(replaced, `/${name}`, undefined), {
      keep: "yes",
    });
    const created = updateDataPointer({}, `/${name}/value`, "created");
    assert.equal(Object.getPrototypeOf(created), Object.prototype);
    assert.equal(Object.hasOwn(created, name), true);
    assert.equal(readDataPointer(created, `/${name}/value`), "created");
  }
  assert.equal(Object.hasOwn(Object.prototype, "value"), false);
});
