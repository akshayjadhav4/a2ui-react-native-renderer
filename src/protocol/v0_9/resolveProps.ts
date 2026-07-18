import { scrapeSchemaBehavior, type BehaviorNode } from "@a2ui/web_core/v0_9";
import type { z } from "zod";

import type { A2UIResolvedChild } from "../../catalog/types.js";
import {
  isDataBinding,
  readDataPointer,
  resolveBindingPath,
  resolveStructuralChildren,
} from "./bindings.js";

export type A2UIDataSetter = (path: string, value: unknown) => void;

export function resolvePresenterProps(
  schema: z.AnyZodObject,
  rawProps: Readonly<Record<string, unknown>>,
  dataModel: unknown,
  scopePath: string,
  setData: A2UIDataSetter,
): Readonly<Record<string, unknown>> {
  const behavior = scrapeSchemaBehavior(schema);
  if (behavior.type !== "OBJECT") {
    return Object.freeze({ ...rawProps });
  }

  return Object.freeze(
    resolveObject(rawProps, behavior, dataModel, scopePath, setData),
  );
}

function resolveValue(
  value: unknown,
  behavior: BehaviorNode,
  dataModel: unknown,
  scopePath: string,
  setData: A2UIDataSetter,
): unknown {
  switch (behavior.type) {
    case "DYNAMIC":
      return resolveDynamicValue(value, dataModel, scopePath);
    case "STRUCTURAL":
      return resolveChildren(value, dataModel, scopePath);
    case "ARRAY":
      return Array.isArray(value)
        ? Object.freeze(
            value.map((item) =>
              resolveValue(
                item,
                behavior.element,
                dataModel,
                scopePath,
                setData,
              ),
            ),
          )
        : value;
    case "OBJECT":
      return isRecord(value)
        ? Object.freeze(
            resolveObject(value, behavior, dataModel, scopePath, setData),
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
  behavior: Extract<BehaviorNode, { type: "OBJECT" }>,
  dataModel: unknown,
  scopePath: string,
  setData: A2UIDataSetter,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, rawValue] of Object.entries(value)) {
    result[key] = resolveValue(
      rawValue,
      behavior.shape[key] ?? { type: "STATIC" },
      dataModel,
      scopePath,
      setData,
    );
  }

  for (const [key, childBehavior] of Object.entries(behavior.shape)) {
    if (childBehavior.type !== "DYNAMIC") {
      continue;
    }

    const rawValue = value[key];
    const setterName = `set${key.charAt(0).toUpperCase()}${key.slice(1)}`;
    result[setterName] = (nextValue: unknown): void => {
      if (isDataBinding(rawValue)) {
        setData(resolveBindingPath(scopePath, rawValue.path), nextValue);
      }
    };
  }

  return result;
}

function resolveDynamicValue(
  value: unknown,
  dataModel: unknown,
  scopePath: string,
): unknown {
  if (isDataBinding(value)) {
    return readDataPointer(
      dataModel,
      resolveBindingPath(scopePath, value.path),
    );
  }

  if (isFunctionCall(value)) {
    throw new TypeError(
      `A2UI function "${value.call}" cannot be resolved before it is registered`,
    );
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
