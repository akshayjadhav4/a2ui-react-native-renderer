import { createElement, memo, type ReactNode } from "react";

import { A2UIComponentNode } from "../rendering/presenterAdapter.js";
import { useA2UIEngine } from "./A2UIProvider.js";
import { useA2UISurface } from "./hooks.js";

export interface A2UISurfaceProps {
  readonly surfaceId: string;
}

export const A2UISurface = memo(function A2UISurface({
  surfaceId,
}: A2UISurfaceProps): ReactNode {
  const engine = useA2UIEngine();
  const surface = useA2UISurface(surfaceId);

  if (surface === undefined) {
    return null;
  }

  const { rootId } = surface;
  if (rootId === null) {
    return null;
  }

  return createElement(A2UIComponentNode, {
    engine,
    surface,
    componentId: rootId,
    scopePath: "/",
  });
});
