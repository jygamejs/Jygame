import { describe, it, mock, before, after } from "node:test";
import * as assert from "node:assert";
import { Renderer } from "../../../renderer/Renderer.js";
import { CanvasRenderer } from "../../../renderer/CanvasRenderer.js";
import { World } from "../../../ecs/core/World.js";
import { RenderQueue } from "../../../ecs/render/RenderQueue.js";
import { RenderSystem } from "../../../ecs/systems/RenderSystem.js";
import { Transform } from "../../../ecs/components/Transform.js";
import { Renderable } from "../../../ecs/components/Renderable.js";
import { RenderBounds } from "../../../ecs/components/RenderBounds.js";
import { Visible } from "../../../ecs/components/Visible.js";
import { Trail } from "../../../ecs/components/Trail.js";
import { TrailManager } from "../../../ecs/trails/TrailManager.js";
import { TrailSystem } from "../../../ecs/systems/TrailSystem.js";
import { CanvasContext } from "../../../ecs/render/CanvasContext.js";
import { Camera } from "../../../view/Camera.js";
import { Viewport } from "../../../view/Viewport.js";
import { Text as TextComponent } from "../../../ecs/components/Text.js";
import { TextResourcePool } from "../../../ecs/render/TextResourcePool.js";
import { TextRenderMode } from "../../../ecs/render/TextRenderMode.js";
import { TextSystem } from "../../../ecs/systems/TextSystem.js";
import { Font } from "../../../loaders/Font.js";
import { FontLoader } from "../../../loaders/FontLoader.js";
import { ImageLoader } from "../../../loaders/ImageLoader.js";

function mockCtx() {
  const ctx = {
    save: mock.fn(),
    restore: mock.fn(),
    translate: mock.fn(),
    rotate: mock.fn(),
    scale: mock.fn(),
    clearRect: mock.fn(),
    fillRect: mock.fn(),
    drawImage: mock.fn(),
    beginPath: mock.fn(),
    arc: mock.fn(),
    fill: mock.fn(),
    stroke: mock.fn(),
    moveTo: mock.fn(),
    lineTo: mock.fn(),
    set fillStyle(v) {},
    set strokeStyle(v) {},
    set lineWidth(v) {},
    set imageSmoothingEnabled(v) { this._imageSmoothingEnabled = v; },
    getTransform() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; },
    setTransform() {},
  };
  return ctx;
}

describe("Renderer contract", () => {
  it("is abstract and cannot be instantiated directly", () => {
    assert.throws(() => new Renderer(), /abstract/);
  });

  it("declares contract methods that throw on direct use", () => {
    class Broken extends Renderer {}
    const b = new Broken();
    assert.throws(() => b.beginFrame(), /not implemented/);
    assert.throws(() => b.clear(), /not implemented/);
    assert.throws(() => b.render({}), /not implemented/);
    assert.throws(() => b.endFrame(), /not implemented/);
    assert.throws(() => b.destroy(), /not implemented/);
    assert.throws(() => b.immediateContext, /not implemented/);
    assert.throws(() => b.immediateBackgroundContext, /not implemented/);
  });

  it("base resize updates shared width/height bookkeeping", () => {
    class Broken extends Renderer {}
    const b = new Broken();
    b.resize(640, 480);
    assert.strictEqual(b.width, 640);
    assert.strictEqual(b.height, 480);
  });
});

