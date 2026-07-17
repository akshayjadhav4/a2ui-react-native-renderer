import { useEffect, useRef, type RefObject } from "react";

import { createA2UIEngine } from "../engine/engine.js";
import type { A2UIEngine, A2UIRegisteredCatalog } from "../engine/types.js";
import type { A2UIRendererError } from "../errors/types.js";
import type { A2UIUserAction } from "../types/messages.js";

export interface A2UIEngineCallbacks {
  readonly onAction?: (action: A2UIUserAction) => void | Promise<void>;
  readonly onError?: (error: A2UIRendererError) => void;
}

type StableEngineInput =
  | {
      readonly engine: A2UIEngine;
      readonly catalogs?: never;
      readonly callbacks?: never;
    }
  | {
      readonly engine?: undefined;
      readonly catalogs: readonly A2UIRegisteredCatalog[];
      readonly callbacks: A2UIEngineCallbacks;
    };

interface StableEngineState {
  readonly engine: A2UIEngine;
  readonly ownsEngine: boolean;
  readonly catalogs?: readonly A2UIRegisteredCatalog[];
  mounted: boolean;
}

export function useStableEngine(input: StableEngineInput): A2UIEngine {
  const callbacksRef = useRef<A2UIEngineCallbacks>({});
  if (input.engine === undefined) {
    callbacksRef.current = input.callbacks;
  }

  const stateRef = useRef<StableEngineState | null>(null);
  if (stateRef.current === null) {
    stateRef.current = createStableEngineState(input, callbacksRef);
  } else {
    assertStableConfiguration(stateRef.current, input);
  }

  useEffect(() => {
    const state = stateRef.current;
    if (!state?.ownsEngine) {
      return;
    }

    state.mounted = true;
    return () => {
      state.mounted = false;
      queueMicrotask(() => {
        if (!state.mounted) {
          state.engine.dispose();
        }
      });
    };
  }, []);

  return stateRef.current.engine;
}

function createStableEngineState(
  input: StableEngineInput,
  callbacksRef: RefObject<A2UIEngineCallbacks>,
): StableEngineState {
  if (input.engine !== undefined) {
    return { engine: input.engine, ownsEngine: false, mounted: false };
  }

  const engine = createA2UIEngine({
    catalogs: input.catalogs,
    onAction: (action) => callbacksRef.current.onAction?.(action),
    onError: (error) => callbacksRef.current.onError?.(error),
  });

  return {
    engine,
    ownsEngine: true,
    catalogs: input.catalogs,
    mounted: false,
  };
}

function assertStableConfiguration(
  state: StableEngineState,
  input: StableEngineInput,
): void {
  if (state.ownsEngine === (input.engine !== undefined)) {
    throw new Error(
      "A2UIRenderer cannot switch between an owned and external engine after mounting",
    );
  }

  if (!state.ownsEngine) {
    if (state.engine !== input.engine) {
      throw new Error("A2UIRenderer cannot replace its engine after mounting");
    }
    return;
  }

  if (input.engine !== undefined) {
    throw new Error(
      "A2UIRenderer cannot switch between an owned and external engine after mounting",
    );
  }

  if (
    input.catalogs.length !== state.catalogs?.length ||
    input.catalogs.some((catalog, index) => catalog !== state.catalogs?.[index])
  ) {
    throw new Error(
      "A2UIRenderer catalogs must remain stable for the mounted renderer",
    );
  }
}
