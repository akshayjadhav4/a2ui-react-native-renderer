import type { A2UIRendererError } from "../errors/types.js";
import { prepareClientDataModel } from "./clientDataModel.js";
import { resolveA2UIAction } from "./actions.js";
import { A2UIProtocolCore } from "../protocol/v0_9/core.js";
import { isA2UIFunctionInvocationError } from "../protocol/v0_9/functions.js";
import type { A2UIUserAction } from "../types/messages.js";
import type {
  A2UIEngine,
  A2UIEngineOptions,
  A2UIEngineSnapshot,
  A2UISurfaceSnapshot,
} from "./types.js";
import {
  A2UI_ENGINE_INTERNALS,
  type A2UIEngineWithInternals,
} from "./internals.js";
import { resolveA2UIResourceLimits } from "../validation/limits.js";

const EMPTY_ERRORS: readonly A2UIRendererError[] = Object.freeze([]);

export function createA2UIEngine(options: A2UIEngineOptions): A2UIEngine {
  validateCatalogs(options.catalogs);
  const limits = resolveA2UIResourceLimits(options.limits);

  const core = new A2UIProtocolCore(options.catalogs, limits);
  const catalogs = new Map(
    options.catalogs.map((catalog) => [catalog.id, catalog]),
  );
  const surfaceErrors = new Map<string, A2UIRendererError>();
  const listeners = new Set<() => void>();
  const surfaceListeners = new Map<string, Set<() => void>>();
  let errors = EMPTY_ERRORS;
  let snapshot = createEngineSnapshot(
    0,
    core.getSurfaceIds(),
    surfaceErrors,
    errors,
  );
  let disposed = false;

  const publish = (affectedSurfaceIds: ReadonlySet<string>): void => {
    snapshot = createEngineSnapshot(
      snapshot.revision + 1,
      core.getSurfaceIds(),
      surfaceErrors,
      errors,
      snapshot,
    );

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
      surfaceErrors.set(frozenError.surfaceId, frozenError);
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

    for (const input of messages) {
      try {
        const result = core.apply(input);
        if (result.success) {
          surfaceErrors.delete(result.surfaceId);
          affectedSurfaceIds.add(result.surfaceId);
        } else {
          reportBatchError(result.error, affectedSurfaceIds);
        }
        changed = true;
      } catch (cause) {
        reportBatchError(
          {
            code: "INVALID_MESSAGE",
            message:
              cause instanceof Error ? cause.message : "A2UI processing failed",
            severity: "error",
            cause,
          },
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
      return core.getSurface(surfaceId);
    },
    getClientDataModel(surfaceIds) {
      return prepareClientDataModel(surfaceIds, (id) => core.getSurface(id));
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
      core.dispose();
      surfaceErrors.clear();
      listeners.clear();
      surfaceListeners.clear();
    },
    [A2UI_ENGINE_INTERNALS]: {
      getCatalog(catalogId: string) {
        return catalogs.get(catalogId);
      },
      getSurfaceError(surfaceId: string) {
        return surfaceErrors.get(surfaceId);
      },
      reportError(error: A2UIRendererError): void {
        const frozenError = appendError(error);
        if (frozenError.surfaceId !== undefined) {
          surfaceErrors.set(frozenError.surfaceId, frozenError);
        }
        publish(
          new Set(
            frozenError.surfaceId === undefined ? [] : [frozenError.surfaceId],
          ),
        );
      },
      setDataValue(surfaceId, path, value): void {
        try {
          const result = core.setDataValue(surfaceId, path, value);
          if (result.success) {
            surfaceErrors.delete(surfaceId);
            publish(new Set([surfaceId]));
          } else {
            this.reportError(result.error);
          }
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
        const surface = core.getSurface(surfaceId);
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

function createEngineSnapshot(
  revision: number,
  surfaceIds: readonly string[],
  surfaceErrors: ReadonlyMap<string, A2UIRendererError>,
  errors: readonly A2UIRendererError[],
  previous?: A2UIEngineSnapshot,
): A2UIEngineSnapshot {
  return Object.freeze({
    revision,
    surfaceIds: stableList(surfaceIds, previous?.surfaceIds),
    failedSurfaceIds: stableMapKeys(surfaceErrors, previous?.failedSurfaceIds),
    errorCount: errors.length,
  });
}

function stableList(
  current: readonly string[],
  previous: readonly string[] | undefined,
): readonly string[] {
  if (
    previous?.length === current.length &&
    current.every((value, index) => previous[index] === value)
  ) {
    return previous;
  }
  return current;
}

function stableMapKeys(
  map: ReadonlyMap<string, unknown>,
  previous: readonly string[] | undefined,
): readonly string[] {
  if (previous?.length === map.size) {
    let index = 0;
    let unchanged = true;
    for (const key of map.keys()) {
      if (previous[index] !== key) {
        unchanged = false;
        break;
      }
      index += 1;
    }

    if (unchanged) {
      return previous;
    }
  }

  return Object.freeze(Array.from(map.keys()));
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
