import type { A2UIEngine, A2UIEngineOptions } from "../engine/types.js";
import { useStableEngine } from "./useStableEngine.js";

export function useA2UIEngine(options: A2UIEngineOptions): A2UIEngine {
  return useStableEngine({
    catalogs: options.catalogs,
    callbacks: options,
    ...(options.limits === undefined ? {} : { limits: options.limits }),
  });
}
