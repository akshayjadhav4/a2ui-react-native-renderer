import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import { prepareClientDataModel } from "../../lib/module/engine/clientDataModel.js";
import { z } from "zod";
import { createA2UIEngine, defineA2UICatalog } from "../../lib/module/index.js";

const catalog = defineA2UICatalog({
  id: "metadata",
  components: {
    Label: { schema: z.object({ text: z.string() }), presenter: () => null },
  },
});

function add(engine, id, version, sendDataModel, data = { id }) {
  engine.applyMessages([
    {
      version,
      createSurface: {
        surfaceId: id,
        catalogId: catalog.id,
        ...(sendDataModel === undefined ? {} : { sendDataModel }),
      },
    },
    { version, updateDataModel: { surfaceId: id, value: data } },
  ]);
}

for (const version of ["v0.9", "v0.9.1"]) {
  test(`${version} selects only live opted-in models without side effects`, () => {
    const errors = [];
    const engine = createA2UIEngine({
      catalogs: [catalog],
      onError: (error) => errors.push(error),
    });
    add(engine, "selected", version, true);
    add(engine, "private", version, true);
    add(engine, "false", version, false);
    add(engine, "omitted", version, undefined);
    const before = engine.getSnapshot();
    let notifications = 0;
    engine.subscribe(() => notifications++);
    engine.subscribeSurface("selected", () => notifications++);
    assert.deepEqual(
      engine.getClientDataModel([
        "selected",
        "selected",
        "missing",
        "false",
        "omitted",
      ]),
      {
        version,
        surfaces: { selected: { id: "selected" } },
      },
    );
    assert.equal(engine.getClientDataModel([]), undefined);
    assert.equal(
      engine.getClientDataModel(["false", "omitted", "missing"]),
      undefined,
    );
    assert.equal(engine.getSnapshot(), before);
    assert.equal(notifications, 0);
    assert.deepEqual(errors, []);
    engine.applyMessage({ version, deleteSurface: { surfaceId: "selected" } });
    assert.equal(engine.getClientDataModel(["selected"]), undefined);
    add(engine, "selected", version, false);
    assert.equal(engine.getClientDataModel(["selected"]), undefined);
    engine.dispose();
    assert.equal(engine.getClientDataModel(["private"]), undefined);
  });

  test(`${version} returns full detached immutable JSON models with safe field names`, () => {
    const engine = createA2UIEngine({ catalogs: [catalog] });
    const data = JSON.parse(
      '{"__proto__":{"safe":true},"constructor":"field","items":[{"name":"A"}],"keep":7}',
    );
    add(engine, "__proto__", version, true, data);
    const result = engine.getClientDataModel(["__proto__"]);
    assert.deepEqual(result, {
      version,
      surfaces: Object.fromEntries([["__proto__", data]]),
    });
    assert.notEqual(
      result.surfaces.__proto__,
      engine.getSurface("__proto__").dataModel,
    );
    assert.equal(Object.getPrototypeOf(result.surfaces), Object.prototype);
    data.items[0].name = "mutated";
    assert.equal(result.surfaces.__proto__.items[0].name, "A");
    assert.throws(() => {
      result.surfaces.__proto__.items.push({ name: "bad" });
    }, TypeError);
    engine.applyMessage({
      version,
      updateDataModel: {
        surfaceId: "__proto__",
        path: "/items/0/name",
        value: "B",
      },
    });
    assert.equal(result.surfaces.__proto__.items[0].name, "A");
    assert.equal(
      engine.getClientDataModel(["__proto__"]).surfaces.__proto__.items[0].name,
      "B",
    );
    engine.dispose();
  });
}

test("fails atomically for mixed included versions and invalid included models", () => {
  const errors = [];
  const engine = createA2UIEngine({
    catalogs: [catalog],
    onError: (error) => errors.push(error),
  });
  add(engine, "old", "v0.9", true);
  add(engine, "new", "v0.9.1", true);
  add(engine, "excluded", "v0.9.1", false, []);
  const before = engine.getSnapshot();
  assert.throws(() => engine.getClientDataModel(["old", "new"]), /version/i);
  assert.deepEqual(engine.getClientDataModel(["old", "excluded"]), {
    version: "v0.9",
    surfaces: { old: { id: "old" } },
  });
  assert.equal(engine.getSnapshot(), before);
  for (const value of [
    [],
    "scalar",
    null,
    12,
    { invalid: undefined },
    { invalid: () => null },
    { invalid: NaN },
  ]) {
    add(engine, "bad", "v0.9", true, value);
    const accepted = engine.getSnapshot();
    assert.throws(
      () => engine.getClientDataModel(["old", "bad"]),
      (error) => error instanceof TypeError && error.message.includes("bad"),
    );
    assert.equal(engine.getSnapshot(), accepted);
    engine.applyMessage({
      version: "v0.9",
      deleteSurface: { surfaceId: "bad" },
    });
  }
  assert.deepEqual(errors, []);
  engine.dispose();
});

for (const [fixture, version] of [
  ["v0_9", "v0.9"],
  ["v0_9_1", "v0.9.1"],
]) {
  test(`${version} prepared metadata validates against the official pinned schema`, () => {
    const schema = JSON.parse(
      readFileSync(
        new URL(
          `../fixtures/a2ui/${fixture}/client_data_model.json`,
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const validate = new Ajv2020({ strict: false }).compile(schema);
    const engine = createA2UIEngine({ catalogs: [catalog] });
    add(engine, "form", version, true, {
      items: [{ name: "Edited" }],
      flag: true,
      count: 2,
      empty: null,
    });
    const result = engine.getClientDataModel(["form"]);
    assert.equal(validate(result), true, JSON.stringify(validate.errors));
    assert.deepEqual(Object.keys(result).sort(), ["surfaces", "version"]);
    assert.equal(Object.hasOwn(result.surfaces.form, "components"), false);
    engine.dispose();
  });
}

test("cyclic and non-JSON models fail preparation without invoking diagnostics", () => {
  const cycle = {};
  cycle.self = cycle;
  for (const dataModel of [
    cycle,
    { value: new Date() },
    { values: new Array(1) },
    { value: Infinity },
  ]) {
    const surface = {
      surfaceId: "bad",
      version: "v0.9",
      sendDataModel: true,
      dataModel,
    };
    assert.throws(
      () => prepareClientDataModel(["bad"], () => surface),
      (error) => error instanceof TypeError && error.message.includes("bad"),
    );
  }
});
