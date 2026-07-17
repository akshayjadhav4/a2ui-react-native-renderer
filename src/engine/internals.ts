import type { A2UIComponentAction } from "../catalog/types.js";
import type { A2UIRendererError } from "../errors/types.js";
import type { A2UIEngine, A2UIRegisteredCatalog } from "./types.js";

export const A2UI_ENGINE_INTERNALS = Symbol("A2UI_ENGINE_INTERNALS");

export interface A2UIEngineInternals {
  getCatalog(catalogId: string): A2UIRegisteredCatalog | undefined;
  reportError(error: A2UIRendererError): void;
  dispatchAction(
    surfaceId: string,
    componentId: string,
    action: A2UIComponentAction,
  ): void;
}

export type A2UIEngineWithInternals = A2UIEngine & {
  readonly [A2UI_ENGINE_INTERNALS]: A2UIEngineInternals;
};

export function getA2UIEngineInternals(
  engine: A2UIEngine,
): A2UIEngineInternals {
  const candidate = engine as Partial<A2UIEngineWithInternals>;
  const internals = candidate[A2UI_ENGINE_INTERNALS];

  if (internals === undefined) {
    throw new TypeError(
      "A2UIProvider received an engine that was not created by createA2UIEngine",
    );
  }

  return internals;
}
