import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { createRequire } from "node:module";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { createDemoServer } from "../../example/server/server.mjs";
import { createA2UITestHarness } from "../../lib/module/testing.js";
import { A2UISurface } from "../../lib/module/index.js";
import { demoCatalog } from "./helpers/demo-catalog.mjs";
import { SURFACE_ID, initialMessages } from "../../example/server/fixtures.mjs";
const WebSocket = createRequire(
  new URL("../../example/server/package.json", import.meta.url),
)("ws");
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function connect(url) {
  const socket = new WebSocket(url);
  const frames = [];
  socket.on("message", (data) => frames.push(JSON.parse(data.toString())));
  await once(socket, "open");
  return {
    socket,
    frames,
    send: (value) => socket.send(JSON.stringify(value)),
    async wait(predicate) {
      const deadline = AbortSignal.timeout(3000);
      while (!predicate(frames))
        await once(socket, "message", { signal: deadline });
      return frames;
    },
  };
}

test(
  "real socket streams progressive messages and replies to a mounted action",
  { timeout: 10000 },
  async () => {
    const server = await createDemoServer({ port: 0, delayMs: 5 });
    const harness = createA2UITestHarness({ catalogs: [demoCatalog] });
    let client, renderer;
    try {
      client = await connect(server.url);
      client.send({ type: "command", command: "start" });
      await client.wait((frames) => frames.length === initialMessages.length);
      assert.deepEqual(client.frames, initialMessages);
      harness.engine.applyMessage(client.frames[0]);
      assert.equal(harness.engine.getSurface(SURFACE_ID).rootId, null);
      harness.engine.applyMessages(client.frames.slice(1, 3));
      assert.equal(
        harness.engine.getSurface(SURFACE_ID).pendingComponentIds.length,
        5,
      );
      harness.engine.applyMessages(client.frames.slice(3));
      await act(() => {
        renderer = TestRenderer.create(
          React.createElement(A2UISurface, {
            engine: harness.engine,
            surfaceId: SURFACE_ID,
          }),
        );
      });
      await act(() =>
        renderer.root.findByType("Input").props.onChange("Network edit"),
      );
      await act(() => renderer.root.findByType("Button").props.onPress());
      client.send({
        type: "action",
        version: "v0.9.1",
        action: harness.getActions()[0],
        metadata: {
          a2uiClientDataModel: harness.engine.getClientDataModel([SURFACE_ID]),
        },
      });
      await client.wait((f) => f.length === initialMessages.length + 1);
      await act(() => harness.engine.applyMessage(client.frames.at(-1)));
      assert.equal(
        harness.engine.getSurface(SURFACE_ID).dataModel.response,
        "Received: action | model: Network edit | sibling: Preserved sibling",
      );
      client.send({ type: "command", command: "recover" });
      await client.wait((f) => f.length === initialMessages.length + 3);
      await act(() => harness.engine.applyMessages(client.frames.slice(-2)));
      assert.equal(harness.engine.getErrors().length, 1);
      assert.equal(
        harness.engine.getSurface(SURFACE_ID).dataModel.response,
        "Recovered after invalid message",
      );
      client.send({ type: "command", command: "delete" });
      await client.wait((f) => f.at(-1).deleteSurface);
      await act(() => harness.engine.applyMessage(client.frames.at(-1)));
      assert.equal(renderer.toJSON(), null);
    } finally {
      if (renderer) await act(() => renderer.unmount());
      harness.engine.dispose();
      client?.socket.terminate();
      await server.close();
    }
  },
);

test(
  "server rejects invalid inputs and isolates connection sessions",
  { timeout: 10000 },
  async () => {
    const server = await createDemoServer({ port: 0, delayMs: 0 });
    let one, two;
    try {
      one = await connect(server.url);
      two = await connect(server.url);
      for (const raw of [
        "{",
        JSON.stringify({ type: "command", command: "bad" }),
        JSON.stringify({ type: "action", action: {} }),
      ]) {
        const before = one.frames.length;
        one.socket.send(raw);
        await one.wait((f) => f.length === before + 1);
        assert.equal(one.frames.at(-1).type, "demoError");
      }
      one.socket.send(Buffer.from("binary"));
      await one.wait((f) => f.length === 4);
      assert.equal(one.frames.at(-1).type, "demoError");
      one.send({ type: "command", command: "start" });
      await one.wait((f) => f.length === 4 + initialMessages.length);
      one.send({ type: "command", command: "start" });
      await one.wait((f) => f.length === 5 + initialMessages.length);
      assert.equal(one.frames.at(-1).type, "demoError");
      assert.deepEqual(two.frames, []);
      two.send({ type: "command", command: "start" });
      await two.wait((f) => f.length === initialMessages.length);
      assert.deepEqual(two.frames, initialMessages);
      const before = one.frames.length;
      one.send({
        type: "action",
        action: {
          name: "submit_demo",
          surfaceId: SURFACE_ID,
          sourceComponentId: "button",
          timestamp: new Date().toISOString(),
          context: { value: 42 },
        },
      });
      await one.wait((f) => f.length === before + 1);
      assert.equal(one.frames.at(-1).type, "demoError");
    } finally {
      one?.socket.terminate();
      two?.socket.terminate();
      await server.close();
    }
  },
);

