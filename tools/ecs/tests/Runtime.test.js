import { describe, it, before, after } from "node:test";
import * as assert from "node:assert";

// ─── Browser environment mock (Game constructor needs a DOM) ───────────────

function makeElement() {
  return {
    style: {},
    className: "",
    width: 0,
    height: 0,
    innerHTML: "",
    _listeners: {},
    addEventListener(type, fn) {
      (this._listeners[type] = this._listeners[type] || []).push(fn);
    },
    removeEventListener(type, fn) {
      const list = this._listeners[type] || [];
      const i = list.indexOf(fn);
      if (i !== -1) list.splice(i, 1);
    },
    appendChild() {},
    append() {},
    remove() {},
    querySelector() { return null; },
  };
}

function makeContext() {
  return {
    imageSmoothingEnabled: true,
    set imageSmoothingEnabled(v) { this._imageSmoothingEnabled = v; },
    clearRect() {}, save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
    fillRect() {}, drawImage() {}, beginPath() {}, arc() {}, fill() {}, stroke() {},
    moveTo() {}, lineTo() {},
    getTransform() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; },
    setTransform() {},
  };
}

function setupDom() {
  const body = makeElement();
  const canvas = makeElement();
  canvas.width = 800;
  canvas.height = 600;
  canvas.style.display = "block";
  const ctx = makeContext();
  canvas.getContext = (kind) => (kind === "2d" ? ctx : null);

  globalThis.document = {
    body,
    documentElement: makeElement(),
    createElement: (tag) => (tag === "canvas" ? canvas : makeElement()),
    querySelector: () => null,
    addEventListener() {},
    removeEventListener() {},
    hidden: false,
  };
  globalThis.window = {
    addEventListener() {},
    removeEventListener() {},
    innerWidth: 1920,
    innerHeight: 1080,
    devicePixelRatio: 1,
    open() {},
  };
  globalThis.getComputedStyle = () => ({
    position: "relative",
    getPropertyValue: () => "",
    removeProperty() {},
  });
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
  globalThis.requestAnimationFrame = () => 0;
  globalThis.cancelAnimationFrame = () => {};
  globalThis.localStorage = {
    getItem: () => null,
    setItem() {},
    removeItem() {},
    clear() {},
  };
  return { canvas, ctx };
}

setupDom();

// ─── Imports (barrel exercises the full module graph) ───────────────────────

const { default: jy } = await import("../../../jygame.js");
const moduleApi = await import("../../../jygame.js");

const PUBLIC_NAMES = [
  "Game", "Scene",
  "Sprite", "Group", "Trail", "Camera", "View", "Viewport",
  "Image", "Audio", "Font",
  "Input",
  "Particle", "ParticleSystem", "ParticleEmitter", "ParticleEffect",
  "RectangleShape", "CircleShape", "RingShape", "LineShape", "ConeShape",
  "PolygonShape", "PathShape", "SplineShape",
  "FadeModifier", "ScaleModifier", "VelocityModifier", "ColorModifier",
  "RotationModifier", "AnimationModifier", "AnimatedSpriteModifier",
  "WindModifier", "TurbulenceModifier", "ForceModifier", "AttractionModifier",
  "OrbitModifier", "SpawnModifier", "TrailModifier", "CollisionModifier",
  "Vec2", "Rect", "Color", "Colors", "Palettes",
  "Timer", "State",
];

const INTERNAL_NAMES = [
  "Transform", "Renderable", "Collider", "Visible", "Velocity",
  "World", "System", "Renderer", "CanvasRenderer", "InputSystem",
  "Diagnostics", "OverlayHost", "DebugOverlay",
];

describe("jy — default export", () => {
  it("is a function", () => {
    assert.strictEqual(typeof jy, "function");
  });

  it("exposes createRuntime and scene-delegating methods", () => {
    assert.strictEqual(typeof jy.createRuntime, "function");
    for (const name of ["run", "pushScene", "popScene", "replaceScene", "switchScene", "destroy"]) {
      assert.strictEqual(typeof jy[name], "function", `jy.${name}`);
    }
  });
});

