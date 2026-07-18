import {
  A2UIDynamicStringSchema,
  defineA2UICatalog,
  type A2UIPresenterProps,
  type A2UIResolvedProps,
} from "a2ui-react-native-renderer";
import { Text, View, useColorScheme } from "react-native";
import { z } from "zod";

export const FIXTURE_CATALOG_ID = "urn:example:a2ui:catalog:v1";

const TextSchema = z.object({ text: A2UIDynamicStringSchema });

function TextPresenter({
  props,
}: A2UIPresenterProps<A2UIResolvedProps<z.output<typeof TextSchema>>>) {
  const dark = useColorScheme() === "dark";

  return (
    <View
      style={{
        borderColor: dark ? "#3f3f46" : "#d4d4d8",
        borderRadius: 16,
        borderWidth: 1,
        padding: 18,
      }}
    >
      <Text
        selectable
        style={{ color: dark ? "#ffffff" : "#000000", fontSize: 18 }}
      >
        {props.text}
      </Text>
    </View>
  );
}

export const fixtureCatalog = defineA2UICatalog({
  id: FIXTURE_CATALOG_ID,
  components: {
    Text: {
      schema: TextSchema,
      presenter: TextPresenter,
    },
  },
});
