import { describe, it } from "node:test";
import * as assert from "node:assert";
import { AudioSource } from "../../../ecs/index.js";

describe("AudioSource", () => {
  it("is a tag component with no schema", () => {
    assert.strictEqual(AudioSource.schema, undefined);
  });
});
