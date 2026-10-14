import {
  createElement,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import type {
  A2UIComponentAction,
  A2UIPresenter,
  A2UIPresenterProps,
} from "../catalog/types.js";
import { getA2UIEngineInternals } from "../engine/internals.js";
import type {
  A2UIComponentSnapshot,
  A2UIEngine,
  A2UIRegisteredCatalog,
  A2UISurfaceSnapshot,
} from "../engine/types.js";
import type { A2UIRendererError } from "../errors/types.js";
import type { A2UISurfaceProps } from "../react/A2UISurface.js";
import { A2UIErrorBoundary } from "../errors/ErrorBoundary.js";
import {
  A2UIRecoveryFallback,
  type A2UIRecoveryConfig,
} from "../errors/DevelopmentFallback.js";
import { isDataBinding, readDataPointer } from "../protocol/v0_9/bindings.js";
import { matchesA2UIDynamicKind } from "../protocol/v0_9/behavior.js";
import { isA2UIFunctionInvocationError } from "../protocol/v0_9/functions.js";
import {
  resolvePresenterProps,
  type A2UIDataSetter,
  type A2UISetterFactory,
} from "../protocol/v0_9/resolveProps.js";

import { equalPresenterValues } from "./equalPresenterValues.js";

export interface A2UIComponentNodeProps {
  readonly engine: A2UIEngine;
  readonly surfaceId: string;
  readonly componentId: string;
  readonly scopePath: string;
  readonly recovery: A2UIRecoveryConfig;
  readonly renderPending?: NonNullable<A2UISurfaceProps["renderPending"]>;
}

interface ResolvedPresenter {
  readonly presenter: A2UIPresenter<Record<string, unknown>>;
  readonly props: Record<string, unknown>;
}

type PresenterResolution =
  | { readonly success: true; readonly value: ResolvedPresenter }
  | { readonly success: false; readonly error: A2UIRendererError };

interface PresenterHostProps {
  readonly presenter: A2UIPresenter<Record<string, unknown>>;
  readonly sourceComponent: A2UIComponentSnapshot | undefined;
  readonly input: A2UIPresenterProps<Record<string, unknown>>;
}

const PresenterHost = memo(
  function PresenterHost({ presenter, input }: PresenterHostProps): ReactNode {
    return createElement(presenter, input);
  },
  (previous, next) => {
    const a = previous.input;
    const b = next.input;
    return (
      previous.presenter === next.presenter &&
      previous.sourceComponent === next.sourceComponent &&
      a.surfaceId === b.surfaceId &&
      a.componentId === b.componentId &&
      a.scope.path === b.scope.path &&
      Object.is(a.scope.value, b.scope.value) &&
      a.renderChild === b.renderChild &&
      a.dispatch === b.dispatch &&
      equalPresenterValues(a.props, b.props)
    );
  },
);

export function A2UIComponentNode({
  engine,
  surfaceId,
  componentId,
  scopePath,
  recovery,
  renderPending,
}: A2UIComponentNodeProps): ReactNode {
  const subscribe = useCallback(
    (listener: () => void) => engine.subscribeSurface(surfaceId, listener),
    [engine, surfaceId],
  );
  const getSnapshot = useCallback(
    () => engine.getSurface(surfaceId),
    [engine, surfaceId],
  );
  const surface = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const internals = getA2UIEngineInternals(engine);
  const sourceComponent =
    surface !== undefined &&
    Object.prototype.hasOwnProperty.call(surface.components, componentId)
      ? surface.components[componentId]
      : undefined;
  const catalogId = surface?.catalogId;
  const isPending =
    sourceComponent === undefined &&
    (surface?.pendingComponentIds.includes(componentId) ?? false);
  const setData = useCallback<A2UIDataSetter>(
    (write) => {
      const currentSurface = engine.getSurface(surfaceId);
      const currentComponent =
        currentSurface !== undefined &&
        Object.prototype.hasOwnProperty.call(
          currentSurface.components,
          componentId,
        )
          ? currentSurface.components[componentId]
          : undefined;
      const currentBinding = readNestedProperty(
        currentComponent?.props,
        write.propertyPath,
      );
      if (!matchesA2UIDynamicKind(write.value, write.behavior)) {
        internals.reportError({
          code: "BINDING_ERROR",
          message: `A2UI component "${componentId}" setter received an invalid ${write.behavior.kind} value`,
          severity: "error",
          surfaceId,
          ...(catalogId === undefined ? {} : { catalogId }),
          componentId,
          path: write.path,
        });
        return;
      }
      if (
        currentComponent !== sourceComponent ||
        !isDataBinding(currentBinding) ||
        currentBinding.path !== write.bindingPath
      ) {
        internals.reportError({
          code: "BINDING_ERROR",
          message: `A2UI component "${componentId}" setter is stale`,
          severity: "error",
          surfaceId,
          ...(catalogId === undefined ? {} : { catalogId }),
          componentId,
          path: write.path,
        });
        return;
      }
      internals.setDataValue(surfaceId, write.path, write.value);
    },
    [engine, surfaceId, componentId, catalogId, internals, sourceComponent],
  );

  const createSetter = useMemo<A2UISetterFactory>(() => {
    const setters = new Map<string, (value: unknown) => void>();
    return (binding) => {
      const key = JSON.stringify([
        binding.propertyPath,
        binding.path,
        binding.bindingPath,
        binding.behavior.kind,
      ]);
      let setter = setters.get(key);
      if (setter === undefined) {
        setter = (value) => {
          setData({ ...binding, value });
        };
        setters.set(key, setter);
      }
      return setter;
    };
  }, [setData, scopePath]);

  const resolution = useMemo(
    () =>
      surface === undefined || isPending
        ? null
        : resolvePresenter(
            internals.getCatalog(surface.catalogId),
            surface,
            componentId,
            scopePath,
            setData,
            createSetter,
          ),
    [
      surface,
      isPending,
      internals,
      componentId,
      scopePath,
      setData,
      createSetter,
    ],
  );
  useEffect(() => {
    if (resolution !== null && !resolution.success)
      internals.reportError(resolution.error);
  }, [internals, resolution]);

  // Batched deletion/recreation can repeat a revision with a new component.
  const resetKey = useMemo(
    () => ({ revision: surface?.revision, sourceComponent, scopePath }),
    [surface?.revision, sourceComponent, scopePath],
  );

  const renderChild = useCallback(
    (childId: string, childScopePath = scopePath): ReactNode =>
      createElement(A2UIComponentNode, {
        key: `${childId}:${childScopePath}`,
        engine,
        surfaceId,
        componentId: childId,
        scopePath: childScopePath,
        recovery,
        ...(renderPending === undefined ? {} : { renderPending }),
      }),
    [engine, surfaceId, scopePath, recovery, renderPending],
  );
  const dispatch = useCallback(
    (action: A2UIComponentAction): void => {
      internals.dispatchAction(surfaceId, componentId, scopePath, action);
    },
    [internals, surfaceId, componentId, scopePath],
  );

  if (surface === undefined) return null;
  if (resolution === null)
    return (
      renderPending?.({ surfaceId, componentId, kind: "component" }) ?? null
    );
  if (!resolution.success)
    return createElement(A2UIRecoveryFallback, {
      ...recovery,
      error: resolution.error,
    });

  return createElement(
    A2UIErrorBoundary,
    {
      resetKey,
      createError: (cause) => createPresenterError(surface, componentId, cause),
      reportError: (error) => {
        internals.reportError(error);
      },
      renderFallback: (error) =>
        createElement(A2UIRecoveryFallback, { ...recovery, error }),
    },
    createElement(PresenterHost, {
      presenter: resolution.value.presenter,
      sourceComponent,
      input: {
        props: resolution.value.props,
        surfaceId,
        componentId,
        scope: {
          path: scopePath,
          value: readDataPointer(surface.dataModel, scopePath),
        },
        renderChild,
        dispatch,
      },
    }),
  );
}

function createPresenterError(
  surface: A2UISurfaceSnapshot,
  componentId: string,
  cause: unknown,
): A2UIRendererError {
  return {
    code: "PRESENTER_ERROR",
    message: `A2UI component "${componentId}" presenter failed to render`,
    severity: "error",
    surfaceId: surface.surfaceId,
    catalogId: surface.catalogId,
    componentId,
    cause,
  };
}

function resolvePresenter(
  catalog: A2UIRegisteredCatalog | undefined,
  surface: A2UISurfaceSnapshot,
  componentId: string,
  scopePath: string,
  setData: A2UIDataSetter,
  createSetter: A2UISetterFactory,
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

  const component = Object.prototype.hasOwnProperty.call(
    surface.components,
    componentId,
  )
    ? surface.components[componentId]
    : undefined;
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

  const definition = Object.prototype.hasOwnProperty.call(
    catalog.components,
    component.type,
  )
    ? catalog.components[component.type]
    : undefined;
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
          catalog.functions,
          createSetter,
        ),
      },
    };
  } catch (cause) {
    const functionError = isA2UIFunctionInvocationError(cause);
    return failure({
      code: functionError ? "FUNCTION_ERROR" : "BINDING_ERROR",
      message: functionError
        ? `A2UI component "${componentId}" function evaluation failed`
        : `A2UI component "${componentId}" has an invalid binding`,
      severity: "error",
      surfaceId: surface.surfaceId,
      catalogId: surface.catalogId,
      componentId,
      cause,
    });
  }
}

function readNestedProperty(
  value: unknown,
  path: readonly (string | number)[],
): unknown {
  let current = value;
  for (const key of path) {
    if (typeof current !== "object" || current === null) {
      return undefined;
    }
    current = (current as Readonly<Record<string | number, unknown>>)[key];
  }
  return current;
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
