import { Text } from "react-native";
import { z } from "zod";

import {
  A2UIProvider,
  A2UIRenderer,
  A2UISurface,
  createA2UIEngine,
  defineA2UICatalog,
  type A2UIMessage,
  type A2UIUserAction,
} from "../../src/index.js";

const catalog = defineA2UICatalog({
  id: "urn:example:a2ui:catalog:v1",
  components: {
    Text: {
      schema: z.object({ text: z.string() }),
      presenter: ({ props }) => <Text>{props.text}</Text>,
    },
  },
});

const messages: A2UIMessage[] = [
  {
    version: "v0.9",
    createSurface: {
      surfaceId: "welcome",
      catalogId: catalog.id,
    },
  },
  {
    version: "v0.9",
    updateComponents: {
      surfaceId: "welcome",
      components: [
        {
          id: "root",
          component: "Text",
          text: "Hello from A2UI",
        },
      ],
    },
  },
];

export function AgentUI() {
  return <A2UIRenderer catalogs={[catalog]} messages={messages} />;
}

function sendActionToAgent(_action: A2UIUserAction): void {}
function reportRendererError(_error: unknown): void {}

const engine = createA2UIEngine({
  catalogs: [catalog],
  onAction: (action: A2UIUserAction) => sendActionToAgent(action),
  onError: (error) => reportRendererError(error),
});

export function acceptA2UIMessage(message: A2UIMessage) {
  engine.applyMessage(message);
}

export function ChatSurface({ surfaceId }: { surfaceId: string }) {
  return (
    <A2UIProvider engine={engine}>
      <A2UISurface surfaceId={surfaceId} />
    </A2UIProvider>
  );
}

const telemetry = { capture: (_error: unknown): undefined => undefined };

void (
  <A2UIRenderer
    catalogs={[catalog]}
    messages={messages}
    diagnostics="production"
    onError={(error) => telemetry.capture(error)}
    renderFallback={() => <Text>Interface unavailable</Text>}
  />
);
