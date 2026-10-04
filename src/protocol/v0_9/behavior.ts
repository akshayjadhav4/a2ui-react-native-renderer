import { z } from "zod";

export type A2UISchemaBehavior =
  | {
      readonly type:
        "STATIC" | "DYNAMIC" | "ACTION" | "STRUCTURAL" | "CHECKABLE";
    }
  | { readonly type: "ARRAY"; readonly element: A2UISchemaBehavior }
  | {
      readonly type: "OBJECT";
      readonly shape: Readonly<Record<string, A2UISchemaBehavior>>;
    };

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
    return { type: "DYNAMIC" };
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
      return { type: "DYNAMIC" };
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
