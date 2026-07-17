import type { ComponentModel } from "@a2ui/web_core/v0_9";

import type { A2UIRendererError } from "../errors/types.js";
import {
  A2UIV09Adapter,
  type ParsedA2UIMessage,
} from "../protocol/v0_9/adapter.js";
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

const EMPTY_ERRORS: readonly A2UIRendererError[] = Object.freeze([]);

export function createA2UIEngine(options: A2UIEngineOptions): A2UIEngine {
  validateCatalogs(options.catalogs);

  const adapter = new A2UIV09Adapter(options.catalogs);
  const catalogs = new Map(
    options.catalogs.map((catalog) => [catalog.id, catalog]),
  );
  const surfaces = new Map<string, A2UISurfaceSnapshot>();
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

      try {
        adapter.processMessage(parsed.value.message);
        updateSurfaceSnapshot(
          adapter,
          parsed.value,
          surfaces,
          surfaceRevisions,
        );
        affectedSurfaceIds.add(parsed.value.surfaceId);
        changed = true;
      } catch (cause) {
        reportBatchError(
          processingFailureToError(parsed.value, cause),
          affectedSurfaceIds,
        );
        changed = true;
      }
    }

    if (changed) {
      publish(affectedSurfaceIds);
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
      dispatchAction(surfaceId, componentId, action): void {
        const surface = adapter.getSurface(surfaceId);
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

        void surface
          .dispatchAction(action, componentId)
          .catch((cause: unknown) => {
            this.reportError({
              code: "INVALID_MESSAGE",
              message: "A2UI action dispatch failed",
              severity: "error",
              surfaceId,
              componentId,
              cause,
            });
          });
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
      revision,
    }),
  );
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
