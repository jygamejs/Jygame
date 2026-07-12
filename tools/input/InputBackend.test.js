import { describe, it } from "node:test";
import * as assert from "node:assert";
import { InputBackend } from "../../input/InputBackend.js";

describe("InputBackend", () => {
  it("has a name getter returning 'abstract'", () => {
    const b = new InputBackend();
    assert.strictEqual(b.name, "abstract");
  });

  it("start and stop are no-ops", () => {
    const b = new InputBackend();
    b.start();
    b.stop();
  });

  it("poll is a no-op", () => {
    const b = new InputBackend();
    b.poll(null);
  });
});
