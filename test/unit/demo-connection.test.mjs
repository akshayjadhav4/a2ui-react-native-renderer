import assert from "node:assert/strict";
import test from "node:test";
import { createDemoConnection } from "../../example/expo/src/demo-connection.mjs";

class FakeSocket {
  readyState = 0;
  onopen = null;
  onmessage = null;
  onerror = null;
  onclose = null;
  sent = [];
  closes = 0;
  send(value) {
    if (this.failSend) throw new Error("Send failed");
    this.sent.push(JSON.parse(value));
  }
  close() {
    this.closes++;
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  receive(data) {
    this.onmessage?.({ data });
  }
}
function fixture(createSocket) {
  const socket = new FakeSocket(),
    states = [],
    errors = [],
    messages = [];
  const connection = createDemoConnection({
    url: "ws://example",
    createSocket: createSocket ?? (() => socket),
    onState: (s) => states.push(s),
    onError: (e) => errors.push(e),
    onMessage: (m) => messages.push(m),
  });
  return { socket, states, errors, messages, connection };
}

test("app connection forwards messages and separates parse, demo and socket errors", () => {
  const f = fixture();
  assert.equal(f.connection.send({ type: "action" }), false);
  f.socket.open();
  assert.deepEqual(f.socket.sent, [
    {
      type: "command",
      command: "start",
      version: "v0.9.1",
      sendDataModel: true,
    },
  ]);
  f.socket.receive('{"version":"v0.9.1"}');
  assert.deepEqual(f.messages, [{ version: "v0.9.1" }]);
  f.socket.receive("{");
  f.socket.receive(new Uint8Array([1]));
  f.socket.receive('{"type":"demoError","message":"Rejected"}');
  f.socket.onerror({});
  assert.equal(f.errors.length, 5);
  assert.equal(f.messages.length, 1);
  f.socket.failSend = true;
  assert.equal(
    f.connection.send({ type: "command", command: "delete" }),
    false,
  );
  f.socket.onclose({});
  assert.deepEqual(f.states, ["connecting", "open", "closed"]);
  f.connection.close();
});

test("retirement blocks saved callbacks and late messages from old sessions", () => {
  const old = fixture();
  const saved = {
    open: old.socket.onopen,
    message: old.socket.onmessage,
    error: old.socket.onerror,
    close: old.socket.onclose,
  };
  old.connection.close();
  old.connection.close();
  const next = fixture();
  next.socket.open();
  saved.open({});
  saved.message({ data: '{"version":"late"}' });
  saved.error({});
  saved.close({});
  assert.deepEqual(old.messages, []);
  assert.deepEqual(old.states, ["connecting"]);
  assert.deepEqual(old.errors, []);
  assert.equal(old.socket.closes, 1);
  assert.equal(old.socket.onmessage, null);
  assert.deepEqual(next.states, ["connecting", "open"]);
  assert.equal(old.connection.send({}), false);
  next.connection.close();
});

test("constructor and close failures do not escape UI callbacks", () => {
  const f = fixture(() => {
    throw new Error("Bad URL");
  });
  assert.deepEqual(f.states, ["connecting", "closed"]);
  assert.match(f.errors[0], /Bad URL/);
  assert.equal(f.connection.send({}), false);
  assert.doesNotThrow(() => f.connection.close());
  const other = fixture();
  other.socket.close = () => {
    throw new Error("Closed");
  };
  assert.doesNotThrow(() => other.connection.close());
});

test("connection sends the chosen version and opt-in policy at session start", () => {
  const socket = new FakeSocket();
  const connection = createDemoConnection({
    url: "ws://example",
    version: "v0.9",
    sendDataModel: false,
    createSocket: () => socket,
    onMessage: () => {},
    onState: () => {},
    onError: () => {},
  });
  socket.open();
  assert.deepEqual(socket.sent, [
    {
      type: "command",
      command: "start",
      version: "v0.9",
      sendDataModel: false,
    },
  ]);
  connection.close();
});
