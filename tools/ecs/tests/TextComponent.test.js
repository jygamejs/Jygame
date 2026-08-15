import { describe, it } from "node:test";
import * as assert from "node:assert";
import { World } from "../../../ecs/core/World.js";
import { Transform } from "../../../ecs/components/Transform.js";
import { Text } from "../../../ecs/components/Text.js";

function createWorld() {
  const world = new World();
  world.register(Transform);
  world.register(Text);
  return world;
}

describe("Text component", () => {
  it("add/remove moves the entity between archetypes", () => {
    const world = createWorld();
    const e = world.createEntity();

    const emptyKey = world.archetypeSystem.entitySignature(e).key;
    world.add(e, Text);
    const textKey = world.archetypeSystem.entitySignature(e).key;
    assert.notStrictEqual(textKey, emptyKey);
    assert.strictEqual(world.has(e, Text), true);
    assert.ok(world.archetypeSystem.entitySignature(e).contains(world.registry.getId(Text)));

    world.remove(e, Text);
    assert.strictEqual(world.has(e, Text), false);
    assert.strictEqual(world.archetypeSystem.entitySignature(e).contains(world.registry.getId(Text)), false);
  });

  it("composes with Transform in the same archetype", () => {
    const world = createWorld();
    const e = world.createEntity();
    world.addMany(e, Transform, Text);
    const sig = world.archetypeSystem.entitySignature(e);
    assert.ok(sig.contains(world.registry.getId(Transform)));
    assert.ok(sig.contains(world.registry.getId(Text)));
  });

  it("defaults numeric fields to 0", () => {
    const world = createWorld();
    const e = world.createEntity();
    world.add(e, Text);
    const view = world.get(e, Text);
    assert.strictEqual(view.fontHandle, 0);
    assert.strictEqual(view.contentHandle, 0);
    assert.strictEqual(view.align, 0);
    assert.strictEqual(view.letterSpacing, 0);
    assert.strictEqual(view.version, 0);
  });

  it("round-trips fields through world.set/get", () => {
    const world = createWorld();
    const e = world.createEntity();
    world.add(e, Text);
    world.set(e, Text, {
      fontHandle: 42,
      contentHandle: 0x10001,
      align: 2,
      letterSpacing: 1.5,
      version: 7,
    });
    const view = world.get(e, Text);
    assert.strictEqual(view.fontHandle, 42);
    assert.strictEqual(view.contentHandle, 0x10001);
    assert.strictEqual(view.align, 2);
    assert.strictEqual(view.letterSpacing, 1.5);
    assert.strictEqual(view.version, 7);
  });

  it("writes through the component view", () => {
    const world = createWorld();
    const e = world.createEntity();
    world.add(e, Text);
    const view = world.get(e, Text);
    view.version = 3;
    assert.strictEqual(world.get(e, Text).version, 3);
  });

  it("rejects unknown fields on set", () => {
    const world = createWorld();
    const e = world.createEntity();
    world.add(e, Text);
    assert.throws(() => world.set(e, Text, { color: 1 }), /unknown field/);
  });
});