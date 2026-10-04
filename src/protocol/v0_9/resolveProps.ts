import type { z } from "zod";

import type {
  A2UIFunctionDefinition,
  A2UIResolvedChild,
} from "../../catalog/types.js";
import {
  isDataBinding,
  readDataPointer,
  resolveBindingPath,
  resolveStructuralChildren,
} from "./bindings.js";
import {
  A2UIFunctionInvocationError,
  evaluateA2UIFunction,
} from "./functions.js";
import {
  inspectA2UISchemaBehavior,
  matchesA2UIDynamicKind,
  type A2UISchemaBehavior,
} from "./behavior.js";

export interface A2UIDataWrite {
  readonly path: string;
  readonly value: unknown;
  readonly bindingPath: string;
  readonly propertyPath: readonly (string | number)[];
  readonly behavior: Extract<A2UISchemaBehavior, { type: "DYNAMIC" }>;
}

export type A2UIDataSetter = (write: A2UIDataWrite) => void;

export function resolvePresenterProps(
  schema: z.AnyZodObject,
  rawProps: Readonly<Record<string, unknown>>,
  dataModel: unknown,
  scopePath: string,
  setData: A2UIDataSetter,
  functions: readonly A2UIFunctionDefinition[],
): Readonly<Record<string, unknown>> {
  const behavior = inspectA2UISchemaBehavior(schema);
  if (behavior.type !== "OBJECT") {
    return Object.freeze({ ...rawProps });
  }

  return Object.freeze(
    resolveObject(
      rawProps,
      behavior,
      dataModel,
      scopePath,
      setData,
      functions,
      [],
    ),
  );
}

function resolveValue(
  value: unknown,
  behavior: A2UISchemaBehavior,
  dataModel: unknown,
  scopePath: string,
  setData: A2UIDataSetter,
  functions: readonly A2UIFunctionDefinition[],
  propertyPath: readonly (string | number)[],
): unknown {
  switch (behavior.type) {
    case "DYNAMIC":
      return resolveDynamicValue(
        value,
        behavior,
        dataModel,
        scopePath,
        functions,
      );
    case "STRUCTURAL":
      return resolveChildren(value, dataModel, scopePath);
    case "ARRAY":
      return Array.isArray(value)
        ? Object.freeze(
            value.map((item, index) =>
              resolveValue(
                item,
                behavior.element,
                dataModel,
                scopePath,
                setData,
                functions,
                [...propertyPath, index],
              ),
            ),
          )
        : value;
    case "OBJECT":
      return isRecord(value)
        ? Object.freeze(
            resolveObject(
              value,
              behavior,
              dataModel,
              scopePath,
              setData,
              functions,
              propertyPath,
            ),
          )
        : value;
    case "ACTION":
    case "CHECKABLE":
    case "STATIC":
      return value;
  }
}

function resolveObject(
  value: Readonly<Record<string, unknown>>,
  behavior: Extract<A2UISchemaBehavior, { type: "OBJECT" }>,
  dataModel: unknown,
  scopePath: string,
  setData: A2UIDataSetter,
  functions: readonly A2UIFunctionDefinition[],
  propertyPath: readonly (string | number)[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, rawValue] of Object.entries(value)) {
    result[key] = resolveValue(
      rawValue,
      behavior.shape[key] ?? { type: "STATIC" },
      dataModel,
      scopePath,
      setData,
      functions,
      [...propertyPath, key],
    );
  }

  for (const [key, childBehavior] of Object.entries(behavior.shape)) {
    if (childBehavior.type !== "DYNAMIC" || !isDataBinding(value[key])) {
      continue;
    }

    const rawValue = value[key];
    const setterName = `set${key.charAt(0).toUpperCase()}${key.slice(1)}`;
    result[setterName] = (nextValue: unknown): void => {
      if (isDataBinding(rawValue)) {
        setData({
          path: resolveBindingPath(scopePath, rawValue.path),
          value: nextValue,
          bindingPath: rawValue.path,
          propertyPath: [...propertyPath, key],
          behavior: childBehavior,
        });
      }
    };
  }

  return result;
}

function resolveDynamicValue(
  value: unknown,
  behavior: Extract<A2UISchemaBehavior, { type: "DYNAMIC" }>,
  dataModel: unknown,
  scopePath: string,
  functions: readonly A2UIFunctionDefinition[],
): unknown {
  if (isDataBinding(value)) {
    const resolved = readDataPointer(
      dataModel,
      resolveBindingPath(scopePath, value.path),
    );
    if (resolved !== undefined && !matchesA2UIDynamicKind(resolved, behavior)) {
      throw new TypeError(`A2UI bound value has invalid ${behavior.kind} type`);
    }
    return resolved;
  }

  if (isFunctionCall(value)) {
    const resolved = evaluateA2UIFunction({
      call: value,
      functions,
      dataModel,
      scopePath,
    });
    if (!matchesA2UIDynamicKind(resolved, behavior)) {
      throw new A2UIFunctionInvocationError(
        value.call,
        `A2UI function "${value.call}" produced an invalid ${behavior.kind} value`,
      );
    }
    return resolved;
  }

  return value;
}

function resolveChildren(
  value: unknown,
  dataModel: unknown,
  scopePath: string,
): readonly A2UIResolvedChild[] {
  if (Array.isArray(value)) {
    return Object.freeze(
      value
        .filter(
          (componentId): componentId is string =>
            typeof componentId === "string",
        )
        .map((componentId) =>
          Object.freeze({ id: componentId, basePath: scopePath }),
        ),
    );
  }

  if (isStructuralBinding(value)) {
    return resolveStructuralChildren(
      dataModel,
      scopePath,
      value.componentId,
      value.path,
    );
  }

  return Object.freeze([]);
}

function isFunctionCall(value: unknown): value is Readonly<{ call: string }> {
  return isRecord(value) && typeof value.call === "string";
}

function isStructuralBinding(
  value: unknown,
): value is Readonly<{ componentId: string; path: string }> {
  return (
    isRecord(value) &&
    typeof value.componentId === "string" &&
    typeof value.path === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
