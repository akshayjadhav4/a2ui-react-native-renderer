import assert from "node:assert/strict";
import test from "node:test";

import { z } from "zod";

import {
  DEFAULT_A2UI_RESOURCE_LIMITS,
  defineA2UICatalog,
} from "../../lib/module/index.js";
import { A2UIProtocolCore } from "../../lib/module/protocol/v0_9/core.js";

const catalog = defineA2UICatalog({
  id: "app",
  components: {
    Text: { schema: z.object({ text: z.string() }), presenter: () => null },
  },
});

function createCore(limits = {}) {
  const core = new A2UIProtocolCore([catalog], {
    ...DEFAULT_A2UI_RESOURCE_LIMITS,
    ...limits,
  });
  assert.equal(
    core.apply({
      version: "v0.9.1",
      createSurface: { surfaceId: "s", catalogId: "app" },
    }).success,
    true,
  );
  return core;
}

function dataUpdate(path, value, includeValue = true) {
  return {
    version: "v0.9.1",
    updateDataModel: {
      surfaceId: "s",
      path,
      ...(includeValue ? { value } : {}),
    },
  };
}

test("replaces the root and a path, then removes an omitted value", () => {
  const core = createCore();
  const pendingBeforeData = core.getSurface("s").pendingComponentIds;
  assert.equal(
    core.apply(dataUpdate("/", { user: { name: "Ada" } })).success,
    true,
  );
  const first = core.getSurface("s");
  assert.equal(first.pendingComponentIds, pendingBeforeData);
  assert.deepEqual(first.dataModel, { user: { name: "Ada" } });
  assert.ok(Object.isFrozen(first.dataModel.user));

  assert.equal(core.apply(dataUpdate("/user/name", "Grace")).success, true);
  assert.equal(core.getSurface("s")?.revision, 3);
  assert.deepEqual(core.getSurface("s")?.dataModel, {
    user: { name: "Grace" },
  });
  assert.deepEqual(first.dataModel, { user: { name: "Ada" } });

  assert.equal(
    core.apply(dataUpdate("/user/name", undefined, false)).success,
    true,
  );
  assert.deepEqual(core.getSurface("s")?.dataModel, { user: {} });
});

test("invalid paths and oversized data preserve the previous revision", () => {
  const core = createCore({ maxDataModelBytes: 32 });
  assert.equal(core.apply(dataUpdate("/", { name: "Ada" })).success, true);
  const before = core.getSurface("s");

  const invalid = core.apply(dataUpdate("/name/~2", "bad"));
  assert.equal(invalid.success, false);
  assert.equal(invalid.error.code, "BINDING_ERROR");
  assert.equal(core.getSurface("s"), before);

  const oversized = core.apply(
    dataUpdate("/", { title: "this is much too long for the limit" }),
  );
  assert.equal(oversized.success, false);
  assert.equal(oversized.error.code, "RESOURCE_LIMIT_EXCEEDED");
  assert.equal(core.getSurface("s"), before);
});
