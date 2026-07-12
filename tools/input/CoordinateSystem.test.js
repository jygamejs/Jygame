import { describe, it } from "node:test";
import * as assert from "node:assert";
import { Space } from "../../input/Space.js";
import { CoordinateSystem } from "../../input/CoordinateSystem.js";

function approx(a, b, eps = 1e-10) {
  return Math.abs(a - b) < eps;
}

class IdentityCamera {
  project(x, y) { return { x, y }; }
  unproject(x, y) { return { x, y }; }
}

class OffsetCamera {
  constructor(ox, oy) { this._ox = ox; this._oy = oy; }
  project(x, y) { return { x: x + this._ox, y: y + this._oy }; }
  unproject(x, y) { return { x: x - this._ox, y: y - this._oy }; }
}

class ZoomCamera {
  constructor(z) { this._z = z; }
  project(x, y) { return { x: x * this._z, y: y * this._z }; }
  unproject(x, y) { return { x: x / this._z, y: y / this._z }; }
}

class OffsetZoomCamera {
  constructor(ox, oy, z) { this._ox = ox; this._oy = oy; this._z = z; }
  project(x, y) { return { x: x * this._z + this._ox, y: y * this._z + this._oy }; }
  unproject(x, y) { return { x: (x - this._ox) / this._z, y: (y - this._oy) / this._z }; }
}

describe("Space enum", () => {
  it("defines SCREEN, VIEWPORT, WORLD, UI", () => {
    assert.strictEqual(Space.SCREEN, 0);
    assert.strictEqual(Space.VIEWPORT, 1);
    assert.strictEqual(Space.WORLD, 2);
    assert.strictEqual(Space.UI, 3);
  });

  it("is frozen", () => {
    assert.throws(() => { Space.SCREEN = 99; }, /TypeError/);
  });
});

