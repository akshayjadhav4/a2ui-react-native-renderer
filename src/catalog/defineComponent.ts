import { z } from "zod";

import type { A2UIComponentDefinition } from "./types.js";
import {
  inspectA2UISchemaBehavior,
  type A2UISchemaBehavior,
} from "../protocol/v0_9/behavior.js";

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

  rejectSetterCollisions(inspectA2UISchemaBehavior(definition.schema));

  return Object.isFrozen(definition)
    ? definition
    : Object.freeze({ ...definition });
}

function rejectSetterCollisions(behavior: A2UISchemaBehavior): void {
  if (behavior.type === "ARRAY") {
    rejectSetterCollisions(behavior.element);
  }
  if (behavior.type !== "OBJECT") {
    return;
  }

  for (const [key, child] of Object.entries(behavior.shape)) {
    if (child.type === "DYNAMIC") {
      const setterName = `set${key.charAt(0).toUpperCase()}${key.slice(1)}`;
      if (setterName in behavior.shape) {
        throw new TypeError(
          `A2UI generated setter "${setterName}" conflicts with a schema property`,
        );
      }
    }
    rejectSetterCollisions(child);
  }
}