describe("CanvasRenderer", () => {
  it("exposes width, height, canvas and immediateContext", () => {
    const ctx = mockCtx();
    const r = new CanvasRenderer({ context: ctx, width: 800, height: 600 });
    assert.strictEqual(r.immediateContext, ctx);
    assert.strictEqual(r.immediateBackgroundContext, ctx);
    assert.strictEqual(r.width, 800);
    assert.strictEqual(r.height, 600);
    assert.strictEqual(r.canvas, null);
  });

  it("reads size from the canvas when width/height are not given", () => {
    const canvas = {
      width: 320,
      height: 240,
      getContext: (kind) => {
        assert.strictEqual(kind, "2d");
        return mockCtx();
      },
    };
    const r = new CanvasRenderer({ canvas });
    assert.strictEqual(r.width, 320);
    assert.strictEqual(r.height, 240);
  });

  it("clear() clears the frame", () => {
    const ctx = mockCtx();
    const r = new CanvasRenderer({ context: ctx, width: 100, height: 50 });
    r.clear();
    assert.strictEqual(ctx.clearRect.mock.calls.length, 1);
    assert.deepStrictEqual(ctx.clearRect.mock.calls[0].arguments, [0, 0, 100, 50]);
  });

  it("applies the imageSmoothing option", () => {
    const ctx = mockCtx();
    new CanvasRenderer({ context: ctx, options: { imageSmoothing: false } });
    assert.strictEqual(ctx._imageSmoothingEnabled, false);
  });

  it("beginFrame/endFrame/destroy are safe no-ops", () => {
    const r = new CanvasRenderer({ context: mockCtx() });
    assert.doesNotThrow(() => r.beginFrame());
    assert.doesNotThrow(() => r.endFrame());
    assert.doesNotThrow(() => r.destroy());
  });

  it("resize updates logical size and canvas", () => {
    const canvas = { width: 100, height: 100, getContext: () => mockCtx() };
    const r = new CanvasRenderer({ canvas });
    r.resize(640, 480);
    assert.strictEqual(r.width, 640);
    assert.strictEqual(r.height, 480);
    assert.strictEqual(canvas.width, 640);
    assert.strictEqual(canvas.height, 480);
  });

  it("resize with the same size does not reset the canvas backing store", () => {
    const canvas = { width: 100, height: 100, getContext: () => mockCtx() };
    const r = new CanvasRenderer({ canvas });
    r.resize(100, 100);
    assert.strictEqual(canvas.width, 100);
    assert.strictEqual(canvas.height, 100);
  });

  it("resize re-applies imageSmoothing after a backing-store reset", () => {
    const ctx = mockCtx();
    const r = new CanvasRenderer({ context: ctx, options: { imageSmoothing: false } });
    ctx._imageSmoothingEnabled = true;
    r.resize(640, 480);
    assert.strictEqual(ctx._imageSmoothingEnabled, false);
  });

  it("render(world) is a no-op without a context", () => {
    const r = new CanvasRenderer();
    assert.doesNotThrow(() => r.render(new World()));
  });

  it("executes the retained render queue", () => {
    const world = new World();
    world.register(Transform);
    world.register(Renderable);
    world.register(RenderBounds);
    world.register(Visible);
    world.setResource(RenderQueue, new RenderQueue());
    world.addSystem(new RenderSystem());

    const e = world.createEntity();
    world.addMany(e, Transform, Renderable, RenderBounds, Visible);
    world.set(e, Transform, { x: 0, y: 0 });
    world.set(e, Renderable, { image: 0, layer: 1 });
    world.set(e, RenderBounds, { width: 10, height: 10 });
    world.set(e, Visible, { value: 1 });
    world.update(16);

    const ctx = mockCtx();
    new CanvasRenderer({ context: ctx }).render(world);
    assert.ok(ctx.save.mock.calls.length >= 1);
    assert.ok(ctx.restore.mock.calls.length >= 1);
    assert.ok(ctx.fillRect.mock.calls.length >= 1 || ctx.drawImage.mock.calls.length >= 1);
  });

  it("applies camera transform from Camera and Viewport resources", () => {
    const world = new World();
    world.setResource(Camera, new Camera(100, 50, 2));
    world.setResource(Viewport, new Viewport(0, 0, 800, 600));

    const ctx = mockCtx();
    new CanvasRenderer({ context: ctx }).render(world);

    const translates = ctx.translate.mock.calls.map((c) => c.arguments);
    assert.deepStrictEqual(translates, [[400, 300], [-100, -50]]);
    assert.deepStrictEqual(ctx.scale.mock.calls[0].arguments, [2, 2]);
  });

  it("renders effects sorted by depth", () => {
    const world = new World();
    const order = [];
    for (const d of [10, -5, 0]) {
      world.addEffect({ depth: d, render: () => order.push(d) });
    }

    new CanvasRenderer({ context: mockCtx() }).render(world);
    assert.deepStrictEqual(order, [-5, 0, 10]);
  });

  it("renders trail renderables through the CanvasContext resource", () => {
    const world = new World();
    world.register(Transform);
    world.register(Visible);
    world.register(Trail);
    const manager = new TrailManager();
    const ctx = mockCtx();
    world.setResource(TrailManager, manager);
    world.setResource(CanvasContext, ctx);
    world.addSystem(new TrailSystem());

    const e = world.createEntity();
    world.addComponent(e, Transform);
    world.setComponent(e, Transform, { x: 0, y: 0 });
    world.addComponent(e, Visible);
    world.setComponent(e, Visible, { value: 1 });
    world.addComponent(e, Trail);
    world.setComponent(e, Trail, { enabled: 1, maxPoints: 64, spacing: 4, width: 4, color: 0xffffff, mode: 0 });
    world.update(1 / 60);
    world.setComponent(e, Transform, { x: 50, y: 0 });
    world.update(1 / 60);

    new CanvasRenderer({ context: ctx }).render(world);
    assert.ok(ctx.beginPath.mock.calls.length >= 1);
    assert.ok(ctx.stroke.mock.calls.length >= 1);
  });
});

describe("World renderable surface", () => {
  it("exposes queue, trails and effects", () => {
    const world = new World();
    world.setResource(RenderQueue, new RenderQueue());
    const fx = { depth: 1 };
    world.addEffect(fx);

    assert.strictEqual(world.effects, world._effects);
    const surface = world.renderables;
    assert.ok(surface.queue instanceof RenderQueue);
    assert.deepStrictEqual(surface.effects, [fx]);
    assert.ok(Array.isArray(surface.trails));
  });

  it("collectTrailRenderables returns [] without a TrailManager", () => {
    const world = new World();
    assert.deepStrictEqual(world.collectTrailRenderables(), []);
  });
});

