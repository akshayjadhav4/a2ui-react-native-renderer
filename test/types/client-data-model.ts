import { z } from "zod";
import {
  createA2UIEngine,
  defineA2UICatalog,
  type A2UIClientDataModel,
} from "a2ui-react-native-renderer";

const catalog = defineA2UICatalog({
  id: "metadata",
  components: {
    Label: { schema: z.object({ text: z.string() }), presenter: () => null },
  },
});
const engine = createA2UIEngine({
  catalogs: [catalog],
  onAction: (action) => {
    action.name.toUpperCase();
  },
});
const data: A2UIClientDataModel | undefined = engine.getClientDataModel([
  "main",
]);
if (data) {
  const version: "v0.9" | "v0.9.1" = data.version;
  void version;
  // @ts-expect-error Prepared metadata is readonly.
  data.version = "v0.9";
  // @ts-expect-error Surface models are readonly.
  data.surfaces.main = {};
  const model = data.surfaces.main;
  if (model) {
    // @ts-expect-error Nested model fields cannot be assigned.
    model.name = "changed";
    const nested = model.address;
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      // @ts-expect-error Nested JSON values remain readonly.
      nested.city = "changed";
    }
  }
}
// @ts-expect-error Explicit selection is required.
engine.getClientDataModel();

type JsonArray = Extract<
  A2UIClientDataModel["surfaces"][string][string],
  readonly unknown[]
>;
function acceptsReadonlyArray(values: JsonArray): void {
  // @ts-expect-error Nested arrays are readonly.
  values.push("changed");
}
void acceptsReadonlyArray;

declare const agent: {
  send(message: {
    content: unknown;
    metadata: { a2uiClientDataModel?: A2UIClientDataModel };
  }): void;
};
const sendingEngine = createA2UIEngine({
  catalogs: [catalog],
  onAction(action) {
    const surface = sendingEngine.getSurface(action.surfaceId);
    if (surface) sendToAgent({ version: surface.version, action });
  },
});
function sendToAgent(content: unknown): void {
  const clientDataModel = sendingEngine.getClientDataModel(
    sendingEngine.getSnapshot().surfaceIds,
  );
  agent.send({
    content,
    metadata: clientDataModel ? { a2uiClientDataModel: clientDataModel } : {},
  });
}
sendToAgent({ text: "Confirm my order" });
