import {
  A2UISurface,
  useA2UIEngine,
  type A2UIRendererError,
  type A2UIUserAction,
} from "a2ui-react-native-renderer";
import { useEffect, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from "react-native";
import { fixtureCatalog } from "../catalog";
import { createDemoConnection } from "../demo-connection.mjs";

export function NetworkDemo() {
  const dark = useColorScheme() === "dark";
  const [endpoint, setEndpoint] = useState(
    process.env.EXPO_PUBLIC_A2UI_DEMO_URL ?? "ws://localhost:8080",
  );
  const [session, setSession] = useState<{
    id: number;
    endpoint: string;
  } | null>(null);
  const generation = useRef(0);
  const color = dark ? "#fafafa" : "#18181b";
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: dark ? "#09090b" : "#fafafa" }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.title, { color }]}>Local network demo</Text>
      <Text style={{ color }}>
        A deterministic producer streams A2UI v0.9.1 messages over WebSocket.
        Edit the rendered input and send an action to see its reply.
      </Text>
      <TextInput
        accessibilityLabel="WebSocket endpoint"
        autoCapitalize="none"
        autoCorrect={false}
        editable={session === null}
        value={endpoint}
        onChangeText={setEndpoint}
        style={[styles.endpoint, { color }]}
      />
      {session === null ? (
        <Control
          label="Connect"
          disabled={!endpoint.trim()}
          onPress={() =>
            setSession({ id: ++generation.current, endpoint: endpoint.trim() })
          }
        />
      ) : (
        <Control label="Disconnect" onPress={() => setSession(null)} />
      )}
      {session !== null ? (
        <NetworkSession
          key={session.id}
          endpoint={session.endpoint}
          color={color}
        />
      ) : (
        <Text style={{ color }}>
          Start the demo producer, then connect. Android emulators and phones
          need a reachable host address; see the example README.
        </Text>
      )}
    </ScrollView>
  );
}

function NetworkSession({
  endpoint,
  color,
}: {
  endpoint: string;
  color: string;
}) {
  const [state, setState] = useState<"connecting" | "open" | "closed">(
    "connecting",
  );
  const [transportError, setTransportError] = useState<string | null>(null);
  const [rendererError, setRendererError] = useState<A2UIRendererError | null>(
    null,
  );
  const [lastAction, setLastAction] = useState<A2UIUserAction | null>(null);
  const connection = useRef<ReturnType<typeof createDemoConnection> | null>(
    null,
  );
  const engine = useA2UIEngine({
    catalogs: [fixtureCatalog],
    onError: setRendererError,
    onAction: (action) => {
      setLastAction(action);
      connection.current?.send({ type: "action", action });
    },
  });
  useEffect(() => {
    const active = createDemoConnection({
      url: endpoint,
      onState: setState,
      onError: setTransportError,
      onMessage: (message) => engine.applyMessage(message),
    });
    connection.current = active;
    return () => {
      connection.current = null;
      active.close();
    };
  }, [endpoint, engine]);
  const command = (name: "recover" | "delete") =>
    connection.current?.send({ type: "command", command: name });
  return (
    <View style={styles.session}>
      <Text accessibilityLiveRegion="polite" style={{ color }}>
        Connection: {state}
      </Text>
      <View style={styles.controls}>
        <Control
          label="Recover invalid update"
          disabled={state !== "open"}
          onPress={() => command("recover")}
        />
        <Control
          label="Delete surface"
          disabled={state !== "open"}
          onPress={() => command("delete")}
        />
      </View>
      <A2UISurface
        engine={engine}
        surfaceId="network-demo"
        diagnostics="development"
        renderPending={({ componentId }) => (
          <Text style={{ color }}>Waiting for {componentId}…</Text>
        )}
        renderFallback={(error) => (
          <Text style={{ color }}>Renderer: {error.code}</Text>
        )}
      />
      {transportError !== null ? (
        <Text accessibilityLiveRegion="polite" style={{ color }}>
          Transport: {transportError}
        </Text>
      ) : null}
      {rendererError !== null ? (
        <Text style={{ color }}>
          Last renderer error: {rendererError.code} (later valid messages can
          recover)
        </Text>
      ) : null}
      {lastAction !== null ? (
        <Text selectable style={{ color }}>
          Last action: {JSON.stringify(lastAction, null, 2)}
        </Text>
      ) : null}
      {state === "closed" ? (
        <Text style={{ color }}>
          Disconnect and connect again to start a fresh session.
        </Text>
      ) : null}
    </View>
  );
}

function Control({
  label,
  disabled = false,
  onPress,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.control,
        { opacity: disabled ? 0.4 : pressed ? 0.7 : 1 },
      ]}
    >
      <Text style={styles.controlText}>{label}</Text>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  content: { padding: 20, gap: 16, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: "700" },
  endpoint: {
    borderWidth: 1,
    borderColor: "#71717a",
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
  },
  session: { gap: 16 },
  controls: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  control: {
    backgroundColor: "#2563eb",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  controlText: { color: "#ffffff", fontWeight: "600" },
});
