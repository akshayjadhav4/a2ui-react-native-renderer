import {
  A2UISurface,
  useA2UIEngine,
  type A2UIRendererError,
  type A2UIUserAction,
} from "a2ui-react-native-renderer";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
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
  const [version, setVersion] = useState<"v0.9" | "v0.9.1">("v0.9.1");
  const [session, setSession] = useState<{
    id: number;
    endpoint: string;
    version: "v0.9" | "v0.9.1";
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
        Test themes, exact data paths, edited model round trips and surface
        recovery against a local producer. Choose a version before connecting.
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
      <View style={styles.controls}>
        {(["v0.9", "v0.9.1"] as const).map((candidate) => (
          <Control
            key={candidate}
            label={`${candidate}${version === candidate ? " ✓" : ""}`}
            disabled={session !== null}
            onPress={() => setVersion(candidate)}
          />
        ))}
      </View>
      {session === null ? (
        <Control
          label="Connect"
          disabled={!endpoint.trim()}
          onPress={() =>
            setSession({
              id: ++generation.current,
              endpoint: endpoint.trim(),
              version,
            })
          }
        />
      ) : (
        <Control label="Disconnect" onPress={() => setSession(null)} />
      )}
      {session !== null ? (
        <NetworkSession
          key={session.id}
          endpoint={session.endpoint}
          version={session.version}
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
  version,
  color,
}: {
  endpoint: string;
  version: "v0.9" | "v0.9.1";
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
  const [lastPayload, setLastPayload] = useState<unknown>(null);
  const connection = useRef<ReturnType<typeof createDemoConnection> | null>(
    null,
  );
  const engine = useA2UIEngine({
    catalogs: [fixtureCatalog],
    onError: setRendererError,
    onAction: (action) => {
      setLastAction(action);
      sendToProducer({ type: "action", action });
    },
  });
  const subscribe = useCallback(
    (listener: () => void) => engine.subscribeSurface("network-demo", listener),
    [engine],
  );
  const getSurface = useCallback(
    () => engine.getSurface("network-demo"),
    [engine],
  );
  const surface = useSyncExternalStore(subscribe, getSurface, getSurface);
  const ready =
    surface !== undefined &&
    surface.rootId !== null &&
    surface.pendingComponentIds.length === 0;
  function sendToProducer(
    message:
      | { type: "action"; action: A2UIUserAction }
      | { type: "chat"; text: string },
  ): void {
    try {
      const model = engine.getClientDataModel(["network-demo"]);
      const payload = {
        ...message,
        version,
        ...(model ? { metadata: { a2uiClientDataModel: model } } : {}),
      };
      if (connection.current?.send(payload)) {
        setTransportError(null);
        setLastPayload(payload);
      }
    } catch (error) {
      setTransportError(
        error instanceof Error
          ? error.message
          : "Could not prepare model metadata",
      );
    }
  }
  useEffect(() => {
    const active = createDemoConnection({
      url: endpoint,
      version,
      onState: setState,
      onError: setTransportError,
      onMessage: (message) => engine.applyMessage(message),
    });
    connection.current = active;
    return () => {
      connection.current = null;
      active.close();
    };
  }, [endpoint, engine, version]);
  const command = (name: string) =>
    connection.current?.send({ type: "command", command: name });
  return (
    <View style={styles.session}>
      <Text accessibilityLiveRegion="polite" style={{ color }}>
        Connection: {state}
      </Text>
      <Text style={{ color }}>
        Protocol: {version} · Model sharing:{" "}
        {surface?.sendDataModel ? "on" : "off"}
      </Text>
      <Text style={{ color }}>
        Edit the form, then use Send action or Send chat. The reply confirms the
        full model and preserved sibling received by the server. Teal controls
        come from the surface theme; No theme restores app defaults.
      </Text>
      <Control
        label="Send chat with current form"
        disabled={state !== "open" || !ready}
        onPress={() =>
          sendToProducer({ type: "chat", text: "Confirm the current form" })
        }
      />
      <View style={styles.controls}>
        {(
          [
            ["Invalid list path", "invalid-path"],
            ["Restore input", "restore-path"],
            ["Invalid theme", "invalid-theme"],
            ["Recover invalid update", "recover"],
          ] as const
        ).map(([label, name]) => (
          <Control
            key={name}
            label={label}
            disabled={state !== "open" || !ready}
            onPress={() => command(name)}
          />
        ))}
        {(
          [
            ["Recreate form", "recreate"],
            ["No theme", "without-theme"],
            ["Opt out of model sharing", "opt-out"],
            ["Delete surface (try twice)", "delete"],
          ] as const
        ).map(([label, name]) => (
          <Control
            key={name}
            label={label}
            disabled={state !== "open"}
            onPress={() => command(name)}
          />
        ))}
      </View>
      <Text style={{ color }}>
        Invalid path, invalid theme and a second deletion intentionally report
        errors. Restore input keeps edits; Recreate form resets values and turns
        model sharing back on. No theme also recreates the form.
      </Text>
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
      {lastPayload !== null ? (
        <Text selectable style={{ color }}>
          Last sent payload: {JSON.stringify(lastPayload, null, 2)}
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