describe("CoordinateSystem", () => {
  it("defaults to identity (no camera, 1:1, canvas at origin)", () => {
    const cs = new CoordinateSystem();
    const vp = cs.toViewport({ x: 200, y: 150 });
    assert.ok(approx(vp.x, 200));
    assert.ok(approx(vp.y, 150));

    const world = cs.toWorld({ x: 100, y: 50 });
    assert.ok(approx(world.x, 100));
    assert.ok(approx(world.y, 50));

    const ui = cs.toUI({ x: 75, y: 25 });
    assert.ok(approx(ui.x, 75));
    assert.ok(approx(ui.y, 25));

    const screen = cs.toScreen({ x: 400, y: 300 });
    assert.ok(approx(screen.x, 400));
    assert.ok(approx(screen.y, 300));
  });

  it("toViewport subtracts canvas offset and divides by DPR", () => {
    const cs = new CoordinateSystem({
      canvasRect: { x: 100, y: 50, width: 800, height: 600 },
      devicePixelRatio: 2,
    });
    const vp = cs.toViewport({ x: 500, y: 250 });
    assert.strictEqual(vp.x, 200); // (500 - 100) / 2
    assert.strictEqual(vp.y, 100); // (250 - 50) / 2
  });

  it("toScreen multiplies by DPR and adds canvas offset", () => {
    const cs = new CoordinateSystem({
      canvasRect: { x: 100, y: 50, width: 800, height: 600 },
      devicePixelRatio: 2,
    });
    const screen = cs.toScreen({ x: 200, y: 100 });
    assert.strictEqual(screen.x, 500); // 200 * 2 + 100
    assert.strictEqual(screen.y, 250); // 100 * 2 + 50
  });

  it("toWorld returns identity when no camera", () => {
    const cs = new CoordinateSystem();
    const w = cs.toWorld({ x: 42, y: 73 });
    assert.strictEqual(w.x, 42);
    assert.strictEqual(w.y, 73);
  });

  it("toWorld uses camera.unproject when camera is set", () => {
    const cs = new CoordinateSystem({ camera: new OffsetCamera(100, 50) });
    const w = cs.toWorld({ x: 250, y: 100 });
    assert.strictEqual(w.x, 150); // 250 - 100
    assert.strictEqual(w.y, 50);  // 100 - 50
  });

  it("toScreen uses camera.project then viewport scaling", () => {
    const cs = new CoordinateSystem({
      camera: new OffsetCamera(100, 50),
      canvasRect: { x: 10, y: 10, width: 800, height: 600 },
      devicePixelRatio: 1.5,
    });
    const screen = cs.toScreen({ x: 200, y: 100 });
    // project(200, 100) → (300, 150)
    // viewport → screen: (300 * 1.5 + 10, 150 * 1.5 + 10) = (460, 235)
    assert.ok(approx(screen.x, 460));
    assert.ok(approx(screen.y, 235));
  });

  it("toUI returns viewport point unchanged", () => {
    const cs = new CoordinateSystem();
    const ui = cs.toUI({ x: 320, y: 240 });
    assert.strictEqual(ui.x, 320);
    assert.strictEqual(ui.y, 240);
  });

  it("round-trip screen → viewport → screen is identity", () => {
    const cs = new CoordinateSystem({
      canvasRect: { x: 50, y: 25, width: 800, height: 600 },
      devicePixelRatio: 2,
    });
    const original = { x: 700, y: 425 };
    const vp = cs.toViewport(original);
    const back = cs.toScreen({ x: vp.x, y: vp.y });
    assert.ok(approx(back.x, original.x));
    assert.ok(approx(back.y, original.y));
  });

  it("round-trip world → screen → viewport → world is identity with camera", () => {
    const cs = new CoordinateSystem({
      camera: new OffsetZoomCamera(100, 50, 2),
      canvasRect: { x: 10, y: 10, width: 800, height: 600 },
      devicePixelRatio: 1.5,
    });
    const original = { x: 75, y: -30 };
    const screen = cs.toScreen(original);
    const vp = cs.toViewport(screen);
    const world = cs.toWorld(vp);
    assert.ok(approx(world.x, original.x));
    assert.ok(approx(world.y, original.y));
  });

  it("camera property can be swapped", () => {
    const cs = new CoordinateSystem({ camera: new OffsetCamera(100, 0) });
    assert.strictEqual(cs.toWorld({ x: 110, y: 0 }).x, 10);

    cs.camera = new OffsetCamera(200, 0);
    assert.strictEqual(cs.toWorld({ x: 210, y: 0 }).x, 10);
  });

  it("transform with explicit Space enums", () => {
    const cs = new CoordinateSystem({
      canvasRect: { x: 10, y: 10, width: 800, height: 600 },
      devicePixelRatio: 2,
      camera: new OffsetCamera(100, 50),
    });

    // World (50, 25) → project → viewport (150, 75) → screen (150*2+10, 75*2+10) = (310, 160)
    const result = cs.transform({ x: 50, y: 25 }, Space.WORLD, Space.SCREEN);
    assert.strictEqual(result.x, 310);
    assert.strictEqual(result.y, 160);
  });

  it("transform from SCREEN to WORLD", () => {
    const cs = new CoordinateSystem({
      canvasRect: { x: 10, y: 10, width: 800, height: 600 },
      devicePixelRatio: 1,
      camera: new OffsetCamera(100, 50),
    });
    // Screen (210, 60) → viewport (200, 50) → unproject → world (100, 0)
    const result = cs.transform({ x: 210, y: 60 }, Space.SCREEN, Space.WORLD);
    assert.strictEqual(result.x, 100);
    assert.strictEqual(result.y, 0);
  });

  it("transform from VIEWPORT to UI is identity", () => {
    const cs = new CoordinateSystem();
    const result = cs.transform({ x: 150, y: 75 }, Space.VIEWPORT, Space.UI);
    assert.strictEqual(result.x, 150);
    assert.strictEqual(result.y, 75);
  });

  it("camera setter accepts null to disable camera transforms", () => {
    const cs = new CoordinateSystem({ camera: new OffsetCamera(100, 50) });
    assert.notStrictEqual(cs.toWorld({ x: 150, y: 50 }).x, 150);

    cs.camera = null;
    assert.strictEqual(cs.toWorld({ x: 150, y: 50 }).x, 150);
  });

  it("canvasRect and devicePixelRatio setters work", () => {
    const cs = new CoordinateSystem();
    cs.canvasRect = { x: 50, y: 25, width: 400, height: 300 };
    cs.devicePixelRatio = 2;

    const vp = cs.toViewport({ x: 250, y: 125 });
    assert.strictEqual(vp.x, 100);
    assert.strictEqual(vp.y, 50);
  });
});
