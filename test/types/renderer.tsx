import { z } from "zod";

import {
  A2UIRenderer,
  createA2UIEngine,
  defineA2UICatalog,
  type A2UIMessage,
  type A2UIFallbackRenderer,
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

const renderFallback: A2UIFallbackRenderer = (error) => <>{error.code}</>;
void (
  <A2UIRenderer
    catalogs={[catalog]}
    messages={messages}
    diagnostics="production"
    renderFallback={renderFallback}
  />
);

const invalidDiagnostics: A2UIRendererProps = {
  catalogs: [catalog],
  messages,
  // @ts-expect-error Diagnostic modes are explicit and finite.
  diagnostics: "verbose",
};
void invalidDiagnostics;

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
