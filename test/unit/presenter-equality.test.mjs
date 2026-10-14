import assert from "node:assert/strict";
import test from "node:test";
import { equalPresenterValues } from "../../lib/module/rendering/equalPresenterValues.js";

test("compares nested values and preserves callback identity", () => {
  const callback = () => {};
  assert.equal(
    equalPresenterValues(
      { rows: [{ value: undefined, setValue: callback }] },
      { rows: [{ value: undefined, setValue: callback }] },
    ),
    true,
  );
  assert.equal(
    equalPresenterValues({ callback }, { callback: () => {} }),
    false,
  );
  assert.equal(equalPresenterValues({ a: undefined }, {}), false);
  assert.equal(equalPresenterValues([, "A"], [undefined, "A"]), false);
  assert.equal(equalPresenterValues(NaN, NaN), true);
  assert.equal(equalPresenterValues(0, -0), false);
});

test("includes symbol keys and observable property order", () => {
  const key = Symbol("value");
  assert.equal(equalPresenterValues({ [key]: 1 }, { [key]: 2 }), false);
  assert.equal(equalPresenterValues({ a: 1, b: 2 }, { b: 2, a: 1 }), false);
});

test("does not evaluate accessors or equate unusual objects", () => {
  let reads = 0;
  const value = {
    get text() {
      reads++;
      return "A";
    },
  };
  assert.equal(equalPresenterValues(value, { text: "A" }), false);
  assert.equal(reads, 0);
  assert.equal(equalPresenterValues(new Date(0), new Date(0)), false);
  assert.equal(equalPresenterValues(new Map(), new Map()), false);
});

test("cycles, alias changes, and large traversals fall back to rerendering", () => {
  const left = {};
  left.self = left;
  const right = {};
  right.self = right;
  assert.equal(equalPresenterValues(left, right), false);
  const shared = { a: 1 };
  assert.equal(
    equalPresenterValues(
      { x: shared, y: shared },
      { x: { a: 1 }, y: { a: 1 } },
    ),
    false,
  );
  assert.equal(
    equalPresenterValues(Array(12000).fill(1), Array(12000).fill(1)),
    false,
  );
  let a = {};
  let b = {};
  for (let depth = 0; depth < 100; depth++) {
    a = { a };
    b = { a: b };
  }
  assert.equal(equalPresenterValues(a, b), false);
});
