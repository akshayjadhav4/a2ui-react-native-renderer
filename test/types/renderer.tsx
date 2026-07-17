import { z } from "zod";

import {
  A2UIRenderer,
  createA2UIEngine,
  defineA2UICatalog,
  type A2UIMessage,
  type A2UIRendererProps,
} from "../../src/index.js";

const catalog = defineA2UICatalog({
  id: "urn:example:a2ui:catalog:v1",
  components: {
    Text: {
      schema: z.object({ text: z.string() }),
      presenter: () => null,
    },
  },
});
const messages: A2UIMessage[] = [];
const engine = createA2UIEngine({ catalogs: [catalog] });

void (<A2UIRenderer catalogs={[catalog]} messages={messages} />);
void (<A2UIRenderer engine={engine} messages={messages} />);

// @ts-expect-error An external engine already owns its catalog configuration.
const mixedConfiguration: A2UIRendererProps = {
  engine,
  catalogs: [catalog],
  messages,
};
void mixedConfiguration;

// @ts-expect-error Owned-engine mode requires at least a catalog collection.
const missingCatalogs: A2UIRendererProps = { messages };
void missingCatalogs;
