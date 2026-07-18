export interface A2UIResourceLimits {
  readonly maxComponentsPerSurface: number;
  readonly maxComponentDepth: number;
  readonly maxDataModelBytes: number;
  readonly maxMessagesPerBatch: number;
}

export const DEFAULT_A2UI_RESOURCE_LIMITS: A2UIResourceLimits = Object.freeze({
  maxComponentsPerSurface: 500,
  maxComponentDepth: 64,
  maxDataModelBytes: 1024 * 1024,
  maxMessagesPerBatch: 1000,
});

export function resolveA2UIResourceLimits(
  overrides: Partial<A2UIResourceLimits> | undefined,
): A2UIResourceLimits {
  const limits = {
    ...DEFAULT_A2UI_RESOURCE_LIMITS,
    ...overrides,
  };

  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new TypeError(
        `A2UI resource limit "${name}" must be a positive integer`,
      );
    }
  }

  return Object.freeze(limits);
}

export function measureSerializedBytes(value: unknown): number {
  const serialized = JSON.stringify(value) as string | undefined;
  if (serialized === undefined) {
    return 0;
  }

  let bytes = 0;
  for (let index = 0; index < serialized.length; index += 1) {
    const code = serialized.charCodeAt(index);
    if (code <= 0x7f) {
      bytes += 1;
    } else if (code <= 0x7ff) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      index += 1;
    } else {
      bytes += 3;
    }
  }

  return bytes;
}