describe("jy — runtime bootstrap", () => {
  before(() => {
    // Reset any globals leaked by previous tests.
    for (const name of PUBLIC_NAMES) delete globalThis[name];
  });

  after(() => {
    if (jy.runtime) jy.destroy();
  });

  it("does not install globals before jy()", () => {
    assert.strictEqual(globalThis.Scene, undefined);
    assert.strictEqual(globalThis.Sprite, undefined);
  });

  it("jy(options) creates a Runtime backed by a Game", () => {
    const runtime = jy({ width: 320, height: 240 });
    assert.ok(runtime.game);
    assert.strictEqual(runtime.game.width, 320);
    assert.strictEqual(runtime.game.height, 240);
    jy.destroy();
  });

  it("returns the runtime from jy()", () => {
    const runtime = jy({ width: 100, height: 100 });
    assert.strictEqual(jy.runtime, runtime);
    assert.strictEqual(jy.game, runtime.game);
    jy.destroy();
  });

  it("installs the curated public surface as globals", () => {
    jy({ width: 100, height: 100 });
    for (const name of PUBLIC_NAMES) {
      if (name === "Trail") continue; // intentionally the display Trail effect (see below)
      assert.ok(globalThis[name] !== undefined, `global ${name} missing`);
      assert.strictEqual(globalThis[name], moduleApi[name], `global ${name} !== imported ${name}`);
    }
  });

  it("maps global Trail to the user-facing Trail effect", () => {
    jy({ width: 100, height: 100 });
    const Trail = globalThis.Trail;
    assert.strictEqual(typeof Trail, "function");
    assert.strictEqual(typeof Trail.prototype.follow, "function");
    assert.strictEqual(typeof Trail.prototype.render, "function");
    assert.strictEqual(typeof Trail.prototype.update, "function");
  });

  it("does not install internal engine classes", () => {
    jy({ width: 100, height: 100 });
    for (const name of INTERNAL_NAMES) {
      assert.strictEqual(globalThis[name], undefined, `internal ${name} leaked to globals`);
    }
  });

  it("jy.run(scene) mounts the scene on the default runtime", () => {
    const runtime = jy({ width: 200, height: 200 });
    class MyScene extends globalThis.Scene {}
    const scene = new MyScene();
    runtime.run(scene);
    assert.strictEqual(runtime.scene, scene);
    jy.destroy();
  });

  it("jy.run throws before jy() is called", () => {
    if (jy.runtime) jy.destroy();
    assert.throws(() => jy.run(new (globalThis.Scene || class {})()), /not initialized/);
  });

  it("destroy() restores pre-existing globals", () => {
    globalThis.Scene = "sentinel";
    const runtime = jy({ width: 100, height: 100 });
    assert.notStrictEqual(globalThis.Scene, "sentinel");
    runtime.destroy();
    assert.strictEqual(globalThis.Scene, "sentinel");
    delete globalThis.Scene;
  });

  it("calling jy() twice replaces the previous runtime", () => {
    const a = jy({ width: 100, height: 100 });
    const gameA = a.game;
    const b = jy({ width: 200, height: 200 });
    assert.notStrictEqual(a, b);
    assert.strictEqual(gameA._running, false);
    assert.strictEqual(jy.runtime, b);
    jy.destroy();
  });
});

describe("jy.createRuntime — isolated runtimes", () => {
  before(() => {
    if (jy.runtime) jy.destroy();
  });

  after(() => {
    if (jy.runtime) jy.destroy();
  });

  it("creates a runtime without installing globals by default", () => {
    const runtime = jy.createRuntime({ width: 100, height: 100 });
    assert.ok(runtime.game);
    assert.strictEqual(globalThis.Scene, undefined);
    assert.strictEqual(jy.runtime, null);
    runtime.destroy();
  });

  it("respects globals: true", () => {
    const runtime = jy.createRuntime({ width: 100, height: 100, globals: true });
    assert.ok(globalThis.Scene !== undefined);
    runtime.destroy();
    assert.strictEqual(globalThis.Scene, undefined);
  });

  it("isolated runtimes run scenes independently", () => {
    const a = jy.createRuntime({ width: 100, height: 100 });
    const b = jy.createRuntime({ width: 200, height: 200 });
    const AScene = moduleApi.Scene;
    const sceneA = new AScene();
    a.run(sceneA);
    assert.strictEqual(a.scene, sceneA);
    assert.strictEqual(b.scene, null);
    a.destroy();
    b.destroy();
  });
});
