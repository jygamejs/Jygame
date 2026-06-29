import { describe, it } from "node:test";
import * as assert from "node:assert";
import { ComponentRegistry } from "../../../ecs/core/ComponentRegistry.js";
import { ComponentSignature } from "../../../ecs/core/ComponentSignature.js";
import { Table } from "../../../ecs/core/Table.js";

function createTestRegistry() {
  const reg = new ComponentRegistry();

  class Transform {
    static schema = { x: "f32", y: "f32" };
  }

  class Velocity {
    static schema = { vx: "f32", vy: "f32" };
  }

  class Health {
    static schema = { hp: "u32", maxHp: "u32" };
  }

  class Tag {}

  class Score {
    static schema = { value: "i32" };
  }

  reg.register(Tag);
  reg.register(Transform);
  reg.register(Velocity);
  reg.register(Health);
  reg.register(Score);

  return {
    registry: reg,
    ids: {
      Tag: reg.getId(Tag),
      Transform: reg.getId(Transform),
      Velocity: reg.getId(Velocity),
      Health: reg.getId(Health),
      Score: reg.getId(Score),
    },
  };
}

describe("Table", () => {
  // ─── Construction ──────────────────────────────────────────

  describe("construction", () => {
    it("creates a table with a valid signature and default capacity", () => {
      const { registry } = createTestRegistry();
      const sig = new ComponentSignature([65, 66]);
      const table = new Table(registry, sig);
      assert.strictEqual(table.count, 0);
      assert.strictEqual(table.capacity, 64);
      assert.strictEqual(table.entityCount, 0);
      assert.strictEqual(table.signature, sig);
    });

    it("creates a table with custom initial capacity", () => {
      const { registry } = createTestRegistry();
      const sig = new ComponentSignature([65]);
      const table = new Table(registry, sig, 128);
      assert.strictEqual(table.capacity, 128);
    });

    it("creates a table with a tag-only signature (no typed array columns)", () => {
      const { registry } = createTestRegistry();
      const sig = new ComponentSignature([64]);
      const table = new Table(registry, sig);
      assert.strictEqual(table.count, 0);
      assert.strictEqual(table.hasComponent(64), true);
      assert.strictEqual(table.getColumn(64, "x"), null);
    });

    it("creates a table with multiple components, building correct columns", () => {
      const { registry, ids } = createTestRegistry();
      const sig = new ComponentSignature([ids.Transform, ids.Velocity]);
      const table = new Table(registry, sig);

      const tx = table.getColumn(ids.Transform, "x");
      const ty = table.getColumn(ids.Transform, "y");
      const vx = table.getColumn(ids.Velocity, "vx");
      const vy = table.getColumn(ids.Velocity, "vy");

      assert.ok(tx instanceof Float32Array);
      assert.ok(ty instanceof Float32Array);
      assert.ok(vx instanceof Float32Array);
      assert.ok(vy instanceof Float32Array);

      assert.strictEqual(tx.length, 64);
      assert.strictEqual(table.getColumn(ids.Score, "value"), null);
    });

    it("throws for unregistered component ID in signature", () => {
      const { registry } = createTestRegistry();
      const sig = new ComponentSignature([999]);
      assert.throws(
        () => new Table(registry, sig),
        /not registered/i
      );
    });

    it("throws for negative initialCapacity", () => {
      const { registry } = createTestRegistry();
      const sig = new ComponentSignature([65]);
      assert.throws(
        () => new Table(registry, sig, -1),
        RangeError
      );
    });

    it("throws for zero initialCapacity", () => {
      const { registry } = createTestRegistry();
      const sig = new ComponentSignature([65]);
      assert.throws(
        () => new Table(registry, sig, 0),
        RangeError
      );
    });

    it("throws for non-integer initialCapacity", () => {
      const { registry } = createTestRegistry();
      const sig = new ComponentSignature([65]);
      assert.throws(
        () => new Table(registry, sig, 10.5),
        RangeError
      );
    });
  });

  // ─── allocate ──────────────────────────────────────────────

  describe("allocate", () => {
    it("allocates a row and returns its index", () => {
      const { registry } = createTestRegistry();
      const sig = new ComponentSignature([65, 66]);
      const table = new Table(registry, sig);

      const row = table.allocate();
      assert.strictEqual(row, 0);
      assert.strictEqual(table.count, 1);
    });

    it("allocates multiple rows with sequential indices", () => {
      const { registry } = createTestRegistry();
      const sig = new ComponentSignature([65]);
      const table = new Table(registry, sig);

      const r0 = table.allocate();
      const r1 = table.allocate();
      const r2 = table.allocate();

      assert.strictEqual(r0, 0);
      assert.strictEqual(r1, 1);
      assert.strictEqual(r2, 2);
      assert.strictEqual(table.count, 3);
    });

    it("triggers growth when count reaches capacity", () => {
      const { registry } = createTestRegistry();
      const sig = new ComponentSignature([65]);
      const table = new Table(registry, sig, 2);

      assert.strictEqual(table.capacity, 2);

      table.allocate();
      table.allocate();
      assert.strictEqual(table.capacity, 2);
      assert.strictEqual(table.count, 2);

      table.allocate();
      assert.strictEqual(table.capacity, 4);
      assert.strictEqual(table.count, 3);
    });

    it("preserves column data after growth", () => {
      const { registry } = createTestRegistry();
      const sig = new ComponentSignature([65, 66]);
      const table = new Table(registry, sig, 2);

      const r0 = table.allocate();
      const tx0 = table.getColumn(65, "x");
      const ty0 = table.getColumn(65, "y");
      const vx0 = table.getColumn(66, "vx");
      tx0[r0] = 1.5;
      ty0[r0] = 2.5;
      vx0[r0] = 3.5;

      const r1 = table.allocate();
      const tx1 = table.getColumn(65, "x");
      const ty1 = table.getColumn(65, "y");
      const vx1 = table.getColumn(66, "vx");
      tx1[r1] = 4.5;
      ty1[r1] = 5.5;
      vx1[r1] = 6.5;

      table.allocate();

      assert.strictEqual(table.getColumn(65, "x")[r0], 1.5);
      assert.strictEqual(table.getColumn(65, "y")[r0], 2.5);
      assert.strictEqual(table.getColumn(66, "vx")[r0], 3.5);
      assert.strictEqual(table.getColumn(65, "x")[r1], 4.5);
      assert.strictEqual(table.getColumn(65, "y")[r1], 5.5);
      assert.strictEqual(table.getColumn(66, "vx")[r1], 6.5);
    });

    it("throws when table is destroyed", () => {
      const { registry } = createTestRegistry();
      const sig = new ComponentSignature([65]);
      const table = new Table(registry, sig);
      table.destroy();
      assert.throws(
        () => table.allocate(),
        /destroyed/i
      );
    });
  });

  // ─── reserve ───────────────────────────────────────────────

  describe("reserve", () => {
    it("reserves capacity for more rows without incrementing count", () => {
      const { registry } = createTestRegistry();
      const sig = new ComponentSignature([65]);
      const table = new Table(registry, sig, 4);

      assert.strictEqual(table.capacity, 4);
      table.reserve(16);
      assert.strictEqual(table.capacity, 16);
      assert.strictEqual(table.count, 0);
    });

    it("is a no-op when count is less than capacity", () => {
      const { registry } = createTestRegistry();
      const sig = new ComponentSignature([65]);
      const table = new Table(registry, sig, 64);

      table.reserve(32);
      assert.strictEqual(table.capacity, 64);
    });

    it("doubles until capacity meets the requested count", () => {
      const { registry } = createTestRegistry();
      const sig = new ComponentSignature([65]);
      const table = new Table(registry, sig, 10);

      table.reserve(100);
      assert.strictEqual(table.capacity, 160);
    });

    it("throws for non-positive count", () => {
      const { registry } = createTestRegistry();
      const sig = new ComponentSignature([65]);
      const table = new Table(registry, sig);
      assert.throws(() => table.reserve(0), RangeError);
      assert.throws(() => table.reserve(-1), RangeError);
    });

    it("throws when table is destroyed", () => {
      const { registry } = createTestRegistry();
      const sig = new ComponentSignature([65]);
      const table = new Table(registry, sig);
      table.destroy();
      assert.throws(() => table.reserve(10), /destroyed/i);
    });
  });

  // ─── allocateRange ─────────────────────────────────────────

  describe("allocateRange", () => {
    it("allocates a contiguous range of rows and returns the start index", () => {
      const { registry } = createTestRegistry();
      const sig = new ComponentSignature([65]);
      const table = new Table(registry, sig);

      const start = table.allocateRange(5);
      assert.strictEqual(start, 0);
      assert.strictEqual(table.count, 5);
    });

    it("allocates multiple ranges contiguously", () => {
      const { registry } = createTestRegistry();
      const sig = new ComponentSignature([65]);
      const table = new Table(registry, sig);

      const s1 = table.allocateRange(3);
      const s2 = table.allocateRange(2);

      assert.strictEqual(s1, 0);
      assert.strictEqual(s2, 3);
      assert.strictEqual(table.count, 5);
    });

    it("triggers growth when needed", () => {
      const { registry } = createTestRegistry();
      const sig = new ComponentSignature([65]);
      const table = new Table(registry, sig, 2);

      table.allocateRange(5);
      assert.ok(table.capacity >= 5);
      assert.strictEqual(table.count, 5);
    });

    it("throws for non-positive count", () => {
      const { registry } = createTestRegistry();
      const sig = new ComponentSignature([65]);
      const table = new Table(registry, sig);
      assert.throws(() => table.allocateRange(0), RangeError);
      assert.throws(() => table.allocateRange(-1), RangeError);
    });

    it("throws when table is destroyed", () => {
      const { registry } = createTestRegistry();
      const sig = new ComponentSignature([65]);
      const table = new Table(registry, sig);
      table.destroy();
      assert.throws(() => table.allocateRange(5), /destroyed/i);
    });
  });

  // ─── getEntity / setEntity ─────────────────────────────────

  describe("getEntity / setEntity", () => {
    it("getEntity returns entity ID at the given row", () => {
      const { registry } = createTestRegistry();
      const sig = new ComponentSignature([65]);
      const table = new Table(registry, sig);

      const r0 = table.allocate();
      const r1 = table.allocate();

      table.setEntity(r0, 100);
      table.setEntity(r1, 200);

      assert.strictEqual(table.getEntity(r0), 100);
      assert.strictEqual(table.getEntity(r1), 200);
    });

    it("getEntity throws for out-of-range row", () => {
      const { registry } = createTestRegistry();
      const sig = new ComponentSignature([65]);
      const table = new Table(registry, sig);

      assert.throws(
        () => table.getEntity(0),
        /out of range/i
      );
    });

    it("getEntity throws for negative row", () => {
      const { registry } = createTestRegistry();
      const sig = new ComponentSignature([65]);
      const table = new Table(registry, sig);

      assert.throws(
        () => table.getEntity(-1),
        RangeError
      );
    });

    it("setEntity throws for out-of-range row", () => {
      const { registry } = createTestRegistry();
      const sig = new ComponentSignature([65]);
      const table = new Table(registry, sig);

      assert.throws(
        () => table.setEntity(0, 100),
        /out of range/i
      );
    });

    it("setEntity throws for negative entity ID", () => {
      const { registry } = createTestRegistry();
      const sig = new ComponentSignature([65]);
      const table = new Table(registry, sig);
      table.allocate();

      assert.throws(
        () => table.setEntity(0, -1),
        TypeError
      );
    });

    it("entityIds getter returns a view of the correct length", () => {
      const { registry } = createTestRegistry();
      const sig = new ComponentSignature([65]);
      const table = new Table(registry, sig);

      table.allocate();
      table.allocate();
      table.allocate();

      table.setEntity(0, 10);
      table.setEntity(1, 20);
      table.setEntity(2, 30);

      const ids = table.entityIds;
      assert.strictEqual(ids.length, 3);
      assert.strictEqual(ids[0], 10);
      assert.strictEqual(ids[1], 20);
      assert.strictEqual(ids[2], 30);
    });

    it("throws when table is destroyed", () => {
      const { registry } = createTestRegistry();
      const sig = new ComponentSignature([65]);
      const table = new Table(registry, sig);
      table.destroy();
      assert.throws(() => table.getEntity(0), /destroyed/i);
      assert.throws(() => table.setEntity(0, 1), /destroyed/i);
    });
  });

  // ─── removeRow (swap-remove) ───────────────────────────────

  describe("removeRow", () => {
    it("removes the last row without moving data", () => {
      const { registry } = createTestRegistry();
      const sig = new ComponentSignature([65]);
      const table = new Table(registry, sig);

      table.allocate();
      table.allocate();
      table.setEntity(0, 10);
      table.setEntity(1, 20);

      const result = table.removeRow(1);

      assert.deepStrictEqual(result, { moved: false, entity: 0 });
      assert.strictEqual(table.count, 1);
      assert.strictEqual(table.getEntity(0), 10);
    });

    it("removes a middle row via swap-remove", () => {
      const { registry } = createTestRegistry();
      const sig = new ComponentSignature([65, 66]);
      const table = new Table(registry, sig);

      table.allocate();
      table.allocate();
      table.allocate();

      table.setEntity(0, 100);
      table.setEntity(1, 200);
      table.setEntity(2, 300);

      const tx = table.getColumn(65, "x");
      const ty = table.getColumn(65, "y");
      const vx = table.getColumn(66, "vx");

      tx[0] = 1.0; ty[0] = 2.0; vx[0] = 3.0;
      tx[1] = 4.0; ty[1] = 5.0; vx[1] = 6.0;
      tx[2] = 7.0; ty[2] = 8.0; vx[2] = 9.0;

      const result = table.removeRow(1);

      assert.deepStrictEqual(result, { moved: true, entity: 300 });
      assert.strictEqual(table.count, 2);

      assert.strictEqual(table.getEntity(1), 300);
      assert.strictEqual(tx[1], 7.0);
      assert.strictEqual(ty[1], 8.0);
      assert.strictEqual(vx[1], 9.0);

      assert.strictEqual(table.getEntity(0), 100);
      assert.strictEqual(tx[0], 1.0);
    });

    it("removes the only entity, leaving count at 0", () => {
      const { registry } = createTestRegistry();
      const sig = new ComponentSignature([65]);
      const table = new Table(registry, sig);

      table.allocate();
      table.setEntity(0, 42);

      const result = table.removeRow(0);

      assert.deepStrictEqual(result, { moved: false, entity: 0 });
      assert.strictEqual(table.count, 0);
    });

    it("removes entities sequentially leaving capacity unchanged", () => {
      const { registry } = createTestRegistry();
      const sig = new ComponentSignature([65]);
      const table = new Table(registry, sig, 8);

      table.allocateRange(5);
      assert.strictEqual(table.count, 5);
      assert.strictEqual(table.capacity, 8);

      table.removeRow(4);
      table.removeRow(3);
      table.removeRow(2);
      table.removeRow(1);
      table.removeRow(0);
      assert.strictEqual(table.count, 0);
      assert.strictEqual(table.capacity, 8);
    });

    it("throws for out-of-range row", () => {
      const { registry } = createTestRegistry();
      const sig = new ComponentSignature([65]);
      const table = new Table(registry, sig);

      assert.throws(
        () => table.removeRow(0),
        /out of range/i
      );
    });

    it("throws for negative row", () => {
      const { registry } = createTestRegistry();
      const sig = new ComponentSignature([65]);
      const table = new Table(registry, sig);
      assert.throws(() => table.removeRow(-1), RangeError);
    });

    it("throws when table is destroyed", () => {
      const { registry } = createTestRegistry();
      const sig = new ComponentSignature([65]);
      const table = new Table(registry, sig);
      table.destroy();
      assert.throws(() => table.removeRow(0), /destroyed/i);
    });
  });

  // ─── getColumn ─────────────────────────────────────────────

  describe("getColumn", () => {
    it("returns the correct typed array for a given component and field", () => {
      const { registry, ids } = createTestRegistry();
      const sig = new ComponentSignature([ids.Transform, ids.Health]);
      const table = new Table(registry, sig);

      const tx = table.getColumn(ids.Transform, "x");
      const ty = table.getColumn(ids.Transform, "y");
      const hp = table.getColumn(ids.Health, "hp");
      const maxHp = table.getColumn(ids.Health, "maxHp");

      assert.ok(tx instanceof Float32Array);
      assert.ok(ty instanceof Float32Array);
      assert.ok(hp instanceof Uint32Array);
      assert.ok(maxHp instanceof Uint32Array);
    });

    it("returns null for a component not in the table", () => {
      const { registry, ids } = createTestRegistry();
      const sig = new ComponentSignature([ids.Transform]);
      const table = new Table(registry, sig);

      assert.strictEqual(table.getColumn(ids.Velocity, "vx"), null);
    });

    it("returns null for a valid component but unknown field", () => {
      const { registry, ids } = createTestRegistry();
      const sig = new ComponentSignature([ids.Transform]);
      const table = new Table(registry, sig);

      assert.strictEqual(table.getColumn(ids.Transform, "nonexistent"), null);
    });

    it("throws for invalid component ID", () => {
      const { registry } = createTestRegistry();
      const sig = new ComponentSignature([65]);
      const table = new Table(registry, sig);

      assert.throws(() => table.getColumn(-1, "x"), TypeError);
      assert.throws(() => table.getColumn(1.5, "x"), TypeError);
    });

    it("throws for empty field name", () => {
      const { registry, ids } = createTestRegistry();
      const sig = new ComponentSignature([ids.Transform]);
      const table = new Table(registry, sig);

      assert.throws(() => table.getColumn(ids.Transform, ""), TypeError);
    });

    it("throws when table is destroyed", () => {
      const { registry, ids } = createTestRegistry();
      const sig = new ComponentSignature([ids.Transform]);
      const table = new Table(registry, sig);
      table.destroy();
      assert.throws(() => table.getColumn(ids.Transform, "x"), /destroyed/i);
    });
  });

  // ─── hasComponent ──────────────────────────────────────────

  describe("hasComponent", () => {
    it("returns true for a component present in the table", () => {
      const { registry, ids } = createTestRegistry();
      const sig = new ComponentSignature([ids.Transform, ids.Velocity]);
      const table = new Table(registry, sig);

      assert.strictEqual(table.hasComponent(ids.Transform), true);
      assert.strictEqual(table.hasComponent(ids.Velocity), true);
    });

    it("returns true for a tag component present in the table", () => {
      const { registry, ids } = createTestRegistry();
      const sig = new ComponentSignature([ids.Tag, ids.Transform]);
      const table = new Table(registry, sig);

      assert.strictEqual(table.hasComponent(ids.Tag), true);
    });

    it("returns false for a component not in the table", () => {
      const { registry, ids } = createTestRegistry();
      const sig = new ComponentSignature([ids.Transform]);
      const table = new Table(registry, sig);

      assert.strictEqual(table.hasComponent(ids.Velocity), false);
    });

    it("throws for invalid component ID", () => {
      const { registry } = createTestRegistry();
      const sig = new ComponentSignature([65]);
      const table = new Table(registry, sig);

      assert.throws(() => table.hasComponent(-1), TypeError);
      assert.throws(() => table.hasComponent(1.5), TypeError);
    });

    it("throws when table is destroyed", () => {
      const { registry, ids } = createTestRegistry();
      const sig = new ComponentSignature([ids.Transform]);
      const table = new Table(registry, sig);
      table.destroy();
      assert.throws(() => table.hasComponent(ids.Transform), /destroyed/i);
    });
  });

  // ─── moveRowTo (migration between tables) ──────────────────

  describe("moveRowTo", () => {
    it("moves a row from one table to another, copying shared component data", () => {
      const { registry, ids } = createTestRegistry();
      const srcSig = new ComponentSignature([ids.Transform, ids.Velocity]);
      const dstSig = new ComponentSignature([ids.Transform, ids.Health]);
      const src = new Table(registry, srcSig);
      const dst = new Table(registry, dstSig);

      const row = src.allocate();
      src.setEntity(row, 42);
      const tx = src.getColumn(ids.Transform, "x");
      const ty = src.getColumn(ids.Transform, "y");
      tx[row] = 1.5;
      ty[row] = 2.5;

      const dstRow = src.moveRowTo(row, dst);

      assert.strictEqual(dst.getEntity(dstRow), 42);
      assert.strictEqual(dst.getColumn(ids.Transform, "x")[dstRow], 1.5);
      assert.strictEqual(dst.getColumn(ids.Transform, "y")[dstRow], 2.5);
    });

    it("moves a row with tag components (no field data to copy)", () => {
      const { registry, ids } = createTestRegistry();
      const srcSig = new ComponentSignature([ids.Tag, ids.Transform]);
      const dstSig = new ComponentSignature([ids.Tag, ids.Score]);
      const src = new Table(registry, srcSig);
      const dst = new Table(registry, dstSig);

      const row = src.allocate();
      src.setEntity(row, 7);
      const tx = src.getColumn(ids.Transform, "x");
      tx[row] = 3.14;

      const dstRow = src.moveRowTo(row, dst);

      assert.strictEqual(dst.getEntity(dstRow), 7);
      assert.strictEqual(dst.hasComponent(ids.Tag), true);
    });

    it("moves between tables with no shared components (entity only)", () => {
      const { registry, ids } = createTestRegistry();
      const srcSig = new ComponentSignature([ids.Transform]);
      const dstSig = new ComponentSignature([ids.Health]);
      const src = new Table(registry, srcSig);
      const dst = new Table(registry, dstSig);

      const row = src.allocate();
      src.setEntity(row, 99);

      const dstRow = src.moveRowTo(row, dst);

      assert.strictEqual(dst.getEntity(dstRow), 99);
      assert.strictEqual(dst.count, 1);
    });

    it("moves multiple rows independently", () => {
      const { registry, ids } = createTestRegistry();
      const srcSig = new ComponentSignature([ids.Score]);
      const dstSig = new ComponentSignature([ids.Transform]);
      const src = new Table(registry, srcSig);
      const dst = new Table(registry, dstSig);

      const r0 = src.allocate();
      const r1 = src.allocate();
      src.setEntity(r0, 10);
      src.setEntity(r1, 20);
      const sv = src.getColumn(ids.Score, "value");
      sv[r0] = 100;
      sv[r1] = 200;

      const d0 = src.moveRowTo(r0, dst);
      const d1 = src.moveRowTo(r1, dst);

      assert.strictEqual(dst.getEntity(d0), 10);
      assert.strictEqual(dst.getEntity(d1), 20);
      assert.strictEqual(dst.count, 2);
    });

    it("throws for out-of-range source row", () => {
      const { registry, ids } = createTestRegistry();
      const srcSig = new ComponentSignature([ids.Transform]);
      const dstSig = new ComponentSignature([ids.Health]);
      const src = new Table(registry, srcSig);
      const dst = new Table(registry, dstSig);

      assert.throws(
        () => src.moveRowTo(0, dst),
        /out of range/i
      );
    });

    it("throws when destination is not a Table", () => {
      const { registry, ids } = createTestRegistry();
      const srcSig = new ComponentSignature([ids.Transform]);
      const src = new Table(registry, srcSig);

      assert.throws(
        () => src.moveRowTo(0, null),
        TypeError
      );
    });

    it("throws when source table is destroyed", () => {
      const { registry, ids } = createTestRegistry();
      const srcSig = new ComponentSignature([ids.Transform]);
      const dstSig = new ComponentSignature([ids.Health]);
      const src = new Table(registry, srcSig);
      const dst = new Table(registry, dstSig);
      src.destroy();

      assert.throws(
        () => src.moveRowTo(0, dst),
        /destroyed/i
      );
    });
  });

  // ─── Growth ────────────────────────────────────────────────

  describe("growth", () => {
    it("grow doubles the capacity", () => {
      const { registry } = createTestRegistry();
      const sig = new ComponentSignature([65]);
      const table = new Table(registry, sig, 4);

      table.grow();
      assert.strictEqual(table.capacity, 8);
      assert.strictEqual(table.count, 0);
    });

    it("data survives multiple grow cycles", () => {
      const { registry } = createTestRegistry();
      const sig = new ComponentSignature([65, 66]);
      const table = new Table(registry, sig, 2);

      const r0 = table.allocate();
      const r1 = table.allocate();
      table.setEntity(r0, 1);
      table.setEntity(r1, 2);
      const tx = table.getColumn(65, "x");
      tx[r0] = 10;
      tx[r1] = 20;

      table.grow();
      assert.strictEqual(table.capacity, 4);
      assert.strictEqual(table.getEntity(0), 1);
      assert.strictEqual(table.getEntity(1), 2);
      assert.strictEqual(table.getColumn(65, "x")[0], 10);
      assert.strictEqual(table.getColumn(65, "x")[1], 20);

      table.grow();
      assert.strictEqual(table.capacity, 8);
      assert.strictEqual(table.getEntity(0), 1);
      assert.strictEqual(table.getColumn(65, "x")[0], 10);
    });

    it("throws when table is destroyed", () => {
      const { registry } = createTestRegistry();
      const sig = new ComponentSignature([65]);
      const table = new Table(registry, sig);
      table.destroy();
      assert.throws(() => table.grow(), /destroyed/i);
    });
  });

  // ─── Destroy ───────────────────────────────────────────────

  describe("destroy", () => {
    it("clears all state and marks as destroyed", () => {
      const { registry } = createTestRegistry();
      const sig = new ComponentSignature([65, 66]);
      const table = new Table(registry, sig);

      table.allocate();
      table.allocate();

      table.destroy();

      assert.strictEqual(table.count, 0);
      assert.strictEqual(table.capacity, 0);
      assert.strictEqual(table._destroyed, true);
    });
  });

  // ─── Edge Cases ────────────────────────────────────────────

  describe("edge cases", () => {
    it("empty signature table works (zero columns)", () => {
      const { registry } = createTestRegistry();
      const sig = new ComponentSignature([]);
      const table = new Table(registry, sig);

      const r0 = table.allocate();
      const r1 = table.allocate();
      table.setEntity(r0, 1);
      table.setEntity(r1, 2);

      assert.strictEqual(table.count, 2);
      assert.strictEqual(table.entityIds.length, 2);
      assert.strictEqual(table.getEntity(r0), 1);
      assert.strictEqual(table.getEntity(r1), 2);

      const result = table.removeRow(r0);
      assert.strictEqual(result.moved, true);
      assert.strictEqual(table.count, 1);
    });

    it("allocates up to capacity, then growth allows more", () => {
      const { registry } = createTestRegistry();
      const sig = new ComponentSignature([65]);
      const table = new Table(registry, sig, 4);

      for (let i = 0; i < 100; i++) {
        table.allocate();
      }

      assert.strictEqual(table.count, 100);
      assert.ok(table.capacity >= 100);
    });

    it("column data is independent per row", () => {
      const { registry, ids } = createTestRegistry();
      const sig = new ComponentSignature([ids.Transform, ids.Health]);
      const table = new Table(registry, sig);

      const r0 = table.allocate();
      const r1 = table.allocate();
      const r2 = table.allocate();

      const tx = table.getColumn(ids.Transform, "x");
      const hp = table.getColumn(ids.Health, "hp");

      tx[r0] = 1; tx[r1] = 2; tx[r2] = 3;
      hp[r0] = 10; hp[r1] = 20; hp[r2] = 30;

      assert.strictEqual(tx[r0], 1);
      assert.strictEqual(tx[r1], 2);
      assert.strictEqual(tx[r2], 3);
      assert.strictEqual(hp[r0], 10);
      assert.strictEqual(hp[r1], 20);
      assert.strictEqual(hp[r2], 30);

      hp[r1] = 99;
      assert.strictEqual(hp[r1], 99);
      assert.strictEqual(hp[r0], 10);
    });
  });
});
