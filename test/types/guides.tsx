import { Pressable, Text, TextInput, View } from "react-native";
import { z } from "zod";

import {
  A2UIActionSchema,
  A2UIChildListSchema,
  A2UIDynamicStringSchema,
  A2UIProvider,
  A2UISurface,
  createA2UIEngine,
  defineA2UICatalog,
  defineA2UIComponent,
  defineA2UIFunction,
  type A2UIMessage,
} from "../../src/index.js";

const Label = defineA2UIComponent({
  schema: z.object({
    text: A2UIDynamicStringSchema,
    tone: z.enum(["normal", "muted"]).optional(),
  }),
  presenter: ({ props }) => (
    <Text style={{ opacity: props.tone === "muted" ? 0.6 : 1 }}>
      {props.text}
    </Text>
  ),
  description: "Native text label",
});

const Input = defineA2UIComponent({
  schema: z.object({ value: A2UIDynamicStringSchema }),
  presenter: ({ props }) => (
    <TextInput value={props.value} onChangeText={props.setValue} />
  ),
});

const Column = defineA2UIComponent({
  schema: z.object({ children: A2UIChildListSchema }),
  presenter: ({ props, renderChild }) => (
    <View>
      {props.children.map((child) => renderChild(child.id, child.basePath))}
    </View>
  ),
});

const Button = defineA2UIComponent({
  schema: z.object({
    label: A2UIDynamicStringSchema,
    action: A2UIActionSchema,
  }),
  presenter: ({ props, dispatch }) => (
    <Pressable onPress={() => dispatch(props.action)}>
      <Text>{props.label}</Text>
    </Pressable>
  ),
});

const formatCount = defineA2UIFunction({
  name: "formatCount",
  args: z.object({ count: z.number() }),
  returns: "string",
  execute: ({ count }) => `${count} items`,
});

const catalog = defineA2UICatalog({
  id: "urn:example:a2ui:catalog:v1",
  components: { Button, Column, Input, Label },
  functions: [formatCount],
});

const agent = {
  send: (_payload: unknown): undefined => undefined,
};
const engine = createA2UIEngine({
  catalogs: [catalog],
  onAction(action) {
    agent.send({ forwardedProps: { a2ui: { action } } });
  },
  limits: {
    maxComponentsPerSurface: 250,
    maxComponentDepth: 40,
    maxDataModelBytes: 256 * 1024,
    maxMessagesPerBatch: 250,
  },
});

const transport = {
  onA2UIMessage(handler: (message: A2UIMessage) => void): void {
    void handler;
  },
};

transport.onA2UIMessage((message) => {
  engine.applyMessage(message);
});

type DisplayItem =
  | {
      readonly kind: "surface";
      readonly id: string;
      readonly surfaceId: string;
    }
  | { readonly kind: "message"; readonly id: string; readonly text: string };

function ChatMessage({
  item,
}: {
  item: Extract<DisplayItem, { kind: "message" }>;
}) {
  return <Text>{item.text}</Text>;
}

export function Transcript({ items }: { items: readonly DisplayItem[] }) {
  return (
    <A2UIProvider engine={engine}>
      {items.map((item) =>
        item.kind === "surface" ? (
          <A2UISurface key={item.id} surfaceId={item.surfaceId} />
        ) : (
          <ChatMessage key={item.id} item={item} />
        ),
      )}
    </A2UIProvider>
  );
}

engine.applyMessages([]);
engine.dispose();
