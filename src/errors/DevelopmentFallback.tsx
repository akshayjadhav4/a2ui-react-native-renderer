import { useEffect, type ReactNode } from "react";

import {
  formatA2UIDiagnostic,
  shouldShowDevelopmentDiagnostics,
  type A2UIDiagnosticsMode,
} from "./diagnostics.js";
import type { A2UIRendererError } from "./types.js";

export type A2UIFallbackRenderer = (error: A2UIRendererError) => ReactNode;

export interface A2UIRecoveryConfig {
  readonly diagnostics: A2UIDiagnosticsMode;
  readonly renderFallback?: A2UIFallbackRenderer;
}

interface A2UIRecoveryFallbackProps extends A2UIRecoveryConfig {
  readonly error: A2UIRendererError;
}

export function A2UIRecoveryFallback({
  error,
  diagnostics,
  renderFallback,
}: A2UIRecoveryFallbackProps): ReactNode {
  const showDevelopmentDiagnostic =
    shouldShowDevelopmentDiagnostics(diagnostics);

  useEffect(() => {
    if (renderFallback === undefined && showDevelopmentDiagnostic) {
      globalThis.console.error(formatA2UIDiagnostic(error));
    }
  }, [error, renderFallback, showDevelopmentDiagnostic]);

  if (renderFallback === undefined) {
    return null;
  }

  try {
    return renderFallback(error);
  } catch {
    return null;
  }
}
