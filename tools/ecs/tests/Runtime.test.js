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

const { default: jygame } = await import("../../../jygame.js");
const moduleApi = await import("../../../jygame.js");
import { WebGpuRenderer } from "../../../renderer/WebGpuRenderer.js";
import { makeMockGL } from "./lib/MockGL.js";

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

describe("jygame — default export", () => {
  it("is a function", () => {
    assert.strictEqual(typeof jygame, "function");
  });

  it("exposes createRuntime and scene-delegating methods", () => {
    assert.strictEqual(typeof jygame.createRuntime, "function");
    for (const name of ["run", "pushScene", "popScene", "replaceScene", "switchScene", "destroy"]) {
      assert.strictEqual(typeof jygame[name], "function", `jygame.${name}`);
    }
  });
});

describe("jygame — runtime bootstrap", () => {
  before(() => {
    // Reset any globals leaked by previous tests.
    for (const name of PUBLIC_NAMES) delete globalThis[name];
  });

  after(() => {
    if (jygame.runtime) jygame.destroy();
  });

  it("does not install globals before jygame()", () => {
    assert.strictEqual(globalThis.Scene, undefined);
    assert.strictEqual(globalThis.Sprite, undefined);
  });

  it("jygame(options) creates a Runtime backed by a Game", () => {
    const runtime = jygame({ width: 320, height: 240 });
    assert.ok(runtime.game);
    assert.strictEqual(runtime.game.width, 320);
    assert.strictEqual(runtime.game.height, 240);
    jygame.destroy();
  });

  it("returns the runtime from jygame()", () => {
    const runtime = jygame({ width: 100, height: 100 });
    assert.strictEqual(jygame.runtime, runtime);
    assert.strictEqual(jygame.game, runtime.game);
    jygame.destroy();
  });

  it("installs the curated public surface as globals", () => {
    jygame({ width: 100, height: 100 });
    for (const name of PUBLIC_NAMES) {
      if (name === "Trail") continue; // intentionally the display Trail effect (see below)
      assert.ok(globalThis[name] !== undefined, `global ${name} missing`);
      assert.strictEqual(globalThis[name], moduleApi[name], `global ${name} !== imported ${name}`);
    }
  });

  it("maps global Trail to the user-facing Trail effect", () => {
    jygame({ width: 100, height: 100 });
    const Trail = globalThis.Trail;
    assert.strictEqual(typeof Trail, "function");
    assert.strictEqual(typeof Trail.prototype.follow, "function");
    assert.strictEqual(typeof Trail.prototype.render, "function");
    assert.strictEqual(typeof Trail.prototype.update, "function");
  });

  it("does not install internal engine classes", () => {
    jygame({ width: 100, height: 100 });
    for (const name of INTERNAL_NAMES) {
      assert.strictEqual(globalThis[name], undefined, `internal ${name} leaked to globals`);
    }
  });

  it("jygame.run(scene) mounts the scene on the default runtime", () => {
    const runtime = jygame({ width: 200, height: 200 });
    class MyScene extends globalThis.Scene {}
    const scene = new MyScene();
    runtime.run(scene);
    assert.strictEqual(runtime.scene, scene);
    jygame.destroy();
  });

  it("jygame.run throws before jygame() is called", () => {
    if (jygame.runtime) jygame.destroy();
    assert.throws(() => jygame.run(new (globalThis.Scene || class {})()), /not initialized/);
  });

  it("destroy() restores pre-existing globals", () => {
    globalThis.Scene = "sentinel";
    const runtime = jygame({ width: 100, height: 100 });
    assert.notStrictEqual(globalThis.Scene, "sentinel");
    runtime.destroy();
    assert.strictEqual(globalThis.Scene, "sentinel");
    delete globalThis.Scene;
  });

  it("calling jygame() twice replaces the previous runtime", () => {
    const a = jygame({ width: 100, height: 100 });
    const gameA = a.game;
    const b = jygame({ width: 200, height: 200 });
    assert.notStrictEqual(a, b);
    assert.strictEqual(gameA._running, false);
    assert.strictEqual(jygame.runtime, b);
    jygame.destroy();
  });
});

