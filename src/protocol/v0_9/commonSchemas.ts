import { z } from "zod";

// These are the catalog-independent value shapes from the A2UI v0.9/v0.9.1
// common-types contract. Applications still define their own component schemas.
export const DataBindingSchema = z
  .object({ path: z.string() })
  .strict()
  .describe("A2UI:DataBinding");

export const FunctionCallSchema = z
  .object({
    call: z.string(),
    args: z.record(z.unknown()).optional(),
    returnType: z
      .enum(["string", "number", "boolean", "array", "object", "any", "void"])
      .optional(),
  })
  .strict()
  .describe("A2UI:FunctionCall");

const stringCall = FunctionCallSchema.extend({
  returnType: z.literal("string").optional(),
});
const numberCall = FunctionCallSchema.extend({
  returnType: z.literal("number").optional(),
});
const booleanCall = FunctionCallSchema.extend({
  returnType: z.literal("boolean").optional(),
});
const arrayCall = FunctionCallSchema.extend({
  returnType: z.literal("array").optional(),
});

export const DynamicStringSchema = z
  .union([z.string(), DataBindingSchema, stringCall])
  .describe("A2UI:DynamicString");
export const DynamicNumberSchema = z
  .union([z.number(), DataBindingSchema, numberCall])
  .describe("A2UI:DynamicNumber");
export const DynamicBooleanSchema = z
  .union([z.boolean(), DataBindingSchema, booleanCall])
  .describe("A2UI:DynamicBoolean");
export const DynamicStringListSchema = z
  .union([z.array(z.string()), DataBindingSchema, arrayCall])
  .describe("A2UI:DynamicStringList");
export const DynamicValueSchema = z
  .union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.unknown()),
    DataBindingSchema,
    FunctionCallSchema,
  ])
  .describe("A2UI:DynamicValue");

export const ChildListSchema = z
  .union([
    z.array(z.string()),
    z.object({ componentId: z.string(), path: z.string() }).strict(),
  ])
  .describe("A2UI:ChildList");

export const ActionSchema = z
  .union([
    z
      .object({
        event: z
          .object({
            name: z.string(),
            context: z.record(DynamicValueSchema).optional(),
          })
          .strict(),
      })
      .strict(),
    z.object({ functionCall: FunctionCallSchema }).strict(),
  ])
  .describe("A2UI:Action");

export type DataBinding = z.infer<typeof DataBindingSchema>;
export type FunctionCall = z.infer<typeof FunctionCallSchema>;
export type DynamicString = z.infer<typeof DynamicStringSchema>;
export type DynamicNumber = z.infer<typeof DynamicNumberSchema>;
export type DynamicBoolean = z.infer<typeof DynamicBooleanSchema>;
export type DynamicStringList = z.infer<typeof DynamicStringListSchema>;
export type DynamicValue = z.infer<typeof DynamicValueSchema>;
export type ChildList = z.infer<typeof ChildListSchema>;
export type Action = z.infer<typeof ActionSchema>;
