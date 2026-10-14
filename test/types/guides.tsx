import { Pressable, Text, TextInput, View } from "react-native";
import { useEffect } from "react";
import { z } from "zod";

import {
  A2UIActionSchema,
  A2UIChildListSchema,
  A2UIComponentIdSchema,
  A2UIDynamicStringSchema,
  A2UIProvider,
  A2UISurface,
  createA2UIEngine,
  defineA2UICatalog,
  defineA2UIComponent,
  defineA2UIFunction,
  useA2UIEngine,
  type A2UIMessage,
  type A2UIRendererError,
  type A2UIUserAction,
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

const SingleChild = defineA2UIComponent({
  schema: z.object({ child: A2UIComponentIdSchema }),
  presenter: ({ props, renderChild }) => (
    <View>{renderChild(props.child)}</View>
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
  components: { Button, Column, Input, Label, SingleChild },
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

type MessageSource = {
  onA2UIMessage(handler: (message: A2UIMessage) => void): () => void;
};

export function LiveTranscript({
  source,
  items,
  onAction,
  onError,
}: {
  source: MessageSource;
  items: readonly DisplayItem[];
  onAction: (action: A2UIUserAction) => void | Promise<void>;
  onError: (error: A2UIRendererError) => void;
}) {
  const liveEngine = useA2UIEngine({ catalogs: [catalog], onAction, onError });
  useEffect(
    () =>
      source.onA2UIMessage((message) => {
        liveEngine.applyMessage(message);
      }),
    [source, liveEngine],
  );
  return items.map((item) =>
    item.kind === "surface" ? (
      <A2UISurface
        key={item.id}
        engine={liveEngine}
        surfaceId={item.surfaceId}
        renderPending={({ kind }) => <Text>Loading {kind}…</Text>}
        renderFallback={(error) => <Text>Unable to display: {error.code}</Text>}
      />
    ) : (
      <ChatMessage key={item.id} item={item} />
    ),
  );
}
