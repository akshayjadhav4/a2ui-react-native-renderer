import {
  A2uiMessageSchema,
  Catalog,
  MessageProcessor,
  type A2uiMessage,
  type ComponentApi,
  type SurfaceModel,
} from "@a2ui/web_core/v0_9";

import type { A2UIRegisteredCatalog } from "../../engine/types.js";

interface RuntimeComponentApi extends ComponentApi {
  readonly name: string;
}

export interface ParsedA2UIMessage {
  readonly message: A2uiMessage;
  readonly surfaceId: string;
  readonly catalogId?: string;
  readonly operation:
    "createSurface" | "updateComponents" | "updateDataModel" | "deleteSurface";
}

export interface A2UIMessageParseFailure {
  readonly error: unknown;
  readonly path?: string;
  readonly unsupportedVersion: boolean;
}

export type A2UIMessageParseResult =
  | { readonly success: true; readonly value: ParsedA2UIMessage }
  | { readonly success: false; readonly failure: A2UIMessageParseFailure };

export class A2UIV09Adapter {
  readonly processor: MessageProcessor<RuntimeComponentApi>;

  constructor(catalogs: readonly A2UIRegisteredCatalog[]) {
    this.processor = new MessageProcessor(
      catalogs.map((catalog) => toRuntimeCatalog(catalog)),
    );
  }

  parseMessage(input: unknown): A2UIMessageParseResult {
    const result = A2uiMessageSchema.safeParse(input);
    if (!result.success) {
      const path = issuePath(result.error.issues[0]?.path);
      return {
        success: false,
        failure: {
          error: result.error,
          ...(path === undefined ? {} : { path }),
          unsupportedVersion: hasUnsupportedVersion(input),
        },
      };
    }

    // The upstream schema output and interface differ only in the spelling of
    // optional fields under exactOptionalPropertyTypes.
    return {
      success: true,
      value: describeMessage(result.data as A2uiMessage),
    };
  }

  processMessage(message: A2uiMessage): void {
    this.processor.processMessages([message]);
  }

  getSurface(surfaceId: string): SurfaceModel<RuntimeComponentApi> | undefined {
    return this.processor.model.getSurface(surfaceId);
  }

  setDataValue(surfaceId: string, path: string, value: unknown): void {
    const surface = this.getSurface(surfaceId);
    if (surface === undefined) {
      throw new TypeError(`A2UI surface "${surfaceId}" does not exist`);
    }

    surface.dataModel.set(path, value);
  }

  dispose(): void {
    this.processor.model.dispose();
  }
}

function toRuntimeCatalog(
  catalog: A2UIRegisteredCatalog,
): Catalog<RuntimeComponentApi> {
  const components = Object.entries(catalog.components).map(
    ([name, definition]) => ({
      name,
      schema: definition.schema,
    }),
  );

  return new Catalog(catalog.id, components);
}

function describeMessage(message: A2uiMessage): ParsedA2UIMessage {
  if ("createSurface" in message) {
    return {
      message,
      operation: "createSurface",
      surfaceId: message.createSurface.surfaceId,
      catalogId: message.createSurface.catalogId,
    };
  }

  if ("updateComponents" in message) {
    return {
      message,
      operation: "updateComponents",
      surfaceId: message.updateComponents.surfaceId,
    };
  }

  if ("updateDataModel" in message) {
    return {
      message,
      operation: "updateDataModel",
      surfaceId: message.updateDataModel.surfaceId,
    };
  }

  return {
    message,
    operation: "deleteSurface",
    surfaceId: message.deleteSurface.surfaceId,
  };
}

function hasUnsupportedVersion(input: unknown): boolean {
  return (
    isRecord(input) &&
    typeof input.version === "string" &&
    input.version !== "v0.9"
  );
}

function issuePath(path: PropertyKey[] | undefined): string | undefined {
  if (path === undefined || path.length === 0) {
    return undefined;
  }

  return `/${path.map((part) => escapePointerToken(String(part))).join("/")}`;
}

function escapePointerToken(token: string): string {
  return token.replaceAll("~", "~0").replaceAll("/", "~1");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
