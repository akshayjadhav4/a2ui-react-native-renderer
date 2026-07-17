export { defineA2UICatalog } from "./catalog/defineCatalog.js";
export { defineA2UIComponent } from "./catalog/defineComponent.js";
export { defineA2UIFunction } from "./catalog/defineFunction.js";
export { createA2UIEngine } from "./engine/engine.js";
export { A2UIProvider } from "./react/A2UIProvider.js";
export { A2UISurface } from "./react/A2UISurface.js";
export { useA2UIErrors, useA2UISurface } from "./react/hooks.js";

export type {
  A2UIBindingScope,
  A2UICatalog,
  A2UICatalogDefinition,
  A2UIChildRenderer,
  A2UIComponentAction,
  A2UIComponentDefinition,
  A2UIComponentDefinitions,
  A2UIComponentSchemas,
  A2UIFunctionDefinition,
  A2UIFunctionReturnKind,
  A2UIFunctionReturnMap,
  A2UIPresenter,
  A2UIPresenterProps,
} from "./catalog/types.js";
export type {
  A2UIRendererError,
  A2UIRendererErrorCode,
  A2UIRendererErrorSeverity,
} from "./errors/types.js";
export type {
  A2UIComponentSnapshot,
  A2UIEngine,
  A2UIEngineOptions,
  A2UIEngineSnapshot,
  A2UISurfaceSnapshot,
} from "./engine/types.js";
export type { A2UIMessage } from "./types/messages.js";
export type { A2UIProviderProps } from "./react/A2UIProvider.js";
export type { A2UISurfaceProps } from "./react/A2UISurface.js";
