# a2ui-react-native-renderer

A catalog-agnostic A2UI renderer and protocol runtime for React Native and
Expo.

The package is under active development and is not published yet. It includes
no UI component catalog: applications define their own Zod schemas and native
React presenters.

## Simple API

```tsx
import { Text } from "react-native";
import { z } from "zod";
import {
  A2UIRenderer,
  defineA2UICatalog,
  type A2UIMessage,
} from "a2ui-react-native-renderer";

const catalog = defineA2UICatalog({
  id: "urn:example:a2ui:catalog:v1",
  components: {
    Text: {
      schema: z.object({ text: z.string() }),
      presenter: ({ props }) => <Text>{props.text}</Text>,
    },
  },
});

export function AgentUI({ messages }: { messages: A2UIMessage[] }) {
  return <A2UIRenderer catalogs={[catalog]} messages={messages} />;
}
```

`A2UIRenderer` owns one engine, incrementally applies appended messages, and
renders every active surface. Catalogs must remain stable while it is mounted.

## Advanced API

Use an application-owned engine when surfaces need custom placement, such as
inside individual chat turns.

```tsx
const engine = createA2UIEngine({
  catalogs: [catalog],
  onAction: sendActionToAgent,
  onError: reportRendererError,
});

agentStream.onMessage((message) => engine.applyMessage(message));

function Surface({ surfaceId }: { surfaceId: string }) {
  return (
    <A2UIProvider engine={engine}>
      <A2UISurface surfaceId={surfaceId} />
    </A2UIProvider>
  );
}
```

Transport, chat state, persistence, and the component catalog remain owned by
the consuming application.
