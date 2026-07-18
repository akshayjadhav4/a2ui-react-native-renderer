import { A2uiClientActionSchema, ActionSchema } from "@a2ui/web_core/v0_9";

import {
  isDataBinding,
  readDataPointer,
  resolveBindingPath,
} from "../protocol/v0_9/bindings.js";
import type { A2UIAction } from "../protocol/v0_9/schemas.js";
import type { A2UIUserAction } from "../types/messages.js";

export interface ResolveA2UIUserActionInput {
  readonly surfaceId: string;
  readonly sourceComponentId: string;
  readonly scopePath: string;
  readonly action: unknown;
  readonly dataModel: unknown;
  readonly timestamp?: string;
}

export function resolveA2UIUserAction({
  surfaceId,
  sourceComponentId,
  scopePath,
  action,
  dataModel,
  timestamp = new Date().toISOString(),
}: ResolveA2UIUserActionInput): A2UIUserAction {
  const parsedAction = ActionSchema.safeParse(action);
  if (!parsedAction.success) {
    throw new TypeError("Presenter dispatched an invalid A2UI action", {
      cause: parsedAction.error,
    });
  }

  if (!("event" in parsedAction.data)) {
    throw new TypeError(
      "Local A2UI function actions require a registered client function",
    );
  }

  const context: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(
    parsedAction.data.event.context ?? {},
  )) {
    context[key] = freezeActionValue(
      resolveContextValue(value, dataModel, scopePath),
    );
  }

  const userAction: A2UIUserAction = {
    name: parsedAction.data.event.name,
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
