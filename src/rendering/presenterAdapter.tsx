import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";

import type { A2UIComponentAction, A2UIPresenter } from "../catalog/types.js";
import { getA2UIEngineInternals } from "../engine/internals.js";
import type {
  A2UIEngine,
  A2UIRegisteredCatalog,
  A2UISurfaceSnapshot,
} from "../engine/types.js";
import type { A2UIRendererError } from "../errors/types.js";
import { readDataPointer } from "../protocol/v0_9/bindings.js";
import { resolvePresenterProps } from "../protocol/v0_9/resolveProps.js";

export interface A2UIComponentNodeProps {
  readonly engine: A2UIEngine;
  readonly surface: A2UISurfaceSnapshot;
  readonly componentId: string;
  readonly scopePath: string;
}

interface ResolvedPresenter {
  readonly presenter: A2UIPresenter<Record<string, unknown>>;
  readonly props: Record<string, unknown>;
}

type PresenterResolution =
  | { readonly success: true; readonly value: ResolvedPresenter }
  | { readonly success: false; readonly error: A2UIRendererError };

export function A2UIComponentNode({
  engine,
  surface,
  componentId,
  scopePath,
}: A2UIComponentNodeProps): ReactNode {
  const internals = getA2UIEngineInternals(engine);
  const resolution = useMemo(
    () =>
      resolvePresenter(
        internals.getCatalog(surface.catalogId),
        surface,
        componentId,
        scopePath,
        (path, value) => {
          internals.setDataValue(surface.surfaceId, path, value);
        },
      ),
    [componentId, internals, scopePath, surface],
  );

  useEffect(() => {
    if (!resolution.success) {
      internals.reportError(resolution.error);
    }
  }, [internals, resolution]);

  const renderChild = useCallback(
    (childId: string, childScopePath = scopePath): ReactNode =>
      createElement(A2UIComponentNode, {
        key: `${childId}:${childScopePath}`,
        engine,
        surface,
        componentId: childId,
        scopePath: childScopePath,
      }),
    [engine, scopePath, surface],
  );

  const dispatch = useCallback(
    (action: A2UIComponentAction): void => {
      internals.dispatchAction(surface.surfaceId, componentId, action);
    },
    [componentId, internals, surface.surfaceId],
  );

  if (!resolution.success) {
    return null;
  }

  return createElement(resolution.value.presenter, {
    props: resolution.value.props,
    surfaceId: surface.surfaceId,
    componentId,
    scope: {
      path: scopePath,
      value: readDataPointer(surface.dataModel, scopePath),
    },
    renderChild,
    dispatch,
  });
}

function resolvePresenter(
  catalog: A2UIRegisteredCatalog | undefined,
  surface: A2UISurfaceSnapshot,
  componentId: string,
  scopePath: string,
  setData: (path: string, value: unknown) => void,
): PresenterResolution {
  if (catalog === undefined) {
    return failure({
      code: "UNKNOWN_CATALOG",
      message: `A2UI catalog "${surface.catalogId}" is not registered`,
      severity: "error",
      surfaceId: surface.surfaceId,
      catalogId: surface.catalogId,
    });
  }

  const component = surface.components[componentId];
  if (component === undefined) {
    return failure({
      code: "INVALID_REFERENCE",
      message: `A2UI component "${componentId}" does not exist`,
      severity: "error",
      surfaceId: surface.surfaceId,
      catalogId: surface.catalogId,
      componentId,
    });
  }

  const definition = catalog.components[component.type];
  if (definition === undefined) {
    return failure({
      code: "UNKNOWN_COMPONENT",
      message: `A2UI component type "${component.type}" is not registered`,
      severity: "error",
      surfaceId: surface.surfaceId,
      catalogId: surface.catalogId,
      componentId,
    });
  }

  const parsed = definition.schema.safeParse(component.props);
  if (!parsed.success) {
    return failure({
      code: "INVALID_COMPONENT_PROPS",
      message: `A2UI component "${componentId}" has invalid properties`,
      severity: "error",
      surfaceId: surface.surfaceId,
      catalogId: surface.catalogId,
      componentId,
      path: zodIssuePath(parsed.error.issues[0]?.path),
      cause: parsed.error,
    });
  }

  if (typeof definition.presenter !== "function") {
    return failure({
      code: "PRESENTER_ERROR",
      message: `A2UI component type "${component.type}" has no presenter`,
      severity: "error",
      surfaceId: surface.surfaceId,
      catalogId: surface.catalogId,
      componentId,
    });
  }

  try {
    return {
      success: true,
      value: {
        presenter: definition.presenter as A2UIPresenter<
          Record<string, unknown>
        >,
        props: resolvePresenterProps(
          definition.schema,
          parsed.data,
          surface.dataModel,
          scopePath,
          setData,
        ),
      },
    };
  } catch (cause) {
    return failure({
      code: "BINDING_ERROR",
      message: `A2UI component "${componentId}" has an invalid binding`,
      severity: "error",
      surfaceId: surface.surfaceId,
      catalogId: surface.catalogId,
      componentId,
      cause,
    });
  }
}

function failure(error: A2UIRendererError): PresenterResolution {
  return { success: false, error };
}

function zodIssuePath(path: PropertyKey[] | undefined): string {
  if (path === undefined || path.length === 0) {
    return "/";
  }

  return `/${path.map((part) => String(part).replaceAll("~", "~0").replaceAll("/", "~1")).join("/")}`;
}
