// @ts-check
/**
 * @param {{ url: string,
 * onMessage: (message: unknown) => void,
 * onState: (state: "connecting" | "open" | "closed") => void,
 * onError: (message: string) => void,
 * version?: "v0.9" | "v0.9.1",
 * sendDataModel?: boolean,
 * createSocket?: (url: string) => WebSocket }} options
 */
export function createDemoConnection({
  url,
  onMessage,
  onState,
  onError,
  version = "v0.9.1",
  sendDataModel = true,
  createSocket = (endpoint) => new WebSocket(endpoint),
}) {
  let retired = false;
  /** @type {WebSocket | undefined} */
  let socket;
  onState("connecting");
  try {
    socket = createSocket(url);
  } catch (error) {
    onError(error instanceof Error ? error.message : "Connection failed");
    onState("closed");
  }
  /** @param {unknown} frame */
  const send = (frame) => {
    if (retired) return false;
    if (socket?.readyState !== 1) {
      onError("The demo connection is not open");
      return false;
    }
    try {
      socket.send(JSON.stringify(frame));
      return true;
    } catch {
      onError("Could not send demo frame");
      return false;
    }
  };
  if (socket) {
    socket.onopen = () => {
      if (!retired) {
        onState("open");
        send({ type: "command", command: "start", version, sendDataModel });
      }
    };
    socket.onmessage = (event) => {
      if (retired) return;
      if (typeof event.data !== "string" || event.data.length > 65536) {
        onError("Expected a bounded JSON text frame");
        return;
      }
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        onError("Producer sent invalid JSON");
        return;
      }
      if (message?.type === "demoError") {
        onError(
          typeof message.message === "string"
            ? message.message.slice(0, 4096)
            : "Invalid demo error",
        );
        return;
      }
      onMessage(message);
    };
    socket.onerror = () => {
      if (!retired)
        onError("WebSocket connection failed; check the endpoint and producer");
    };
    socket.onclose = () => {
      if (!retired) {
        retired = true;
        onState("closed");
      }
    };
  }
  return {
    send,
    close() {
      if (retired && !socket) return;
      retired = true;
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        try {
          socket.close();
        } catch {
          /* The session is already retired. */
        }
        socket = undefined;
      }
    },
  };
}
