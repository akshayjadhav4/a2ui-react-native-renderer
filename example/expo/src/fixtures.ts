import type { A2UIMessage } from "a2ui-react-native-renderer";

import { FIXTURE_CATALOG_ID } from "./catalog";

export const simpleMessages = [
  {
    version: "v0.9",
    createSurface: {
      surfaceId: "simple",
      catalogId: FIXTURE_CATALOG_ID,
    },
  },
  {
    version: "v0.9",
    updateComponents: {
      surfaceId: "simple",
      components: [
        {
          id: "root",
          component: "Text",
          text: "Hello from an Expo SDK 57 consumer.",
        },
      ],
    },
  },
] satisfies readonly A2UIMessage[];
