import assert from "node:assert/strict";
import test from "node:test";

import { z } from "zod";

import { createA2UIEngine, defineA2UICatalog } from "../../lib/module/index.js";

const catalog = defineA2UICatalog({
  id: "urn:example:a2ui:catalog:v1",
  components: {
    Text: {
      schema: z.object({ text: z.string() }),
      presenter: () => null,
    },
    Badge: {
      schema: z.object({ label: z.string() }),
      presenter: () => null,
    },
  },
});

function createSurface(surfaceId, text) {
  return [
    {
      version: "v0.9",
      createSurface: { surfaceId, catalogId: catalog.id },
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

test("creates and updates multiple surfaces independently", () => {
  const engine = createA2UIEngine({ catalogs: [catalog] });
  engine.applyMessages([
    ...createSurface("first", "First"),
    ...createSurface("second", "Second"),
  ]);

  const secondBeforeUpdate = engine.getSurface("second");
  let firstNotifications = 0;
  let secondNotifications = 0;
  engine.subscribeSurface("first", () => {
    firstNotifications += 1;
  });
  engine.subscribeSurface("second", () => {
    secondNotifications += 1;
  });

  engine.applyMessage({
    version: "v0.9",
    updateComponents: {
      surfaceId: "first",
      components: [{ id: "root", component: "Text", text: "First updated" }],
    },
  });

  assert.deepEqual(engine.getSnapshot().surfaceIds, ["first", "second"]);
  assert.equal(
    engine.getSurface("first")?.components.root?.props.text,
    "First updated",
  );
  assert.equal(engine.getSurface("second"), secondBeforeUpdate);
  assert.equal(firstNotifications, 1);
  assert.equal(secondNotifications, 0);
});

test("replaces component properties without retaining stale values", () => {
  const engine = createA2UIEngine({ catalogs: [catalog] });
  engine.applyMessages(createSurface("main", "Original"));
  engine.applyMessage({
    version: "v0.9",
    updateComponents: {
      surfaceId: "main",
      components: [
        {
          id: "root",
          component: "Text",
          text: "Replacement",
        },
      ],
    },
  });

  assert.deepEqual(engine.getSurface("main")?.components.root, {
    id: "root",
    type: "Text",
    props: { text: "Replacement" },
  });
});

test("replaces the reserved root component when its type changes", () => {
  const engine = createA2UIEngine({ catalogs: [catalog] });
  engine.applyMessages(createSurface("main", "Original"));
  const previousRoot = engine.getSurface("main")?.components.root;

  engine.applyMessage({
    version: "v0.9",
    updateComponents: {
      surfaceId: "main",
      components: [{ id: "root", component: "Badge", label: "New root" }],
    },
  });

  const surface = engine.getSurface("main");
  assert.equal(surface?.rootId, "root");
  assert.notEqual(surface?.components.root, previousRoot);
  assert.deepEqual(surface?.components.root, {
    id: "root",
    type: "Badge",
    props: { label: "New root" },
  });
});

test("deletes a surface and notifies only its subscribers", () => {
  const engine = createA2UIEngine({ catalogs: [catalog] });
  engine.applyMessages([
    ...createSurface("first", "First"),
    ...createSurface("second", "Second"),
  ]);
  let firstNotifications = 0;
  let secondNotifications = 0;
  engine.subscribeSurface("first", () => {
    firstNotifications += 1;
  });
  engine.subscribeSurface("second", () => {
    secondNotifications += 1;
  });

  engine.applyMessage({
    version: "v0.9",
    deleteSurface: { surfaceId: "first" },
  });

  assert.equal(engine.getSurface("first"), undefined);
  assert.ok(engine.getSurface("second"));
  assert.deepEqual(engine.getSnapshot().surfaceIds, ["second"]);
  assert.equal(firstNotifications, 1);
  assert.equal(secondNotifications, 0);
});

test("recreating a deleted surface starts a fresh lifecycle", () => {
  const engine = createA2UIEngine({ catalogs: [catalog] });
  engine.applyMessages(createSurface("main", "Before deletion"));
  const previousSurface = engine.getSurface("main");

  engine.applyMessage({
    version: "v0.9",
    deleteSurface: { surfaceId: "main" },
  });
  engine.applyMessages(createSurface("main", "After recreation"));

  const recreatedSurface = engine.getSurface("main");
  assert.notEqual(recreatedSurface, previousSurface);
  assert.equal(recreatedSurface?.revision, 2);
  assert.equal(
    recreatedSurface?.components.root?.props.text,
    "After recreation",
  );
});

for (const version of ["v0.9", "v0.9.1"]) {
  test(`${version} missing deletions report errors without notifying healthy surfaces`, () => {
    const errors = [];
    const engine = createA2UIEngine({
      catalogs: [catalog],
      onError: (error) => errors.push(error),
    });
    engine.applyMessage({
      version,
      createSurface: { surfaceId: "healthy", catalogId: catalog.id },
    });
    const healthy = engine.getSurface("healthy");
    const ids = engine.getSnapshot().surfaceIds;
    let healthyNotifications = 0;
    let targetNotifications = 0;
    engine.subscribeSurface("healthy", () => healthyNotifications++);
    engine.subscribeSurface("target", () => targetNotifications++);
    engine.applyMessage({ version, deleteSurface: { surfaceId: "target" } });
    assert.equal(errors.length, 1);
    assert.equal(errors[0].code, "INVALID_MESSAGE");
    assert.equal(errors[0].surfaceId, "target");
    assert.deepEqual(engine.getSnapshot().failedSurfaceIds, ["target"]);
    assert.equal(engine.getErrors()[0], errors[0]);
    assert.equal(engine.getSurface("healthy"), healthy);
    assert.equal(engine.getSnapshot().surfaceIds, ids);
    assert.equal(healthyNotifications, 0);
    assert.equal(targetNotifications, 1);

    engine.applyMessages([
      { version, deleteSurface: { surfaceId: "target" } },
      {
        version,
        createSurface: { surfaceId: "target", catalogId: catalog.id },
      },
      {
        version,
        updateDataModel: { surfaceId: "target", value: { fresh: true } },
      },
    ]);
    assert.equal(errors.length, 2);
    assert.equal(engine.getErrors().length, 2);
    assert.deepEqual(engine.getSnapshot().failedSurfaceIds, []);
    assert.deepEqual(engine.getSurface("target").dataModel, { fresh: true });
    assert.equal(engine.getSurface("healthy"), healthy);
    assert.equal(healthyNotifications, 0);
    assert.equal(targetNotifications, 2);
    engine.dispose();
  });

  test(`${version} ordered recreation clears old state and disposal ignores deletions`, () => {
    const engine = createA2UIEngine({ catalogs: [catalog] });
    engine.applyMessages([
      { version, createSurface: { surfaceId: "main", catalogId: catalog.id } },
      { version, updateDataModel: { surfaceId: "main", value: { old: true } } },
      {
        version,
        updateComponents: {
          surfaceId: "main",
          components: [{ id: "root", component: "Text", text: "Old" }],
        },
      },
      { version, deleteSurface: { surfaceId: "main" } },
      { version, deleteSurface: { surfaceId: "main" } },
      { version, createSurface: { surfaceId: "main", catalogId: catalog.id } },
    ]);
    assert.equal(engine.getErrors().length, 1);
    assert.deepEqual(engine.getSnapshot().failedSurfaceIds, []);
    assert.deepEqual(engine.getSurface("main").dataModel, {});
    assert.deepEqual(engine.getSurface("main").components, {});
    assert.equal(engine.getSurface("main").revision, 1);
    engine.dispose();
    const disposed = engine.getSnapshot();
    const errorsBeforeIgnoredMessage = engine.getErrors();
    engine.applyMessage({ version, deleteSurface: { surfaceId: "main" } });
    assert.equal(engine.getSnapshot(), disposed);
    assert.equal(engine.getErrors(), errorsBeforeIgnoredMessage);
    assert.equal(engine.getSurface("main"), undefined);
  });
}
