import assert from "node:assert/strict";
import test from "node:test";

import { z } from "zod";

import { defineA2UIFunction } from "../../lib/module/index.js";
import {
  A2UIFunctionInvocationError,
  evaluateA2UIFunction,
} from "../../lib/module/protocol/v0_9/functions.js";

const formatCount = defineA2UIFunction({
  name: "formatCount",
  args: z.object({ count: z.number(), suffix: z.string() }),
  returns: "string",
  execute: ({ count, suffix }) => `${count} ${suffix}`,
});

test("validates arguments and evaluates bound consumer functions", () => {
  const result = evaluateA2UIFunction({
    call: {
      call: "formatCount",
      args: { count: { path: "count" }, suffix: "items" },
      returnType: "string",
    },
    functions: [formatCount],
    dataModel: { rows: [{ count: 3 }] },
    scopePath: "/rows/0",
  });

  assert.equal(result, "3 items");
});

test("supports nested consumer function calls", () => {
  const double = defineA2UIFunction({
    name: "double",
    args: z.object({ value: z.number() }),
    returns: "number",
    execute: ({ value }) => value * 2,
  });

  const result = evaluateA2UIFunction({
    call: {
      call: "formatCount",
      args: {
        count: {
          call: "double",
          args: { value: { path: "/count" } },
          returnType: "number",
        },
        suffix: "items",
      },
      returnType: "string",
    },
    functions: [formatCount, double],
    dataModel: { count: 2 },
    scopePath: "/",
  });

  assert.equal(result, "4 items");
});

test("accepts a registered function call with omitted optional args", () => {
  const greet = defineA2UIFunction({
    name: "greet",
    args: z.object({}),
    returns: "string",
    execute: () => "Hello",
  });

  assert.equal(
    evaluateA2UIFunction({
      call: { call: "greet", returnType: "string" },
      functions: [greet],
      dataModel: {},
      scopePath: "/",
    }),
    "Hello",
  );
});

test("rejects unknown functions and ships no implicit built-ins", () => {
  for (const functionName of ["missing", "openUrl", "formatCurrency"]) {
    assert.throws(
      () =>
        evaluateA2UIFunction({
          call: {
            call: functionName,
            args: {},
            returnType: "string",
          },
          functions: [],
          dataModel: {},
          scopePath: "/",
        }),
      (error) =>
        error instanceof A2UIFunctionInvocationError &&
        error.functionName === functionName &&
        error.message.includes("Unknown A2UI function"),
    );
  }
});

test("contains invalid arguments, thrown functions, and bad return values", () => {
  const throwing = defineA2UIFunction({
    name: "throwing",
    args: z.object({}),
    returns: "string",
    execute: () => {
      throw new Error("consumer failure");
    },
  });
  const wrongReturn = defineA2UIFunction({
    name: "wrongReturn",
    args: z.object({}),
    returns: "string",
    execute: () => "typed correctly",
  });
  const calls = [
    {
      function: formatCount,
      call: {
        call: "formatCount",
        args: { count: "three", suffix: "items" },
        returnType: "string",
      },
      message: "Invalid arguments",
    },
    {
      function: throwing,
      call: { call: "throwing", args: {}, returnType: "string" },
      message: "failed",
    },
    {
      function: { ...wrongReturn, execute: () => 42 },
      call: { call: "wrongReturn", args: {}, returnType: "string" },
      message: "invalid string value",
    },
  ];

  for (const fixture of calls) {
    assert.throws(
      () =>
        evaluateA2UIFunction({
          call: fixture.call,
          functions: [fixture.function],
          dataModel: {},
          scopePath: "/",
        }),
      (error) =>
        error instanceof A2UIFunctionInvocationError &&
        error.message.includes(fixture.message),
    );
  }
});

test("freezes object and array results", () => {
  const buildResult = defineA2UIFunction({
    name: "buildResult",
    args: z.object({}),
    returns: "object",
    execute: () => ({ items: [{ id: "one" }] }),
  });
  const result = evaluateA2UIFunction({
    call: { call: "buildResult", args: {}, returnType: "object" },
    functions: [buildResult],
    dataModel: {},
    scopePath: "/",
  });

  assert.deepEqual(result, { items: [{ id: "one" }] });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.items), true);
  assert.equal(Object.isFrozen(result.items[0]), true);
});
