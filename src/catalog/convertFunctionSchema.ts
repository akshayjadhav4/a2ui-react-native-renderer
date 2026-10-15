import { z } from "zod";

import type { A2UIFunctionDefinition } from "./types.js";
import {
  convertCatalogSchema,
  isRequiredCatalogProperty,
} from "./convertCatalogSchema.js";

const COMMON_TYPES_URI =
  "https://a2ui.org/specification/v0_9/common_types.json";
const RETURN_TYPES = [
  "string",
  "number",
  "boolean",
  "array",
  "object",
  "any",
  "void",
] as const;

export function convertFunctionSchema(
  definition: A2UIFunctionDefinition,
): Record<string, unknown> {
  const path = `functions.${definition.name}`;
  if (!(definition.args._def.catchall instanceof z.ZodNever)) {
    throw new TypeError(`Unsupported catalog schema at ${path}.args.catchall`);
  }

  const shape = definition.args.shape as Record<string, z.ZodTypeAny>;
  const properties = Object.fromEntries(
    Object.entries(shape).map(([name, schema]) => {
      const argumentPath = `${path}.args.${name}`;
      if (acceptsNullLiteral(schema) || overlapsResolverShape(schema)) {
        throw new TypeError(`Unsupported catalog schema at ${argumentPath}`);
      }
      return [
        name,
        {
          anyOf: [
            convertCatalogSchema(schema, argumentPath),
            { $ref: `${COMMON_TYPES_URI}#/$defs/DataBinding` },
            { $ref: `${COMMON_TYPES_URI}#/$defs/FunctionCall` },
          ],
        },
      ];
    }),
  );
  const required = Object.entries(shape)
    .filter(([, schema]) => isRequiredCatalogProperty(schema))
    .map(([name]) => name);
  const expectedReturnType =
    definition.returns === "unknown" ? "any" : definition.returns;

  return {
    type: "object",
    ...(definition.description === undefined
      ? {}
      : { description: definition.description }),
    properties: {
      call: { const: definition.name },
      args: {
        type: "object",
        properties,
        ...(required.length === 0 ? {} : { required }),
        ...(definition.args._def.unknownKeys === "strict"
          ? { additionalProperties: false }
          : {}),
      },
      returnType: {
        type: "string",
        enum: [...RETURN_TYPES],
        default: expectedReturnType,
        description: `Declared return kind: ${definition.returns}. The renderer validates the result using this kind; the wire returnType field does not control validation.`,
      },
    },
    required: required.length === 0 ? ["call"] : ["call", "args"],
    additionalProperties: false,
  };
}

function acceptsNullLiteral(schema: z.ZodTypeAny): boolean {
  if (schema instanceof z.ZodNullable || schema instanceof z.ZodNull) {
    return true;
  }
  if (schema instanceof z.ZodOptional) {
    return acceptsNullLiteral(schema.unwrap() as z.ZodTypeAny);
  }
  if (schema instanceof z.ZodDefault) {
    return acceptsNullLiteral(schema.removeDefault() as z.ZodTypeAny);
  }
  if (schema instanceof z.ZodLiteral) return schema.value === null;
  if (schema instanceof z.ZodUnion) {
    return (schema.options as readonly z.ZodTypeAny[]).some(acceptsNullLiteral);
  }
  return false;
}

function overlapsResolverShape(schema: z.ZodTypeAny): boolean {
  if (
    schema instanceof z.ZodOptional ||
    schema instanceof z.ZodNullable ||
    schema instanceof z.ZodDefault
  ) {
    const inner: unknown =
      schema instanceof z.ZodDefault ? schema.removeDefault() : schema.unwrap();
    return overlapsResolverShape(inner as z.ZodTypeAny);
  }
  if (schema instanceof z.ZodUnion) {
    return (schema.options as readonly z.ZodTypeAny[]).some(
      overlapsResolverShape,
    );
  }
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    return Object.hasOwn(shape, "path") || Object.hasOwn(shape, "call");
  }
  return false;
}
