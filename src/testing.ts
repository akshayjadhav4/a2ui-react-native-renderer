import { createA2UIEngine } from "./engine/engine.js";
import type { A2UIEngine, A2UIEngineOptions } from "./engine/types.js";
import type { A2UIUserAction } from "./types/messages.js";

export type A2UITestHarnessOptions = Pick<
  A2UIEngineOptions,
  "catalogs" | "limits"
>;

export interface A2UITestHarness {
  readonly engine: A2UIEngine;
  getActions(): readonly A2UIUserAction[];
}

export function createA2UITestHarness(
  options: A2UITestHarnessOptions,
): A2UITestHarness {
  const actions: A2UIUserAction[] = [];
  const engine = createA2UIEngine({
    ...options,
    onAction: (action) => {
      actions.push(action);
    },
  });

  return Object.freeze({
    engine,
    getActions: () => Object.freeze([...actions]),
  });
}
