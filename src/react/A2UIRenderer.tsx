import {
  createElement,
  Fragment,
  useEffect,
  useRef,
  type ReactNode,
} from "react";

import type { A2UIEngine, A2UIRegisteredCatalog } from "../engine/types.js";
import type { A2UIRendererError } from "../errors/types.js";
import type { A2UIFallbackRenderer } from "../errors/DevelopmentFallback.js";
import type { A2UIDiagnosticsMode } from "../errors/diagnostics.js";
import { shouldShowDevelopmentDiagnostics } from "../errors/diagnostics.js";
import type { A2UIMessage, A2UIUserAction } from "../types/messages.js";
import { A2UIProvider } from "./A2UIProvider.js";
import { A2UISurface } from "./A2UISurface.js";
import { useA2UIFailedSurfaceIds, useA2UISurfaceIds } from "./hooks.js";
import { useStableEngine } from "./useStableEngine.js";

interface A2UIRendererBaseProps {
  readonly messages: readonly A2UIMessage[];
  readonly diagnostics?: A2UIDiagnosticsMode;
  readonly renderFallback?: A2UIFallbackRenderer;
}

interface A2UIRendererOwnedEngineProps extends A2UIRendererBaseProps {
  readonly engine?: undefined;
  readonly catalogs: readonly A2UIRegisteredCatalog[];
  readonly onAction?: (action: A2UIUserAction) => void | Promise<void>;
  readonly onError?: (error: A2UIRendererError) => void;
}

interface A2UIRendererExternalEngineProps extends A2UIRendererBaseProps {
  readonly engine: A2UIEngine;
  readonly catalogs?: never;
  readonly onAction?: never;
  readonly onError?: never;
}

export type A2UIRendererProps =
  A2UIRendererOwnedEngineProps | A2UIRendererExternalEngineProps;

export function A2UIRenderer(props: A2UIRendererProps): ReactNode {
  const engine = useStableEngine(
    props.engine === undefined
      ? {
          catalogs: props.catalogs,
          callbacks: {
            ...(props.onAction === undefined
              ? {}
              : { onAction: props.onAction }),
            ...(props.onError === undefined ? {} : { onError: props.onError }),
          },
        }
      : { engine: props.engine },
  );

  useA2UIMessages(engine, props.messages);

  return createElement(
    A2UIProvider,
    { engine },
    createElement(A2UIActiveSurfaces, {
      ...(props.diagnostics === undefined
        ? {}
        : { diagnostics: props.diagnostics }),
      ...(props.renderFallback === undefined
        ? {}
        : { renderFallback: props.renderFallback }),
    }),
  );
}

interface A2UIActiveSurfacesProps {
  readonly diagnostics?: A2UIDiagnosticsMode;
  readonly renderFallback?: A2UIFallbackRenderer;
}

function A2UIActiveSurfaces(props: A2UIActiveSurfacesProps): ReactNode {
  const surfaceIds = useA2UISurfaceIds();
  const failedSurfaceIds = useA2UIFailedSurfaceIds();
  const includeFailedSurfaces =
    props.renderFallback !== undefined ||
    shouldShowDevelopmentDiagnostics(props.diagnostics ?? "auto");
  const renderableSurfaceIds = includeFailedSurfaces
    ? Array.from(new Set([...surfaceIds, ...failedSurfaceIds]))
    : surfaceIds;

  return createElement(
    Fragment,
    null,
    ...renderableSurfaceIds.map((surfaceId) =>
      createElement(A2UISurface, { key: surfaceId, surfaceId, ...props }),
    ),
  );
}

function useA2UIMessages(
  engine: A2UIEngine,
  messages: readonly A2UIMessage[],
): void {
  const previousRef = useRef<readonly A2UIMessage[] | null>(null);

  useEffect(() => {
    const previous = previousRef.current;
    if (previous === messages) {
      return;
    }

    const nextMessages = appendedMessages(previous, messages);
    previousRef.current = messages;
    engine.applyMessages(nextMessages);
  }, [engine, messages]);
}

function appendedMessages(
  previous: readonly A2UIMessage[] | null,
  current: readonly A2UIMessage[],
): readonly A2UIMessage[] {
  if (
    previous !== null &&
    current.length >= previous.length &&
    previous.every((message, index) => current[index] === message)
  ) {
    return current.slice(previous.length);
  }

  return current;
}
