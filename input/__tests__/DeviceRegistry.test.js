import { describe, it } from "node:test";
import * as assert from "node:assert";
import { DeviceRegistry } from "../DeviceRegistry.js";
import { Device } from "../Device.js";

class TestDeviceA extends Device {
  constructor(name) {
    super();
    this._name = name;
    this.updateCount = 0;
  }
  get name() { return this._name; }
  update() { this.updateCount++; }
}

class TestDeviceB extends Device {
  constructor(name) {
    super();
    this._name = name;
  }
  get name() { return this._name; }
}

describe("DeviceRegistry", () => {
  describe("register and get", () => {
    it("registers a single device and retrieves it by class", () => {
      const reg = new DeviceRegistry();
      const device = new TestDeviceA("primary");
      reg.register(device);
      assert.strictEqual(reg.get(TestDeviceA), device);
    });

    it("returns null for unregistered class", () => {
      const reg = new DeviceRegistry();
      assert.strictEqual(reg.get(TestDeviceA), null);
    });

    it("registers multiple devices of the same class", () => {
      const reg = new DeviceRegistry();
      const a = new TestDeviceA("a");
      const b = new TestDeviceA("b");
      reg.register(a);
      reg.register(b);
      const all = reg.getAll(TestDeviceA);
      assert.strictEqual(all.length, 2);
      assert.ok(all.includes(a));
      assert.ok(all.includes(b));
    });

    it("get returns the first device when multiple exist", () => {
      const reg = new DeviceRegistry();
      const a = new TestDeviceA("a");
      const b = new TestDeviceA("b");
      reg.register(a);
      reg.register(b);
      assert.strictEqual(reg.get(TestDeviceA), a);
    });
  });

  describe("unregister", () => {
    it("removes a single device", () => {
      const reg = new DeviceRegistry();
      const device = new TestDeviceA("only");
      reg.register(device);
      reg.unregister(device);
      assert.strictEqual(reg.get(TestDeviceA), null);
    });

    it("removes one device from multi-device registration", () => {
      const reg = new DeviceRegistry();
      const a = new TestDeviceA("a");
      const b = new TestDeviceA("b");
      reg.register(a);
      reg.register(b);
      reg.unregister(a);
      const all = reg.getAll(TestDeviceA);
      assert.strictEqual(all.length, 1);
      assert.strictEqual(all[0], b);
    });

    it("does nothing when unregistering unknown device", () => {
      const reg = new DeviceRegistry();
      const device = new TestDeviceA("ghost");
      reg.register(new TestDeviceA("real"));
      reg.unregister(device);
      assert.ok(reg.get(TestDeviceA));
    });
  });

  describe("getAll", () => {
    it("returns empty array for unregistered class", () => {
      const reg = new DeviceRegistry();
      assert.deepStrictEqual(reg.getAll(TestDeviceA), []);
    });

    it("returns single device as array", () => {
      const reg = new DeviceRegistry();
      const device = new TestDeviceA("solo");
      reg.register(device);
      assert.deepStrictEqual(reg.getAll(TestDeviceA), [device]);
    });
  });

  describe("forEach", () => {
    it("iterates all registered devices", () => {
      const reg = new DeviceRegistry();
      const a = new TestDeviceA("a");
      const b = new TestDeviceA("b");
      const c = new TestDeviceB("c");
      reg.register(a);
      reg.register(b);
      reg.register(c);
      const visited = [];
      reg.forEach(d => visited.push(d.name));
      assert.strictEqual(visited.length, 3);
      assert.ok(visited.includes("a"));
      assert.ok(visited.includes("b"));
      assert.ok(visited.includes("c"));
    });
  });

  describe("update", () => {
    it("calls update on every registered device", () => {
      const reg = new DeviceRegistry();
      const a = new TestDeviceA("a");
      const b = new TestDeviceA("b");
      reg.register(a);
      reg.register(b);
      reg.update();
      assert.strictEqual(a.updateCount, 1);
      assert.strictEqual(b.updateCount, 1);
    });
  });

  describe("type property", () => {
    it("Device.type returns the constructor by default", () => {
      const d = new TestDeviceA("test");
      assert.strictEqual(d.type, TestDeviceA);
    });
  });
});
