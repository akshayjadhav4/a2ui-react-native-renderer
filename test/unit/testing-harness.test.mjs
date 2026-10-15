import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { createA2UITestHarness } from "../../lib/module/testing.js";

const catalog = {
  id: "urn:test:harness",
  components: {
    Text: { schema: z.object({ text: z.string() }), presenter: null },
  },
  functions: [],
};
const messages = (version = "v0.9.1") => [
  { version, createSurface: { surfaceId: "form", catalogId: catalog.id } },
  {
    version,
    updateComponents: {
      surfaceId: "form",
      components: [{ id: "root", component: "Text", text: "Hello" }],
    },
  },
];

for (const version of ["v0.9", "v0.9.1"]) {
  test(`harness ingests ${version} with real recovery and subscriptions`, () => {
    const harness = createA2UITestHarness({ catalogs: [catalog] });
    let notifications = 0;
    const unsubscribe = harness.engine.subscribe(() => notifications++);
    try {
      harness.engine.applyMessages([
        ...messages(version),
        { version: "invalid" },
        {
          version,
          updateDataModel: { surfaceId: "form", value: { title: "Recovered" } },
        },
      ]);
      assert.equal(
        harness.engine.getSurface("form").components.root.props.text,
        "Hello",
      );
      assert.equal(
        harness.engine.getSurface("form").dataModel.title,
        "Recovered",
      );
      assert.equal(harness.engine.getErrors()[0].code, "UNSUPPORTED_VERSION");
      assert.equal(notifications, 1);
      assert.deepEqual(harness.getActions(), []);
      unsubscribe();
      harness.engine.dispose();
      assert.equal(harness.engine.getSurface("form"), undefined);
      harness.engine.applyMessages(messages(version));
      assert.equal(harness.engine.getSurface("form"), undefined);
    } finally {
      unsubscribe();
      harness.engine.dispose();
    }
  });
}

test("harness instances isolate surfaces and preserve configured limits", () => {
  const first = createA2UITestHarness({ catalogs: [catalog] });
  const second = createA2UITestHarness({
    catalogs: [catalog],
    limits: { maxMessagesPerBatch: 1 },
  });
  try {
    first.engine.applyMessages(messages());
    second.engine.applyMessages(messages());
    assert.ok(first.engine.getSurface("form"));
    assert.equal(second.engine.getSurface("form"), undefined);
    assert.equal(second.engine.getErrors()[0].code, "RESOURCE_LIMIT_EXCEEDED");
    assert.deepEqual(first.engine.getErrors(), []);
    assert.notEqual(first.getActions(), second.getActions());
  } finally {
    first.engine.dispose();
    second.engine.dispose();
  }
});
