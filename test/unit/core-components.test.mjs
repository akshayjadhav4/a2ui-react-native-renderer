import assert from "node:assert/strict";
import test from "node:test";

import { z } from "zod";

import {
  A2UIChildListSchema,
  DEFAULT_A2UI_RESOURCE_LIMITS,
  defineA2UICatalog,
} from "../../lib/module/index.js";
import { A2UIProtocolCore } from "../../lib/module/protocol/v0_9/core.js";

const catalog = defineA2UICatalog({
  id: "app",
  components: {
    Row: {
      schema: z.object({ children: A2UIChildListSchema }),
      presenter: () => null,
    },
    Text: { schema: z.object({ text: z.string() }), presenter: () => null },
  },
});

function createCore() {
  const core = new A2UIProtocolCore([catalog], DEFAULT_A2UI_RESOURCE_LIMITS);
  assert.equal(
    core.apply({
      version: "v0.9.1",
      createSurface: { surfaceId: "s", catalogId: "app" },
    }).success,
    true,
  );
  return core;
}

function update(components) {
  return {
    version: "v0.9.1",
    updateComponents: { surfaceId: "s", components },
  };
}

test("commits a complete app-owned component graph and later replacements", () => {
  const core = createCore();
  assert.equal(
    core.apply(
      update([
        { id: "root", component: "Row", children: ["label"] },
        { id: "label", component: "Text", text: "Hello" },
      ]),
    ).success,
    true,
  );
  const before = core.getSurface("s");
  assert.equal(before.rootId, "root");
  assert.equal(before.revision, 2);
  assert.deepEqual(before.components.label.props, { text: "Hello" });

  assert.equal(
    core.apply(update([{ id: "label", component: "Text", text: "Ada" }]))
      .success,
    true,
  );
  const after = core.getSurface("s");
  assert.equal(after.revision, 3);
  assert.deepEqual(after.components.label.props, { text: "Ada" });
  assert.deepEqual(before.components.label.props, { text: "Hello" });
  assert.ok(Object.isFrozen(after.components.label.props));
});

test("a late invalid component rejects the entire update", () => {
  const core = createCore();
  assert.equal(
    core.apply(update([{ id: "root", component: "Text", text: "original" }]))
      .success,
    true,
  );
  const before = core.getSurface("s");

  const result = core.apply(
    update([
      { id: "root", component: "Text", text: "new" },
      { id: "other", component: "Text", text: 123 },
    ]),
  );
  assert.equal(result.success, false);
  assert.equal(result.error.code, "INVALID_COMPONENT_PROPS");
  assert.equal(core.getSurface("s"), before);
  assert.equal(core.getSurface("s")?.components.other, undefined);
});

test("a missing surface fails while a missing child stays pending", () => {
  const core = createCore();
  const missing = core.apply({
    version: "v0.9.1",
    updateComponents: {
      surfaceId: "other",
      components: [{ id: "root", component: "Text", text: "Hi" }],
    },
  });
  assert.equal(missing.success, false);
  assert.equal(missing.error.code, "INVALID_MESSAGE");

  const pending = core.apply(
    update([{ id: "root", component: "Row", children: ["missing"] }]),
  );
  assert.equal(pending.success, true);
  assert.equal(core.getSurface("s").rootId, "root");
  assert.deepEqual(core.getSurface("s").pendingComponentIds, ["missing"]);

  const beforeInvalid = core.getSurface("s");
  const invalid = core.apply(
    update([{ id: "missing", component: "Row", children: ["root"] }]),
  );
  assert.equal(invalid.success, false);
  assert.equal(invalid.error.code, "INVALID_REFERENCE");
  assert.equal(core.getSurface("s"), beforeInvalid);

  assert.equal(
    core.apply(update([{ id: "missing", component: "Text", text: "Ready" }]))
      .success,
    true,
  );
  assert.deepEqual(core.getSurface("s").pendingComponentIds, []);
});

for (const version of ["v0.9", "v0.9.1"]) {
  test(`${version} buffers components before root and notifies on each accepted update`, () => {
    const core = createCore();
    const childFirst = {
      version,
      updateComponents: {
        surfaceId: "s",
        components: [{ id: "label", component: "Text", text: "First" }],
      },
    };
    assert.equal(core.apply(childFirst).success, true);
    assert.equal(core.getSurface("s").rootId, null);
    assert.deepEqual(core.getSurface("s").pendingComponentIds, ["root"]);
    assert.equal(core.getSurface("s").revision, 2);

    assert.equal(
      core.apply({
        version,
        updateComponents: {
          surfaceId: "s",
          components: [{ id: "root", component: "Row", children: ["label"] }],
        },
      }).success,
      true,
    );
    assert.equal(core.getSurface("s").rootId, "root");
    assert.deepEqual(core.getSurface("s").pendingComponentIds, []);
    assert.equal(core.getSurface("s").revision, 3);
  });
}
