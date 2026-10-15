export interface A2UIDataBinding {
  readonly path: string;
}

export interface A2UIStructuralChild {
  readonly id: string;
  readonly basePath: string;
}

export function resolveBindingPath(scopePath: string, path: string): string {
  if (path.startsWith("/")) {
    return normalizePointer(path);
  }

  if (path === "" || path === ".") {
    return normalizePointer(scopePath);
  }

  const basePath = normalizePointer(scopePath);
  const separator = basePath === "/" ? "" : basePath;
  return normalizePointer(`${separator}/${path}`);
}

export function readDataPointer(data: unknown, path: string): unknown {
  const tokens = parsePointer(path);
  let current = data;

  for (const token of tokens) {
    if (!isContainer(current)) {
      return undefined;
    }

    if (Array.isArray(current)) {
      parseArrayIndex(token, path);
    }
    current = Object.hasOwn(current, token) ? current[token] : undefined;
  }

  return current;
}

export function updateDataPointer(
  data: unknown,
  path: string,
  value: unknown,
): unknown {
  const tokens = parsePointer(path);
  if (tokens.length === 0) {
    return value;
  }

  return updateContainer(data, tokens, value, path);
}

export function resolveStructuralChildren(
  data: unknown,
  scopePath: string,
  componentId: string,
  path: string,
): readonly A2UIStructuralChild[] {
  const listPath = resolveBindingPath(scopePath, path);
  const value = readDataPointer(data, listPath);
  if (!Array.isArray(value)) {
    return Object.freeze([]);
  }

  return Object.freeze(
    value.map((_, index) =>
      Object.freeze({
        id: componentId,
        basePath: appendPointerToken(listPath, String(index)),
      }),
    ),
  );
}

export function isDataBinding(value: unknown): value is A2UIDataBinding {
  return (
    isPlainObject(value) &&
    typeof value.path === "string" &&
    Object.keys(value).length === 1
  );
}

function updateContainer(
  current: unknown,
  tokens: readonly string[],
  value: unknown,
  originalPath: string,
): unknown {
  const [token, ...remaining] = tokens;
  if (token === undefined) {
    return value;
  }

  const container = createContainer(current, token, originalPath);
  const currentValue = Object.hasOwn(container, token)
    ? Array.isArray(container)
      ? container[parseArrayIndex(token, originalPath)]
      : container[token]
    : undefined;
  const nextValue =
    remaining.length === 0
      ? value
      : updateContainer(currentValue, remaining, value, originalPath);

  if (Array.isArray(container)) {
    const result = [...container];
    result[parseArrayIndex(token, originalPath)] = nextValue;
    return Object.freeze(result);
  }

  if (value === undefined && remaining.length === 0) {
    return Object.freeze(
      Object.fromEntries(
        Object.entries(container).filter(([key]) => key !== token),
      ),
    );
  }

  return Object.freeze({ ...container, [token]: nextValue });
}

function createContainer(
  value: unknown,
  token: string,
  originalPath: string,
): unknown[] | Record<string, unknown> {
  if (Array.isArray(value)) {
    parseArrayIndex(token, originalPath);
    return value as unknown[];
  }

  if (isPlainObject(value)) {
    return value;
  }

  if (value !== undefined && value !== null) {
    throw new TypeError(
      `Cannot update A2UI data path "${originalPath}" through a primitive value`,
    );
  }

  return isArrayIndex(token) ? [] : {};
}

function parsePointer(path: string): readonly string[] {
  const normalized = normalizePointer(path);
  if (normalized === "/") {
    return [];
  }

  return normalized.slice(1).split("/").map(decodePointerToken);
}

function normalizePointer(path: string): string {
  if (path === "" || path === "/") {
    return "/";
  }

  if (!path.startsWith("/")) {
    throw new TypeError(
      `A2UI data path "${path}" is not an absolute JSON pointer`,
    );
  }

  return path;
}

function decodePointerToken(token: string): string {
  let decoded = "";

  for (let index = 0; index < token.length; index += 1) {
    const character = token.charAt(index);
    if (character !== "~") {
      decoded += character;
      continue;
    }

    const escape = token[index + 1];
    if (escape === "0") {
      decoded += "~";
    } else if (escape === "1") {
      decoded += "/";
    } else {
      throw new TypeError(`Invalid JSON pointer escape in token "${token}"`);
    }
    index += 1;
  }

  return decoded;
}

function appendPointerToken(path: string, token: string): string {
  const basePath = normalizePointer(path);
  const escaped = token.replaceAll("~", "~0").replaceAll("/", "~1");
  return basePath === "/" ? `/${escaped}` : `${basePath}/${escaped}`;
}

function parseArrayIndex(token: string, path: string): number {
  if (!isArrayIndex(token)) {
    throw new TypeError(
      `A2UI data path "${path}" uses non-numeric array token "${token}"`,
    );
  }

  const index = Number(token);
  if (index > 2 ** 32 - 2) {
    throw new TypeError(
      `A2UI data path "${path}" uses out-of-range array token "${token}"`,
    );
  }

  return index;
}

function isArrayIndex(value: string): boolean {
  return value === "0" || /^[1-9]\d*$/.test(value);
}

function isContainer(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return isContainer(value) && !Array.isArray(value);
}
