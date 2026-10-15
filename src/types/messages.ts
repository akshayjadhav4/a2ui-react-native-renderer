import type { z } from "zod";

import type {
  A2UIWireActionPayloadSchema,
  A2UIWireMessage,
} from "../protocol/v0_9/wireSchemas.js";

export type A2UIMessage = A2UIWireMessage;
export type A2UIUserAction = z.infer<typeof A2UIWireActionPayloadSchema>;
