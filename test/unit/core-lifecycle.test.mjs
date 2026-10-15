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

function createCore() {
  return new A2UIProtocolCore([catalog], DEFAULT_A2UI_RESOURCE_LIMITS);
}

test("creates, deletes, and recreates a surface without retaining old state", () => {
  const core = createCore();
  const create = {
    version: "v0.9.1",
    createSurface: { surfaceId: "s", catalogId: catalog.id },
  };

  assert.equal(core.apply(create).success, true);
  const first = core.getSurface("s");
  assert.ok(first);
  assert.equal(first.revision, 1);
  assert.equal(first.rootId, null);
  assert.deepEqual(first.pendingComponentIds, ["root"]);
  assert.ok(Object.isFrozen(first.pendingComponentIds));
  assert.deepEqual(first.components, {});
  assert.deepEqual(first.dataModel, {});
  assert.ok(Object.isFrozen(first));

  assert.equal(
    core.apply({ version: "v0.9.1", deleteSurface: { surfaceId: "s" } })
      .success,
    true,
  );
  assert.equal(core.getSurface("s"), undefined);
  assert.equal(core.apply(create).success, true);
  assert.equal(core.getSurface("s")?.revision, 1);
  assert.deepEqual(core.getSurface("s")?.pendingComponentIds, ["root"]);
  assert.notEqual(
    core.getSurface("s")?.pendingComponentIds,
    first.pendingComponentIds,
  );
  assert.notEqual(core.getSurface("s"), first);
});

test("duplicate creates and unknown catalogs leave committed state intact", () => {
  const core = createCore();
  const create = {
    version: "v0.9",
    createSurface: { surfaceId: "s", catalogId: catalog.id },
  };

  assert.equal(core.apply(create).success, true);
  const previous = core.getSurface("s");
  const duplicate = core.apply(create);
  assert.equal(duplicate.success, false);
  assert.equal(duplicate.error.code, "INVALID_MESSAGE");
  assert.equal(core.getSurface("s"), previous);

  const unknown = core.apply({
    version: "v0.9.1",
    createSurface: { surfaceId: "other", catalogId: "missing" },
  });
  assert.equal(unknown.success, false);
  assert.equal(unknown.error.code, "UNKNOWN_CATALOG");
  assert.equal(core.getSurface("other"), undefined);
});

test("distinguishes invalid v0.9.1 content from an unsupported version", () => {
  const core = createCore();
  const malformed = core.apply({
    version: "v0.9.1",
    createSurface: { surfaceId: "s" },
  });
  const future = core.apply({
    version: "v1.0",
    createSurface: { surfaceId: "s", catalogId: "app" },
  });
  assert.equal(malformed.success, false);
  assert.equal(malformed.error.code, "INVALID_MESSAGE");
  assert.equal(future.success, false);
  assert.equal(future.error.code, "UNSUPPORTED_VERSION");
  assert.equal(core.getSurface("s"), undefined);
});

for (const version of ["v0.9", "v0.9.1"]) {
  test(`${version} completes a surface, component, data, and delete sequence`, () => {
    const core = createCore();
    const messages = [
      { version, createSurface: { surfaceId: "s", catalogId: "app" } },
      {
        version,
        updateComponents: {
          surfaceId: "s",
          components: [{ id: "root", component: "Text", text: "Hello" }],
        },
      },
      {
        version,
        updateDataModel: { surfaceId: "s", path: "/name", value: "Ada" },
      },
    ];
    for (const message of messages) {
      assert.equal(core.apply(message).success, true);
    }
    assert.equal(core.getSurface("s")?.revision, 3);
    assert.deepEqual(core.getSurface("s")?.pendingComponentIds, []);
    assert.deepEqual(core.getSurface("s")?.dataModel, { name: "Ada" });
    assert.equal(
      core.apply({ version, deleteSurface: { surfaceId: "s" } }).success,
      true,
    );
    assert.equal(core.getSurface("s"), undefined);
  });
}

for (const version of ["v0.9", "v0.9.1"]) {
  for (const state of ["never-created", "deleted", "failed-create"]) {
    test(`${version} rejects deletion of a ${state} surface`, () => {
      const core = createCore();
      core.apply({
        version,
        createSurface: { surfaceId: "healthy", catalogId: catalog.id },
      });
      const healthy = core.getSurface("healthy");
      if (state === "deleted") {
        core.apply({
          version,
          createSurface: { surfaceId: "target", catalogId: catalog.id },
        });
        assert.equal(
          core.apply({ version, deleteSurface: { surfaceId: "target" } })
            .success,
          true,
        );
      } else if (state === "failed-create") {
        assert.equal(
          core.apply({
            version,
            createSurface: { surfaceId: "target", catalogId: "unknown" },
          }).success,
          false,
        );
      }
      const result = core.apply({
        version,
        deleteSurface: { surfaceId: "target" },
      });
      assert.equal(result.success, false);
      assert.equal(result.error.code, "INVALID_MESSAGE");
      assert.equal(result.error.severity, "error");
      assert.equal(result.error.surfaceId, "target");
      assert.equal(core.getSurface("target"), undefined);
      assert.equal(core.getSurface("healthy"), healthy);
      assert.deepEqual(core.getSurfaceIds(), ["healthy"]);
      assert.equal(
        core.apply({
          version,
          createSurface: { surfaceId: "target", catalogId: catalog.id },
        }).success,
        true,
      );
      assert.equal(core.getSurface("target").revision, 1);
      assert.deepEqual(core.getSurface("target").dataModel, {});
    });
  }
}
