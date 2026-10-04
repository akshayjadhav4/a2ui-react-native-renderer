import {
  inspectA2UISchemaBehavior,
  type A2UISchemaBehavior,
} from "../protocol/v0_9/behavior.js";

import type { A2UIRegisteredCatalog } from "../engine/types.js";
import type { A2UIRendererError } from "../errors/types.js";
import {
  isDataBinding,
  readDataPointer,
  resolveBindingPath,
} from "../protocol/v0_9/bindings.js";
import type { A2UIResourceLimits } from "./limits.js";

export interface ValidatedComponent {
  readonly id: string;
  readonly type: string;
  readonly props: Readonly<Record<string, unknown>>;
}

export type A2UIComponentGraph = Readonly<Record<string, ValidatedComponent>>;

export interface ValidateComponentUpdateInput {
  readonly surfaceId: string;
  readonly catalog: A2UIRegisteredCatalog;
  readonly current: A2UIComponentGraph;
  readonly updates: readonly Readonly<Record<string, unknown>>[];
  readonly limits: A2UIResourceLimits;
}

export type ValidateComponentUpdateResult =
  | { readonly success: true; readonly components: A2UIComponentGraph }
  | { readonly success: false; readonly error: A2UIRendererError };

export function validateComponentUpdate({
  surfaceId,
  catalog,
  current,
  updates,
  limits,
}: ValidateComponentUpdateInput): ValidateComponentUpdateResult {
  const candidate: Record<string, ValidatedComponent> = { ...current };
  const updatedIds = new Set<string>();

  for (const [index, component] of updates.entries()) {
    const path = `/updateComponents/components/${String(index)}`;
    const id = component.id;
    if (typeof id !== "string" || id.length === 0) {
      return invalidReference(
        surfaceId,
        catalog.id,
        path,
        "Component is missing an id",
      );
    }

    if (updatedIds.has(id)) {
      return invalidReference(
        surfaceId,
        catalog.id,
        `${path}/id`,
        `Duplicate A2UI component id "${id}"`,
        id,
      );
    }
    updatedIds.add(id);

    const type = component.component;
    if (typeof type !== "string" || type.length === 0) {
      return invalidReference(
        surfaceId,
        catalog.id,
        `${path}/component`,
        `A2UI component "${id}" is missing a type`,
        id,
      );
    }

    const definition = catalog.components[type];
    if (definition === undefined) {
      return failure({
        code: "UNKNOWN_COMPONENT",
        message: `A2UI component type "${type}" is not registered`,
        severity: "error",
        surfaceId,
        catalogId: catalog.id,
        componentId: id,
        path: `${path}/component`,
      });
    }

    const props: Record<string, unknown> = { ...component };
    delete props.id;
    delete props.component;
    const parsedProps = definition.schema.safeParse(props);
    if (!parsedProps.success) {
      return failure({
        code: "INVALID_COMPONENT_PROPS",
        message: `A2UI component "${id}" has invalid properties`,
        severity: "error",
        surfaceId,
        catalogId: catalog.id,
        componentId: id,
        path: appendIssuePath(path, parsedProps.error.issues[0]?.path),
        cause: parsedProps.error,
      });
    }

    candidate[id] = Object.freeze({
      id,
      type,
      props: freezeRecord(props),
    });
  }

  const componentIds = Object.keys(candidate);
  if (componentIds.length > limits.maxComponentsPerSurface) {
    return failure({
      code: "RESOURCE_LIMIT_EXCEEDED",
      message: `A2UI surface exceeds the ${String(limits.maxComponentsPerSurface)} component limit`,
      severity: "error",
      surfaceId,
      catalogId: catalog.id,
      path: "/updateComponents/components",
    });
  }

  if (candidate.root === undefined) {
    return failure({
      code: "INVALID_ROOT",
      message: `A2UI surface "${surfaceId}" has no root component`,
      severity: "error",
      surfaceId,
      catalogId: catalog.id,
      componentId: "root",
      path: "/updateComponents/components",
    });
  }

  const edges = new Map<string, readonly string[]>();
  for (const component of Object.values(candidate)) {
    const definition = catalog.components[component.type];
    if (definition === undefined) {
      return failure({
        code: "UNKNOWN_COMPONENT",
        message: `A2UI component type "${component.type}" is not registered`,
        severity: "error",
        surfaceId,
        catalogId: catalog.id,
        componentId: component.id,
      });
    }

    const references: string[] = [];
    try {
      collectBehaviorReferences(
        component.props,
        inspectA2UISchemaBehavior(definition.schema),
        references,
      );
    } catch (cause) {
      return failure({
        code: "BINDING_ERROR",
        message: `A2UI component "${component.id}" contains an invalid data path`,
        severity: "error",
        surfaceId,
        catalogId: catalog.id,
        componentId: component.id,
        path: `/components/${escapePointerToken(component.id)}`,
        cause,
      });
    }
    edges.set(component.id, Object.freeze(references));
  }

  for (const [componentId, references] of edges) {
    for (const reference of references) {
      if (candidate[reference] === undefined) {
        return invalidReference(
          surfaceId,
          catalog.id,
          `/components/${escapePointerToken(componentId)}`,
          `A2UI component "${componentId}" references missing component "${reference}"`,
          componentId,
        );
      }
    }
  }

  const cycle = findCycle(edges);
  if (cycle !== undefined) {
    return invalidReference(
      surfaceId,
      catalog.id,
      `/components/${escapePointerToken(cycle)}`,
      `A2UI component graph contains a cycle at "${cycle}"`,
      cycle,
    );
  }

  const depth = findMaximumDepth(edges);
  if (depth > limits.maxComponentDepth) {
    return failure({
      code: "RESOURCE_LIMIT_EXCEEDED",
      message: `A2UI component graph exceeds the ${String(limits.maxComponentDepth)} level depth limit`,
      severity: "error",
      surfaceId,
      catalogId: catalog.id,
      componentId: "root",
      path: "/components/root",
    });
  }

  return { success: true, components: freezeRecord(candidate) };
}

