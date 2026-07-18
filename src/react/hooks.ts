import { useCallback, useSyncExternalStore } from "react";

import type { A2UISurfaceSnapshot } from "../engine/types.js";
import type { A2UIRendererError } from "../errors/types.js";
import { useA2UIEngine } from "./A2UIProvider.js";

export function useA2UISurface(
  surfaceId: string,
): A2UISurfaceSnapshot | undefined {
  const engine = useA2UIEngine();
  const subscribe = useCallback(
    (listener: () => void) => engine.subscribeSurface(surfaceId, listener),
    [engine, surfaceId],
  );
  const getSnapshot = useCallback(
    () => engine.getSurface(surfaceId),
    [engine, surfaceId],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useA2UIErrors(): readonly A2UIRendererError[] {
  const engine = useA2UIEngine();
  const subscribe = useCallback(
    (listener: () => void) => engine.subscribe(listener),
    [engine],
  );
  const getSnapshot = useCallback(() => engine.getErrors(), [engine]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useA2UISurfaceIds(): readonly string[] {
  const engine = useA2UIEngine();
  const subscribe = useCallback(
    (listener: () => void) => engine.subscribe(listener),
    [engine],
  );
  const getSnapshot = useCallback(
    () => engine.getSnapshot().surfaceIds,
    [engine],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useA2UIFailedSurfaceIds(): readonly string[] {
  const engine = useA2UIEngine();
  const subscribe = useCallback(
    (listener: () => void) => engine.subscribe(listener),
    [engine],
  );
  const getSnapshot = useCallback(
    () => engine.getSnapshot().failedSurfaceIds,
    [engine],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
