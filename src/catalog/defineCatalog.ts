import type { z } from "zod";

import { defineA2UIComponent } from "./defineComponent.js";
import { defineA2UIFunction } from "./defineFunction.js";
import type {
  A2UICatalog,
  A2UICatalogDefinition,
  A2UIComponentDefinition,
  A2UIComponentDefinitions,
  A2UIComponentSchemas,
  A2UIFunctionDefinition,
} from "./types.js";

export function defineA2UICatalog<
  const Schemas extends A2UIComponentSchemas,
  const Functions extends readonly A2UIFunctionDefinition[] = readonly [],
>(
  definition: A2UICatalogDefinition<Schemas, Functions>,
): A2UICatalog<Schemas, Functions> {
  if (definition.id.trim().length === 0) {
    throw new TypeError("A2UI catalog id must not be empty");
  }

  const names = Object.keys(definition.components) as (keyof Schemas &
    string)[];
  if (names.length === 0) {
    throw new TypeError("A2UI catalog must define at least one component");
  }

  const components = Object.fromEntries(
    names.map((name) => {
      if (name.trim().length === 0) {
        throw new TypeError("A2UI component name must not be empty");
      }

      return [name, normalizeComponent(definition.components[name])] as const;
    }),
  ) as A2UIComponentDefinitions<Schemas>;

  const functions = normalizeFunctions(definition.functions ?? []);

  return Object.freeze({
    id: definition.id,
    components: Object.freeze(components),
    functions: Object.freeze(functions) as unknown as Readonly<Functions>,
  });
}

function normalizeComponent<Schema extends z.AnyZodObject>(
  definition: A2UIComponentDefinition<Schema>,
): A2UIComponentDefinition<Schema> {
  return defineA2UIComponent(definition);
}

function normalizeFunctions(
  definitions: readonly A2UIFunctionDefinition[],
): readonly A2UIFunctionDefinition[] {
  const names = new Set<string>();

  return definitions.map((definition) => {
    if (names.has(definition.name)) {
      throw new TypeError(
        `A2UI catalog contains duplicate function "${definition.name}"`,
      );
    }

    names.add(definition.name);
    return defineA2UIFunction(definition);
  });
}
