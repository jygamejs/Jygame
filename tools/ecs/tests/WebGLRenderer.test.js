import { describe, it } from "node:test";
import * as assert from "node:assert";
import { WebGLRenderer } from "../../../renderer/WebGLRenderer.js";
import { World } from "../../../ecs/core/World.js";
import { RenderQueue } from "../../../ecs/render/RenderQueue.js";
import { RenderConfig } from "../../../view/RenderConfig.js";
import { Camera } from "../../../view/Camera.js";
import { Viewport } from "../../../view/Viewport.js";
import { Diagnostics, MetricCategory, MetricUnit, MetricType } from "../../../debug/index.js";
import { Trail, Transform, Visible, TrailManager, TrailBuffer } from "../../../ecs/index.js";
import { ParticleEffect } from "../../../particles/ParticleEffect.js";
import { Particle } from "../../../display/Particle.js";
import { GpuParticleBackend } from "../../../particles/backends/GpuParticleBackend.js";
import { GpuParticleRenderer } from "../../../particles/renderers/GpuParticleRenderer.js";
import { makeMockGL } from "./lib/MockGL.js";

function makeWorld(opts = {}) {
  const world = new World();
  const queue = new RenderQueue();
  world.setResource(RenderQueue, queue);
  if (opts.camera) world.setResource(Camera, opts.camera);
  if (opts.viewport) world.setResource(Viewport, opts.viewport);
  if (opts.config) world.setResource(RenderConfig, opts.config);
  return { world, queue };
}

function pushRect(queue, overrides = {}) {
  queue.push(
    overrides.image ?? null,
    overrides.sx ?? 0, overrides.sy ?? 0, overrides.sw ?? 0, overrides.sh ?? 0,
    overrides.x ?? 10, overrides.y ?? 20, overrides.rotation ?? 0,
    overrides.scaleX ?? 1, overrides.scaleY ?? 1,
    overrides.width ?? 40, overrides.height ?? 40,
    overrides.fillColor ?? 0xff0000, overrides.shape ?? 0, overrides.layer ?? 1,
    overrides.imageSmoothing ?? true, overrides.depth ?? 0,
  );
}

