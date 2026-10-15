import type { z } from "zod";

export type A2UISchemaMarker =
  | "Action"
  | "ChildList"
  | "ComponentId"
  | "DataBinding"
  | "DynamicBoolean"
  | "DynamicNumber"
  | "DynamicString"
  | "DynamicStringList"
  | "DynamicValue"
  | "FunctionCall";

const markerKey = Symbol("a2ui.schema.marker");

interface MarkerStamp {
  readonly name: A2UISchemaMarker;
  readonly baseline: Readonly<Record<string, unknown>>;
}

export function markA2UISchema<Schema extends z.ZodTypeAny>(
  schema: Schema,
  marker: A2UISchemaMarker,
): Schema {
  const definition = schema._def as Record<string, unknown>;
  const baseline = Object.fromEntries(
    Object.entries(definition).filter(([key]) => key !== "description"),
  );
  Object.defineProperty(schema._def, markerKey, {
    value: { name: marker, baseline } satisfies MarkerStamp,
    enumerable: true,
  });
  return schema;
}

export function getA2UISchemaMarker(
  schema: z.ZodTypeAny,
): A2UISchemaMarker | undefined {
  return (schema._def as Record<symbol, MarkerStamp | undefined>)[markerKey]
    ?.name;
}

export function isA2UISchemaMarkerUnchanged(schema: z.ZodTypeAny): boolean {
  const stamp = (schema._def as Record<symbol, MarkerStamp | undefined>)[
    markerKey
  ];
  if (stamp === undefined) return true;
  const definition = schema._def as Record<string, unknown>;
  const keys = Object.keys(definition).filter((key) => key !== "description");
  return (
    keys.length === Object.keys(stamp.baseline).length &&
    keys.every((key) => definition[key] === stamp.baseline[key])
  );
}
