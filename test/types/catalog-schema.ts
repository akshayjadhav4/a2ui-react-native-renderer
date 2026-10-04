import { z } from "zod";

import { exportA2UICatalogSchema } from "a2ui-react-native-renderer/catalog-schema";
import {
  defineA2UICatalog,
  defineA2UIComponent,
} from "a2ui-react-native-renderer";

const catalog = defineA2UICatalog({
  id: "https://example.com/a2ui/catalog/v1",
  components: {
    Label: defineA2UIComponent({
      schema: z.object({ text: z.string() }),
      presenter: () => null,
    }),
  },
});

const document = exportA2UICatalogSchema(catalog);
document.catalogId.toUpperCase();
document.$id.toUpperCase();

// @ts-expect-error The exporter requires an A2UI catalog.
exportA2UICatalogSchema({ id: "not-a-catalog" });
