import { z } from "zod";

import {
  createA2UIEngine,
  DEFAULT_A2UI_RESOURCE_LIMITS,
  defineA2UICatalog,
  type A2UIMessage,
  type A2UIResourceLimits,
  type A2UISurfaceSnapshot,
} from "../../src/index.js";

const catalog = defineA2UICatalog({
  id: "urn:example:a2ui:catalog:v1",
  components: {
    Text: {
      schema: z.object({ text: z.string() }),
      presenter: () => null,
    },
  },
});

const message: A2UIMessage = {
  version: "v0.9",
  createSurface: {
    surfaceId: "main",
    catalogId: catalog.id,
  },
};

const limits: A2UIResourceLimits = {
  ...DEFAULT_A2UI_RESOURCE_LIMITS,
  maxComponentsPerSurface: 100,
};
const engine = createA2UIEngine({ catalogs: [catalog], limits });
engine.applyMessage(message);

const surface: A2UISurfaceSnapshot | undefined = engine.getSurface("main");
void surface;
const failedSurfaceIds: readonly string[] =
  engine.getSnapshot().failedSurfaceIds;
void failedSurfaceIds;

// @ts-expect-error Only official v0.9 messages satisfy A2UIMessage.
const futureMessage: A2UIMessage = { version: "v1.0" };
void futureMessage;
