import type {
  A2UIRegisteredCatalog,
  A2UISurfaceSnapshot,
} from "../../engine/types.js";
import type { A2UIRendererError } from "../../errors/types.js";
import {
  measureSerializedBytes,
  type A2UIResourceLimits,
} from "../../validation/limits.js";
import { validateComponentUpdate } from "../../validation/validateGraph.js";
import { updateDataPointer } from "./bindings.js";
import { A2UIWireMessageSchema } from "./wireSchemas.js";

interface CoreSurface {
  readonly snapshot: A2UISurfaceSnapshot;
}

export type A2UIProtocolCoreResult =
  | { readonly success: true; readonly surfaceId: string }
  | { readonly success: false; readonly error: A2UIRendererError };

const EMPTY_COMPONENTS = Object.freeze({});
const EMPTY_DATA_MODEL = Object.freeze({});

export class A2UIProtocolCore {
  private readonly catalogs: ReadonlyMap<string, A2UIRegisteredCatalog>;
  private readonly surfaces = new Map<string, CoreSurface>();

  constructor(
    catalogs: readonly A2UIRegisteredCatalog[],
    private readonly limits: A2UIResourceLimits,
  ) {
    this.catalogs = new Map(catalogs.map((catalog) => [catalog.id, catalog]));
  }

  apply(input: unknown): A2UIProtocolCoreResult {
    const parsed = A2UIWireMessageSchema.safeParse(input);
    if (!parsed.success) {
      const createIssues = parsed.error.issues.flatMap((issue) =>
        issue.code === "invalid_union"
          ? (issue.unionErrors[0]?.issues ?? [])
          : [issue],
      );
      const themeOnly =
        createIssues.length > 0 &&
        createIssues.every(
          (issue) =>
            issue.path[0] === "createSurface" && issue.path[1] === "theme",
        );
      const unsupportedVersion =
        isRecord(input) &&
        typeof input.version === "string" &&
        input.version !== "v0.9" &&
        input.version !== "v0.9.1";
      return {
        success: false,
        error: {
          code: unsupportedVersion ? "UNSUPPORTED_VERSION" : "INVALID_MESSAGE",
          message: unsupportedVersion
            ? "Only A2UI v0.9 and v0.9.1 messages are supported"
            : "Invalid A2UI message",
          severity: "error",
          ...extractIdentifiers(input),
          path: themeOnly ? "/createSurface/theme" : "/",
          cause: parsed.error,
        },
      };
    }

    const message = parsed.data;
    if ("createSurface" in message) {
      const { surfaceId, catalogId, theme, sendDataModel } =
        message.createSurface;
      if (this.surfaces.has(surfaceId)) {
        return failure(
          "INVALID_MESSAGE",
          `A2UI surface "${surfaceId}" already exists`,
          surfaceId,
        );
      }
      const catalog = this.catalogs.get(catalogId);
      if (catalog === undefined) {
        return {
          success: false,
          error: {
            code: "UNKNOWN_CATALOG",
            message: `A2UI catalog "${catalogId}" is not registered`,
            severity: "error",
            surfaceId,
            catalogId,
            path: "/createSurface/catalogId",
          },
        };
      }

      let acceptedTheme: A2UISurfaceSnapshot["theme"];
      if (theme !== undefined) {
        let themePath = "/createSurface/theme";
        try {
          assertJsonTheme(theme);
          const result = catalog.themeSchema?.safeParse(theme);
          if (result !== undefined && !result.success) {
            const parts = result.error.issues[0]?.path ?? [];
            themePath += parts
              .map(
                (part) =>
                  `/${String(part).replaceAll("~", "~0").replaceAll("/", "~1")}`,
              )
              .join("");
            throw result.error;
          }
          const value: unknown = result?.data ?? theme;
          assertJsonTheme(value);
          acceptedTheme = freezeData(value) as NonNullable<
            A2UISurfaceSnapshot["theme"]
          >;
        } catch (cause) {
          return {
            success: false,
            error: {
              code: "INVALID_MESSAGE",
              message: `A2UI surface "${surfaceId}" has an invalid theme`,
              severity: "error",
              surfaceId,
              catalogId,
              path: themePath,
              cause,
            },
          };
        }
      }

      this.surfaces.set(surfaceId, {
        snapshot: Object.freeze({
          surfaceId,
          catalogId,
          version: message.version,
          sendDataModel: sendDataModel ?? false,
          ...(acceptedTheme === undefined ? {} : { theme: acceptedTheme }),
          rootId: null,
          pendingComponentIds: Object.freeze(["root"]),
          components: EMPTY_COMPONENTS,
          dataModel: EMPTY_DATA_MODEL,
          revision: 1,
        }),
      });
      return { success: true, surfaceId };
    }

    if ("deleteSurface" in message) {
      const { surfaceId } = message.deleteSurface;
      if (!this.surfaces.has(surfaceId)) {
        return failure(
          "INVALID_MESSAGE",
          `A2UI surface "${surfaceId}" does not exist`,
          surfaceId,
        );
      }
      this.surfaces.delete(surfaceId);
      return { success: true, surfaceId };
    }

    if ("updateComponents" in message) {
      const { surfaceId, components } = message.updateComponents;
      const current = this.surfaces.get(surfaceId);
      if (current === undefined) {
        return failure(
          "INVALID_MESSAGE",
          `A2UI surface "${surfaceId}" does not exist`,
          surfaceId,
        );
      }

      const catalog = this.catalogs.get(current.snapshot.catalogId);
      if (catalog === undefined) {
        return failure(
          "UNKNOWN_CATALOG",
          `A2UI catalog "${current.snapshot.catalogId}" is not registered`,
          surfaceId,
        );
      }

      const validation = validateComponentUpdate({
        surfaceId,
        catalog,
        current: current.snapshot.components,
        updates: components,
        limits: this.limits,
      });
      if (!validation.success) {
        return { success: false, error: validation.error };
      }

      this.surfaces.set(surfaceId, {
        ...current,
        snapshot: Object.freeze({
          ...current.snapshot,
          rootId: validation.components.root === undefined ? null : "root",
          pendingComponentIds: validation.pendingComponentIds,
          components: validation.components,
          revision: current.snapshot.revision + 1,
        }),
      });
      return { success: true, surfaceId };
    }

    const { surfaceId, path, value } = message.updateDataModel;
    return this.updateDataModel(surfaceId, path ?? "/", value, true);
  }

