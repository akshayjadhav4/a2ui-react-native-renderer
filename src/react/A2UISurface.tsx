import { createElement, memo, useMemo, type ReactNode } from "react";

import type { A2UIRendererError } from "../errors/types.js";
import { A2UIErrorBoundary } from "../errors/ErrorBoundary.js";
import {
  A2UIRecoveryFallback,
  type A2UIFallbackRenderer,
  type A2UIRecoveryConfig,
} from "../errors/DevelopmentFallback.js";
import type { A2UIDiagnosticsMode } from "../errors/diagnostics.js";
import { getA2UIEngineInternals } from "../engine/internals.js";
import { A2UIComponentNode } from "../rendering/presenterAdapter.js";
import { useA2UIEngine } from "./A2UIProvider.js";
import { useA2UISurface } from "./hooks.js";

export interface A2UISurfaceProps {
  readonly surfaceId: string;
  readonly diagnostics?: A2UIDiagnosticsMode;
  readonly renderFallback?: A2UIFallbackRenderer;
}

export const A2UISurface = memo(function A2UISurface({
  surfaceId,
  diagnostics = "auto",
  renderFallback,
}: A2UISurfaceProps): ReactNode {
  const engine = useA2UIEngine();
  const internals = getA2UIEngineInternals(engine);
  const surface = useA2UISurface(surfaceId);
  const recovery = useMemo<A2UIRecoveryConfig>(
    () => ({
      diagnostics,
      ...(renderFallback === undefined ? {} : { renderFallback }),
    }),
    [diagnostics, renderFallback],
  );

  if (surface === undefined) {
    const error = internals.getSurfaceError(surfaceId);
    return error === undefined
      ? null
      : createElement(A2UIRecoveryFallback, { ...recovery, error });
  }

  const { rootId } = surface;
  if (rootId === null) {
    const error = internals.getSurfaceError(surfaceId);
    return error === undefined
      ? null
      : createElement(A2UIRecoveryFallback, { ...recovery, error });
  }

  return createElement(
    A2UIErrorBoundary,
    {
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
    }),
  );
});

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