describe("jygame — forwards Game options", () => {
  before(() => {
    if (jygame.runtime) jygame.destroy();
  });

  after(() => {
    if (jygame.runtime) jygame.destroy();
  });

  it("forwards width, height, fps, maxTicks", () => {
    const runtime = jygame({ width: 640, height: 360, fps: 30, maxTicks: 2 });
    const game = runtime.game;
    assert.strictEqual(game.width, 640);
    assert.strictEqual(game.height, 360);
    assert.strictEqual(game.clock.fps, 30);
    assert.strictEqual(game.clock.maxTicks, 2);
    jygame.destroy();
  });

  it("forwards debug, interpolation, autoPause, imageSmoothing", () => {
    const runtime = jygame({
      width: 100,
      height: 100,
      debug: false,
      interpolation: false,
      autoPause: false,
      imageSmoothing: false,
    });
    const game = runtime.game;
    assert.strictEqual(game._debug, false);
    assert.strictEqual(game._interpolation, false);
    assert.strictEqual(game._visibilityHandler, null);
    assert.strictEqual(game._imageSmoothing, false);
    jygame.destroy();
  });

  it("forwards parent as a CSS selector", () => {
    const container = makeElement();
    const appended = [];
    container.appendChild = (el) => appended.push(el);
    document.querySelector = (sel) => (sel === "#game" ? container : null);
    try {
      const runtime = jygame({ parent: "#game", width: 100, height: 100 });
      assert.ok(appended.includes(runtime.game.canvas));
      assert.ok(appended.includes(runtime.game.domLayer));
      jygame.destroy();
    } finally {
      document.querySelector = () => null;
    }
  });

  it("forwards scaleToFit", () => {
    const runtime = jygame({ width: 200, height: 100, scaleToFit: true });
    assert.ok(runtime.game._viewport);
    assert.strictEqual(runtime.game._viewport.width, 200);
    assert.strictEqual(runtime.game._viewport.height, 100);
    jygame.destroy();
  });

  it("forwards renderer selection", () => {
    const runtime = jygame({ width: 100, height: 100, renderer: "canvas" });
    assert.strictEqual(runtime.game.renderer.constructor.name, "CanvasRenderer");
    jygame.destroy();
  });

  it("defaults to the canvas renderer when renderer is omitted", () => {
    const { CanvasRenderer } = moduleApi;
    const runtime = jygame({ width: 100, height: 100 });
    assert.ok(runtime.game.renderer instanceof CanvasRenderer);
    jygame.destroy();
  });

  it("auto renderer prefers WebGL when it is available", () => {
    const { WebGLRenderer } = moduleApi;
    const origWebgl = WebGLRenderer.isAvailable;
    const origWebgpu = WebGpuRenderer.isAvailable;
    const origCreateElement = document.createElement;
    document.createElement = (tag) => {
      const el = makeElement();
      el.getContext = (kind) => (kind === "webgl2" ? makeMockGL().gl : kind === "2d" ? makeContext() : null);
      return el;
    };
    WebGLRenderer.isAvailable = () => true;
    WebGpuRenderer.isAvailable = () => false;
    try {
      const runtime = jygame({ width: 100, height: 100, renderer: "auto" });
      assert.ok(runtime.game.renderer instanceof WebGLRenderer);
      jygame.destroy();
    } finally {
      document.createElement = origCreateElement;
      WebGLRenderer.isAvailable = origWebgl;
      WebGpuRenderer.isAvailable = origWebgpu;
    }
  });

  it("treats globals as a runtime-only option", () => {
    const runtime = jygame({ width: 100, height: 100, globals: false });
    assert.strictEqual(runtime.globals, false);
    assert.strictEqual(globalThis.Scene, undefined);
    jygame.destroy();
  });
});

describe("jygame.createRuntime — isolated runtimes", () => {
  before(() => {
    if (jygame.runtime) jygame.destroy();
  });

  after(() => {
    if (jygame.runtime) jygame.destroy();
  });

  it("creates a runtime without installing globals by default", () => {
    const runtime = jygame.createRuntime({ width: 100, height: 100 });
    assert.ok(runtime.game);
    assert.strictEqual(globalThis.Scene, undefined);
    assert.strictEqual(jygame.runtime, null);
    runtime.destroy();
  });

  it("respects globals: true", () => {
    const runtime = jygame.createRuntime({ width: 100, height: 100, globals: true });
    assert.ok(globalThis.Scene !== undefined);
    runtime.destroy();
    assert.strictEqual(globalThis.Scene, undefined);
  });

  it("isolated runtimes run scenes independently", () => {
    const a = jygame.createRuntime({ width: 100, height: 100 });
    const b = jygame.createRuntime({ width: 200, height: 200 });
    const AScene = moduleApi.Scene;
    const sceneA = new AScene();
    a.run(sceneA);
    assert.strictEqual(a.scene, sceneA);
    assert.strictEqual(b.scene, null);
    a.destroy();
    b.destroy();
  });
});
