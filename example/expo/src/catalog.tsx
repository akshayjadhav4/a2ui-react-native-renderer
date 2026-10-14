import {
  A2UIActionSchema,
  A2UIChildListSchema,
  A2UIDynamicStringSchema,
  defineA2UICatalog,
  type A2UIPresenterProps,
  type A2UIResolvedProps,
} from "a2ui-react-native-renderer";
import { Pressable, Text, TextInput, View, useColorScheme } from "react-native";
import { z } from "zod";

import { createDemoSchemas, FIXTURE_CATALOG_ID } from "./catalog-contract.mjs";
export { FIXTURE_CATALOG_ID };
const { ColumnSchema, TextSchema, InputSchema, ButtonSchema } =
  createDemoSchemas({
    z,
    A2UIActionSchema,
    A2UIChildListSchema,
    A2UIDynamicStringSchema,
  });

type PresenterProps<Schema extends z.AnyZodObject> = A2UIPresenterProps<
  A2UIResolvedProps<z.output<Schema>>
>;

function usePalette() {
  const dark = useColorScheme() === "dark";

  return {
    background: dark ? "#000000" : "#ffffff",
    border: dark ? "#3f3f46" : "#d4d4d8",
    muted: dark ? "#a1a1aa" : "#52525b",
    primary: dark ? "#ffffff" : "#000000",
    primaryText: dark ? "#000000" : "#ffffff",
    text: dark ? "#ffffff" : "#000000",
  } as const;
}

function ColumnPresenter({
  props,
  renderChild,
}: PresenterProps<typeof ColumnSchema>) {
  const colors = usePalette();
  const card = props.appearance === "card";

  return (
    <View
      style={{
        backgroundColor: colors.background,
        borderColor: card ? colors.border : "transparent",
        borderCurve: "continuous",
        borderRadius: card ? 18 : 0,
        borderWidth: card ? 1 : 0,
        gap: 14,
        padding: card ? 18 : 0,
      }}
    >
      {props.children.map((child) => renderChild(child.id, child.basePath))}
    </View>
  );
}

function TextPresenter({ props }: PresenterProps<typeof TextSchema>) {
  const colors = usePalette();
  const variant = props.variant ?? "body";

  return (
    <Text
      selectable
      style={{
        color: variant === "caption" ? colors.muted : colors.text,
        fontSize: variant === "title" ? 20 : variant === "caption" ? 14 : 17,
        fontWeight: variant === "title" ? "700" : "400",
        lineHeight: variant === "title" ? 26 : variant === "caption" ? 19 : 24,
      }}
    >
      {props.text}
    </Text>
  );
}

function InputPresenter({ props }: PresenterProps<typeof InputSchema>) {
  const colors = usePalette();

  return (
    <TextInput
      accessibilityLabel={props.placeholder ?? "A2UI text input"}
      editable={props.setValue !== undefined}
      onChangeText={props.setValue}
      placeholder={props.placeholder}
      placeholderTextColor={colors.muted}
      style={{
        borderColor: colors.border,
        borderCurve: "continuous",
        borderRadius: 12,
        borderWidth: 1,
        color: colors.text,
        fontSize: 17,
        paddingHorizontal: 14,
        paddingVertical: 12,
      }}
      value={props.value ?? ""}
    />
  );
}

function ButtonPresenter({
  props,
  dispatch,
}: PresenterProps<typeof ButtonSchema>) {
  const colors = usePalette();

  return (
    <Pressable
      accessibilityLabel={props.label}
      accessibilityRole="button"
      onPress={() => dispatch(props.action)}
      style={({ pressed }) => ({
        alignItems: "center",
        backgroundColor: colors.primary,
        borderCurve: "continuous",
        borderRadius: 12,
        opacity: pressed ? 0.72 : 1,
        paddingHorizontal: 16,
        paddingVertical: 13,
      })}
    >
      <Text
        style={{ color: colors.primaryText, fontSize: 17, fontWeight: "600" }}
      >
        {props.label}
      </Text>
    </Pressable>
  );
}

export const fixtureCatalog = defineA2UICatalog({
  id: FIXTURE_CATALOG_ID,
  components: {
    Column: { schema: ColumnSchema, presenter: ColumnPresenter },
    Text: { schema: TextSchema, presenter: TextPresenter },
    Input: { schema: InputSchema, presenter: InputPresenter },
    Button: { schema: ButtonSchema, presenter: ButtonPresenter },
  },
});
