// @ts-check
export const FIXTURE_CATALOG_ID = "urn:example:a2ui:catalog:v1";

/**
 * @param {{
 * z: typeof import("zod").z,
 * A2UIActionSchema: typeof import("a2ui-react-native-renderer").A2UIActionSchema,
 * A2UIChildListSchema: typeof import("a2ui-react-native-renderer").A2UIChildListSchema,
 * A2UIDynamicStringSchema: typeof import("a2ui-react-native-renderer").A2UIDynamicStringSchema
 * }} dependencies
 */
export function createDemoSchemas({
  z,
  A2UIActionSchema,
  A2UIChildListSchema,
  A2UIDynamicStringSchema,
}) {
  return {
    ThemeSchema: z
      .object({ primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/) })
      .strict(),
    ColumnSchema: z.object({
      children: A2UIChildListSchema,
      appearance: z.enum(["plain", "card"]).optional(),
    }),
    TextSchema: z.object({
      text: A2UIDynamicStringSchema,
      variant: z.enum(["title", "body", "caption"]).optional(),
    }),
    InputSchema: z.object({
      value: A2UIDynamicStringSchema,
      placeholder: z.string().optional(),
    }),
    ButtonSchema: z.object({
      label: A2UIDynamicStringSchema,
      action: A2UIActionSchema,
    }),
  };
}
