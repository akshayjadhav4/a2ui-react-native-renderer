import { DarkTheme, DefaultTheme, ThemeProvider, Link } from "expo-router";
import { Stack } from "expo-router/stack";
import { useColorScheme } from "react-native";

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen
          name="index"
          options={{
            title: "A2UI Renderer Example",
            headerRight: () => <Link href="./network">Network demo</Link>,
          }}
        />
        <Stack.Screen name="network" options={{ title: "WebSocket demo" }} />
      </Stack>
    </ThemeProvider>
  );
}
