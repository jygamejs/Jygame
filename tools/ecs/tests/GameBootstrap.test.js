import { describe, it, before, after } from "node:test";
import * as assert from "node:assert";




// ─── Imports (barrel exercises the full module graph) ───────────────────────

const moduleApi = await import("../../../jygame.js");
const { Game, Scene, CanvasRenderer, WebGLRenderer } = moduleApi;
import { WebGpuRenderer } from "../../../renderer/WebGpuRenderer.js";
import { makeMockGL } from "./lib/MockGL.js";
const { HeadlessHost, HeadlessElement } = await import("../../../core/Host.js");

function newHost(opts) { return new HeadlessHost({ width: 100, height: 100, ...opts }); }

// The names a game is expected to build with. jygame ships plain named
// exports, so both `import { Game, Scene } from "jygame"` and
// `import * as jy from "jygame"` work off this same surface.
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

describe("jygame — module surface", () => {
  it("exports every name a game builds with", () => {
    for (const name of PUBLIC_NAMES) {
      assert.ok(moduleApi[name] !== undefined, `export ${name} missing`);
    }
  });

  it("has no default export", () => {
    assert.strictEqual(
      moduleApi.default, undefined,
      "jygame is imported by name; there is no default runtime object",
    );
  });

  it("installs nothing on globalThis", () => {
    for (const name of PUBLIC_NAMES) {
      assert.strictEqual(
        globalThis[name], undefined,
        `${name} leaked to globals — importing jygame must have no side effects`,
      );
    }
  });

  it("supports namespace-style import off the same exports", () => {
    // `import * as jy from "jygame"` — jy.Game, jy.Input.down(...), etc.
    assert.strictEqual(typeof moduleApi.Game, "function");
    assert.strictEqual(typeof moduleApi.Scene, "function");
    assert.strictEqual(typeof moduleApi.Input, "object");
    assert.strictEqual(typeof moduleApi.Input.down, "function");
  });

  it("exposes the user-facing Trail effect under Trail", () => {
    const { Trail } = moduleApi;
    assert.strictEqual(typeof Trail, "function");
    assert.strictEqual(typeof Trail.prototype.follow, "function");
    assert.strictEqual(typeof Trail.prototype.render, "function");
    assert.strictEqual(typeof Trail.prototype.update, "function");
  });
});

describe("Game — construction", () => {
  let game;

  after(() => {
    if (game) { try { game.destroy(); } catch {} game = null; }
  });

  it("constructs with no arguments", () => {
    game = new Game({ host: newHost() });
    assert.strictEqual(game.width, 800);
    assert.strictEqual(game.height, 600);
    game.destroy();
    game = null;
  });

  it("applies width and height", () => {
    game = new Game({ width: 320, height: 240, host: newHost() });
    assert.strictEqual(game.width, 320);
    assert.strictEqual(game.height, 240);
    game.destroy();
    game = null;
  });

  it("applies fps and maxTicks", () => {
    game = new Game({ width: 640, height: 360, fps: 30, maxTicks: 2, host: newHost() });
    assert.strictEqual(game.clock.fps, 30);
    assert.strictEqual(game.clock.maxTicks, 2);
    game.destroy();
    game = null;
  });

  it("applies debug, interpolation, autoPause, imageSmoothing", () => {
    game = new Game({
      width: 100, height: 100, host: newHost(),
      debug: false, interpolation: false, autoPause: false, imageSmoothing: false,
    });
    assert.strictEqual(game._debug, false);
    assert.strictEqual(game._interpolation, false);
    assert.strictEqual(game._visibilityHandler, null);
    assert.strictEqual(game._imageSmoothing, false);
    game.destroy();
    game = null;
  });

  it("accepts parent as a CSS selector", () => {
    const host = newHost();
    const container = new HeadlessElement("div");
    host.registerSelector("#game", container);

    game = new Game({ parent: "#game", width: 100, height: 100, host });
    assert.ok(container.children.includes(game.canvas));
    assert.ok(container.children.includes(game.domLayer));
    game.destroy();
    game = null;
  });

  it("accepts parent as an element", () => {
    const container = new HeadlessElement("div");
    game = new Game({ parent: container, width: 100, height: 100, host: newHost() });
    assert.ok(
      container.children.includes(game.canvas),
      "an element parent should be used directly, not silently ignored",
    );
    game.destroy();
    game = null;
  });

  it("applies scaleToFit", () => {
    game = new Game({ width: 200, height: 100, scaleToFit: true, host: newHost() });
    assert.ok(game._viewport);
    assert.strictEqual(game._viewport.width, 200);
    assert.strictEqual(game._viewport.height, 100);
    game.destroy();
    game = null;
  });

  it("defaults to the canvas renderer", () => {
    game = new Game({ width: 100, height: 100, host: newHost() });
    assert.ok(game.renderer instanceof CanvasRenderer);
    game.destroy();
    game = null;
  });

  it("applies explicit renderer selection", () => {
    game = new Game({ width: 100, height: 100, renderer: "canvas", host: newHost() });
    assert.strictEqual(game.renderer.constructor.name, "CanvasRenderer");
    game.destroy();
    game = null;
  });

  it("auto renderer prefers WebGL when it is available", () => {
    const origWebgl = WebGLRenderer.isAvailable;
    const origWebgpu = WebGpuRenderer.isAvailable;
    // Teach this host's canvases to hand back a mock WebGL2 context.
    const host = newHost();
    const baseCreate = host.createElement.bind(host);
    host.createElement = (tag) => {
      const el = baseCreate(tag);
      if (el.tagName === "CANVAS") {
        const gl = makeMockGL().gl;
        const base2d = el._context;
        el._context = (kind) => (kind === "webgl2" ? gl : base2d ? base2d(kind) : null);
      }
      return el;
    };
    WebGLRenderer.isAvailable = () => true;
    WebGpuRenderer.isAvailable = () => false;
    try {
      game = new Game({ width: 100, height: 100, renderer: "auto", host });
      assert.ok(game.renderer instanceof WebGLRenderer);
      game.destroy();
      game = null;
    } finally {
      WebGLRenderer.isAvailable = origWebgl;
      WebGpuRenderer.isAvailable = origWebgpu;
    }
  });
});

describe("Game — scenes", () => {
  let game;

  after(() => {
    if (game) { try { game.destroy(); } catch {} game = null; }
  });

  it("run(scene) mounts the scene", () => {
    game = new Game({ width: 200, height: 200, host: newHost() });
    const scene = new Scene();
    game.run(scene);
    assert.strictEqual(game.scene, scene);
    game.destroy();
    game = null;
  });

  it("games are independent of one another", () => {
    const a = new Game({ width: 100, height: 100, host: newHost() });
    const b = new Game({ width: 200, height: 200, host: newHost() });
    const sceneA = new Scene();
    a.run(sceneA);
    assert.strictEqual(a.scene, sceneA);
    assert.strictEqual(b.scene, null, "constructing a game must not affect another");
    a.destroy();
    b.destroy();
  });
});
