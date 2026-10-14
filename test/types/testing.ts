import { z } from "zod";
import {
  createA2UITestHarness,
  type A2UITestHarness,
  type A2UITestHarnessOptions,
} from "../../src/testing.js";
import { defineA2UICatalog, type A2UIUserAction } from "../../src/index.js";

const catalog = defineA2UICatalog({
  id: "urn:test:harness",
  components: {
    Text: { schema: z.object({ text: z.string() }), presenter: () => null },
  },
});
const options: A2UITestHarnessOptions = {
  catalogs: [catalog],
  limits: { maxMessagesPerBatch: 5 },
};
const harness: A2UITestHarness = createA2UITestHarness(options);
const actions: readonly A2UIUserAction[] = harness.getActions();
// @ts-expect-error The action list cannot be appended to.
actions.push(actions[0]);
// @ts-expect-error The harness owns its action callback.
createA2UITestHarness({ catalogs: [catalog], onAction: () => {} });
// @ts-expect-error Catalog configuration is required.
createA2UITestHarness({});
harness.engine.dispose();
