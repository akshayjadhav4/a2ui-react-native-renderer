import assert from "node:assert/strict";
import test from "node:test";

import { z } from "zod";

import {
  createA2UIEngine,
  defineA2UICatalog,
  defineA2UIComponent,
} from "../../lib/module/index.js";

const catalog = defineA2UICatalog({
  id: "urn:example:a2ui:catalog:v1",
  components: {
    Text: defineA2UIComponent({
      schema: z.object({ text: z.string() }),
      presenter: () => null,
    }),
  },
});

const welcomeMessages = [
  {
    version: "v0.9",
    createSurface: {
      surfaceId: "welcome",
      catalogId: catalog.id,
    },
  },
  {
    version: "v0.9",
    updateComponents: {
      surfaceId: "welcome",
      components: [
        {
          id: "root",
          component: "Text",
          text: "Hello from A2UI",
        },
      ],
    },
  },
];

test("creates an immutable package-owned surface snapshot", () => {
  const engine = createA2UIEngine({ catalogs: [catalog] });

  engine.applyMessages(welcomeMessages);

  const surface = engine.getSurface("welcome");
  assert.ok(surface);
  assert.equal(surface.surfaceId, "welcome");
  assert.equal(surface.catalogId, catalog.id);
  assert.equal(surface.rootId, "root");
  assert.deepEqual(surface.components.root, {
    id: "root",
    type: "Text",
    props: { text: "Hello from A2UI" },
  });
  assert.deepEqual(engine.getSnapshot().surfaceIds, ["welcome"]);
  assert.ok(Object.isFrozen(surface));
  assert.ok(Object.isFrozen(surface.components));
  assert.ok(Object.isFrozen(surface.components.root));
  assert.ok(Object.isFrozen(surface.components.root.props));
});

test("publishes one stable snapshot notification for a message batch", () => {
  const engine = createA2UIEngine({ catalogs: [catalog] });
  const initialSnapshot = engine.getSnapshot();
  let notifications = 0;

  const unsubscribe = engine.subscribe(() => {
    notifications += 1;
  });

  engine.applyMessages(welcomeMessages);

  const nextSnapshot = engine.getSnapshot();
  assert.equal(notifications, 1);
  assert.notEqual(nextSnapshot, initialSnapshot);
  assert.equal(engine.getSnapshot(), nextSnapshot);
  assert.equal(engine.getSurface("welcome"), engine.getSurface("welcome"));

  unsubscribe();
});

test("reports malformed messages without throwing or replacing valid state", () => {
  const errors = [];
  const engine = createA2UIEngine({
    catalogs: [catalog],
    onError: (error) => errors.push(error),
  });
  engine.applyMessages(welcomeMessages);
  const validSurface = engine.getSurface("welcome");

  assert.doesNotThrow(() => {
    engine.applyMessage({
      version: "v0.9",
      updateComponents: {
        surfaceId: "welcome",
        components: [{ component: "Text", text: "Missing id" }],
      },
    });
  });

  assert.equal(errors.length, 1);
  assert.equal(errors[0].code, "INVALID_MESSAGE");
  assert.equal(errors[0].surfaceId, "welcome");
  assert.equal(engine.getErrors()[0], errors[0]);
  assert.equal(engine.getSurface("welcome"), validSurface);
});

test("reports unsupported protocol versions distinctly", () => {
  const errors = [];
  const engine = createA2UIEngine({
    catalogs: [catalog],
    onError: (error) => errors.push(error),
  });

  engine.applyMessage({
    version: "v1.0",
    createSurface: {
      surfaceId: "future",
      catalogId: catalog.id,
    },
  });

  assert.equal(errors.length, 1);
  assert.equal(errors[0].code, "UNSUPPORTED_VERSION");
  assert.equal(engine.getSurface("future"), undefined);
});

test("keeps engine instances isolated", () => {
  const first = createA2UIEngine({ catalogs: [catalog] });
  const second = createA2UIEngine({ catalogs: [catalog] });

  first.applyMessages(welcomeMessages);

  assert.ok(first.getSurface("welcome"));
  assert.equal(second.getSurface("welcome"), undefined);
  assert.deepEqual(second.getSnapshot().surfaceIds, []);
});

test("rejects duplicate catalog ids before creating processor state", () => {
  assert.throws(() => createA2UIEngine({ catalogs: [catalog, catalog] }), {
    name: "TypeError",
    message: `Duplicate A2UI catalog id "${catalog.id}"`,
  });
});

test("reports an unknown surface catalog with structured identifiers", () => {
  const errors = [];
  const engine = createA2UIEngine({
    catalogs: [catalog],
    onError: (error) => errors.push(error),
  });

  engine.applyMessage({
    version: "v0.9",
    createSurface: {
      surfaceId: "unknown-catalog-surface",
      catalogId: "urn:missing:a2ui:catalog:v1",
    },
  });

  assert.equal(errors.length, 1);
  assert.equal(errors[0].code, "UNKNOWN_CATALOG");
  assert.equal(errors[0].surfaceId, "unknown-catalog-surface");
  assert.equal(errors[0].catalogId, "urn:missing:a2ui:catalog:v1");
});
