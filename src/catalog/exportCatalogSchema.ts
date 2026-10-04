import { z } from "zod";

import {
  convertCatalogSchema,
  isRequiredCatalogProperty,
} from "./convertCatalogSchema.js";
import type {
  A2UICatalog,
  A2UIComponentDefinition,
  A2UIComponentSchemas,
  A2UIFunctionDefinition,
} from "./types.js";

const COMMON_TYPES_URI =
  "https://a2ui.org/specification/v0_9/common_types.json";
const JSON_SCHEMA_URI = "https://json-schema.org/draft/2020-12/schema";

interface A2UICatalogSchemaDocument {
  readonly $schema: string;
  readonly $id: string;
  readonly catalogId: string;
  readonly components: Readonly<Record<string, unknown>>;
  readonly functions: Readonly<Record<string, unknown>>;
  readonly $defs: Readonly<Record<string, unknown>>;
}

export function exportA2UICatalogSchema<
  Schemas extends A2UIComponentSchemas,
  Functions extends readonly A2UIFunctionDefinition[],
>(catalog: A2UICatalog<Schemas, Functions>): A2UICatalogSchemaDocument {
  if (catalog.functions.length > 0) {
    throw new TypeError("A2UI function schema export is not yet supported");
  }

  const definitions = catalog.components as Readonly<
    Record<string, Pick<A2UIComponentDefinition, "schema" | "description">>
  >;
  const components = Object.fromEntries(
    Object.entries(definitions).map(([name, definition]) => {
      const shape = definition.schema.shape as Record<string, z.ZodTypeAny>;
      if (!(definition.schema._def.catchall instanceof z.ZodNever)) {
        throw new TypeError(
          `Unsupported catalog schema at components.${name}.catchall`,
        );
      }
      for (const reserved of ["id", "component"]) {
        if (Object.hasOwn(shape, reserved)) {
          throw new TypeError(
            `Unsupported catalog schema at components.${name}.${reserved}`,
          );
        }
      }
      const properties = Object.fromEntries(
        Object.entries(shape).map(([key, schema]) => [
          key,
          convertCatalogSchema(schema, `components.${name}.${key}`),
        ]),
      );
      const required = Object.entries(shape)
        .filter(([, schema]) => isRequiredCatalogProperty(schema))
        .map(([key]) => key);

      return [
        name,
        {
          type: "object",
          ...(definition.description === undefined
            ? {}
            : { description: definition.description }),
          allOf: [
            { $ref: `${COMMON_TYPES_URI}#/$defs/ComponentCommon` },
            { $ref: "#/$defs/CatalogComponentCommon" },
            {
              type: "object",
              properties: {
                ...(definition.schema._def.unknownKeys === "strict"
                  ? { id: true }
                  : {}),
                component: { const: name },
                ...properties,
              },
              required: ["component", ...required],
              ...(definition.schema._def.unknownKeys === "strict"
                ? { additionalProperties: false }
                : {}),
            },
          ],
        },
      ];
    }),
  );

  return {
    $schema: JSON_SCHEMA_URI,
    $id: catalog.id,
    catalogId: catalog.id,
    components,
    functions: {},
    $defs: {
      CatalogComponentCommon: {
        type: "object",
        properties: { weight: { type: "number" } },
      },
      theme: { type: "object", additionalProperties: true },
      anyComponent: {
        oneOf: Object.keys(components).map((name) => ({
          $ref: `#/components/${escapePointerToken(name)}`,
        })),
        discriminator: { propertyName: "component" },
      },
      anyFunction: false,
    },
  };
}

function escapePointerToken(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}
