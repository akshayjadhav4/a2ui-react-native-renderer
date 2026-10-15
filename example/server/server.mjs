import { WebSocket, WebSocketServer } from "ws";
import {
  SURFACE_ID,
  messagesForSession,
  inputBindingMessage,
  invalidThemeMessage,
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
    const session = {
      timers: new Set(),
      active: false,
      ready: false,
      started: false,
      version: "v0.9.1",
      sendDataModel: true,
    };
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
      const reply = (value) =>
        send({ ...responseMessage(value), version: session.version });
      if (frame.type === "command") {
        if (frame.command === "start") {
          if (session.active)
            return error("Session already started; reconnect to reset");
          if (
            (frame.version !== undefined &&
              !["v0.9", "v0.9.1"].includes(frame.version)) ||
            (frame.sendDataModel !== undefined &&
              typeof frame.sendDataModel !== "boolean")
          ) {
            return error("Invalid demo version or model policy");
          }
          session.version = frame.version ?? "v0.9.1";
          session.sendDataModel = frame.sendDataModel ?? true;
          session.started = true;
          session.active = true;
          session.ready = false;
          const messages = messagesForSession(session.version, {
            sendDataModel: session.sendDataModel,
          });
          messages.forEach((message, index) => {
            const timer = setTimeout(() => {
              session.timers.delete(timer);
              if (!session.active) return;
              if (index === messages.length - 1) session.ready = true;
              send(message);
            }, index * delayMs);
            session.timers.add(timer);
          });
        } else if (!session.started) {
          error("Start the demo session first");
        } else if (frame.command === "delete") {
          cancel();
          session.active = false;
          session.ready = false;
          send({ ...deleteMessage, version: session.version });
        } else if (
          ["recreate", "without-theme", "opt-out"].includes(frame.command)
        ) {
          cancel();
          if (session.active)
            send({ ...deleteMessage, version: session.version });
          session.sendDataModel = frame.command !== "opt-out";
          session.active = true;
          session.ready = true;
          messagesForSession(session.version, {
            sendDataModel: session.sendDataModel,
            themed: frame.command !== "without-theme",
          }).forEach(send);
        } else if (frame.command === "invalid-theme" && session.ready) {
          cancel();
          session.active = false;
          session.ready = false;
          send({ ...deleteMessage, version: session.version });
          send(invalidThemeMessage(session.version));
        } else if (
          ["invalid-path", "restore-path"].includes(frame.command) &&
          session.ready
        ) {
          send(
            inputBindingMessage(
              session.version,
              frame.command === "invalid-path" ? "/items/length" : "/record/",
            ),
          );
        } else if (frame.command === "recover" && session.ready) {
          recoveryMessages.forEach((message) =>
            send({ ...message, version: session.version }),
          );
        } else {
          error("Unsupported command or inactive surface");
        }
      } else if (frame.type === "action" || frame.type === "chat") {
        if (!session.ready || frame.version !== session.version)
          return error("Inactive surface or wrong wire version");
        let value;
        if (frame.type === "action") {
          const action = frame.action;
          if (
            !action ||
            action.name !== "submit_demo" ||
            action.surfaceId !== SURFACE_ID ||
            action.sourceComponentId !== "button" ||
            typeof action.timestamp !== "string" ||
            !/^\d{4}-\d{2}-\d{2}T/.test(action.timestamp) ||
            !Number.isFinite(Date.parse(action.timestamp)) ||
            typeof action.context?.value !== "string" ||
            action.context.value.length > 4096
          ) {
            return error("Invalid demo action");
          }
          value = action.context.value;
        } else if (
          typeof frame.text !== "string" ||
          !frame.text.trim() ||
          frame.text.length > 4096
        ) {
          return error("Invalid demo chat message");
        }
        const metadata = frame.metadata?.a2uiClientDataModel;
        if (session.sendDataModel) {
          const model = metadata?.surfaces?.[SURFACE_ID];
          if (
            !metadata ||
            metadata.version !== session.version ||
            Object.keys(metadata).some(
              (key) => !["version", "surfaces"].includes(key),
            ) ||
            !metadata.surfaces ||
            Array.isArray(metadata.surfaces) ||
            Object.keys(metadata.surfaces).length !== 1 ||
            typeof model?.record?.[""] !== "string" ||
            model.record[""].length > 4096 ||
            model.record.keep !== "Preserved sibling" ||
            !Array.isArray(model.items) ||
            (frame.type === "action" && value !== model.record[""])
          ) {
            return error("Missing or invalid current model metadata");
          }
          reply(
            `${frame.type} | model: ${model.record[""]} | sibling: ${model.record.keep}`,
          );
        } else {
          if (metadata !== undefined)
            return error("Metadata must be omitted for an opted-out surface");
          reply(`${frame.type} | metadata omitted (surface opted out)`);
        }
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
