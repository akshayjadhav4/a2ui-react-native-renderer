import { z } from "zod";

export type A2UISchemaBehavior =
  | {
      readonly type: "STATIC" | "ACTION" | "STRUCTURAL" | "CHECKABLE";
    }
  | {
      readonly type: "DYNAMIC";
      readonly kind: A2UIDynamicKind;
      readonly allowsNull: boolean;
      readonly literalSchemas?: readonly z.ZodTypeAny[];
    }
  | { readonly type: "ARRAY"; readonly element: A2UISchemaBehavior }
  | {
      readonly type: "OBJECT";
      readonly shape: Readonly<Record<string, A2UISchemaBehavior>>;
    };

export type A2UIDynamicKind =
  "string" | "number" | "boolean" | "string-list" | "unknown";

export function matchesA2UIDynamicKind(
  value: unknown,
  behavior: Extract<A2UISchemaBehavior, { type: "DYNAMIC" }>,
): boolean {
  if (value === null) return behavior.allowsNull;
  let matchesKind: boolean;
  switch (behavior.kind) {
    case "string":
      matchesKind = typeof value === "string";
      break;
    case "number":
      matchesKind = typeof value === "number" && Number.isFinite(value);
      break;
    case "boolean":
      matchesKind = typeof value === "boolean";
      break;
    case "string-list":
      matchesKind =
        Array.isArray(value) && value.every((item) => typeof item === "string");
      break;
    case "unknown":
      matchesKind = true;
  }
  return (
    matchesKind &&
    (behavior.literalSchemas === undefined ||
      behavior.literalSchemas.some((schema) => schema.safeParse(value).success))
  );
}

export function inspectA2UISchemaBehavior(
  schema: z.ZodTypeAny,
): A2UISchemaBehavior {
  return inspect(schema);
}

function inspect(schema: z.ZodTypeAny, key?: string): A2UISchemaBehavior {
  if (key === "checks") {
    return { type: "CHECKABLE" };
  }

  const current = unwrap(schema);
  const tag = current.description ?? schema.description ?? "";
  if (/^(A2UI:|REF:common_types\.json#\/\$defs\/)Action/.test(tag)) {
    return { type: "ACTION" };
  }
  if (/^(A2UI:|REF:common_types\.json#\/\$defs\/)ChildList/.test(tag)) {
    return { type: "STRUCTURAL" };
  }
  if (/^(A2UI:|REF:common_types\.json#\/\$defs\/)Dynamic/.test(tag)) {
    return {
      type: "DYNAMIC",
      kind: taggedDynamicKind(tag),
      allowsNull: schema.safeParse(null).success,
    };
  }

  if (current instanceof z.ZodUnion) {
    const options = current.options as unknown as readonly z.ZodTypeAny[];
    if (options.some((option) => hasFields(option, "event"))) {
      return { type: "ACTION" };
    }
    if (options.some((option) => hasFields(option, "componentId", "path"))) {
      return { type: "STRUCTURAL" };
    }
    if (options.some((option) => hasFields(option, "path"))) {
      const literalSchemas = options.filter(
        (option) => !hasFields(option, "path") && !hasFields(option, "call"),
      );
      return {
        type: "DYNAMIC",
        kind: inferredDynamicKind(options),
        allowsNull: schema.safeParse(null).success,
        literalSchemas,
      };
    }
  }

  if (current instanceof z.ZodArray) {
    const element: unknown = current.element;
    return {
      type: "ARRAY",
      element: inspect(element as z.ZodTypeAny),
    };
  }

  if (current instanceof z.ZodObject) {
    return {
      type: "OBJECT",
      shape: Object.fromEntries(
        Object.entries(
          current.shape as Readonly<Record<string, z.ZodTypeAny>>,
        ).map(([name, child]) => [name, inspect(child, name)]),
      ),
    };
  }

  return { type: "STATIC" };
}

function taggedDynamicKind(tag: string): A2UIDynamicKind {
  if (tag.endsWith("DynamicStringList")) return "string-list";
  if (tag.endsWith("DynamicString")) return "string";
  if (tag.endsWith("DynamicNumber")) return "number";
  if (tag.endsWith("DynamicBoolean")) return "boolean";
  return "unknown";
}

function inferredDynamicKind(
  options: readonly z.ZodTypeAny[],
): A2UIDynamicKind {
  const literalKinds = new Set<A2UIDynamicKind>();
  for (const option of options) {
    if (hasFields(option, "path") || hasFields(option, "call")) {
      continue;
    }

    literalKinds.add(literalSchemaKind(option));
  }

  return literalKinds.size === 1
    ? (literalKinds.values().next().value ?? "unknown")
    : "unknown";
}

function literalSchemaKind(schema: z.ZodTypeAny): A2UIDynamicKind {
  const current = unwrap(schema);
  if (current instanceof z.ZodString || current instanceof z.ZodEnum) {
    return "string";
  }
  if (current instanceof z.ZodNumber) return "number";
  if (current instanceof z.ZodBoolean) return "boolean";
  if (current instanceof z.ZodLiteral) {
    return literalKind(current.value as unknown);
  }
  if (
    current instanceof z.ZodArray &&
    unwrap(current.element as z.ZodTypeAny) instanceof z.ZodString
  ) {
    return "string-list";
  }
  return "unknown";
}

function literalKind(value: unknown): A2UIDynamicKind {
  if (typeof value === "string") return "string";
  if (typeof value === "number" && Number.isFinite(value)) return "number";
  if (typeof value === "boolean") return "boolean";
  return "unknown";
}

function unwrap(schema: z.ZodTypeAny): z.ZodTypeAny {
  let current = schema;
  while (
    current instanceof z.ZodOptional ||
    current instanceof z.ZodNullable ||
    current instanceof z.ZodDefault
  ) {
    const unwrapped: unknown =
      current instanceof z.ZodDefault
        ? current.removeDefault()
        : current.unwrap();
    current = unwrapped as z.ZodTypeAny;
  }
  return current;
}

function hasFields(schema: z.ZodTypeAny, ...keys: readonly string[]): boolean {
  const current = unwrap(schema);
  return (
    current instanceof z.ZodObject &&
    keys.every(
      (key) => key in (current.shape as Readonly<Record<string, z.ZodTypeAny>>),
    )
  );
}
