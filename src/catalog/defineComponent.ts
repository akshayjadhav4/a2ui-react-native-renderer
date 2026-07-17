import { z } from "zod";

import type { A2UIComponentDefinition } from "./types.js";

export function defineA2UIComponent<const Schema extends z.AnyZodObject>(
  definition: A2UIComponentDefinition<Schema>,
): A2UIComponentDefinition<Schema> {
  if (!(definition.schema instanceof z.ZodObject)) {
    throw new TypeError("A2UI component schema must be a Zod object schema");
  }

  if (typeof definition.presenter !== "function") {
    throw new TypeError("A2UI component presenter must be a React component");
  }

  if (definition.description?.trim().length === 0) {
    throw new TypeError("A2UI component description must not be empty");
  }

  return Object.isFrozen(definition)
    ? definition
    : Object.freeze({ ...definition });
}
