import {
  A2UIDynamicStringSchema,
  A2UISurface,
  defineA2UICatalog,
  useA2UIEngine,
  type A2UIMessage,
} from "a2ui-react-native-renderer";
import { AppRegistry, Text } from "react-native";
import { useEffect, useRef } from "react";
import { z } from "zod";

const catalog = defineA2UICatalog({
  id: "urn:smoke:a2ui:catalog:v1",
  components: {
    Text: {
      schema: z.object({ text: A2UIDynamicStringSchema }),
      presenter: ({ props }) => <Text>{props.text}</Text>,
    },
  },
});

const messages = [
  {
    version: "v0.9",
    createSurface: {
      surfaceId: "main",
      catalogId: catalog.id,
    },
  },
  {
    version: "v0.9",
    updateComponents: {
      surfaceId: "main",
      components: [
        {
          id: "root",
          component: "Text",
          text: "Installed from the packed artifact",
        },
      ],
    },
  },
] satisfies readonly A2UIMessage[];

function App() {
  const engine = useA2UIEngine({ catalogs: [catalog] });
  const initialized = useRef(false);
  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      engine.applyMessages(messages);
    }
  }, [engine]);
  return <A2UISurface engine={engine} surfaceId="main" />;
}

AppRegistry.registerComponent("A2UIBareConsumer", () => App);
