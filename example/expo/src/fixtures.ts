import type { A2UIMessage } from "a2ui-react-native-renderer";

import { FIXTURE_CATALOG_ID } from "./catalog";

export const SIMPLE_SURFACE_ID = "simple";
export const INTERACTIVE_SURFACE_ID = "interactive";
export const STREAMING_SURFACE_ID = "streaming";
export const ERROR_SURFACE_ID = "error";

export const simpleMessages = [
  createSurface(SIMPLE_SURFACE_ID),
  {
    version: "v0.9",
    updateComponents: {
      surfaceId: SIMPLE_SURFACE_ID,
      components: [
        {
          id: "root",
          component: "Column",
          appearance: "card",
          children: ["title", "body"],
        },
        {
          id: "title",
          component: "Text",
          variant: "title",
          text: "Simple rendering",
        },
        {
          id: "body",
          component: "Text",
          text: "This surface came from official A2UI v0.9 messages.",
        },
      ],
    },
  },
] satisfies readonly A2UIMessage[];

export const interactiveMessages = [
  createSurface(INTERACTIVE_SURFACE_ID),
  {
    version: "v0.9",
    updateDataModel: {
      surfaceId: INTERACTIVE_SURFACE_ID,
      value: { draft: "Edit this bound value" },
    },
  },
  {
    version: "v0.9",
    updateComponents: {
      surfaceId: INTERACTIVE_SURFACE_ID,
      components: [
        {
          id: "root",
          component: "Column",
          appearance: "card",
          children: ["title", "input", "button"],
        },
        {
          id: "title",
          component: "Text",
          variant: "title",
          text: "Bindings and actions",
        },
        {
          id: "input",
          component: "Input",
          value: { path: "/draft" },
          placeholder: "Action value",
        },
        {
          id: "button",
          component: "Button",
          label: "Dispatch action",
          action: {
            event: {
              name: "submit_fixture",
              context: { value: { path: "/draft" } },
            },
          },
        },
      ],
    },
  },
] satisfies readonly A2UIMessage[];

export const streamingMessages = [
  createSurface(STREAMING_SURFACE_ID),
  {
    version: "v0.9",
    updateDataModel: {
      surfaceId: STREAMING_SURFACE_ID,
      value: {
        headline: "Streaming complete",
        detail: "createSurface, data, and components arrived separately.",
      },
    },
  },
  {
    version: "v0.9",
    updateComponents: {
      surfaceId: STREAMING_SURFACE_ID,
      components: [
        {
          id: "root",
          component: "Column",
          appearance: "card",
          children: ["title", "detail"],
        },
        {
          id: "title",
          component: "Text",
          variant: "title",
          text: { path: "/headline" },
        },
        {
          id: "detail",
          component: "Text",
          variant: "caption",
          text: { path: "/detail" },
        },
      ],
    },
  },
] satisfies readonly A2UIMessage[];

export const invalidSurfaceMessages = [
  createSurface(ERROR_SURFACE_ID),
  {
    version: "v0.9",
    updateComponents: {
      surfaceId: ERROR_SURFACE_ID,
      components: [{ id: "root", component: "UnsupportedFixture" }],
    },
  },
] satisfies readonly A2UIMessage[];

export const recoveredSurfaceMessages = [
  createSurface(ERROR_SURFACE_ID),
  {
    version: "v0.9",
    updateComponents: {
      surfaceId: ERROR_SURFACE_ID,
      components: [
        {
          id: "root",
          component: "Column",
          appearance: "card",
          children: ["title", "body"],
        },
        {
          id: "title",
          component: "Text",
          variant: "title",
          text: "Surface recovered",
        },
        {
          id: "body",
          component: "Text",
          text: "A later valid revision replaced the failed surface.",
        },
      ],
    },
  },
] satisfies readonly A2UIMessage[];

export function deleteSurfaceMessage(surfaceId: string): A2UIMessage {
  return { version: "v0.9", deleteSurface: { surfaceId } };
}

function createSurface(surfaceId: string): A2UIMessage {
  return {
    version: "v0.9",
    createSurface: { surfaceId, catalogId: FIXTURE_CATALOG_ID },
  };
}
