import {
  A2UIDynamicStringSchema,
  A2UIRenderer,
  defineA2UICatalog,
  type A2UIMessage,
} from "a2ui-react-native-renderer";
import { AppRegistry, Text } from "react-native";
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
  return <A2UIRenderer catalogs={[catalog]} messages={messages} />;
}

AppRegistry.registerComponent("A2UIBareConsumer", () => App);
