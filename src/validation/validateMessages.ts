import type {
  A2UIRegisteredCatalog,
  A2UISurfaceSnapshot,
} from "../engine/types.js";
import type { A2UIRendererError } from "../errors/types.js";
import type { ParsedA2UIMessage } from "../protocol/v0_9/adapter.js";
import { updateDataPointer } from "../protocol/v0_9/bindings.js";
import { measureSerializedBytes, type A2UIResourceLimits } from "./limits.js";
import {
  validateComponentUpdate,
  type A2UIComponentGraph,
} from "./validateGraph.js";

interface StagedSurface {
  readonly catalogId: string;
  readonly components: A2UIComponentGraph;
  readonly dataModel: unknown;
}

export interface ValidateMessageBatchInput {
  readonly messages: readonly ParsedA2UIMessage[];
  readonly surfaces: ReadonlyMap<string, A2UISurfaceSnapshot>;
  readonly catalogs: ReadonlyMap<string, A2UIRegisteredCatalog>;
  readonly limits: A2UIResourceLimits;
}

export interface ValidatedMessageBatch {
  readonly accepted: readonly ParsedA2UIMessage[];
  readonly errors: readonly A2UIRendererError[];
}

export function validateMessageBatch({
  messages,
  surfaces,
  catalogs,
  limits,
}: ValidateMessageBatchInput): ValidatedMessageBatch {
  const staged = new Map<string, StagedSurface | null>();
  const rejectedSurfaceIds = new Set<string>();
  const errors: A2UIRendererError[] = [];

  const getStagedSurface = (surfaceId: string): StagedSurface | null => {
    if (staged.has(surfaceId)) {
      return staged.get(surfaceId) ?? null;
    }

    const current = surfaces.get(surfaceId);
    const value =
      current === undefined
        ? null
        : {
            catalogId: current.catalogId,
            components: current.components,
            dataModel: current.dataModel,
          };
    staged.set(surfaceId, value);
    return value;
  };

  const reject = (error: A2UIRendererError): void => {
    rejectedSurfaceIds.add(error.surfaceId ?? "");
    errors.push(Object.freeze(error));
  };

  for (const parsed of messages) {
    if (rejectedSurfaceIds.has(parsed.surfaceId)) {
      continue;
    }

    const current = getStagedSurface(parsed.surfaceId);
    if (parsed.operation === "createSurface") {
      if (current !== null) {
        reject(
          invalidMessage(
            parsed.surfaceId,
            `A2UI surface "${parsed.surfaceId}" already exists`,
          ),
        );
        continue;
      }

      const catalogId = parsed.catalogId;
      const catalog =
        catalogId === undefined ? undefined : catalogs.get(catalogId);
      if (catalog === undefined) {
        reject({
          code: "UNKNOWN_CATALOG",
          message: `A2UI catalog "${catalogId ?? ""}" is not registered`,
          severity: "error",
          surfaceId: parsed.surfaceId,
          ...(catalogId === undefined ? {} : { catalogId }),
          path: "/createSurface/catalogId",
        });
        continue;
      }

      staged.set(parsed.surfaceId, {
        catalogId: catalog.id,
        components: Object.freeze({}),
        dataModel: Object.freeze({}),
      });
      continue;
    }

    if (parsed.operation === "deleteSurface") {
      staged.set(parsed.surfaceId, null);
      continue;
    }

    if (current === null) {
      reject(
        invalidMessage(
          parsed.surfaceId,
          `A2UI surface "${parsed.surfaceId}" does not exist`,
        ),
      );
      continue;
    }

    if (parsed.operation === "updateComponents") {
      const catalog = catalogs.get(current.catalogId);
      if (catalog === undefined) {
        reject({
          code: "UNKNOWN_CATALOG",
          message: `A2UI catalog "${current.catalogId}" is not registered`,
          severity: "error",
          surfaceId: parsed.surfaceId,
          catalogId: current.catalogId,
        });
        continue;
      }

      const message = parsed.message;
      if (!("updateComponents" in message)) {
        reject(invalidMessage(parsed.surfaceId, "Invalid component update"));
        continue;
      }
      const validation = validateComponentUpdate({
        surfaceId: parsed.surfaceId,
        catalog,
        current: current.components,
        updates: message.updateComponents.components,
        limits,
      });
      if (!validation.success) {
        reject(validation.error);
        continue;
      }

      staged.set(parsed.surfaceId, {
        ...current,
        components: validation.components,
      });
      continue;
    }

    const message = parsed.message;
    if (!("updateDataModel" in message)) {
      reject(invalidMessage(parsed.surfaceId, "Invalid data model update"));
      continue;
    }

    try {
      const nextDataModel = updateDataPointer(
        current.dataModel,
        message.updateDataModel.path ?? "/",
        message.updateDataModel.value,
      );
      if (measureSerializedBytes(nextDataModel) > limits.maxDataModelBytes) {
        reject({
          code: "RESOURCE_LIMIT_EXCEEDED",
          message: `A2UI data model exceeds the ${String(limits.maxDataModelBytes)} byte limit`,
          severity: "error",
          surfaceId: parsed.surfaceId,
          path: "/updateDataModel/value",
        });
        continue;
      }

      staged.set(parsed.surfaceId, {
        ...current,
        dataModel: nextDataModel,
      });
    } catch (cause) {
      reject({
        code: "BINDING_ERROR",
        message: `A2UI data model update contains an invalid path`,
        severity: "error",
        surfaceId: parsed.surfaceId,
        path: "/updateDataModel/path",
        cause,
      });
    }
  }

  return Object.freeze({
    accepted: Object.freeze(
      messages.filter((message) => !rejectedSurfaceIds.has(message.surfaceId)),
    ),
    errors: Object.freeze(errors),
  });
}

function invalidMessage(surfaceId: string, message: string): A2UIRendererError {
  return {
    code: "INVALID_MESSAGE",
    message,
    severity: "error",
    surfaceId,
  };
}
