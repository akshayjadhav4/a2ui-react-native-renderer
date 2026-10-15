import { z } from "zod";

import { defineA2UIComponent } from "./defineComponent.js";
import { defineA2UIFunction } from "./defineFunction.js";
import type {
  A2UICatalog,
  A2UICatalogDefinition,
  A2UIComponentDefinition,
  A2UIComponentSchemas,
  A2UIFunctionDefinition,
} from "./types.js";

export function defineA2UICatalog<
  const Schemas extends A2UIComponentSchemas,
  const Functions extends readonly A2UIFunctionDefinition[] = readonly [],
  const ThemeSchema extends z.AnyZodObject | undefined = undefined,
>(
  definition: A2UICatalogDefinition<Schemas, Functions, ThemeSchema>,
): A2UICatalog<Schemas, Functions, ThemeSchema> {
  if (definition.id.trim().length === 0) {
    throw new TypeError("A2UI catalog id must not be empty");
  }

  if (
    definition.themeSchema !== undefined &&
    !(definition.themeSchema instanceof z.ZodObject)
  ) {
    throw new TypeError("A2UI theme schema must be a Zod object schema");
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
  ) as A2UICatalog<Schemas, Functions, ThemeSchema>["components"];

  const functions = normalizeFunctions(definition.functions ?? []);

  return Object.freeze({
    id: definition.id,
    ...(definition.themeSchema === undefined
      ? {}
      : { themeSchema: definition.themeSchema }),
    components: Object.freeze(components),
    functions: Object.freeze(functions) as unknown as Readonly<Functions>,
  });
}

function normalizeComponent<
  Schema extends z.AnyZodObject,
  Theme extends object,
>(
  definition: A2UIComponentDefinition<Schema, Theme>,
): A2UIComponentDefinition<Schema, Theme> {
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
