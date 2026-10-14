import { z } from "zod";
import { useEffect } from "react";

import {
  createA2UIEngine,
  DEFAULT_A2UI_RESOURCE_LIMITS,
  defineA2UICatalog,
  useA2UIEngine,
  type A2UIEngine,
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

const currentMessage: A2UIMessage = {
  version: "v0.9.1",
  updateDataModel: { surfaceId: "main", path: "/title", value: "Hello" },
};
void currentMessage;

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

// @ts-expect-error Only official v0.9/v0.9.1 messages satisfy A2UIMessage.
const futureMessage: A2UIMessage = { version: "v1.0" };
void futureMessage;

export function EngineHookTypeFixture(): null {
  const hookEngine: A2UIEngine = useA2UIEngine({
    catalogs: [catalog],
    limits: { maxMessagesPerBatch: 5 },
    onAction: (action) => {
      void action.name;
    },
    onError: (error) => {
      void error.code;
    },
  });
  useEffect(() => {
    hookEngine.applyMessage(message);
  }, [hookEngine]);
  // @ts-expect-error A hook-owned engine requires catalog configuration.
  useA2UIEngine({});
  return null;
}