function collectBehaviorReferences(
  value: unknown,
  behavior: A2UISchemaBehavior,
  references: string[],
): void {
  switch (behavior.type) {
    case "DYNAMIC":
    case "ACTION":
    case "CHECKABLE":
      validateDynamicPayload(value);
      return;
    case "STRUCTURAL":
      if (Array.isArray(value)) {
        for (const reference of value) {
          if (typeof reference === "string") {
            references.push(reference);
          }
        }
        return;
      }
      if (isRecord(value)) {
        if (typeof value.componentId === "string") {
          references.push(value.componentId);
        }
        if (typeof value.path === "string") {
          validateBindingPath(value.path);
        }
      }
      return;
    case "ARRAY":
      if (Array.isArray(value)) {
        for (const item of value) {
          collectBehaviorReferences(item, behavior.element, references);
        }
      }
      return;
    case "OBJECT":
      if (isRecord(value)) {
        for (const [key, childBehavior] of Object.entries(behavior.shape)) {
          collectBehaviorReferences(value[key], childBehavior, references);
        }
      }
      return;
    case "STATIC":
      return;
  }
}

function validateDynamicPayload(value: unknown): void {
  if (isDataBinding(value)) {
    validateBindingPath(value.path);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      validateDynamicPayload(item);
    }
    return;
  }

  if (isRecord(value)) {
    for (const nested of Object.values(value)) {
      validateDynamicPayload(nested);
    }
  }
}

function validateBindingPath(path: string): void {
  readDataPointer(undefined, resolveBindingPath("/", path));
}

function findCycle(
  edges: ReadonlyMap<string, readonly string[]>,
): string | undefined {
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (componentId: string): string | undefined => {
    if (visiting.has(componentId)) {
      return componentId;
    }
    if (visited.has(componentId)) {
      return undefined;
    }

    visiting.add(componentId);
    for (const childId of edges.get(componentId) ?? []) {
      const cycle = visit(childId);
      if (cycle !== undefined) {
        return cycle;
      }
    }
    visiting.delete(componentId);
    visited.add(componentId);
    return undefined;
  };

  for (const componentId of edges.keys()) {
    const cycle = visit(componentId);
    if (cycle !== undefined) {
      return cycle;
    }
  }
  return undefined;
}

function findMaximumDepth(
  edges: ReadonlyMap<string, readonly string[]>,
): number {
  const depths = new Map<string, number>();
  const visit = (componentId: string): number => {
    const knownDepth = depths.get(componentId);
    if (knownDepth !== undefined) {
      return knownDepth;
    }

    const children = edges.get(componentId) ?? [];
    const depth = 1 + Math.max(0, ...children.map(visit));
    depths.set(componentId, depth);
    return depth;
  };

  return Math.max(0, ...Array.from(edges.keys(), visit));
}

function invalidReference(
  surfaceId: string,
  catalogId: string,
  path: string,
  message: string,
  componentId?: string,
): ValidateComponentUpdateResult {
  return failure({
    code: "INVALID_REFERENCE",
    message,
    severity: "error",
    surfaceId,
    catalogId,
    ...(componentId === undefined ? {} : { componentId }),
    path,
  });
}

function failure(error: A2UIRendererError): ValidateComponentUpdateResult {
  return { success: false, error: Object.freeze(error) };
}

function appendIssuePath(
  basePath: string,
  issuePath: PropertyKey[] | undefined,
): string {
  if (issuePath === undefined || issuePath.length === 0) {
    return basePath;
  }
  return `${basePath}/${issuePath.map((part) => escapePointerToken(String(part))).join("/")}`;
}

function escapePointerToken(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function freezeRecord<Value>(
  value: Readonly<Record<string, Value>>,
): Readonly<Record<string, Value>> {
  return Object.freeze({ ...value });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
