import {
  createContext,
  createElement,
  useContext,
  type ReactNode,
} from "react";

import type { A2UIEngine } from "../engine/types.js";

const A2UIEngineContext = createContext<A2UIEngine | null>(null);

export interface A2UIProviderProps {
  readonly engine: A2UIEngine;
  readonly children?: ReactNode;
}

export function A2UIProvider({
  engine,
  children,
}: A2UIProviderProps): ReactNode {
  return createElement(A2UIEngineContext.Provider, { value: engine }, children);
}

export function useA2UIEngine(): A2UIEngine {
  const engine = useContext(A2UIEngineContext);
  if (engine === null) {
    throw new Error("A2UISurface must be rendered inside A2UIProvider");
  }

  return engine;
}