describe("WebGLRenderer", () => {
  it("isAvailable() returns false without a DOM", () => {
    assert.strictEqual(WebGLRenderer.isAvailable(), false);
  });

  it("throws without a WebGL2 context", () => {
    assert.throws(() => new WebGLRenderer({}), /WebGL2/);
    assert.throws(() => new WebGLRenderer({ canvas: { getContext: () => null } }), /WebGL2/);
  });

  it("compiles and links the sprite and composite programs", () => {
    const { gl, calls } = makeMockGL();
    new WebGLRenderer({ context: gl, width: 800, height: 600 });
    assert.ok(calls.createShader.length >= 4);
    assert.ok(calls.linkProgram.length >= 2);
  });

  it("clear() uses the default transparent clear color", () => {
    const { gl, calls } = makeMockGL();
    const renderer = new WebGLRenderer({ context: gl, width: 800, height: 600 });
    renderer.clear();
    assert.deepStrictEqual(calls.clearColor[0], [0, 0, 0, 0]);
    assert.ok(calls.clear.length >= 1);
    assert.ok(calls.enable.includes(gl.BLEND));
    assert.ok(calls.disable.includes(gl.DEPTH_TEST));
  });

  it("composite texture is complete (non-mipmapped LINEAR min filter)", () => {
    const { gl, calls } = makeMockGL();
    new WebGLRenderer({ context: gl, width: 800, height: 600 });
    const hasLinearMin = calls.texParameteri.some(
      (c) => c.pname === gl.TEXTURE_MIN_FILTER && c.value === gl.LINEAR,
    );
    assert.ok(
      hasLinearMin,
      "an incomplete composite texture samples opaque black, blacking out the frame",
    );
  });

  it("render(world) batches a sprite command into one instanced draw", () => {
    const { gl, calls } = makeMockGL();
    const renderer = new WebGLRenderer({ context: gl, width: 800, height: 600 });
    const { world, queue } = makeWorld();
    pushRect(queue, { x: 10, y: 20, width: 40, height: 40, fillColor: 0xff0000 });
    renderer.render(world);

    const draws = calls.drawArraysInstanced;
    assert.strictEqual(draws.length, 1);
    assert.strictEqual(draws[0].instanceCount, 1);
    assert.strictEqual(draws[0].count, 4);
  });

  it("draws each batch with its own texture when textures upload mid-frame", () => {
    const { gl, calls } = makeMockGL();
    const renderer = new WebGLRenderer({ context: gl, width: 800, height: 600 });
    const { world, queue } = makeWorld();

    const imgA = { width: 8, height: 8, naturalWidth: 8, naturalHeight: 8 };
    const imgB = { width: 8, height: 8, naturalWidth: 8, naturalHeight: 8 };
    queue.push(imgA, 0, 0, 8, 8, 10, 10, 0, 1, 1, 8, 8, 0xffffff, 0, 1, true, 0);
    queue.push(imgB, 0, 0, 8, 8, 50, 10, 0, 1, 1, 8, 8, 0xffffff, 0, 1, true, 0);

    // Cache-miss upload binds the new texture; without a re-bind the first
    // sprite's batch is drawn with the second sprite's texture.
    const drawnWith = [];
    const origDraw = gl.drawArraysInstanced;
    gl.drawArraysInstanced = (mode, first, count, instanceCount) => {
      drawnWith.push(gl._boundTexture ? gl._boundTexture.id : null);
      return origDraw(mode, first, count, instanceCount);
    };

    renderer.render(world);

    const texA = renderer._textures._cache.get(imgA).texture;
    const texB = renderer._textures._cache.get(imgB).texture;
    assert.strictEqual(drawnWith.length, 2);
    assert.strictEqual(drawnWith[0], texA.id, "first sprite must draw with its own texture");
    assert.strictEqual(drawnWith[1], texB.id, "second sprite must draw with its own texture");
  });

  it("primitive instance data carries position, size, color, depth and shape", () => {
    const { gl, calls } = makeMockGL();
    const renderer = new WebGLRenderer({ context: gl, width: 800, height: 600 });
    const { world, queue } = makeWorld();
    pushRect(queue, { x: 10, y: 20, width: 40, height: 80, fillColor: 0x112233, shape: 1, depth: 5 });
    renderer.render(world);

    const d = renderer._batch.data;
    assert.strictEqual(d[0], 10);       // x
    assert.strictEqual(d[1], 20);       // y
    assert.strictEqual(d[5], 40);       // width
    assert.strictEqual(d[6], 80);       // height
    assert.ok(Math.abs(d[11] - 0x11 / 255) < 1e-6); // r
    assert.ok(Math.abs(d[12] - 0x22 / 255) < 1e-6); // g
    assert.ok(Math.abs(d[13] - 0x33 / 255) < 1e-6); // b
    assert.strictEqual(d[14], 1);       // alpha
    assert.ok(Math.abs(d[15] - 0.99) < 1e-6);       // depth clamped into NDC
    assert.strictEqual(d[16], 1);       // shape (circle)
  });

  it("camera uniform reflects the Camera and Viewport resources", () => {
    const { gl, calls } = makeMockGL();
    const renderer = new WebGLRenderer({ context: gl, width: 800, height: 600 });
    const { world, queue } = makeWorld({
      camera: new Camera(100, 50, 2),
      viewport: new Viewport(0, 0, 800, 600),
    });
    pushRect(queue, { x: 100, y: 50 });
    renderer.render(world);

    const call = calls.uniformMatrix4fv.find((c) => c.loc && c.loc.name === "uMatrix");
    assert.ok(call, "uMatrix uniform should be set");
    const m = call.value;
    assert.ok(Math.abs(m[0] - 0.005) < 1e-9);
    assert.ok(Math.abs(m[5] - (-2 / 600 * 2)) < 1e-9);
    assert.ok(Math.abs(m[12] - (-0.5)) < 1e-9);
    assert.ok(Math.abs(m[13] - (1 / 3)) < 1e-6);
  });

  it("uploads AssetRegistry images lazily and computes UVs from the source rect", () => {
    const { gl, calls } = makeMockGL();
    const renderer = new WebGLRenderer({ context: gl, width: 800, height: 600 });
    const image = { width: 32, height: 16 };
    const { world, queue } = makeWorld();
    pushRect(queue, { image, sx: 4, sy: 2, sw: 8, sh: 4 });
    renderer.render(world);

    const upload = calls.texImage2D.find((c) => c.source === image);
    assert.ok(upload, "image should be uploaded as a texture");

    const d = renderer._batch.data;
    assert.ok(Math.abs(d[7] - 4 / 32) < 1e-6);   // u0
    assert.ok(Math.abs(d[8] - 2 / 16) < 1e-6);   // v0
    assert.ok(Math.abs(d[9] - 12 / 32) < 1e-6);  // u1
    assert.ok(Math.abs(d[10] - 6 / 16) < 1e-6);  // v1
  });

  it("clear color comes from the RenderConfig resource", () => {
    const { gl, calls } = makeMockGL();
    const renderer = new WebGLRenderer({ context: gl, width: 800, height: 600 });
    const { world, queue } = makeWorld({ config: new RenderConfig({ clearColor: "#102030" }) });
    pushRect(queue);
    renderer.render(world);
    renderer.clear();

    const last = calls.clearColor[calls.clearColor.length - 1];
    assert.ok(Math.abs(last[0] - 0x10 / 255) < 1e-6);
    assert.ok(Math.abs(last[1] - 0x20 / 255) < 1e-6);
    assert.ok(Math.abs(last[2] - 0x30 / 255) < 1e-6);
  });

  it("culling skips instances outside the viewport", () => {
    const { gl, calls } = makeMockGL();
    const renderer = new WebGLRenderer({ context: gl, width: 800, height: 600 });
    const { world, queue } = makeWorld({
      camera: new Camera(400, 300, 1),
      viewport: new Viewport(0, 0, 800, 600),
      config: new RenderConfig({ culling: true }),
    });
    pushRect(queue, { x: 100000, y: 100000 });
    renderer.render(world);
    assert.strictEqual(calls.drawArraysInstanced.length, 0);
  });

  it("records render.draw / render.batch / render.images / render.primitives metrics", () => {
    const { gl } = makeMockGL();
    const renderer = new WebGLRenderer({ context: gl, width: 800, height: 600 });
    const world = new World();
    const queue = new RenderQueue();
    world.setResource(RenderQueue, queue);

    const diag = new Diagnostics();
    for (const name of ["render.draw", "render.batch", "render.images", "render.primitives"]) {
      diag.registerMetric({ name, category: MetricCategory.RENDER, group: "Render", unit: MetricUnit.MILLISECONDS, type: MetricType.TIMER, tags: Object.freeze(["render"]) });
    }
    world.setResource(Diagnostics, diag);
    diag.lockRegistry();

    const image = { width: 8, height: 8 };
    pushRect(queue, { image });
    pushRect(queue, { fillColor: 0x00ff00 });
    renderer.render(world);

    const snap = diag.lastSnapshot;
    const images = diag.metrics.find("render.images");
    const primitives = diag.metrics.find("render.primitives");
    assert.strictEqual(snap.counter(images.id), 1);
    assert.strictEqual(snap.counter(primitives.id), 1);
  });

  it("resize sets the GL viewport and resizes the immediate surface", () => {
    const { gl, calls } = makeMockGL();
    const renderer = new WebGLRenderer({ context: gl, width: 800, height: 600 });
    renderer.resize(640, 480);
    assert.deepStrictEqual(calls.viewport[calls.viewport.length - 1], [0, 0, 640, 480]);
    assert.strictEqual(renderer.width, 640);
    assert.strictEqual(renderer.height, 480);
  });

  it("endFrame composites the foreground overlay as a fullscreen quad", () => {
    const previous = globalThis.document;
    globalThis.document = {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: (kind) => (kind === "2d" ? { clearRect() {}, fillRect() {} } : null),
      }),
    };
    try {
      const { gl, calls } = makeMockGL();
      const renderer = new WebGLRenderer({ context: gl, width: 800, height: 600 });
      renderer.immediateContext.fillRect(0, 0, 1, 1);
      renderer.endFrame();
      assert.ok(calls.drawArrays.some((c) => c.mode === gl.TRIANGLE_STRIP && c.count === 4));
    } finally {
      if (previous === undefined) delete globalThis.document;
      else globalThis.document = previous;
    }
  });

  it("composites the background overlay before the world is drawn", () => {
    const previous = globalThis.document;
    globalThis.document = {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: (kind) => (kind === "2d" ? { clearRect() {}, fillRect() {} } : null),
      }),
    };
    try {
      const { gl, calls } = makeMockGL();
      const renderer = new WebGLRenderer({ context: gl, width: 800, height: 600 });
      renderer.immediateBackgroundContext.fillRect(0, 0, 1, 1);
      const { world, queue } = makeWorld({ config: new RenderConfig({ clearColor: "#102030" }) });
      pushRect(queue);
      renderer.render(world);

      const strips = calls.drawArrays.filter((c) => c.mode === gl.TRIANGLE_STRIP && c.count === 4);
      assert.strictEqual(strips.length, 1, "background composite quad only");
      assert.strictEqual(calls.drawArrays[0], strips[0], "composite quad is drawn before sprites");
    } finally {
      if (previous === undefined) delete globalThis.document;
      else globalThis.document = previous;
    }
  });

  it("destroy releases GL resources", () => {
    const { gl, calls } = makeMockGL();
    const renderer = new WebGLRenderer({ context: gl, width: 800, height: 600 });
    renderer.destroy();
    assert.ok(calls.deleteProgram.length >= 2);
    assert.ok(calls.deleteBuffer.length >= 1);
    assert.ok(calls.deleteVertexArray.length >= 1);
  });

  it("exposes the WebGL2 context via the gl getter", () => {
    const { gl } = makeMockGL();
    const renderer = new WebGLRenderer({ context: gl, width: 800, height: 600 });
    assert.strictEqual(renderer.gl, gl);
  });
});

