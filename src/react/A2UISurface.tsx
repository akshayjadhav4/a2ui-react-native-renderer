import {
  createElement,
  memo,
  useCallback,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import type { A2UIRendererError } from "../errors/types.js";
import { A2UIErrorBoundary } from "../errors/ErrorBoundary.js";
import {
  A2UIRecoveryFallback,
  type A2UIFallbackRenderer,
  type A2UIRecoveryConfig,
} from "../errors/DevelopmentFallback.js";
import type { A2UIDiagnosticsMode } from "../errors/diagnostics.js";
import { getA2UIEngineInternals } from "../engine/internals.js";
import type { A2UIEngine } from "../engine/types.js";
import { A2UIComponentNode } from "../rendering/presenterAdapter.js";
import { A2UIProvider, useA2UIEngineContext } from "./A2UIProvider.js";
import { useA2UISurface } from "./hooks.js";

export interface A2UISurfaceProps {
  readonly engine?: A2UIEngine;
  readonly surfaceId: string;
  readonly diagnostics?: A2UIDiagnosticsMode;
  readonly renderFallback?: A2UIFallbackRenderer;
  readonly renderPending?: (pending: {
    readonly surfaceId: string;
    readonly componentId: string;
    readonly kind: "root" | "component";
  }) => ReactNode;
}

export const A2UISurface = memo(function A2UISurface({
  engine,
  ...props
}: A2UISurfaceProps): ReactNode {
  const content = createElement(A2UISurfaceContent, props);
  return engine === undefined
    ? content
    : createElement(A2UIProvider, { engine }, content);
});

const A2UISurfaceContent = memo(function A2UISurfaceContent({
  surfaceId,
  diagnostics = "auto",
  renderFallback,
  renderPending,
}: A2UISurfaceProps): ReactNode {
  const engine = useA2UIEngineContext();
  const source = useRef({ engine, surfaceId, generation: 0 });
  if (
    source.current.engine !== engine ||
    source.current.surfaceId !== surfaceId
  ) {
    source.current = {
      engine,
      surfaceId,
      generation: source.current.generation + 1,
    };
  }
  const internals = getA2UIEngineInternals(engine);
  const surface = useA2UISurface(surfaceId);
  const surfaceError = useA2UISurfaceError(engine, surfaceId);
  const recovery = useMemo<A2UIRecoveryConfig>(
    () => ({
      diagnostics,
      ...(renderFallback === undefined ? {} : { renderFallback }),
    }),
    [diagnostics, renderFallback],
  );

  if (surface === undefined) {
    return surfaceError === undefined
      ? null
      : createElement(A2UIRecoveryFallback, {
          ...recovery,
          error: surfaceError,
        });
  }

  const { rootId } = surface;
  if (rootId === null) {
    return surfaceError === undefined
      ? (renderPending?.({ surfaceId, componentId: "root", kind: "root" }) ??
          null)
      : createElement(A2UIRecoveryFallback, {
          ...recovery,
          error: surfaceError,
        });
  }

  return createElement(
    A2UIErrorBoundary,
    {
      key: source.current.generation,
      resetKey: surface.revision,
      createError: (cause) =>
        createSurfaceError(surfaceId, surface.catalogId, cause),
      reportError: (error) => {
        internals.reportError(error);
      },
      renderFallback: (error) =>
        createElement(A2UIRecoveryFallback, { ...recovery, error }),
    },
    createElement(A2UIComponentNode, {
      engine,
      surface,
      componentId: rootId,
      scopePath: "/",
      recovery,
      ...(renderPending === undefined ? {} : { renderPending }),
    }),
  );
});

function useA2UISurfaceError(
  engine: A2UIEngine,
  surfaceId: string,
): A2UIRendererError | undefined {
  const subscribe = useCallback(
    (listener: () => void) => engine.subscribeSurface(surfaceId, listener),
    [engine, surfaceId],
  );
  const getSnapshot = useCallback(
    () => getA2UIEngineInternals(engine).getSurfaceError(surfaceId),
    [engine, surfaceId],
  );
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function createSurfaceError(
  surfaceId: string,
  catalogId: string,
  cause: unknown,
): A2UIRendererError {
  return {
    code: "PRESENTER_ERROR",
    message: "A2UI surface failed to render",
    severity: "error",
    surfaceId,
    catalogId,
    cause,
  };
}
