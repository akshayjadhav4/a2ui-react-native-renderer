import { A2uiClientActionSchema, ActionSchema } from "@a2ui/web_core/v0_9";

import type { A2UIFunctionDefinition } from "../catalog/types.js";
import {
  isDataBinding,
  readDataPointer,
  resolveBindingPath,
} from "../protocol/v0_9/bindings.js";
import type { A2UIAction } from "../protocol/v0_9/schemas.js";
import { evaluateA2UIFunction } from "../protocol/v0_9/functions.js";
import type { A2UIUserAction } from "../types/messages.js";

export interface ResolveA2UIUserActionInput {
  readonly surfaceId: string;
  readonly sourceComponentId: string;
  readonly scopePath: string;
  readonly action: unknown;
  readonly dataModel: unknown;
  readonly functions?: readonly A2UIFunctionDefinition[];
  readonly timestamp?: string;
}

export type A2UIResolvedAction =
  | { readonly kind: "event"; readonly action: A2UIUserAction }
  | {
      readonly kind: "function";
      readonly functionName: string;
      readonly result: unknown;
    };

export function resolveA2UIAction(
  input: ResolveA2UIUserActionInput,
): A2UIResolvedAction {
  const parsedAction = ActionSchema.safeParse(input.action);
  if (!parsedAction.success) {
    throw new TypeError("Presenter dispatched an invalid A2UI action", {
      cause: parsedAction.error,
    });
  }

  if ("functionCall" in parsedAction.data) {
    return Object.freeze({
      kind: "function",
      functionName: parsedAction.data.functionCall.call,
      result: evaluateA2UIFunction({
        call: parsedAction.data.functionCall,
        functions: input.functions ?? [],
        dataModel: input.dataModel,
        scopePath: input.scopePath,
      }),
    });
  }

  return Object.freeze({
    kind: "event",
    action: resolveParsedEventAction(input, parsedAction.data),
  });
}

export function resolveA2UIUserAction(
  input: ResolveA2UIUserActionInput,
): A2UIUserAction {
  const parsedAction = ActionSchema.safeParse(input.action);
  if (!parsedAction.success) {
    throw new TypeError("Presenter dispatched an invalid A2UI action", {
      cause: parsedAction.error,
    });
  }

  if ("functionCall" in parsedAction.data) {
    throw new TypeError(
      "Local A2UI function actions require a registered client function",
    );
  }

  return resolveParsedEventAction(input, parsedAction.data);
}

function resolveParsedEventAction(
  {
    surfaceId,
    sourceComponentId,
    scopePath,
    dataModel,
    functions = [],
    timestamp = new Date().toISOString(),
  }: ResolveA2UIUserActionInput,
  eventAction: A2UIEventAction,
): A2UIUserAction {
  const context: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(eventAction.event.context ?? {})) {
    context[key] = freezeActionValue(
      resolveContextValue(value, dataModel, scopePath, functions),
    );
  }

  const userAction: A2UIUserAction = {
    name: eventAction.event.name,
    surfaceId,
    sourceComponentId,
    timestamp,
    context: Object.freeze(context),
  };
  const validation = A2uiClientActionSchema.safeParse(userAction);
  if (!validation.success) {
    throw new TypeError("Resolved A2UI user action is invalid", {
      cause: validation.error,
    });
  }

  return Object.freeze(userAction);
}

function resolveContextValue(
  value: A2UIActionContextValue,
  dataModel: unknown,
  scopePath: string,
  functions: readonly A2UIFunctionDefinition[],
): unknown {
  if (isDataBinding(value)) {
    return readDataPointer(
      dataModel,
      resolveBindingPath(scopePath, value.path),
    );
  }

  if (isFunctionCall(value)) {
    return evaluateA2UIFunction({
      call: value,
      functions,
      dataModel,
      scopePath,
    });
  }

  return value;
}

type A2UIEventAction = Extract<A2UIAction, { event: unknown }>;
type A2UIActionContextValue = NonNullable<
  A2UIEventAction["event"]["context"]
>[string];

function isFunctionCall(value: unknown): value is Readonly<{ call: string }> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "call" in value &&
    typeof value.call === "string"
  );
}

function freezeActionValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return Object.freeze(value.map(freezeActionValue));
  }

  if (isRecord(value)) {
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value).map(([key, nestedValue]) => [
          key,
          freezeActionValue(nestedValue),
        ]),
      ),
    );
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
