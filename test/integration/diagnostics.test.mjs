import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import TestRenderer, { act } from "react-test-renderer";

import { A2UIErrorBoundary } from "../../lib/module/errors/ErrorBoundary.js";
import {
  formatA2UIDiagnostic,
  shouldShowDevelopmentDiagnostics,
} from "../../lib/module/errors/diagnostics.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

test("formats diagnostics without exposing messages, causes, or control characters", () => {
  const diagnostic = formatA2UIDiagnostic({
    code: "PRESENTER_ERROR",
    message: "secret message",
    severity: "error",
    surfaceId: "main\nforged",
    catalogId: "urn:example:catalog",
    componentId: "root",
    path: "/private/value",
    cause: new Error("secret cause"),
  });

  assert.equal(
    diagnostic,
    "A2UI PRESENTER_ERROR | surface=main forged | catalog=urn:example:catalog | component=root | path=/private/value",
  );
  assert.equal(diagnostic.includes("secret"), false);
});

test("resolves explicit and React Native development diagnostic modes", () => {
  const previous = globalThis.__DEV__;
  globalThis.__DEV__ = true;

  try {
    assert.equal(shouldShowDevelopmentDiagnostics("auto"), true);
    assert.equal(shouldShowDevelopmentDiagnostics("development"), true);
    assert.equal(shouldShowDevelopmentDiagnostics("production"), false);
  } finally {
    globalThis.__DEV__ = previous;
  }
});

test("contains render failures, reports once, and recovers after reset", async () => {
  const errors = [];
  const Broken = () => {
    throw new Error("presenter exploded");
  };

  let renderer;
  await act(() => {
    renderer = TestRenderer.create(
      React.createElement(
        A2UIErrorBoundary,
        {
          resetKey: 1,
          createError: (cause) => ({
            code: "PRESENTER_ERROR",
            message: "A2UI presenter failed to render",
            severity: "error",
            surfaceId: "main",
            componentId: "root",
            cause,
          }),
          reportError: (error) => errors.push(error),
          renderFallback: (error) =>
            React.createElement("Diagnostic", null, error.code),
        },
        React.createElement(Broken),
      ),
    );
  });

  assert.equal(errors.length, 1);
  assert.equal(errors[0].code, "PRESENTER_ERROR");
  assert.deepEqual(renderer.toJSON(), {
    type: "Diagnostic",
    props: {},
    children: ["PRESENTER_ERROR"],
  });

  await act(() => {
    renderer.update(
      React.createElement(
        A2UIErrorBoundary,
        {
          resetKey: 2,
          createError: () => {
            throw new Error("must not run");
          },
          reportError: () => {
            throw new Error("must not run");
          },
          renderFallback: () => null,
        },
        React.createElement("Recovered", null, "Ready"),
      ),
    );
  });

  assert.deepEqual(renderer.toJSON(), {
    type: "Recovered",
    props: {},
    children: ["Ready"],
  });
});
