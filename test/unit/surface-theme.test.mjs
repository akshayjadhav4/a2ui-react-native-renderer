import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { createA2UIEngine, defineA2UICatalog } from "../../lib/module/index.js";

const components = {
  Label: { schema: z.object({ text: z.string() }), presenter: () => null },
};
const themeSchema = z
  .object({
    color: z.string().default("blue"),
    nested: z.object({ shades: z.array(z.string()) }).optional(),
  })
  .strict();
const catalog = defineA2UICatalog({ id: "themed", themeSchema, components });
const generic = defineA2UICatalog({ id: "generic", components });

for (const version of ["v0.9", "v0.9.1"]) {
  test(`${version} stores parsed immutable themes and preserves lifetime isolation`, () => {
    const engine = createA2UIEngine({ catalogs: [catalog, generic] });
    const theme = { color: "red", nested: { shades: ["pink"] } };
    const create = (surfaceId, catalogId, value) =>
      engine.applyMessage({
        version,
        createSurface: {
          surfaceId,
          catalogId,
          ...(value === undefined ? {} : { theme: value }),
        },
      });
    create("a", catalog.id, theme);
    create("b", catalog.id, {});
    create("omitted", catalog.id);
    create("generic", generic.id, { arbitrary: { list: [1] } });
    const first = engine.getSurface("a");
    assert.deepEqual(first.theme, theme);
    theme.nested.shades[0] = "mutated";
    assert.equal(first.theme.nested.shades[0], "pink");
    assert.throws(() => {
      first.theme.nested.shades.push("mutated");
    }, TypeError);
    assert.deepEqual(engine.getSurface("b").theme, { color: "blue" });
    assert.equal(engine.getSurface("omitted").theme, undefined);
    assert.deepEqual(engine.getSurface("generic").theme, {
      arbitrary: { list: [1] },
    });
    engine.applyMessages([
      { version, updateDataModel: { surfaceId: "a", value: { x: 1 } } },
      {
        version,
        updateComponents: {
          surfaceId: "a",
          components: [{ id: "root", component: "Label", text: "hello" }],
        },
      },
    ]);
    assert.equal(engine.getSurface("a").theme, first.theme);
    assert.deepEqual(engine.getSurface("b").theme, { color: "blue" });
    engine.applyMessage({ version, deleteSurface: { surfaceId: "a" } });
    create("a", catalog.id);
    assert.equal(engine.getSurface("a").theme, undefined);
    engine.dispose();
  });

  test(`${version} rejects invalid themes atomically and recovers within batches`, () => {
    const errors = [];
    const engine = createA2UIEngine({
      catalogs: [catalog, generic],
      onError: (error) => errors.push(error),
    });
    engine.applyMessage({
      version,
      createSurface: {
        surfaceId: "healthy",
        catalogId: catalog.id,
        theme: { color: "green" },
      },
    });
    const healthy = engine.getSurface("healthy");
    for (const catalogId of [catalog.id, generic.id]) {
      for (const theme of [42, "bad", null, [], true]) {
        engine.applyMessage({
          version,
          createSurface: { surfaceId: "bad", catalogId, theme },
        });
        assert.equal(engine.getSurface("bad"), undefined);
        assert.equal(errors.at(-1).code, "INVALID_MESSAGE");
        assert.equal(errors.at(-1).surfaceId, "bad");
        assert.equal(errors.at(-1).catalogId, catalogId);
        assert.match(errors.at(-1).path, /^\/createSurface\/theme/);
      }
    }
    engine.applyMessages([
      {
        version,
        createSurface: {
          surfaceId: "bad",
          catalogId: catalog.id,
          theme: { color: 42 },
        },
      },
      {
        version,
        createSurface: {
          surfaceId: "bad",
          catalogId: catalog.id,
          theme: { color: "fixed" },
        },
      },
    ]);
    assert.deepEqual(engine.getSurface("bad").theme, { color: "fixed" });
    assert.deepEqual(engine.getSnapshot().failedSurfaceIds, []);
    assert.equal(engine.getSurface("healthy"), healthy);
    engine.applyMessage({
      version,
      createSurface: {
        surfaceId: "healthy",
        catalogId: catalog.id,
        theme: { color: 42 },
      },
    });
    assert.equal(engine.getSurface("healthy"), healthy);
    assert.equal(
      errors.at(-1).message,
      'A2UI surface "healthy" already exists',
    );
    engine.dispose();
  });
}

for (const version of ["v0.9", "v0.9.1"]) {
  test(`${version} missing theme bypasses required fields and rejects non-JSON values`, () => {
    const required = defineA2UICatalog({
      id: "required",
      components,
      themeSchema: z.object({ color: z.string() }),
    });
    const errors = [];
    const engine = createA2UIEngine({
      catalogs: [required, generic],
      onError: (error) => errors.push(error),
    });
    engine.applyMessage({
      version,
      createSurface: { surfaceId: "omitted", catalogId: required.id },
    });
    assert.ok(engine.getSurface("omitted"));
    assert.equal(engine.getSurface("omitted").theme, undefined);
    engine.applyMessage({
      version,
      createSurface: {
        surfaceId: "missing-field",
        catalogId: required.id,
        theme: {},
      },
    });
    assert.equal(engine.getSurface("missing-field"), undefined);
    assert.equal(errors.at(-1).path, "/createSurface/theme/color");
    const cycle = {};
    cycle.self = cycle;
    for (const nested of [
      undefined,
      () => null,
      new Date(),
      NaN,
      Infinity,
      cycle,
    ]) {
      engine.applyMessage({
        version,
        createSurface: {
          surfaceId: "invalid",
          catalogId: generic.id,
          theme: { nested },
        },
      });
      assert.equal(engine.getSurface("invalid"), undefined);
      assert.equal(errors.at(-1).path, "/createSurface/theme");
    }
    engine.dispose();
  });
}

test("generic themes preserve JSON field names without changing prototypes", () => {
  const engine = createA2UIEngine({ catalogs: [generic] });
  const theme = JSON.parse(
    '{"__proto__":{"color":"red"},"constructor":"value"}',
  );
  engine.applyMessage({
    version: "v0.9.1",
    createSurface: { surfaceId: "special", catalogId: generic.id, theme },
  });
  assert.deepEqual(engine.getSurface("special").theme, theme);
  assert.equal(
    Object.getPrototypeOf(engine.getSurface("special").theme),
    Object.prototype,
  );
  engine.dispose();
});
