import assert from "node:assert/strict";
import test from "node:test";

import { z } from "zod";

import {
  createA2UIEngine,
  defineA2UICatalog,
} from "../../lib/module/index.js";

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
      components: [
        { id: "root", component: "Text", text: "First updated" },
      ],
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
