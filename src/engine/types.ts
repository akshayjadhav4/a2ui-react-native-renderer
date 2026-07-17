import type { z } from "zod";

import type { A2UIFunctionDefinition } from "../catalog/types.js";
import type { A2UIRendererError } from "../errors/types.js";

export interface A2UIRegisteredComponent {
  readonly schema: z.AnyZodObject;
  readonly presenter: unknown;
  readonly description?: string;
}

export interface A2UIRegisteredCatalog {
  readonly id: string;
  readonly components: Readonly<Record<string, A2UIRegisteredComponent>>;
  readonly functions: readonly A2UIFunctionDefinition[];
}

export interface A2UIEngineOptions {
  readonly catalogs: readonly A2UIRegisteredCatalog[];
  readonly onError?: (error: A2UIRendererError) => void;
}

export interface A2UIComponentSnapshot {
  readonly id: string;
  readonly type: string;
  readonly props: Readonly<Record<string, unknown>>;
}

export interface A2UISurfaceSnapshot {
  readonly surfaceId: string;
  readonly catalogId: string;
  readonly rootId: string | null;
  readonly components: Readonly<Record<string, A2UIComponentSnapshot>>;
  readonly revision: number;
}

export interface A2UIEngineSnapshot {
  readonly revision: number;
  readonly surfaceIds: readonly string[];
  readonly errorCount: number;
}

export interface A2UIEngine {
  applyMessage(message: unknown): void;
  applyMessages(messages: readonly unknown[]): void;
  getSnapshot(): A2UIEngineSnapshot;
  getSurface(surfaceId: string): A2UISurfaceSnapshot | undefined;
  getErrors(): readonly A2UIRendererError[];
  subscribe(listener: () => void): () => void;
  subscribeSurface(surfaceId: string, listener: () => void): () => void;
  dispose(): void;
}
