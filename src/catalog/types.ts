import type { ReactNode } from "react";
import type { z } from "zod";

export interface A2UIBindingScope {
  readonly path: string;
  readonly value: unknown;
}

export type A2UIChildRenderer = (
  componentId: string,
  scopePath?: string,
) => ReactNode;

export type A2UIComponentAction = Readonly<Record<string, unknown>>;

export interface A2UIPresenterProps<Props extends object> {
  readonly props: Readonly<Props>;
  readonly surfaceId: string;
  readonly componentId: string;
  readonly scope: A2UIBindingScope;
  readonly renderChild: A2UIChildRenderer;
  readonly dispatch: (action: A2UIComponentAction) => void;
}

export type A2UIPresenter<Props extends object> = (
  props: A2UIPresenterProps<Props>,
) => ReactNode;

export interface A2UIComponentDefinition<
  Schema extends z.AnyZodObject = z.AnyZodObject,
> {
  readonly schema: Schema;
  readonly presenter: A2UIPresenter<z.output<Schema>>;
  readonly description?: string;
}

export type A2UIFunctionReturnKind =
  "string" | "number" | "boolean" | "object" | "array" | "unknown";

export interface A2UIFunctionReturnMap {
  readonly string: string;
  readonly number: number;
  readonly boolean: boolean;
  readonly object: Readonly<Record<string, unknown>>;
  readonly array: readonly unknown[];
  readonly unknown: unknown;
}

export interface A2UIFunctionDefinition<
  Args extends z.AnyZodObject = z.AnyZodObject,
  ReturnKind extends A2UIFunctionReturnKind = A2UIFunctionReturnKind,
> {
  readonly name: string;
  readonly args: Args;
  readonly returns: ReturnKind;
  execute(args: z.output<Args>): A2UIFunctionReturnMap[ReturnKind];
  readonly description?: string;
}

export type A2UIComponentSchemas = Readonly<Record<string, z.AnyZodObject>>;

export type A2UIComponentDefinitions<
  Schemas extends A2UIComponentSchemas = A2UIComponentSchemas,
> = {
  readonly [Name in keyof Schemas]: A2UIComponentDefinition<Schemas[Name]>;
};

export interface A2UICatalog<
  Schemas extends A2UIComponentSchemas = A2UIComponentSchemas,
  Functions extends readonly A2UIFunctionDefinition[] =
    readonly A2UIFunctionDefinition[],
> {
  readonly id: string;
  readonly components: A2UIComponentDefinitions<Schemas>;
  readonly functions: Readonly<Functions>;
}

export interface A2UICatalogDefinition<
  Schemas extends A2UIComponentSchemas,
  Functions extends readonly A2UIFunctionDefinition[],
> {
  readonly id: string;
  readonly components: A2UIComponentDefinitions<Schemas>;
  readonly functions?: Functions;
}