test(
  "delete cancels pending sends; disconnect and shutdown release sessions",
  { timeout: 10000 },
  async () => {
    const server = await createDemoServer({ port: 0, delayMs: 1000 });
    let client;
    try {
      client = await connect(server.url);
      client.send({ type: "command", command: "start" });
      await client.wait((f) => f.length === 1);
      client.send({ type: "command", command: "delete" });
      await client.wait((f) => f.at(-1).deleteSurface);
      client.send({ type: "command", command: "recover" });
      await client.wait((f) => f.at(-1).type === "demoError");
      assert.equal(server.getPendingCount(), 0);
      client.socket.close();
      await once(client.socket, "close");
      assert.equal(server.getPendingCount(), 0);
      client = await connect(server.url);
      client.send({ type: "command", command: "start" });
      await client.wait((f) => f.length === 1);
      const closed = once(client.socket, "close");
      await server.close();
      await closed;
      assert.equal(server.getPendingCount(), 0);
    } finally {
      client?.socket.terminate();
      await server.close();
    }
  },
);

test(
  "oversized frames close only the offending connection",
  { timeout: 10000 },
  async () => {
    const server = await createDemoServer({ port: 0 });
    let client;
    try {
      client = await connect(server.url);
      const closed = once(client.socket, "close");
      client.socket.send("x".repeat(20000));
      const [code] = await closed;
      assert.equal(code, 1009);
      client = await connect(server.url);
      client.send({ type: "command", command: "bad" });
      await client.wait((f) => f.length === 1);
      assert.equal(client.frames[0].type, "demoError");
    } finally {
      client?.socket.terminate();
      await server.close();
    }
  },
);

for (const version of ["v0.9", "v0.9.1"]) {
  test(
    `${version} demo round trips metadata, themes, pointer errors and lifecycle recovery`,
    { timeout: 10000 },
    async () => {
      const server = await createDemoServer({ port: 0, delayMs: 0 });
      const harness = createA2UITestHarness({ catalogs: [demoCatalog] });
      let client, renderer;
      try {
        client = await connect(server.url);
        client.send({ type: "command", command: "start", version });
        await client.wait((frames) => frames.length === initialMessages.length);
        harness.engine.applyMessages(client.frames);
        assert.equal(harness.engine.getSurface(SURFACE_ID).version, version);
        assert.deepEqual(harness.engine.getSurface(SURFACE_ID).theme, {
          primaryColor: "#0f766e",
        });
        await act(() => {
          renderer = TestRenderer.create(
            React.createElement(A2UISurface, {
              engine: harness.engine,
              surfaceId: SURFACE_ID,
            }),
          );
        });
        await act(() =>
          renderer.root.findByType("Input").props.onChange("Edited form"),
        );
        const sendChat = () =>
          client.send({
            type: "chat",
            version,
            text: "Confirm form",
            metadata: {
              a2uiClientDataModel: harness.engine.getClientDataModel([
                SURFACE_ID,
              ]),
            },
          });
        let count = client.frames.length;
        sendChat();
        await client.wait((f) => f.length === count + 1);
        assert.match(
          client.frames.at(-1).updateDataModel?.value ?? "",
          /model: Edited form.*sibling: Preserved sibling/,
        );
        await act(() => harness.engine.applyMessage(client.frames.at(-1)));
        for (const invalidFrame of [
          {
            type: "chat",
            version,
            text: "Extra surface",
            metadata: {
              a2uiClientDataModel: {
                version,
                surfaces: {
                  ...harness.engine.getClientDataModel([SURFACE_ID]).surfaces,
                  foreign: { secret: "must not be accepted" },
                },
              },
            },
          },
          {
            type: "chat",
            version: version === "v0.9" ? "v0.9.1" : "v0.9",
            text: "Wrong version",
          },
        ]) {
          count = client.frames.length;
          client.send(invalidFrame);
          await client.wait((f) => f.length === count + 1);
          assert.equal(client.frames.at(-1).type, "demoError");
        }
        const command = async (name, expected = 1) => {
          const before = client.frames.length;
          client.send({ type: "command", command: name });
          await client.wait((f) => f.length === before + expected);
          await act(() =>
            harness.engine.applyMessages(client.frames.slice(before)),
          );
        };
        await command("invalid-path");
        assert.equal(harness.engine.getErrors().at(-1).code, "BINDING_ERROR");
        await command("restore-path");
        assert.equal(
          renderer.root.findByType("Input").props.value,
          "Edited form",
        );
        assert.equal(
          harness.engine.getSurface(SURFACE_ID).dataModel.record.keep,
          "Preserved sibling",
        );
        await command("invalid-theme", 2);
        assert.equal(harness.engine.getSurface(SURFACE_ID), undefined);
        assert.equal(harness.engine.getErrors().at(-1).code, "INVALID_MESSAGE");
        await command("recreate", initialMessages.length);
        assert.equal(harness.engine.getSurface(SURFACE_ID).sendDataModel, true);
        assert.deepEqual(harness.engine.getSnapshot().failedSurfaceIds, []);
        await command("without-theme", initialMessages.length + 1);
        assert.equal(harness.engine.getSurface(SURFACE_ID).theme, undefined);
        await command("opt-out", initialMessages.length + 1);
        assert.equal(
          harness.engine.getClientDataModel([SURFACE_ID]),
          undefined,
        );
        count = client.frames.length;
        client.send({ type: "chat", version, text: "Confirm without model" });
        await client.wait((f) => f.length === count + 1);
        assert.match(
          client.frames.at(-1).updateDataModel?.value ?? "",
          /metadata omitted/,
        );
        await command("delete");
        await command("delete");
        assert.equal(harness.engine.getErrors().at(-1).code, "INVALID_MESSAGE");
        await command("recreate", initialMessages.length);
        assert.equal(harness.engine.getSurface(SURFACE_ID).sendDataModel, true);
        count = client.frames.length;
        client.send({ type: "chat", version, text: "Missing metadata" });
        await client.wait((f) => f.length === count + 1);
        assert.equal(client.frames.at(-1).type, "demoError");
      } finally {
        if (renderer) await act(() => renderer.unmount());
        harness.engine.dispose();
        client?.socket.terminate();
        await server.close();
      }
    },
  );
}
