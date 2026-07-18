import assert from "node:assert/strict";
import test from "node:test";

import { z } from "zod";

import {
  createA2UIEngine,
  defineA2UICatalog,
} from "../../lib/module/index.js";

const catalog = defineA2UICatalog({
  id: "urn:example:a2ui:performance:v1",
  components: {
    Text: {
      schema: z.object({ text: z.string() }),
      presenter: () => null,
    },
  },
});

function createSurfaceMessages(surfaceId, text) {
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

test("reuses unchanged engine snapshot collections", () => {
  const engine = createA2UIEngine({ catalogs: [catalog] });
  engine.applyMessages(createSurfaceMessages("main", "Initial"));

  const initial = engine.getSnapshot();
  engine.applyMessage({
    version: "v0.9",
    updateComponents: {
      surfaceId: "main",
      components: [{ id: "root", component: "Text", text: "Updated" }],
    },
  });
  const updated = engine.getSnapshot();

  assert.notEqual(updated, initial);
  assert.equal(updated.surfaceIds, initial.surfaceIds);
  assert.equal(updated.failedSurfaceIds, initial.failedSurfaceIds);
});

test("changes failed-surface identity only when failure membership changes", () => {
  const engine = createA2UIEngine({ catalogs: [catalog] });
  engine.applyMessages(createSurfaceMessages("main", "Initial"));
  const healthy = engine.getSnapshot();

  engine.applyMessage({ version: "v1.0", updateComponents: { surfaceId: "main" } });
  const failed = engine.getSnapshot();
  assert.equal(failed.surfaceIds, healthy.surfaceIds);
  assert.notEqual(failed.failedSurfaceIds, healthy.failedSurfaceIds);
  assert.deepEqual(failed.failedSurfaceIds, ["main"]);

  engine.applyMessage({ version: "v1.0", updateComponents: { surfaceId: "main" } });
  const failedAgain = engine.getSnapshot();
  assert.equal(failedAgain.failedSurfaceIds, failed.failedSurfaceIds);

  engine.applyMessage({
    version: "v0.9",
    updateComponents: {
      surfaceId: "main",
      components: [{ id: "root", component: "Text", text: "Recovered" }],
    },
  });
  const recovered = engine.getSnapshot();
  assert.notEqual(recovered.failedSurfaceIds, failed.failedSurfaceIds);
  assert.deepEqual(recovered.failedSurfaceIds, []);
});
