import {
  A2UIRenderer,
  useA2UIEngine,
  type A2UIRendererError,
  type A2UIUserAction,
} from "a2ui-react-native-renderer";
import { useEffect, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  Text,
  View,
  useColorScheme,
} from "react-native";

import { fixtureCatalog } from "../catalog";
import {
  ERROR_SURFACE_ID,
  INTERACTIVE_SURFACE_ID,
  STREAMING_SURFACE_ID,
  deleteSurfaceMessage,
  interactiveMessages,
  invalidSurfaceMessages,
  recoveredSurfaceMessages,
  simpleMessages,
  streamingMessages,
} from "../fixtures";

const STREAM_LABELS = [
  "createSurface applied",
  "updateDataModel applied",
  "updateComponents applied",
] as const;

export function RendererShowcase() {
  const dark = useColorScheme() === "dark";
  const colors = {
    background: dark ? "#000000" : "#ffffff",
    border: dark ? "#3f3f46" : "#d4d4d8",
    muted: dark ? "#a1a1aa" : "#52525b",
    text: dark ? "#ffffff" : "#000000",
  } as const;
  const [lastAction, setLastAction] = useState<A2UIUserAction | null>(null);
  const [lastError, setLastError] = useState<A2UIRendererError | null>(null);
  const [streamStatus, setStreamStatus] = useState("Ready");
  const [isStreaming, setIsStreaming] = useState(false);
  const streamRun = useRef(0);
  const engine = useA2UIEngine({
    catalogs: [fixtureCatalog],
    onAction: setLastAction,
    onError: setLastError,
  });
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      engine.applyMessages(simpleMessages);
    }
  }, [engine]);

  useEffect(
    () => () => {
      streamRun.current += 1;
    },
    [engine],
  );

  const startStreaming = async () => {
    if (isStreaming) {
      return;
    }

    const run = streamRun.current + 1;
    streamRun.current = run;
    setIsStreaming(true);
    if (engine.getSurface(STREAMING_SURFACE_ID) !== undefined) {
      engine.applyMessage(deleteSurfaceMessage(STREAMING_SURFACE_ID));
    }

    for (const [index, message] of streamingMessages.entries()) {
      if (streamRun.current !== run) {
        return;
      }
      engine.applyMessage(message);
      setStreamStatus(STREAM_LABELS[index] ?? "Streaming");
      if (index < streamingMessages.length - 1) {
        await delay(500);
      }
    }

    if (streamRun.current === run) {
      setIsStreaming(false);
    }
  };

  const deleteStreamingSurface = () => {
    streamRun.current += 1;
    setIsStreaming(false);
    if (engine.getSurface(STREAMING_SURFACE_ID) !== undefined) {
      engine.applyMessage(deleteSurfaceMessage(STREAMING_SURFACE_ID));
      setStreamStatus("deleteSurface applied");
    }
  };

  const showInteractiveSurface = () => {
    if (engine.getSurface(INTERACTIVE_SURFACE_ID) !== undefined) {
      engine.applyMessage(deleteSurfaceMessage(INTERACTIVE_SURFACE_ID));
    }
    engine.applyMessages(interactiveMessages);
  };

  const showError = () => {
    if (engine.getSurface(ERROR_SURFACE_ID) !== undefined) {
      engine.applyMessage(deleteSurfaceMessage(ERROR_SURFACE_ID));
    }
    engine.applyMessages(invalidSurfaceMessages);
  };

  const recoverError = () => {
    if (engine.getSurface(ERROR_SURFACE_ID) !== undefined) {
      engine.applyMessage(deleteSurfaceMessage(ERROR_SURFACE_ID));
    }
    engine.applyMessages(recoveredSurfaceMessages);
  };

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: 20, gap: 20 }}
      style={{ backgroundColor: colors.background }}
    >
      <View style={{ gap: 6 }}>
        <Text
          selectable
          style={{ color: colors.text, fontSize: 28, fontWeight: "700" }}
        >
          Package consumer
        </Text>
        <Text
          selectable
          style={{ color: colors.muted, fontSize: 16, lineHeight: 22 }}
        >
          This Expo app owns every schema and native presenter below.
        </Text>
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <ControlButton
          label="Show action surface"
          onPress={showInteractiveSurface}
        />
        <ControlButton
          disabled={isStreaming}
          label={isStreaming ? "Streaming..." : "Stream surface"}
          onPress={() => void startStreaming()}
        />
        <ControlButton label="Delete stream" onPress={deleteStreamingSurface} />
        <ControlButton label="Show error" onPress={showError} />
        <ControlButton label="Recover error" onPress={recoverError} />
      </View>

      <StatusCard label="Lifecycle" value={streamStatus} />
      {lastAction === null ? null : (
        <StatusCard
          label="Last action"
          value={`${lastAction.name}: ${String(lastAction.context.value ?? "")}`}
        />
      )}
      {lastError === null ? null : (
        <StatusCard label="Last error" value={lastError.code} />
      )}

      <A2UIRenderer
        diagnostics="development"
        engine={engine}
        renderFallback={(error) => <ErrorFallback error={error} />}
      />
    </ScrollView>
  );
}

function ControlButton({
  disabled = false,
  label,
  onPress,
}: {
  readonly disabled?: boolean;
  readonly label: string;
  readonly onPress: () => void;
}) {
  const dark = useColorScheme() === "dark";

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: dark ? "#18181b" : "#f4f4f5",
        borderCurve: "continuous",
        borderRadius: 999,
        opacity: disabled ? 0.4 : pressed ? 0.65 : 1,
        paddingHorizontal: 14,
        paddingVertical: 10,
      })}
    >
      <Text style={{ color: dark ? "#ffffff" : "#000000", fontWeight: "600" }}>
        {label}
      </Text>
    </Pressable>
  );
}

function StatusCard({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  const dark = useColorScheme() === "dark";

  return (
    <View style={{ gap: 3 }}>
      <Text style={{ color: dark ? "#a1a1aa" : "#52525b", fontSize: 13 }}>
        {label}
      </Text>
      <Text
        selectable
        style={{ color: dark ? "#ffffff" : "#000000", fontSize: 16 }}
      >
        {value}
      </Text>
    </View>
  );
}

function ErrorFallback({ error }: { readonly error: A2UIRendererError }) {
  const dark = useColorScheme() === "dark";

  return (
    <View
      accessibilityLabel={`A2UI error ${error.code}`}
      style={{
        borderColor: dark ? "#7f1d1d" : "#fecaca",
        borderCurve: "continuous",
        borderRadius: 16,
        borderWidth: 1,
        gap: 4,
        padding: 16,
      }}
    >
      <Text style={{ color: dark ? "#fca5a5" : "#991b1b", fontWeight: "700" }}>
        Surface unavailable
      </Text>
      <Text selectable style={{ color: dark ? "#fca5a5" : "#991b1b" }}>
        {error.code}
      </Text>
    </View>
  );
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