  setDataValue(
    surfaceId: string,
    path: string,
    value: unknown,
  ): A2UIProtocolCoreResult {
    return this.updateDataModel(surfaceId, path, value, false);
  }

  private updateDataModel(
    surfaceId: string,
    path: string,
    value: unknown,
    wireMessage: boolean,
  ): A2UIProtocolCoreResult {
    const current = this.surfaces.get(surfaceId);
    if (current === undefined) {
      return failure(
        "INVALID_MESSAGE",
        `A2UI surface "${surfaceId}" does not exist`,
        surfaceId,
      );
    }

    let nextDataModel: unknown;
    try {
      nextDataModel = updateDataPointer(
        current.snapshot.dataModel,
        path,
        freezeData(value),
      );
    } catch (cause) {
      return {
        success: false,
        error: {
          code: "BINDING_ERROR",
          message: "A2UI data model update contains an invalid path",
          severity: "error",
          surfaceId,
          path: wireMessage ? "/updateDataModel/path" : path,
          cause,
        },
      };
    }

    if (measureSerializedBytes(nextDataModel) > this.limits.maxDataModelBytes) {
      return {
        success: false,
        error: {
          code: "RESOURCE_LIMIT_EXCEEDED",
          message: `A2UI data model exceeds the ${String(this.limits.maxDataModelBytes)} byte limit`,
          severity: "error",
          surfaceId,
          path: wireMessage ? "/updateDataModel/value" : path,
        },
      };
    }

    this.surfaces.set(surfaceId, {
      ...current,
      snapshot: Object.freeze({
        ...current.snapshot,
        dataModel: nextDataModel,
        revision: current.snapshot.revision + 1,
      }),
    });
    return { success: true, surfaceId };
  }

  getSurface(surfaceId: string): A2UISurfaceSnapshot | undefined {
    return this.surfaces.get(surfaceId)?.snapshot;
  }

  getSurfaceIds(): readonly string[] {
    return Object.freeze(Array.from(this.surfaces.keys()));
  }

  dispose(): void {
    this.surfaces.clear();
  }
}

function extractIdentifiers(input: unknown): {
  readonly surfaceId?: string;
  readonly catalogId?: string;
} {
  if (!isRecord(input)) return {};
  for (const operation of [
    "createSurface",
    "updateComponents",
    "updateDataModel",
    "deleteSurface",
  ] as const) {
    const payload = input[operation];
    if (!isRecord(payload)) continue;
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

function failure(
  code: A2UIRendererError["code"],
  message: string,
  surfaceId: string,
): A2UIProtocolCoreResult {
  return {
    success: false,
    error: { code, message, severity: "error", surfaceId },
  };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function freezeData(value: unknown): unknown {
  if (Array.isArray(value)) {
    return Object.freeze(value.map(freezeData));
  }
  if (isRecord(value)) {
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value).map(([key, nested]) => [key, freezeData(nested)]),
      ),
    );
  }
  return value;
}

function assertJsonTheme(value: unknown, ancestors = new WeakSet()): void {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  )
    return;
  if (
    typeof value !== "object" ||
    (!Array.isArray(value) &&
      Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null) ||
    ancestors.has(value)
  ) {
    throw new TypeError("A2UI themes must contain only JSON values");
  }
  ancestors.add(value);
  for (const nested of Array.isArray(value) ? value : Object.values(value)) {
    assertJsonTheme(nested, ancestors);
  }
  ancestors.delete(value);
}
