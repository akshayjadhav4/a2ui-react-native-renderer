import { z } from "zod";

// The catalog supplies the property schema for each component. The wire
// envelope only needs to identify the component and retain its raw properties.
const WireComponentSchema = z
  .object({
    component: z.string(),
    id: z.string().optional(),
    weight: z.number().optional(),
  })
  .passthrough();

export const A2UIWireVersionSchema = z.enum(["v0.9", "v0.9.1"]);

const CreateSurfaceMessageSchema = z
  .object({
    version: A2UIWireVersionSchema,
    createSurface: z
      .object({
        surfaceId: z.string(),
        catalogId: z.string(),
        theme: z
          .custom<Record<string, unknown>>(
            (value) =>
              typeof value === "object" &&
              value !== null &&
              !Array.isArray(value),
          )
          .optional(),
        sendDataModel: z.boolean().optional(),
      })
      .strict(),
  })
  .strict();

const UpdateComponentsMessageSchema = z
  .object({
    version: A2UIWireVersionSchema,
    updateComponents: z
      .object({
        surfaceId: z.string(),
        components: z.array(WireComponentSchema).min(1),
      })
      .strict(),
  })
  .strict();

const UpdateDataModelMessageSchema = z
  .object({
    version: A2UIWireVersionSchema,
    updateDataModel: z
      .object({
        surfaceId: z.string(),
        path: z.string().optional(),
        value: z.unknown().optional(),
      })
      .strict(),
  })
  .strict();

const DeleteSurfaceMessageSchema = z
  .object({
    version: A2UIWireVersionSchema,
    deleteSurface: z.object({ surfaceId: z.string() }).strict(),
  })
  .strict();

export const A2UIWireMessageSchema = z.union([
  CreateSurfaceMessageSchema,
  UpdateComponentsMessageSchema,
  UpdateDataModelMessageSchema,
  DeleteSurfaceMessageSchema,
]);

export type A2UIWireMessage = z.infer<typeof A2UIWireMessageSchema>;

export const A2UIWireActionPayloadSchema = z
  .object({
    name: z.string(),
    surfaceId: z.string(),
    sourceComponentId: z.string(),
    timestamp: z.string().datetime({ offset: true }),
    context: z.record(z.unknown()),
  })
  .passthrough();

export const A2UIWireActionEnvelopeSchema = z
  .object({
    version: A2UIWireVersionSchema,
    action: A2UIWireActionPayloadSchema,
  })
  .strict();
