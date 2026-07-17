import { z } from "zod";

import type {
  A2UIFunctionDefinition,
  A2UIFunctionReturnKind,
} from "./types.js";

const returnKinds = new Set<A2UIFunctionReturnKind>([
  "string",
  "number",
  "boolean",
  "object",
  "array",
  "unknown",
]);

export function defineA2UIFunction<
  const Args extends z.AnyZodObject,
  const ReturnKind extends A2UIFunctionReturnKind,
>(
  definition: A2UIFunctionDefinition<Args, ReturnKind>,
): A2UIFunctionDefinition<Args, ReturnKind> {
  if (definition.name.trim().length === 0) {
    throw new TypeError("A2UI function name must not be empty");
  }

  if (!(definition.args instanceof z.ZodObject)) {
    throw new TypeError("A2UI function args must be a Zod object schema");
  }

  if (!returnKinds.has(definition.returns)) {
    throw new TypeError(
      `A2UI function "${definition.name}" has an invalid return kind`,
    );
  }

  if (typeof definition.execute !== "function") {
    throw new TypeError(
      `A2UI function "${definition.name}" must define execute`,
    );
  }

  if (definition.description?.trim().length === 0) {
    throw new TypeError("A2UI function description must not be empty");
  }

  return Object.isFrozen(definition)
    ? definition
    : Object.freeze({ ...definition });
}
