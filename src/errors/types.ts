export type A2UIRendererErrorCode =
  | "INVALID_MESSAGE"
  | "UNSUPPORTED_VERSION"
  | "UNKNOWN_CATALOG"
  | "DUPLICATE_CATALOG"
  | "UNKNOWN_COMPONENT"
  | "INVALID_COMPONENT_PROPS"
  | "INVALID_ROOT"
  | "INVALID_REFERENCE"
  | "BINDING_ERROR"
  | "FUNCTION_ERROR"
  | "PRESENTER_ERROR"
  | "RESOURCE_LIMIT_EXCEEDED";

export type A2UIRendererErrorSeverity = "warning" | "error";

export interface A2UIRendererError {
  readonly code: A2UIRendererErrorCode;
  readonly message: string;
  readonly severity: A2UIRendererErrorSeverity;
  readonly surfaceId?: string;
  readonly catalogId?: string;
  readonly componentId?: string;
  readonly path?: string;
  readonly cause?: unknown;
}
