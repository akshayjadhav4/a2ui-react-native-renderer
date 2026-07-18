import { z } from "zod";

import {
  A2UIDynamicStringSchema,
  defineA2UICatalog,
  defineA2UIComponent,
  defineA2UIFunction,
  type A2UIPresenterProps,
  type A2UIRendererError,
} from "../../src/index.js";

const TextSchema = z.object({
  text: z.string(),
  emphasis: z.enum(["regular", "strong"]).optional(),
});

const TextComponent = defineA2UIComponent({
  schema: TextSchema,
  presenter: ({ props }) => {
    props.text.toUpperCase();
    props.emphasis?.toUpperCase();

    // @ts-expect-error The schema does not define a count property.
    props.count;

    return null;
  },
});

const formatCount = defineA2UIFunction({
  name: "formatCount",
  args: z.object({ count: z.number() }),
  returns: "string",
  execute: ({ count }) => count.toFixed(),
});

defineA2UICatalog({
  id: "urn:example:a2ui:catalog:v1",
  components: { Text: TextComponent },
  functions: [formatCount],
});

defineA2UICatalog({
  id: "urn:example:a2ui:inline-catalog:v1",
  components: {
    InlineText: {
      schema: z.object({ label: z.string() }),
      presenter: ({ props }) => {
        props.label.toUpperCase();

        // @ts-expect-error Inline definitions must infer their own schema.
        props.missing;

        return null;
      },
    },
  },
});

function acceptsTextPresenterProps(
  value: A2UIPresenterProps<z.output<typeof TextSchema>>,
): string {
  return value.props.text;
}

void acceptsTextPresenterProps;

const rendererError: A2UIRendererError = {
  code: "INVALID_COMPONENT_PROPS",
  message: "Invalid text props",
  severity: "error",
  surfaceId: "surface-1",
  componentId: "title",
};

void rendererError;

defineA2UIComponent({
  schema: z.object({ value: A2UIDynamicStringSchema }),
  presenter: ({ props }) => {
    props.value?.toUpperCase();
    props.setValue("updated");

    // @ts-expect-error Bound string setters only accept strings.
    props.setValue(42);

    return null;
  },
});

defineA2UIFunction({
  name: "badFormatCount",
  args: z.object({ count: z.number() }),
  returns: "string",
  // @ts-expect-error A string function cannot return a number.
  execute: ({ count }) => count,
});
