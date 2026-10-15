export function equalPresenterValues(left: unknown, right: unknown): boolean {
  let remaining = 10_000;
  const visitedLeft = new WeakSet();
  const visitedRight = new WeakSet();

  function compare(a: unknown, b: unknown, depth: number): boolean {
    if (--remaining < 0 || depth > 64) return false;
    if (
      typeof a !== "object" ||
      a === null ||
      typeof b !== "object" ||
      b === null
    )
      return Object.is(a, b);
    const prototype: unknown = Object.getPrototypeOf(a);
    if (
      prototype !== Object.getPrototypeOf(b) ||
      (prototype !== Object.prototype &&
        prototype !== Array.prototype &&
        prototype !== null)
    )
      return false;
    // A mutable shared object cannot provide an immutable previous value.
    if (a === b && !Object.isFrozen(a)) return false;
    if (visitedLeft.has(a) || visitedRight.has(b)) return false;
    visitedLeft.add(a);
    visitedRight.add(b);
    const keys = Reflect.ownKeys(a);
    const otherKeys = Reflect.ownKeys(b);
    if (keys.length !== otherKeys.length || keys.length > remaining)
      return false;
    return keys.every((key, index) => {
      if (key !== otherKeys[index]) return false;
      const first = Object.getOwnPropertyDescriptor(a, key);
      const second = Object.getOwnPropertyDescriptor(b, key);
      return (
        first !== undefined &&
        second !== undefined &&
        "value" in first &&
        "value" in second &&
        first.enumerable === second.enumerable &&
        first.configurable === second.configurable &&
        first.writable === second.writable &&
        compare(first.value, second.value, depth + 1)
      );
    });
  }

  return compare(left, right, 0);
}
