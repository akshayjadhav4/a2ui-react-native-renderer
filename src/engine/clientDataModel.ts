import type { A2UIClientDataModel, A2UISurfaceSnapshot } from "./types.js";

type ClientObject = A2UIClientDataModel["surfaces"][string];
type ClientValue = ClientObject[string];

export function prepareClientDataModel(
  surfaceIds: readonly string[],
  getSurface: (id: string) => A2UISurfaceSnapshot | undefined,
): A2UIClientDataModel | undefined {
  let version: A2UIClientDataModel["version"] | undefined;
  const entries: [string, ClientObject][] = [];
  for (const id of new Set(surfaceIds)) {
    const surface = getSurface(id);
    if (!surface?.sendDataModel) continue;
    if (version !== undefined && version !== surface.version) {
      throw new TypeError(
        "Cannot combine A2UI client data models with different creation versions",
      );
    }
    version = surface.version;
    if (!isJsonObject(surface.dataModel)) throw invalidModel(id);
    const model = cloneJsonValue(
      surface.dataModel,
      id,
      new WeakSet(),
    ) as ClientObject;
    entries.push([id, model]);
  }
  return version === undefined
    ? undefined
    : Object.freeze({
        version,
        surfaces: Object.freeze(Object.fromEntries(entries)),
      });
}

function cloneJsonValue(
  value: unknown,
  surfaceId: string,
  ancestors: WeakSet<object>,
): ClientValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  )
    return value;
  if ((!Array.isArray(value) && !isJsonObject(value)) || ancestors.has(value)) {
    throw invalidModel(surfaceId);
  }
  ancestors.add(value);
  const copy = Array.isArray(value)
    ? Object.freeze(
        Array.from(value, (item: unknown) =>
          cloneJsonValue(item, surfaceId, ancestors),
        ),
      )
    : Object.freeze(
        Object.fromEntries(
          Object.entries(value).map(([key, item]) => [
            key,
            cloneJsonValue(item, surfaceId, ancestors),
          ]),
        ),
      );
  ancestors.delete(value);
  return copy;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

function invalidModel(surfaceId: string): TypeError {
  return new TypeError(
    `A2UI surface "${surfaceId}" must have a JSON object data model for client metadata`,
  );
}
