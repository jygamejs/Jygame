import { describe, it } from "node:test";
import * as assert from "node:assert";
import { System } from "../../../ecs/core/System.js";

describe("System", () => {
  describe("default state", () => {
    it("is enabled by default", () => {
      const s = new System();
      assert.strictEqual(s.enabled, true);
    });

    it("has priority 0 by default", () => {
      const s = new System();
      assert.strictEqual(s.priority, 0);
    });

    it("has null query before registration", () => {
      const s = new System();
      assert.strictEqual(s.query, null);
    });
  });

  describe("priority", () => {
    it("reads priority from static property", () => {
      class HighPri extends System {
        static priority = 100;
      }
      const s = new HighPri();
      assert.strictEqual(s.priority, 100);
    });

    it("supports negative priority", () => {
      class Early extends System {
        static priority = -10;
      }
      const s = new Early();
      assert.strictEqual(s.priority, -10);
    });

    it("supports zero priority", () => {
      class Default extends System {
        static priority = 0;
      }
      const s = new Default();
      assert.strictEqual(s.priority, 0);
    });
  });

  describe("update", () => {
    it("throws if update is not overridden", () => {
      const s = new System();
      assert.throws(
        () => s.update({}, 0),
        /must override the update/
      );
    });

    it("can be overridden by subclass", () => {
      let called = false;
      class TestSystem extends System {
        update(world, dt) {
          called = true;
        }
      }
      const s = new TestSystem();
      s.update({}, 16);
      assert.strictEqual(called, true);
    });

    it("receives world and dt", () => {
      let receivedWorld = null;
      let receivedDt = null;
      const world = { name: "test" };
      class TestSystem extends System {
        update(w, dt) {
          receivedWorld = w;
          receivedDt = dt;
        }
      }
      const s = new TestSystem();
      s.update(world, 16.5);
      assert.strictEqual(receivedWorld, world);
      assert.strictEqual(receivedDt, 16.5);
    });
  });

  describe("lifecycle hooks", () => {
    it("onAdded is callable and does nothing by default", () => {
      const s = new System();
      s.onAdded({});
    });

    it("onRemoved is callable and does nothing by default", () => {
      const s = new System();
      s.onRemoved({});
    });

    it("subclass can override onAdded", () => {
      let called = false;
      let receivedWorld = null;
      class TestSystem extends System {
        onAdded(world) {
          called = true;
          receivedWorld = world;
        }
      }
      const s = new TestSystem();
      const world = { id: 1 };
      s.onAdded(world);
      assert.strictEqual(called, true);
      assert.strictEqual(receivedWorld, world);
    });

    it("subclass can override onRemoved", () => {
      let called = false;
      let receivedWorld = null;
      class TestSystem extends System {
        onRemoved(world) {
          called = true;
          receivedWorld = world;
        }
      }
      const s = new TestSystem();
      const world = { id: 2 };
      s.onRemoved(world);
      assert.strictEqual(called, true);
      assert.strictEqual(receivedWorld, world);
    });
  });

  describe("query definition", () => {
    it("subclass can define static query", () => {
      class Position { static schema = { x: "f32", y: "f32" }; }
      class Velocity { static schema = { vx: "f32", vy: "f32" }; }

      class MovementSystem extends System {
        static query = { all: [Position, Velocity] };
      }

      const s = new MovementSystem();
      assert.deepStrictEqual(s.constructor.query, { all: [Position, Velocity] });
    });

    it("subclass can define query with any and none", () => {
      class TagA {}
      class TagB {}

      class TestSystem extends System {
        static query = { all: [TagA], any: [TagB], none: [TagA] };
      }

      const s = new TestSystem();
      assert.ok(s.constructor.query);
    });

    it("subclass without query is valid", () => {
      class NoQuerySystem extends System {}
      const s = new NoQuerySystem();
      assert.strictEqual(s.constructor.query, undefined);
    });
  });
});
