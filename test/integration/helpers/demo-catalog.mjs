import React from "react";
import { z } from "zod";
import { defineA2UICatalog } from "../../../lib/module/catalog/defineCatalog.js";
import {
  ActionSchema,
  ChildListSchema,
  DynamicStringSchema,
} from "../../../lib/module/protocol/v0_9/commonSchemas.js";
import {
  FIXTURE_CATALOG_ID,
  createDemoSchemas,
} from "../../../example/expo/src/catalog-contract.mjs";

const schemas = createDemoSchemas({
  z,
  A2UIActionSchema: ActionSchema,
  A2UIChildListSchema: ChildListSchema,
  A2UIDynamicStringSchema: DynamicStringSchema,
});
export const demoCatalog = defineA2UICatalog({
  id: FIXTURE_CATALOG_ID,
  components: {
    Column: {
      schema: schemas.ColumnSchema,
      presenter: ({ props, renderChild }) =>
        React.createElement(
          "Column",
          null,
          props.children.map((c) => renderChild(c.id, c.basePath)),
        ),
    },
    Text: {
      schema: schemas.TextSchema,
      presenter: ({ props }) => React.createElement("Text", null, props.text),
    },
    Input: {
      schema: schemas.InputSchema,
      presenter: ({ props }) =>
        React.createElement("Input", {
          value: props.value,
          onChange: props.setValue,
        }),
    },
    Button: {
      schema: schemas.ButtonSchema,
      presenter: ({ props, dispatch }) =>
        React.createElement(
          "Button",
          { onPress: () => dispatch(props.action) },
          props.label,
        ),
    },
  },
});
