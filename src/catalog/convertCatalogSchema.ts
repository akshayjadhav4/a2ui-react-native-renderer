import { z } from "zod";

export type A2UIJsonSchema = Record<string, unknown>;

export function isRequiredCatalogProperty(schema: z.ZodTypeAny): boolean {
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodDefault) {
    return false;
  }
  if (schema instanceof z.ZodNullable) {
    return isRequiredCatalogProperty(schema.unwrap() as z.ZodTypeAny);
  }
  return true;
}

export function convertCatalogSchema(
  schema: z.ZodTypeAny,
  path: string,
): A2UIJsonSchema {
  let result: A2UIJsonSchema;

  if (schema instanceof z.ZodOptional) {
    result = convertCatalogSchema(schema.unwrap() as z.ZodTypeAny, path);
  } else if (schema instanceof z.ZodNullable) {
    result = {
      anyOf: [
        convertCatalogSchema(schema.unwrap() as z.ZodTypeAny, path),
        { type: "null" },
      ],
    };
  } else if (schema instanceof z.ZodDefault) {
    const value: unknown = schema._def.defaultValue();
    result = {
      ...convertCatalogSchema(schema.removeDefault() as z.ZodTypeAny, path),
      default: cloneJsonValue(value, path, new WeakSet()),
    };
  } else if (schema instanceof z.ZodString) {
    result = convertString(schema, path);
  } else if (schema instanceof z.ZodNumber) {
    result = convertNumber(schema, path);
  } else if (schema instanceof z.ZodBoolean) {
    if (schema._def.coerce) throw unsupported(path);
    result = { type: "boolean" };
  } else if (schema instanceof z.ZodLiteral) {
    const value: unknown = schema.value;
    if (!isJsonScalar(value)) throw unsupported(path);
    result = { const: value };
  } else if (schema instanceof z.ZodEnum) {
    result = {
      type: "string",
      enum: [...(schema.options as readonly string[])],
    };
  } else if (schema instanceof z.ZodArray) {
    for (const length of [
      schema._def.minLength?.value,
      schema._def.maxLength?.value,
      schema._def.exactLength?.value,
    ]) {
      if (length !== undefined && !isJsonLength(length)) {
        throw unsupported(path);
      }
    }
    result = {
      type: "array",
      items: convertCatalogSchema(schema.element as z.ZodTypeAny, `${path}[]`),
      ...(schema._def.minLength === null
        ? {}
        : { minItems: schema._def.minLength.value }),
      ...(schema._def.maxLength === null
        ? {}
        : { maxItems: schema._def.maxLength.value }),
      ...(schema._def.exactLength === null
        ? {}
        : {
            minItems: schema._def.exactLength.value,
            maxItems: schema._def.exactLength.value,
          }),
    };
  } else if (schema instanceof z.ZodObject) {
    result = convertObject(schema as z.AnyZodObject, path);
  } else if (schema instanceof z.ZodUnion) {
    result = {
      anyOf: (schema.options as readonly z.ZodTypeAny[]).map((option) =>
        convertCatalogSchema(option, path),
      ),
    };
  } else {
    throw unsupported(path);
  }

  return schema.description === undefined
    ? result
    : { ...result, description: schema.description };
}

function convertString(schema: z.ZodString, path: string): A2UIJsonSchema {
  if (schema._def.coerce) throw unsupported(path);
  const result: A2UIJsonSchema = { type: "string" };
  const seen = new Set<string>();
  for (const check of schema._def.checks) {
    if (
      (check.kind === "min" ||
        check.kind === "max" ||
        check.kind === "length") &&
      !isJsonLength(check.value)
    ) {
      throw unsupported(path);
    }
    const key = check.kind === "length" ? "min,max" : check.kind;
    if (
      seen.has(key) ||
      (check.kind === "length" && (seen.has("min") || seen.has("max"))) ||
      ((check.kind === "min" || check.kind === "max") && seen.has("min,max"))
    ) {
      throw unsupported(path);
    }
    seen.add(key);
    switch (check.kind) {
      case "min":
        result.minLength = check.value;
        break;
      case "max":
        result.maxLength = check.value;
        break;
      case "length":
        result.minLength = check.value;
        result.maxLength = check.value;
        break;
      case "regex":
        if (check.regex.flags !== "") throw unsupported(path);
        result.pattern = check.regex.source;
        break;
      default:
        throw unsupported(path);
    }
  }
  return result;
}

function convertNumber(schema: z.ZodNumber, path: string): A2UIJsonSchema {
  if (schema._def.coerce) throw unsupported(path);
  const result: A2UIJsonSchema = { type: "number" };
  const seen = new Set<string>();
  for (const check of schema._def.checks) {
    if (
      (check.kind === "min" || check.kind === "max") &&
      !Number.isFinite(check.value)
    ) {
      throw unsupported(path);
    }
    if (
      check.kind === "multipleOf" &&
      (!Number.isFinite(check.value) || check.value <= 0)
    ) {
      throw unsupported(path);
    }
    if (seen.has(check.kind)) throw unsupported(path);
    seen.add(check.kind);
    switch (check.kind) {
      case "int":
        result.type = "integer";
        break;
      case "min":
        result[check.inclusive ? "minimum" : "exclusiveMinimum"] = check.value;
        break;
      case "max":
        result[check.inclusive ? "maximum" : "exclusiveMaximum"] = check.value;
        break;
      case "multipleOf":
        result.multipleOf = check.value;
        break;
      default:
        throw unsupported(path);
    }
  }
  return result;
}

function convertObject(schema: z.AnyZodObject, path: string): A2UIJsonSchema {
  if (!(schema._def.catchall instanceof z.ZodNever)) throw unsupported(path);
  const shape = schema.shape as Record<string, z.ZodTypeAny>;
  const properties = Object.fromEntries(
    Object.entries(shape).map(([name, child]) => [
      name,
      convertCatalogSchema(child, `${path}.${name}`),
    ]),
  );
  const required = Object.entries(shape)
    .filter(([, child]) => isRequiredCatalogProperty(child))
    .map(([name]) => name);
  return {
    type: "object",
    properties,
    ...(required.length === 0 ? {} : { required }),
    ...(schema._def.unknownKeys === "strict"
      ? { additionalProperties: false }
      : {}),
  };
}

function isJsonScalar(value: unknown): boolean {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

function isJsonLength(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function cloneJsonValue(
  value: unknown,
  path: string,
  seen: WeakSet<object>,
): unknown {
  if (isJsonScalar(value)) return value;
  if (typeof value !== "object" || value === null || seen.has(value)) {
    throw unsupported(path);
  }

  seen.add(value);
  if (Array.isArray(value)) {
    if (Object.keys(value).length !== value.length) throw unsupported(path);
    const result = Array.from({ length: value.length }, (_, index) => {
      if (!Object.hasOwn(value, index)) throw unsupported(path);
      return cloneJsonValue(value[index], path, seen);
    });
    seen.delete(value);
    return result;
  }

  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw unsupported(path);
  }
  const result: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") throw unsupported(path);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !("value" in descriptor)) {
      throw unsupported(path);
    }
    if (descriptor.enumerable) {
      Object.defineProperty(result, key, {
        value: cloneJsonValue(descriptor.value as unknown, path, seen),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
  }
  seen.delete(value);
  return result;
}

function unsupported(path: string): TypeError {
  return new TypeError(`Unsupported catalog schema at ${path}`);
}