function addTrailEntity(world, points, opts = {}) {
  const manager = world.getResource(TrailManager);
  const e = world.createEntity();
  world.addComponent(e, Transform);
  world.setComponent(e, Transform, { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
  world.addComponent(e, Visible);
  world.setComponent(e, Visible, { value: 1 });
  world.addComponent(e, Trail);
  world.setComponent(e, Trail, {
    enabled: opts.enabled ?? 1,
    maxPoints: opts.maxPoints ?? 64,
    spacing: opts.spacing ?? 4,
    width: opts.width ?? 4,
    color: opts.color ?? 0xffffff,
    mode: opts.mode ?? 0,
    depth: opts.depth ?? 0,
  });
  const buf = manager.getOrCreate(e, opts.maxPoints ?? 64);
  for (const [x, y] of points) buf.addPoint(x, y);
  return { world, manager, e };
}

function makeTrailWorld(points, opts = {}) {
  const world = new World();
  world.register(Transform);
  world.register(Visible);
  world.register(Trail);
  const manager = new TrailManager();
  world.setResource(TrailManager, manager);
  addTrailEntity(world, points, opts);
  return { world, manager };
}

describe("WebGLRenderer trails", () => {
  it("renders a trail as a single triangle strip with one quad per segment", () => {
    const { gl, calls } = makeMockGL();
    const renderer = new WebGLRenderer({ context: gl, width: 800, height: 600 });
    const { world } = makeTrailWorld([[0, 0], [50, 0], [100, 0]]);
    renderer.render(world);

    const strips = calls.drawArrays.filter((c) => c.mode === gl.TRIANGLE_STRIP);
    assert.strictEqual(strips.length, 1);
    assert.strictEqual(strips[0].count, 6); // 3 points -> 6 ribbon vertices
    renderer.destroy();
  });

  it("sorts trails by depth and bridges them in one strip", () => {
    const { gl, calls } = makeMockGL();
    const renderer = new WebGLRenderer({ context: gl, width: 800, height: 600 });
    const world = new World();
    world.register(Transform);
    world.register(Visible);
    world.register(Trail);
    world.setResource(TrailManager, new TrailManager());
    addTrailEntity(world, [[0, 0], [10, 0], [20, 0]], { depth: 5, color: 0xff0000 });
    addTrailEntity(world, [[0, 0], [10, 0], [20, 0], [30, 0]], { depth: -2, color: 0x0000ff });
    renderer.render(world);

    const strips = calls.drawArrays.filter((c) => c.mode === gl.TRIANGLE_STRIP);
    assert.strictEqual(strips.length, 1);
    // blue trail (4 points -> 8 verts) + connector (2) + red trail (3 points -> 6 verts)
    assert.strictEqual(strips[0].count, 16);

    const d = renderer._trailBatch._data;
    assert.strictEqual(d[0 * 5 + 4], 1);       // first vertex is blue (b = 1)
    assert.strictEqual(d[10 * 5 + 2], 1);      // red trail starts after blue + connector
    renderer.destroy();
  });

  it("records render.trails metrics", () => {
    const { gl } = makeMockGL();
    const renderer = new WebGLRenderer({ context: gl, width: 800, height: 600 });
    const { world } = makeTrailWorld([[0, 0], [10, 0], [20, 0], [30, 0]], { mode: 1 });

    const diag = new Diagnostics();
    for (const name of ["render.trails", "render.trails.segments", "render.trails.lines", "render.trails.ribbons"]) {
      diag.registerMetric({ name, category: MetricCategory.RENDER, group: "Render", unit: MetricUnit.MILLISECONDS, type: MetricType.COUNTER, tags: Object.freeze(["render"]) });
    }
    world.setResource(Diagnostics, diag);
    diag.lockRegistry();

    renderer.render(world);

    const snap = diag.lastSnapshot;
    assert.strictEqual(snap.counter(diag.metrics.find("render.trails.segments").id), 3);
    assert.strictEqual(snap.counter(diag.metrics.find("render.trails.ribbons").id), 1);
    assert.strictEqual(snap.counter(diag.metrics.find("render.trails.lines").id), 0);
    renderer.destroy();
  });
});

describe("WebGLRenderer particles", () => {
  function makeEffectWorld() {
    const world = new World();
    world.setResource(RenderQueue, new RenderQueue());
    return world;
  }

  it("draws CPU-backend particles as instanced quads", () => {
    const { gl, calls } = makeMockGL();
    const renderer = new WebGLRenderer({ context: gl, width: 800, height: 600 });
    const world = makeEffectWorld();
    ParticleEffect._defaultWorld = world;
    try {
      const effect = Particle.create({});
      effect.burst(4);
      renderer.render(world);

      const draws = calls.drawArraysInstanced;
      assert.strictEqual(draws.length, 1);
      assert.strictEqual(draws[0].instanceCount, 4);
      effect.destroy();
    } finally {
      ParticleEffect._defaultWorld = null;
      renderer.destroy();
    }
  });

  it("applies per-effect depth as the instance z (depth order)", () => {
    const { gl } = makeMockGL();
    const renderer = new WebGLRenderer({ context: gl, width: 800, height: 600 });
    const world = makeEffectWorld();
    ParticleEffect._defaultWorld = world;
    try {
      const back = Particle.create({});
      back.depth = -5;
      const front = Particle.create({});
      front.depth = 10;
      back.burst(1);
      front.burst(1);
      renderer.render(world);

      const d = renderer._batch.data;
      assert.ok(Math.abs(d[15] - (-0.99)) < 1e-6);   // back effect first
      assert.ok(Math.abs(d[32] - 0.99) < 1e-6);      // front effect after
      back.destroy();
      front.destroy();
    } finally {
      ParticleEffect._defaultWorld = null;
      renderer.destroy();
    }
  });

  it("uploads particle textures and computes frame UVs", () => {
    const { gl, calls } = makeMockGL();
    const renderer = new WebGLRenderer({ context: gl, width: 800, height: 600 });
    const world = makeEffectWorld();
    ParticleEffect._defaultWorld = world;
    try {
      const img = { width: 32, height: 16 };
      const effect = Particle.create({
        initializer: (p) => {
          p.texture = img;
          p.size = 8;
          p.frameX = 4;
          p.frameY = 2;
          p.frameWidth = 8;
          p.frameHeight = 4;
        },
      });
      effect.burst(1);
      renderer.render(world);

      const upload = calls.texImage2D.find((c) => c.source === img);
      assert.ok(upload, "particle image should be uploaded as a texture");

      const d = renderer._batch.data;
      assert.ok(Math.abs(d[7] - 4 / 32) < 1e-6);   // u0
      assert.ok(Math.abs(d[8] - 2 / 16) < 1e-6);   // v0
      assert.ok(Math.abs(d[9] - 12 / 32) < 1e-6);  // u1
      assert.ok(Math.abs(d[10] - 6 / 16) < 1e-6);  // v1
      effect.destroy();
    } finally {
      ParticleEffect._defaultWorld = null;
      renderer.destroy();
    }
  });

  it("renders a backend:'gpu' effect end-to-end via the shared GL context", () => {
    const { gl, calls } = makeMockGL();
    const renderer = new WebGLRenderer({ context: gl, width: 800, height: 600 });
    const world = makeEffectWorld();
    ParticleEffect._defaultWorld = world;
    try {
      const effect = Particle.create({ backend: "gpu", renderer });
      assert.ok(effect.system._backend instanceof GpuParticleBackend);
      assert.ok(effect.system._backend._renderer instanceof GpuParticleRenderer);
      assert.strictEqual(effect.system._backend._renderer._gl, renderer.gl);

      effect.burst(3);
      renderer.render(world);

      const draws = calls.drawArraysInstanced;
      assert.strictEqual(draws[draws.length - 1].instanceCount, 3);
      effect.destroy();
    } finally {
      ParticleEffect._defaultWorld = null;
      renderer.destroy();
    }
  });
});


describe("WebGLRenderer text glyphs", () => {
  it("batches text glyph commands into one instanced draw", () => {
    const { gl, calls } = makeMockGL();
    const renderer = new WebGLRenderer({ context: gl, width: 800, height: 600 });
    const { world, queue } = makeWorld();
    const canvas = { width: 4, height: 4 };
    queue.push(canvas, 0, 0, 4, 4, 10, 20, 0, 1, 1, 4, 4, 0xffffff, 0, 1, true, 0);
    queue.push(canvas, 0, 0, 4, 4, 30, 20, 0, 1, 1, 4, 4, 0xffffff, 0, 1, true, 0);
    renderer.render(world);

    const draws = calls.drawArraysInstanced;
    assert.strictEqual(draws.length, 1);
    assert.strictEqual(draws[0].instanceCount, 2);
    renderer.destroy();
  });

  it("uploads a shared glyph canvas once through the texture cache", () => {
    const { gl, calls } = makeMockGL();
    const renderer = new WebGLRenderer({ context: gl, width: 800, height: 600 });
    const { world, queue } = makeWorld();
    const canvas = { width: 4, height: 4 };
    queue.push(canvas, 0, 0, 4, 4, 10, 20, 0, 1, 1, 4, 4, 0xffffff, 0, 1, true, 0);
    queue.push(canvas, 0, 0, 4, 4, 30, 20, 0, 1, 1, 4, 4, 0xffffff, 0, 1, true, 0);
    renderer.render(world);

    const uploads = calls.texImage2D.filter((c) => c.source === canvas);
    assert.strictEqual(uploads.length, 1, "shared glyph canvas must upload once");
    renderer.destroy();
  });

  it("applies the camera to text glyph commands", () => {
    const { gl, calls } = makeMockGL();
    const renderer = new WebGLRenderer({ context: gl, width: 800, height: 600 });
    const { world, queue } = makeWorld({
      camera: new Camera(0, 0, 1),
      viewport: new Viewport(0, 0, 800, 600),
    });
    const canvas = { width: 4, height: 4 };
    queue.push(canvas, 0, 0, 4, 4, 100, 50, 0, 1, 1, 4, 4, 0xffffff, 0, 1, true, 0);
    renderer.render(world);

    const cam = calls.uniformMatrix4fv.find((c) => c.loc && c.loc.name === "uMatrix");
    assert.ok(cam, "camera view-projection must be uploaded for a text frame");
    assert.strictEqual(renderer._batch.data[0], 100);
    assert.strictEqual(renderer._batch.data[1], 50);
    renderer.destroy();
  });
});
