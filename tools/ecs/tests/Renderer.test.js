import { describe, it, mock } from "node:test";
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
    assert.throws(() => b.resize(1, 1), /not implemented/);
    assert.throws(() => b.destroy(), /not implemented/);
    assert.throws(() => b.immediateContext, /not implemented/);
  });
});

describe("CanvasRenderer", () => {
  it("exposes width, height, canvas and immediateContext", () => {
    const ctx = mockCtx();
    const r = new CanvasRenderer({ context: ctx, width: 800, height: 600 });
    assert.strictEqual(r.immediateContext, ctx);
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
