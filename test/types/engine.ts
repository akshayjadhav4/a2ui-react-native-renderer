import { z } from "zod";

import {
  createA2UIEngine,
  defineA2UICatalog,
  type A2UIMessage,
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

const engine = createA2UIEngine({ catalogs: [catalog] });
engine.applyMessage(message);

const surface: A2UISurfaceSnapshot | undefined = engine.getSurface("main");
void surface;

// @ts-expect-error Only official v0.9 messages satisfy A2UIMessage.
const futureMessage: A2UIMessage = { version: "v1.0" };
void futureMessage;
