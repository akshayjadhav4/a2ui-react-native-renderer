import { WebSocket, WebSocketServer } from "ws";
import {
  SURFACE_ID,
  initialMessages,
  recoveryMessages,
  deleteMessage,
  responseMessage,
} from "./fixtures.mjs";

export async function createDemoServer({
  host = "127.0.0.1",
  port = 8080,
  delayMs = 600,
} = {}) {
  if (
    !Number.isInteger(port) ||
    port < 0 ||
    port > 65535 ||
    !Number.isFinite(delayMs) ||
    delayMs < 0
  )
    throw new TypeError("Invalid demo port or delay");
  const server = new WebSocketServer({
    host,
    port,
    maxPayload: 16384,
    perMessageDeflate: false,
  });
  const sessions = new Set();
  let closing;
  server.on("connection", (socket) => {
    const session = { timers: new Set(), active: false, ready: false };
    sessions.add(session);
    const cancel = () => {
      for (const timer of session.timers) clearTimeout(timer);
      session.timers.clear();
    };
    const send = (value) => {
      if (socket.readyState === WebSocket.OPEN)
        socket.send(JSON.stringify(value));
    };
    const error = (message) => send({ type: "demoError", message });
    socket.on("error", () => {
      cancel();
    });
    socket.on("close", () => {
      cancel();
      sessions.delete(session);
    });
    socket.on("message", (bytes, binary) => {
      if (binary) return error("Use JSON text frames");
      let frame;
      try {
        frame = JSON.parse(bytes.toString());
      } catch {
        return error("Invalid JSON");
      }
      if (!frame || typeof frame !== "object" || Array.isArray(frame))
        return error("Invalid demo frame");
      if (frame.type === "command") {
        if (frame.command === "start") {
          if (session.active)
            return error("Session already started; reconnect to reset");
          session.active = true;
          initialMessages.forEach((message, index) => {
            const timer = setTimeout(() => {
              session.timers.delete(timer);
              if (!session.active) return;
              if (index === initialMessages.length - 1) session.ready = true;
              send(message);
            }, index * delayMs);
            session.timers.add(timer);
          });
        } else if (frame.command === "delete" && session.active) {
          cancel();
          session.active = false;
          session.ready = false;
          send(deleteMessage);
        } else if (frame.command === "recover" && session.ready) {
          recoveryMessages.forEach(send);
        } else {
          error("Unsupported command or inactive surface");
        }
      } else if (frame.type === "action") {
        const action = frame.action;
        if (
          !session.ready ||
          !action ||
          action.name !== "submit_demo" ||
          action.surfaceId !== SURFACE_ID ||
          action.sourceComponentId !== "button" ||
          typeof action.timestamp !== "string" ||
          !/^\d{4}-\d{2}-\d{2}T/.test(action.timestamp) ||
          !Number.isFinite(Date.parse(action.timestamp)) ||
          typeof action.context?.value !== "string" ||
          action.context.value.length > 4096
        )
          return error("Invalid or premature demo action");
        send(responseMessage(action.context.value));
      } else {
        error("Unsupported demo frame");
      }
    });
    session.cancel = cancel;
  });
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  return {
    url: `ws://${host.includes(":") ? `[${host}]` : host}:${address.port}`,
    getPendingCount: () =>
      [...sessions].reduce((sum, s) => sum + s.timers.size, 0),
    close() {
      if (!closing) {
        for (const session of sessions) session.cancel();
        for (const socket of server.clients) socket.terminate();
        closing = new Promise((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      }
      return closing;
    },
  };
}
