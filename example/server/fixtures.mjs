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
    createSurface: {
      surfaceId: SURFACE_ID,
      catalogId: FIXTURE_CATALOG_ID,
      sendDataModel: true,
      theme: { primaryColor: "#0f766e" },
    },
  },
  {
    version,
    updateDataModel: {
      surfaceId: SURFACE_ID,
      value: {
        record: { "": "Hello from the app", keep: "Preserved sibling" },
        items: ["First item"],
        response: "Waiting for your action",
      },
    },
  },
  components([
    {
      id: "root",
      component: "Column",
      appearance: "card",
      children: ["title", "input", "sibling", "button", "response"],
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
      value: { path: "/record/" },
      placeholder: "Message to the producer",
    },
    {
      id: "sibling",
      component: "Text",
      text: { path: "/record/keep" },
      variant: "caption",
    },
    {
      id: "button",
      component: "Button",
      label: "Send action",
      action: {
        event: {
          name: "submit_demo",
          context: { value: { path: "/record/" } },
        },
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

export function messagesForSession(
  wireVersion,
  { sendDataModel = true, themed = true } = {},
) {
  return initialMessages.map((message) => ({
    ...message,
    version: wireVersion,
    ...(message.createSurface
      ? {
          createSurface: {
            surfaceId: SURFACE_ID,
            catalogId: FIXTURE_CATALOG_ID,
            sendDataModel,
            ...(themed ? { theme: { primaryColor: "#0f766e" } } : {}),
          },
        }
      : {}),
  }));
}

export function inputBindingMessage(wireVersion, path) {
  return {
    version: wireVersion,
    updateComponents: {
      surfaceId: SURFACE_ID,
      components: [
        {
          id: "input",
          component: "Input",
          value: { path },
          placeholder: "Message to the producer",
        },
      ],
    },
  };
}

export function invalidThemeMessage(wireVersion) {
  return {
    version: wireVersion,
    createSurface: {
      surfaceId: SURFACE_ID,
      catalogId: FIXTURE_CATALOG_ID,
      sendDataModel: true,
      theme: { primaryColor: 42 },
    },
  };
}
