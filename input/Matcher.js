export const MATCHER = Symbol("InputMatcher");

export function createMatcher(predicate) {
  if (typeof predicate !== "function") {
    throw new TypeError("Input.match() expects a function predicate");
  }
  return {
    [MATCHER]: true,
    predicate,
  };
}

export function isMatcher(obj) {
  return !!obj && obj[MATCHER] === true && typeof obj.predicate === "function";
}
