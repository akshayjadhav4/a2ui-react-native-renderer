import { A2UIRenderer } from "a2ui-react-native-renderer";
import { ScrollView, Text, View, useColorScheme } from "react-native";

import { fixtureCatalog } from "../catalog";
import { simpleMessages } from "../fixtures";

export default function HomeScreen() {
  const colorScheme = useColorScheme();
  const dark = colorScheme === "dark";

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: 20, gap: 16 }}
      style={{ backgroundColor: dark ? "#000000" : "#ffffff" }}
    >
      <View style={{ gap: 6 }}>
        <Text
          selectable
          style={{
            color: dark ? "#ffffff" : "#000000",
            fontSize: 28,
            fontWeight: "700",
          }}
        >
          Consumer-owned catalog
        </Text>
        <Text
          selectable
          style={{
            color: dark ? "#a1a1aa" : "#52525b",
            fontSize: 16,
            lineHeight: 22,
          }}
        >
          The app supplies the native presenter. The package processes and
          renders official A2UI messages.
        </Text>
      </View>

      <A2UIRenderer catalogs={[fixtureCatalog]} messages={simpleMessages} />
    </ScrollView>
  );
}
