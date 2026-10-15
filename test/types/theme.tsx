import { z } from "zod";
import {
  defineA2UICatalog,
  defineA2UIComponent,
  createA2UIEngine,
  type A2UIPresenterProps,
} from "../../src/index.js";
import { exportA2UICatalogSchema } from "../../src/catalog-schema.js";

const themeSchema = z.object({
  primaryColor: z.string(),
  colors: z.object({ accents: z.array(z.string()) }),
});
const labelSchema = z.object({ text: z.string() });
type Theme = z.output<typeof themeSchema>;

const catalog = defineA2UICatalog({
  id: "theme",
  themeSchema,
  components: {
    Label: {
      schema: labelSchema,
      presenter: ({ props, theme }) => {
        props.text.toUpperCase();
        theme?.primaryColor.toUpperCase();
        // @ts-expect-error Unknown theme fields are rejected.
        theme?.missing;
        if (theme) {
          // @ts-expect-error Theme is deeply readonly.
          theme.colors.accents.push("red");
          // @ts-expect-error Theme is deeply readonly.
          theme.colors = { accents: [] };
        }
        return null;
      },
    },
  },
});

const reusable = defineA2UIComponent<typeof labelSchema, Theme>({
  schema: labelSchema,
  presenter: ({ theme }) => {
    theme?.primaryColor.toUpperCase();
    return null;
  },
});
defineA2UICatalog({
  id: "reused",
  themeSchema,
  components: { Label: reusable },
});
defineA2UICatalog({
  id: "incompatible",
  themeSchema: z.object({ different: z.number() }),
  // @ts-expect-error Presenter requires a different theme shape.
  components: { Label: reusable },
});
defineA2UICatalog({
  id: "no-schema-incompatible",
  // @ts-expect-error Generic theme cannot satisfy this presenter's contract.
  components: { Label: reusable },
});

const unthemed = defineA2UIComponent({
  schema: labelSchema,
  presenter: () => null,
});
defineA2UICatalog({
  id: "compatible",
  themeSchema,
  components: { Label: unthemed },
});
const engine = createA2UIEngine({ catalogs: [catalog] });
const snapshot = engine.getSurface("main");
// @ts-expect-error Mixed-catalog snapshots do not promise a color string.
snapshot?.theme?.primaryColor.toUpperCase();
// @ts-expect-error Snapshot theme is readonly.
if (snapshot?.theme) snapshot.theme.primaryColor = "changed";
exportA2UICatalogSchema(catalog);

function reusablePresenter({
  theme,
}: A2UIPresenterProps<{ text: string }, Theme>) {
  theme?.primaryColor.toUpperCase();
  return null;
}
void reusablePresenter;