function makeImageData(w, h, colorAt) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = colorAt(x, y);
      if (!c) continue;
      const i = (y * w + x) * 4;
      data[i] = c[0];
      data[i + 1] = c[1];
      data[i + 2] = c[2];
      data[i + 3] = 255;
    }
  }
  return data;
}

function makeImage(w, h, colorAt) {
  return {
    width: w,
    height: h,
    data: makeImageData(w, h, colorAt),
    getImageData() {
      return { data: this.data, width: w, height: h };
    },
  };
}

function gridImage() {
  return makeImage(4, 2, () => [255, 255, 255]);
}

function imageDataFrom(img) {
  const seen = new Set();
  while (img) {
    if (typeof img.getImageData === "function") return img.getImageData();
    if (img.getContext) {
      const c = img.getContext("2d");
      if (!c || seen.has(c)) return null;
      seen.add(c);
      if (c._put) return { data: new Uint8ClampedArray(c._put.data), width: c._put.width, height: c._put.height };
      img = c._img;
      continue;
    }
    return null;
  }
  return null;
}

if (typeof global.document === "undefined") {
  global.document = {
    createElement: () => {
      const canvas = {
        width: 0,
        height: 0,
        _ctx: null,
        getContext: () => {
          if (!canvas._ctx) {
            canvas._ctx = {
              _img: null,
              drawImage(...args) { this._img = args[0]; },
              getImageData() {
                if (this._put) {
                  return { data: new Uint8ClampedArray(this._put.data), width: this._put.width, height: this._put.height };
                }
                const found = imageDataFrom(this._img);
                if (found) {
                  return { data: new Uint8ClampedArray(found.data), width: found.width, height: found.height };
                }
                return {
                  data: new Uint8ClampedArray(canvas.width * canvas.height * 4),
                  width: canvas.width,
                  height: canvas.height,
                };
              },
              fillRect() {},
              clearRect() {},
              fillStyle: null,
              globalCompositeOperation: null,
              putImageData(img) { this._put = img; },
            };
          }
          return canvas._ctx;
        },
      };
      return canvas;
    },
  };
}

describe("CanvasRenderer text integration", () => {
  const origImgLoad = ImageLoader.load;
  const origFLoad = FontLoader.load;
  let font;

  before(async () => {
    ImageLoader.load = async () => gridImage();
    FontLoader.load = async () => {};
    font = await Font.load("Grid", { image: "grid.png", characters: "AB", gridX: 2, gridY: 1 });
  });

  after(() => {
    ImageLoader.load = origImgLoad;
    FontLoader.load = origFLoad;
    Font.clear();
  });

  function makeTextWorld() {
    const world = new World();
    world.register(Transform);
    world.register(Renderable);
    world.register(TextComponent);
    world.register(Visible);
    world.setResource(RenderQueue, new RenderQueue());
    world.setResource(TextResourcePool, new TextResourcePool());
    world.addSystem(new TextSystem());
    return world;
  }

  function addTextEntity(world, x, y, handle) {
    const e = world.createEntity();
    world.addMany(e, Transform, Renderable, TextComponent, Visible);
    world.set(e, Transform, { x, y, rotation: 0, scaleX: 1, scaleY: 1, _prevX: x, _prevY: y, _interpValid: 1 });
    world.set(e, Renderable, { fillColor: 0xffffff, layer: 1, depth: 0, imageSmoothing: 1 });
    world.set(e, TextComponent, { fontHandle: font.id, contentHandle: handle, align: 0, letterSpacing: 0, version: 1, surfaceVersion: 1, renderMode: TextRenderMode.RASTERIZED });
    world.set(e, Visible, { value: 1 });
    return e;
  }

  it("renders TextSystem text as a single drawImage of the surface", () => {
    const world = makeTextWorld();
    const pool = world.getResource(TextResourcePool);
    const handle = pool.allocate("AB");
    addTextEntity(world, 100, 50, handle);
    world.update(16);

    const ctx = mockCtx();
    new CanvasRenderer({ context: ctx, width: 800, height: 600 }).render(world);

    assert.strictEqual(ctx.drawImage.mock.calls.length, 1, "one text surface, one draw");
    assert.strictEqual(ctx.drawImage.mock.calls[0].arguments[0], pool.surface(handle));
  });

  it("applies the camera transform to the text surface", () => {
    const world = makeTextWorld();
    const pool = world.getResource(TextResourcePool);
    const handle = pool.allocate("AB");
    addTextEntity(world, 100, 50, handle);
    world.setResource(Camera, new Camera(0, 0, 1));
    world.setResource(Viewport, new Viewport(0, 0, 800, 600));
    world.update(16);

    const transforms = [];
    const ctx = mockCtx();
    ctx.setTransform = (...args) => { transforms.push(args); };
    new CanvasRenderer({ context: ctx, width: 800, height: 600 }).render(world);

    // viewport center (400, 300) + surface world position
    assert.strictEqual(transforms.length, 1);
    assert.strictEqual(transforms[0][4], 500);
    assert.strictEqual(transforms[0][5], 350);
  });
});
