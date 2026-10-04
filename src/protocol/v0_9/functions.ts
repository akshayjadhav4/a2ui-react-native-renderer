import { FunctionCallSchema } from "./commonSchemas.js";

import type {
  A2UIFunctionDefinition,
  A2UIFunctionReturnKind,
} from "../../catalog/types.js";
import {
  isDataBinding,
  readDataPointer,
  resolveBindingPath,
} from "./bindings.js";
import type { A2UIFunctionCallValue } from "./schemas.js";

const MAX_FUNCTION_DEPTH = 32;

export class A2UIFunctionInvocationError extends Error {
  readonly functionName: string;

  constructor(functionName: string, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "A2UIFunctionInvocationError";
    this.functionName = functionName;
  }
}

export interface EvaluateA2UIFunctionInput {
  readonly call: unknown;
  readonly functions: readonly A2UIFunctionDefinition[];
  readonly dataModel: unknown;
  readonly scopePath: string;
}

export function evaluateA2UIFunction({
  call,
  functions,
  dataModel,
  scopePath,
}: EvaluateA2UIFunctionInput): unknown {
  const functionMap = new Map(
    functions.map((definition) => [definition.name, definition]),
  );
  return evaluateCall(call, functionMap, dataModel, scopePath, 0);
}

export function isA2UIFunctionInvocationError(
  value: unknown,
): value is A2UIFunctionInvocationError {
  return value instanceof A2UIFunctionInvocationError;
}

function evaluateCall(
  input: unknown,
  functions: ReadonlyMap<string, A2UIFunctionDefinition>,
  dataModel: unknown,
  scopePath: string,
  depth: number,
): unknown {
  const parsedCall = FunctionCallSchema.safeParse(input);
  const functionName = readFunctionName(input);
  if (!parsedCall.success) {
    throw new A2UIFunctionInvocationError(
      functionName,
      `Invalid A2UI function call "${functionName}"`,
      parsedCall.error,
    );
  }

  if (depth >= MAX_FUNCTION_DEPTH) {
    throw new A2UIFunctionInvocationError(
      parsedCall.data.call,
      `A2UI function call depth exceeded ${String(MAX_FUNCTION_DEPTH)}`,
    );
  }

  const definition = functions.get(parsedCall.data.call);
  if (definition === undefined) {
    throw new A2UIFunctionInvocationError(
      parsedCall.data.call,
      `Unknown A2UI function "${parsedCall.data.call}"`,
    );
  }

  const resolvedArgs = Object.fromEntries(
    Object.entries(parsedCall.data.args ?? {}).map(([key, value]) => [
      key,
      resolveArgument(value, functions, dataModel, scopePath, depth + 1),
    ]),
  );
  const parsedArgs = definition.args.safeParse(resolvedArgs);
  if (!parsedArgs.success) {
    throw new A2UIFunctionInvocationError(
      definition.name,
      `Invalid arguments for A2UI function "${definition.name}"`,
      parsedArgs.error,
    );
  }

  let result: unknown;
  try {
    result = definition.execute(parsedArgs.data);
  } catch (cause) {
    throw new A2UIFunctionInvocationError(
      definition.name,
      `A2UI function "${definition.name}" failed`,
      cause,
    );
  }

  if (isPromiseLike(result)) {
    throw new A2UIFunctionInvocationError(
      definition.name,
      `A2UI function "${definition.name}" returned a Promise; functions must be synchronous`,
    );
  }

  if (!matchesReturnKind(result, definition.returns)) {
    throw new A2UIFunctionInvocationError(
      definition.name,
      `A2UI function "${definition.name}" returned an invalid ${definition.returns} value`,
    );
  }

  return freezeFunctionValue(result);
}

function resolveArgument(
  value: unknown,
  functions: ReadonlyMap<string, A2UIFunctionDefinition>,
  dataModel: unknown,
  scopePath: string,
  depth: number,
): unknown {
  if (isDataBinding(value)) {
    return readDataPointer(
      dataModel,
      resolveBindingPath(scopePath, value.path),
    );
  }

  if (isFunctionCall(value)) {
    return evaluateCall(value, functions, dataModel, scopePath, depth);
  }

  return value;
}

function matchesReturnKind(
  value: unknown,
  kind: A2UIFunctionReturnKind,
): boolean {
  switch (kind) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "object":
      return isRecord(value);
    case "array":
      return Array.isArray(value);
    case "unknown":
      return true;
  }
}

function freezeFunctionValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return Object.freeze(value.map(freezeFunctionValue));
  }

  if (isRecord(value)) {
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value).map(([key, nestedValue]) => [
          key,
          freezeFunctionValue(nestedValue),
        ]),
      ),
    );
  }

  return value;
}

function readFunctionName(value: unknown): string {
  return isRecord(value) && typeof value.call === "string"
    ? value.call
    : "unknown";
}

function isFunctionCall(value: unknown): value is A2UIFunctionCallValue {
  return isRecord(value) && typeof value.call === "string";
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return isRecord(value) && typeof value.then === "function";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
