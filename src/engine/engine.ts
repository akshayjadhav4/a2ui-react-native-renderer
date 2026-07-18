import type { ComponentModel } from "@a2ui/web_core/v0_9";

import type { A2UIRendererError } from "../errors/types.js";
import { resolveA2UIAction } from "./actions.js";
import {
  A2UIV09Adapter,
  type ParsedA2UIMessage,
} from "../protocol/v0_9/adapter.js";
import { updateDataPointer } from "../protocol/v0_9/bindings.js";
import { isA2UIFunctionInvocationError } from "../protocol/v0_9/functions.js";
import type { A2UIUserAction } from "../types/messages.js";
import type {
  A2UIComponentSnapshot,
  A2UIEngine,
  A2UIEngineOptions,
  A2UIEngineSnapshot,
  A2UISurfaceSnapshot,
} from "./types.js";
import {
  A2UI_ENGINE_INTERNALS,
  type A2UIEngineWithInternals,
} from "./internals.js";
import {
  measureSerializedBytes,
  resolveA2UIResourceLimits,
} from "../validation/limits.js";
import { validateMessageBatch } from "../validation/validateMessages.js";

const EMPTY_ERRORS: readonly A2UIRendererError[] = Object.freeze([]);

export function createA2UIEngine(options: A2UIEngineOptions): A2UIEngine {
  validateCatalogs(options.catalogs);
  const limits = resolveA2UIResourceLimits(options.limits);

  const adapter = new A2UIV09Adapter(options.catalogs);
  const catalogs = new Map(
    options.catalogs.map((catalog) => [catalog.id, catalog]),
  );
  const surfaces = new Map<string, A2UISurfaceSnapshot>();
  const dataModels = new Map<string, unknown>();
  const surfaceRevisions = new Map<string, number>();
  const listeners = new Set<() => void>();
  const surfaceListeners = new Map<string, Set<() => void>>();
  let errors = EMPTY_ERRORS;
  let snapshot = createEngineSnapshot(0, surfaces, errors);
  let disposed = false;

  const publish = (affectedSurfaceIds: ReadonlySet<string>): void => {
    snapshot = createEngineSnapshot(snapshot.revision + 1, surfaces, errors);

    for (const listener of listeners) {
      listener();
    }

    for (const surfaceId of affectedSurfaceIds) {
      for (const listener of surfaceListeners.get(surfaceId) ?? []) {
        listener();
      }
    }
  };

  const appendError = (error: A2UIRendererError): A2UIRendererError => {
    const frozenError = Object.freeze({ ...error });
    errors = Object.freeze([...errors, frozenError]);

    try {
      options.onError?.(frozenError);
    } catch {
      // Consumer diagnostics must not break protocol processing.
    }

    return frozenError;
  };

  const reportBatchError = (
    error: A2UIRendererError,
    affectedSurfaceIds: Set<string>,
  ): void => {
    const frozenError = appendError(error);
    if (frozenError.surfaceId !== undefined) {
      affectedSurfaceIds.add(frozenError.surfaceId);
    }
  };

  const applyMessages = (messages: readonly unknown[]): void => {
    if (disposed || messages.length === 0) {
      return;
    }

    const affectedSurfaceIds = new Set<string>();
    let changed = false;

    if (messages.length > limits.maxMessagesPerBatch) {
      appendError({
        code: "RESOURCE_LIMIT_EXCEEDED",
        message: `A2UI message batch exceeds the ${String(limits.maxMessagesPerBatch)} message limit`,
        severity: "error",
        path: "/",
      });
      publish(affectedSurfaceIds);
      return;
    }

    const parsedMessages: ParsedA2UIMessage[] = [];
    for (const input of messages) {
      const parsed = adapter.parseMessage(input);
      if (!parsed.success) {
        reportBatchError(
          parseFailureToError(input, parsed.failure),
          affectedSurfaceIds,
        );
        changed = true;
        continue;
      }

      parsedMessages.push(parsed.value);
    }

    const validated = validateMessageBatch({
      messages: parsedMessages,
      surfaces,
      catalogs,
      limits,
    });
    for (const error of validated.errors) {
      reportBatchError(error, affectedSurfaceIds);
      changed = true;
    }

    for (const parsed of validated.accepted) {
      try {
        const stagedDataModel = stageDataModelUpdate(parsed, dataModels);
        adapter.processMessage(parsed.message);
        commitDataModelUpdate(parsed, stagedDataModel, dataModels);
        updateSurfaceSnapshot(
          adapter,
          parsed,
          surfaces,
          surfaceRevisions,
          dataModels,
        );
        affectedSurfaceIds.add(parsed.surfaceId);
        changed = true;
      } catch (cause) {
        reportBatchError(
          processingFailureToError(parsed, cause),
          affectedSurfaceIds,
        );
        changed = true;
      }
    }

    if (changed) {
      publish(affectedSurfaceIds);
    }
  };

  const deliverAction = async (action: A2UIUserAction): Promise<void> => {
    try {
      await options.onAction?.(action);
    } catch (cause) {
      appendError({
        code: "INVALID_MESSAGE",
        message: "A2UI action callback failed",
        severity: "error",
        surfaceId: action.surfaceId,
        componentId: action.sourceComponentId,
        cause,
      });
      publish(new Set([action.surfaceId]));
    }
  };

  const engine: A2UIEngineWithInternals = {
    applyMessage(message: unknown): void {
      applyMessages([message]);
    },
    applyMessages,
    getSnapshot(): A2UIEngineSnapshot {
      return snapshot;
    },
    getSurface(surfaceId: string): A2UISurfaceSnapshot | undefined {
      return surfaces.get(surfaceId);
    },
    getErrors(): readonly A2UIRendererError[] {
      return errors;
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    subscribeSurface(surfaceId: string, listener: () => void): () => void {
      const current = surfaceListeners.get(surfaceId) ?? new Set<() => void>();
      current.add(listener);
      surfaceListeners.set(surfaceId, current);

      return () => {
        current.delete(listener);
        if (current.size === 0) {
          surfaceListeners.delete(surfaceId);
        }
      };
    },
    dispose(): void {
      if (disposed) {
        return;
      }

      disposed = true;
      adapter.dispose();
      surfaces.clear();
      dataModels.clear();
      surfaceRevisions.clear();
      listeners.clear();
      surfaceListeners.clear();
    },
    [A2UI_ENGINE_INTERNALS]: {
      getCatalog(catalogId: string) {
        return catalogs.get(catalogId);
      },
      reportError(error: A2UIRendererError): void {
        const frozenError = appendError(error);
        publish(
          new Set(
            frozenError.surfaceId === undefined ? [] : [frozenError.surfaceId],
          ),
        );
      },
      setDataValue(surfaceId, path, value): void {
        const surface = surfaces.get(surfaceId);
        if (surface === undefined) {
          this.reportError({
            code: "INVALID_MESSAGE",
            message: `Cannot update data for missing surface "${surfaceId}"`,
            severity: "error",
            surfaceId,
            path,
          });
          return;
        }

        try {
          const frozenValue = freezeDataSnapshot(value);
          const nextDataModel = updateDataPointer(
            dataModels.get(surfaceId) ?? EMPTY_DATA_MODEL,
            path,
            frozenValue,
          );
          if (
            measureSerializedBytes(nextDataModel) > limits.maxDataModelBytes
          ) {
            this.reportError({
              code: "RESOURCE_LIMIT_EXCEEDED",
              message: `A2UI data model exceeds the ${String(limits.maxDataModelBytes)} byte limit`,
              severity: "error",
              surfaceId,
              path,
            });
            return;
          }
          adapter.setDataValue(surfaceId, path, value);
          dataModels.set(surfaceId, nextDataModel);

          const revision = (surfaceRevisions.get(surfaceId) ?? 0) + 1;
          surfaceRevisions.set(surfaceId, revision);
          surfaces.set(
            surfaceId,
            Object.freeze({
              ...surface,
              dataModel: nextDataModel,
              revision,
            }),
          );
          publish(new Set([surfaceId]));
        } catch (cause) {
          this.reportError({
            code: "INVALID_MESSAGE",
            message: `Failed to update A2UI data path "${path}"`,
            severity: "error",
            surfaceId,
            path,
            cause,
          });
        }
      },
      dispatchAction(surfaceId, componentId, scopePath, action): void {
        const surface = surfaces.get(surfaceId);
        if (surface === undefined) {
          this.reportError({
            code: "INVALID_MESSAGE",
            message: `Cannot dispatch an action for missing surface "${surfaceId}"`,
            severity: "error",
            surfaceId,
            componentId,
          });
          return;
        }

        try {
          const catalog = catalogs.get(surface.catalogId);
          const resolvedAction = resolveA2UIAction({
            surfaceId,
            sourceComponentId: componentId,
            scopePath,
            action,
            dataModel: surface.dataModel,
            functions: catalog?.functions ?? [],
          });
          if (resolvedAction.kind === "event") {
            void deliverAction(resolvedAction.action);
          }
        } catch (cause) {
          const functionError = isA2UIFunctionInvocationError(cause);
          this.reportError({
            code: functionError ? "FUNCTION_ERROR" : "INVALID_MESSAGE",
            message: functionError
              ? "A2UI action function evaluation failed"
              : "A2UI action dispatch failed",
            severity: "error",
            surfaceId,
            componentId,
            cause,
          });
        }
      },
    },
  };

  return Object.freeze(engine);
}

function updateSurfaceSnapshot(
  adapter: A2UIV09Adapter,
  parsed: ParsedA2UIMessage,
  surfaces: Map<string, A2UISurfaceSnapshot>,
  surfaceRevisions: Map<string, number>,
  dataModels: ReadonlyMap<string, unknown>,
): void {
  if (parsed.operation === "deleteSurface") {
    surfaces.delete(parsed.surfaceId);
    surfaceRevisions.delete(parsed.surfaceId);
    return;
  }

  const surface = adapter.getSurface(parsed.surfaceId);
  if (surface === undefined) {
    return;
  }

  const revision = (surfaceRevisions.get(parsed.surfaceId) ?? 0) + 1;
  surfaceRevisions.set(parsed.surfaceId, revision);

  const componentEntries = Array.from(
    surface.componentsModel.entries,
    ([, model]) => [model.id, createComponentSnapshot(model)] as const,
  );
  const components = Object.freeze(Object.fromEntries(componentEntries));

  surfaces.set(
    parsed.surfaceId,
    Object.freeze({
      surfaceId: surface.id,
      catalogId: surface.catalog.id,
      rootId: surface.componentsModel.get("root") === undefined ? null : "root",
      components,
      dataModel: dataModels.get(parsed.surfaceId) ?? EMPTY_DATA_MODEL,
      revision,
    }),
  );
}

const EMPTY_DATA_MODEL = Object.freeze({});

function stageDataModelUpdate(
  parsed: ParsedA2UIMessage,
  dataModels: ReadonlyMap<string, unknown>,
): unknown {
  if (parsed.operation !== "updateDataModel") {
    return undefined;
  }

  const message = parsed.message;
  if (!("updateDataModel" in message)) {
    return undefined;
  }

  const current = dataModels.get(parsed.surfaceId) ?? EMPTY_DATA_MODEL;
  const path = message.updateDataModel.path ?? "/";
  const value = freezeDataSnapshot(message.updateDataModel.value);
  return updateDataPointer(current, path, value);
}

function commitDataModelUpdate(
  parsed: ParsedA2UIMessage,
  stagedDataModel: unknown,
  dataModels: Map<string, unknown>,
): void {
  if (parsed.operation === "createSurface") {
    dataModels.set(parsed.surfaceId, EMPTY_DATA_MODEL);
    return;
  }

  if (parsed.operation === "updateDataModel") {
    dataModels.set(parsed.surfaceId, stagedDataModel);
    return;
  }

  if (parsed.operation === "deleteSurface") {
    dataModels.delete(parsed.surfaceId);
  }
}

function freezeDataSnapshot(value: unknown): unknown {
  if (Array.isArray(value)) {
    return Object.freeze(value.map(freezeDataSnapshot));
  }

  if (isRecord(value)) {
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value).map(([key, nestedValue]) => [
          key,
          freezeDataSnapshot(nestedValue),
        ]),
      ),
    );
  }

  return value;
}

