import { FIXTURE_CATALOG_ID } from "../expo/src/catalog-contract.mjs";

export const SURFACE_ID = "network-demo";
const version = "v0.9.1";
const components = (items) => ({
  version,
  updateComponents: { surfaceId: SURFACE_ID, components: items },
});

export const initialMessages = [
  {
    version,
    createSurface: { surfaceId: SURFACE_ID, catalogId: FIXTURE_CATALOG_ID },
  },
  {
    version,
    updateDataModel: {
      surfaceId: SURFACE_ID,
      value: {
        draft: "Hello from the app",
        response: "Waiting for your action",
      },
    },
  },
  components([
    {
      id: "root",
      component: "Column",
      appearance: "card",
      children: ["title", "input", "button", "response"],
    },
  ]),
  components([
    {
      id: "title",
      component: "Text",
      variant: "title",
      text: "A2UI over WebSocket",
    },
  ]),
  components([
    {
      id: "input",
      component: "Input",
      value: { path: "/draft" },
      placeholder: "Message to the producer",
    },
    {
      id: "button",
      component: "Button",
      label: "Send action",
      action: {
        event: { name: "submit_demo", context: { value: { path: "/draft" } } },
      },
    },
    {
      id: "response",
      component: "Text",
      text: { path: "/response" },
      variant: "caption",
    },
  ]),
];

export function responseMessage(value) {
  return {
    version,
    updateDataModel: {
      surfaceId: SURFACE_ID,
      path: "/response",
      value: `Received: ${value}`,
    },
  };
}
export const recoveryMessages = [
  {
    version,
    updateDataModel: { surfaceId: SURFACE_ID, path: 42, value: "Rejected" },
  },
  {
    version,
    updateDataModel: {
      surfaceId: SURFACE_ID,
      path: "/response",
      value: "Recovered after invalid message",
    },
  },
];
export const deleteMessage = {
  version,
  deleteSurface: { surfaceId: SURFACE_ID },
};
