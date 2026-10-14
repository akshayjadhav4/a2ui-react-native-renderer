import { useEffect, useRef, type RefObject } from "react";

import { createA2UIEngine } from "../engine/engine.js";
import type { A2UIEngine, A2UIRegisteredCatalog } from "../engine/types.js";
import type { A2UIRendererError } from "../errors/types.js";
import type { A2UIUserAction } from "../types/messages.js";
import {
  resolveA2UIResourceLimits,
  type A2UIResourceLimits,
} from "../validation/limits.js";

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
      readonly limits?: Partial<A2UIResourceLimits>;
    };

interface StableEngineState {
  readonly engine: A2UIEngine;
  readonly ownsEngine: boolean;
  readonly catalogs?: readonly A2UIRegisteredCatalog[];
  readonly limits?: A2UIResourceLimits;
  mounted: boolean;
  disposed: boolean;
}

export function useStableEngine(
  input: StableEngineInput,
  ownerName: "A2UIRenderer" | "useA2UIEngine" = "A2UIRenderer",
): A2UIEngine {
  const callbacksRef = useRef<A2UIEngineCallbacks>({});
  if (input.engine === undefined) {
    callbacksRef.current = input.callbacks;
  }

  const stateRef = useRef<StableEngineState | null>(null);
  if (stateRef.current === null) {
    stateRef.current = createStableEngineState(input, callbacksRef);
  } else {
    assertStableConfiguration(stateRef.current, input, ownerName);
  }

  useEffect(() => {
    const state = stateRef.current;
    if (!state?.ownsEngine) {
      return;
    }

    state.mounted = true;
    return () => {
      state.mounted = false;
      void Promise.resolve().then(() => {
        if (!state.mounted && !state.disposed) {
          state.disposed = true;
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
    return {
      engine: input.engine,
      ownsEngine: false,
      mounted: false,
      disposed: false,
    };
  }

  const catalogs = [...input.catalogs];
  const limits = resolveA2UIResourceLimits(input.limits);
  const engine = createA2UIEngine({
    catalogs,
    limits,
    onAction: (action) => callbacksRef.current.onAction?.(action),
    onError: (error) => callbacksRef.current.onError?.(error),
  });

  return {
    engine,
    ownsEngine: true,
    catalogs,
    limits,
    mounted: false,
    disposed: false,
  };
}

function assertStableConfiguration(
  state: StableEngineState,
  input: StableEngineInput,
  ownerName: "A2UIRenderer" | "useA2UIEngine",
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
      `${ownerName} catalogs must remain stable for the mounted ${ownerName === "A2UIRenderer" ? "renderer" : "hook"}`,
    );
  }

  const limits = resolveA2UIResourceLimits(input.limits);
  if (
    Object.entries(limits).some(
      ([name, value]) =>
        state.limits?.[name as keyof A2UIResourceLimits] !== value,
    )
  ) {
    throw new Error(`${ownerName} limits must remain stable while mounted`);
  }
}