function createComponentSnapshot(model: ComponentModel): A2UIComponentSnapshot {
  return Object.freeze({
    id: model.id,
    type: model.type,
    props: Object.freeze({ ...model.properties }),
  });
}

function createEngineSnapshot(
  revision: number,
  surfaces: ReadonlyMap<string, A2UISurfaceSnapshot>,
  errors: readonly A2UIRendererError[],
): A2UIEngineSnapshot {
  return Object.freeze({
    revision,
    surfaceIds: Object.freeze(Array.from(surfaces.keys())),
    errorCount: errors.length,
  });
}

function parseFailureToError(
  input: unknown,
  failure: {
    readonly error: unknown;
    readonly path?: string;
    readonly unsupportedVersion: boolean;
  },
): A2UIRendererError {
  const identifiers = extractIdentifiers(input);

  return {
    code: failure.unsupportedVersion
      ? "UNSUPPORTED_VERSION"
      : "INVALID_MESSAGE",
    message: failure.unsupportedVersion
      ? "Only A2UI v0.9 messages are supported"
      : "Invalid A2UI v0.9 message",
    severity: "error",
    ...identifiers,
    ...(failure.path === undefined ? {} : { path: failure.path }),
    cause: failure.error,
  };
}

function processingFailureToError(
  parsed: ParsedA2UIMessage,
  cause: unknown,
): A2UIRendererError {
  const message =
    cause instanceof Error ? cause.message : "A2UI processing failed";
  const unknownCatalog = message.startsWith("Catalog not found:");

  return {
    code: unknownCatalog ? "UNKNOWN_CATALOG" : "INVALID_MESSAGE",
    message,
    severity: "error",
    surfaceId: parsed.surfaceId,
    ...(parsed.catalogId === undefined ? {} : { catalogId: parsed.catalogId }),
    cause,
  };
}

function extractIdentifiers(input: unknown): {
  readonly surfaceId?: string;
  readonly catalogId?: string;
} {
  if (!isRecord(input)) {
    return {};
  }

  for (const operation of [
    "createSurface",
    "updateComponents",
    "updateDataModel",
    "deleteSurface",
  ] as const) {
    const payload = input[operation];
    if (!isRecord(payload)) {
      continue;
    }

    return {
      ...(typeof payload.surfaceId === "string"
        ? { surfaceId: payload.surfaceId }
        : {}),
      ...(typeof payload.catalogId === "string"
        ? { catalogId: payload.catalogId }
        : {}),
    };
  }

  return {};
}

function validateCatalogs(catalogs: A2UIEngineOptions["catalogs"]): void {
  if (catalogs.length === 0) {
    throw new TypeError("A2UI engine requires at least one catalog");
  }

  const ids = new Set<string>();
  for (const catalog of catalogs) {
    if (ids.has(catalog.id)) {
      throw new TypeError(`Duplicate A2UI catalog id "${catalog.id}"`);
    }
    ids.add(catalog.id);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
