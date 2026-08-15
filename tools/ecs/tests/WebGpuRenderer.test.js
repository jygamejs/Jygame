import { describe, it } from "node:test";
import * as assert from "node:assert";
import { WebGpuRenderer } from "../../../renderer/WebGpuRenderer.js";
import { Renderer } from "../../../renderer/index.js";
import { World } from "../../../ecs/core/World.js";
import { RenderQueue } from "../../../ecs/render/RenderQueue.js";
import { RenderConfig } from "../../../view/RenderConfig.js";
import { Camera } from "../../../view/Camera.js";
import { Viewport } from "../../../view/Viewport.js";
import { Diagnostics, MetricCategory, MetricUnit, MetricType } from "../../../debug/index.js";
import { Trail, Transform, Visible, TrailManager } from "../../../ecs/index.js";
import { ParticleEffect } from "../../../particles/ParticleEffect.js";
import { Particle } from "../../../display/Particle.js";
import { GpuParticleBackend } from "../../../particles/backends/GpuParticleBackend.js";
import { makeMockGPU } from "./lib/MockGPU.js";

function makeCanvas(mock) {
  return {
    width: 800,
    height: 600,
    getContext: (kind) => (kind === "webgpu" ? mock.context : null),
  };
}

async function makeRenderer(mock, options = {}) {
  const renderer = new WebGpuRenderer({
    canvas: makeCanvas(mock),
    width: 800,
    height: 600,
    options: { ...options, device: mock.device, format: "bgra8unorm" },
  });
  await renderer.initialize();
  return renderer;
}

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

function withNavigator(navigatorValue, fn) {
  const desc = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const hadNavigator = desc !== undefined;
  try {
    if (navigatorValue === undefined) {
      if (hadNavigator) delete globalThis.navigator;
    } else {
      Object.defineProperty(globalThis, "navigator", { value: navigatorValue, configurable: true });
    }
    return fn();
  } finally {
    if (hadNavigator) {
      Object.defineProperty(globalThis, "navigator", desc);
    } else {
      delete globalThis.navigator;
    }
  }
}

describe("WebGpuRenderer", () => {
  it("isAvailable() returns false without navigator.gpu", () => {
    withNavigator(undefined, () => {
      assert.strictEqual(WebGpuRenderer.isAvailable(), false);
    });
  });

  it("throws without a WebGPU context", () => {
    assert.throws(() => new WebGpuRenderer({}), /WebGPU/);
    assert.throws(() => new WebGpuRenderer({ canvas: { getContext: () => null } }), /WebGPU/);
  });

  it("initialize() creates pipelines, buffers and configures the context", async () => {
    const mock = makeMockGPU();
    const renderer = await makeRenderer(mock);
    assert.ok(mock.log.createRenderPipeline.length >= 3, "sprite + trail + composite pipelines");
    assert.ok(mock.log.createBuffer.some(({ desc }) => (desc.usage & GPUBufferUsage.STORAGE) !== 0));
    assert.ok(mock.log.createBuffer.some(({ desc }) => (desc.usage & GPUBufferUsage.VERTEX) !== 0));
    assert.ok(mock.log.createBuffer.some(({ desc }) => (desc.usage & GPUBufferUsage.UNIFORM) !== 0));
    assert.ok(mock.log.configure.length >= 1);
    renderer.destroy();
  });

  it("render() is a no-op before initialize() resolves", () => {
    const mock = makeMockGPU();
    const renderer = new WebGpuRenderer({ canvas: makeCanvas(mock), width: 800, height: 600 });
    const { world, queue } = makeWorld();
    pushRect(queue);
    renderer.render(world);
    assert.strictEqual(mock.log.submit.length, 0);
    renderer.destroy();
  });

  it("batches a sprite command into one instanced draw and uploads instance data", async () => {
    const mock = makeMockGPU();
    const renderer = await makeRenderer(mock);
    const { world, queue } = makeWorld();
    pushRect(queue, { x: 10, y: 20, width: 40, height: 40, fillColor: 0xff0000 });
    renderer.render(world);

    assert.strictEqual(mock.log.submit.length, 1);
    const draws = mock.log.draw;
    assert.strictEqual(draws.length, 1);
    assert.strictEqual(draws[0].vertexCount, 4);
    assert.strictEqual(draws[0].instanceCount, 1);

    assert.ok(mock.log.writeBuffer.some((w) => (w.buffer.usage & GPUBufferUsage.STORAGE) !== 0));
    renderer.destroy();
  });

  it("composites the background overlay under the world when drawn to", async () => {
    const previous = globalThis.document;
    globalThis.document = {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: (kind) => (kind === "2d" ? { clearRect() {}, fillRect() {} } : null),
      }),
    };
    try {
      const mock = makeMockGPU();
      const renderer = await makeRenderer(mock);
      renderer.immediateBackgroundContext.fillRect(0, 0, 1, 1);
      const { world, queue } = makeWorld();
      pushRect(queue, { x: 10, y: 20, width: 40, height: 40, fillColor: 0xff0000 });
      renderer.render(world);

      const draws = mock.log.draw.filter((d) => d.vertexCount === 4);
      assert.strictEqual(draws.length, 2, "background composite quad + sprite quad");
      renderer.destroy();
    } finally {
      if (previous === undefined) delete globalThis.document;
      else globalThis.document = previous;
    }
  });

  it("uploads per-instance position, size, color, depth and shape", async () => {
    const mock = makeMockGPU();
    const renderer = await makeRenderer(mock);
    const { world, queue } = makeWorld();
    pushRect(queue, { x: 10, y: 20, width: 40, height: 80, fillColor: 0x112233, shape: 1, depth: 5 });
    renderer.render(world);

    const upload = mock.log.writeBuffer.find((w) => (w.buffer.usage & GPUBufferUsage.STORAGE) !== 0);
    const d = new Float32Array(upload.data.buffer, upload.data.byteOffset, upload.data.byteLength / 4);
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
    renderer.destroy();
  });

  it("writes the camera view-projection into the uniform buffer", async () => {
    const mock = makeMockGPU();
    const renderer = await makeRenderer(mock);
    const { world, queue } = makeWorld({
      camera: new Camera(100, 50, 2),
      viewport: new Viewport(0, 0, 800, 600),
    });
    pushRect(queue, { x: 100, y: 50 });
    renderer.render(world);

    const upload = mock.log.writeBuffer.find((w) => (w.buffer.usage & GPUBufferUsage.UNIFORM) !== 0 && w.byteLength === 64);
    assert.ok(upload, "camera matrix should be written to a uniform buffer");
    const m = new Float32Array(upload.data.buffer, upload.data.byteOffset, 16);
    assert.ok(Math.abs(m[0] - 0.005) < 1e-9);
    assert.ok(Math.abs(m[5] - (-2 / 600 * 2)) < 1e-9);
    assert.ok(Math.abs(m[12] - (-0.5)) < 1e-9);
    renderer.destroy();
  });

  it("uses RenderConfig.clearColor as the render pass clearValue", async () => {
    const mock = makeMockGPU();
    const renderer = await makeRenderer(mock);
    const { world, queue } = makeWorld({ config: new RenderConfig({ clearColor: "#102030" }) });
    pushRect(queue);
    renderer.render(world);

    const pass = mock.log.beginRenderPass[0];
    const cv = pass.colorAttachments[0].clearValue;
    assert.ok(Math.abs(cv[0] - 0x10 / 255) < 1e-6);
    assert.ok(Math.abs(cv[1] - 0x20 / 255) < 1e-6);
    assert.ok(Math.abs(cv[2] - 0x30 / 255) < 1e-6);
    renderer.destroy();
  });

  it("culling skips instances outside the viewport", async () => {
    const mock = makeMockGPU();
    const renderer = await makeRenderer(mock);
    const { world, queue } = makeWorld({
      camera: new Camera(400, 300, 1),
      viewport: new Viewport(0, 0, 800, 600),
      config: new RenderConfig({ culling: true }),
    });
    pushRect(queue, { x: 100000, y: 100000 });
    renderer.render(world);
    const draws = mock.log.draw.filter((d) => d.vertexCount === 4);
    assert.strictEqual(draws.length, 0);
    renderer.destroy();
  });

  it("records render.draw / render.batch / render.images / render.primitives metrics", async () => {
    const mock = makeMockGPU();
    const renderer = await makeRenderer(mock);
    const world = new World();
    const queue = new RenderQueue();
    world.setResource(RenderQueue, queue);

    const diag = new Diagnostics();
    for (const name of ["render.draw", "render.batch", "render.images", "render.primitives"]) {
      diag.registerMetric({ name, category: MetricCategory.RENDER, group: "Render", unit: MetricUnit.MILLISECONDS, type: MetricType.TIMER, tags: Object.freeze(["render"]) });
    }
    world.setResource(Diagnostics, diag);
    diag.lockRegistry();

    const image = { width: 8, height: 8, data: new Uint8Array(8 * 8 * 4) };
    pushRect(queue, { image });
    pushRect(queue, { fillColor: 0x00ff00 });
    renderer.render(world);

    const snap = diag.lastSnapshot;
    assert.strictEqual(snap.counter(diag.metrics.find("render.images").id), 1);
    assert.strictEqual(snap.counter(diag.metrics.find("render.primitives").id), 1);
    renderer.destroy();
  });

  it("resize sets the canvas size and resizes the immediate surface", async () => {
    const mock = makeMockGPU();
    const renderer = await makeRenderer(mock);
    renderer.resize(640, 480);
    assert.strictEqual(renderer.canvas.width, 640);
    assert.strictEqual(renderer.canvas.height, 480);
    assert.strictEqual(renderer.width, 640);
    assert.strictEqual(renderer.height, 480);
    renderer.destroy();
  });

  it("endFrame composites the foreground overlay as a fullscreen quad", async () => {
    const previous = globalThis.document;
    globalThis.document = {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: (kind) => (kind === "2d" ? { clearRect() {}, fillRect() {} } : null),
      }),
    };
    try {
      const mock = makeMockGPU();
      const renderer = await makeRenderer(mock);
      renderer.immediateContext.fillRect(0, 0, 1, 1);
      renderer.endFrame();
      assert.ok(mock.log.copyExternalImageToTexture.length >= 1);
      assert.ok(mock.log.draw.some((d) => d.vertexCount === 4));
      renderer.destroy();
    } finally {
      if (previous === undefined) delete globalThis.document;
      else globalThis.document = previous;
    }
  });

  it("endFrame skips compositing when the foreground overlay is clean", async () => {
    const previous = globalThis.document;
    globalThis.document = {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: (kind) => (kind === "2d" ? { clearRect() {}, fillRect() {} } : null),
      }),
    };
    try {
      const mock = makeMockGPU();
      const renderer = await makeRenderer(mock);
      renderer.endFrame();
      assert.strictEqual(mock.log.copyExternalImageToTexture.length, 0);
      renderer.destroy();
    } finally {
      if (previous === undefined) delete globalThis.document;
      else globalThis.document = previous;
    }
  });

  it("destroy releases all created GPU buffers", async () => {
    const mock = makeMockGPU();
    const renderer = await makeRenderer(mock);
    const created = mock.log.createBuffer.map(({ buffer }) => buffer);
    renderer.destroy();
    assert.strictEqual(created.filter((b) => !b._destroyed).length, 0);
  });
});

describe("WebGpuRenderer trails", () => {
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

  it("renders a trail as a single triangle strip with one quad per segment", async () => {
    const mock = makeMockGPU();
    const renderer = await makeRenderer(mock);
    const { world } = makeTrailWorld([[0, 0], [50, 0], [100, 0]]);
    renderer.render(world);

    const draws = mock.log.draw;
    assert.strictEqual(draws.length, 1);
    assert.strictEqual(draws[0].vertexCount, 6); // 3 points -> 6 ribbon vertices
    renderer.destroy();
  });

  it("sorts trails by depth and bridges them in one strip", async () => {
    const mock = makeMockGPU();
    const renderer = await makeRenderer(mock);
    const world = new World();
    world.register(Transform);
    world.register(Visible);
    world.register(Trail);
    world.setResource(TrailManager, new TrailManager());
    addTrailEntity(world, [[0, 0], [10, 0], [20, 0]], { depth: 5, color: 0xff0000 });
    addTrailEntity(world, [[0, 0], [10, 0], [20, 0], [30, 0]], { depth: -2, color: 0x0000ff });
    renderer.render(world);

    const draws = mock.log.draw;
    assert.strictEqual(draws.length, 1);
    assert.strictEqual(draws[0].vertexCount, 16); // blue (8) + connector (2) + red (6)

    const upload = mock.log.writeBuffer.find((w) => (w.buffer.usage & GPUBufferUsage.VERTEX) !== 0);
    const d = new Float32Array(upload.data.buffer, upload.data.byteOffset, upload.data.byteLength / 4);
    assert.strictEqual(d[0 * 5 + 4], 1);       // first vertex is blue (b = 1)
    assert.strictEqual(d[10 * 5 + 2], 1);      // red trail starts after blue + connector
    renderer.destroy();
  });

  it("records render.trails metrics", async () => {
    const mock = makeMockGPU();
    const renderer = await makeRenderer(mock);
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

describe("WebGpuRenderer particles", () => {
  function makeEffectWorld() {
    const world = new World();
    world.setResource(RenderQueue, new RenderQueue());
    return world;
  }

  it("draws CPU-backend particles as instanced quads", async () => {
    const mock = makeMockGPU();
    const renderer = await makeRenderer(mock);
    const world = makeEffectWorld();
    ParticleEffect._defaultWorld = world;
    try {
      const effect = Particle.create({});
      effect.burst(4);
      renderer.render(world);

      const draws = mock.log.draw.filter((d) => d.vertexCount === 4);
      assert.strictEqual(draws.length, 1);
      assert.strictEqual(draws[0].instanceCount, 4);
      effect.destroy();
    } finally {
      ParticleEffect._defaultWorld = null;
      renderer.destroy();
    }
  });

  it("applies per-effect depth as the instance z (depth order)", async () => {
    const mock = makeMockGPU();
    const renderer = await makeRenderer(mock);
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

      const upload = mock.log.writeBuffer.find((w) => (w.buffer.usage & GPUBufferUsage.STORAGE) !== 0);
      const d = new Float32Array(upload.data.buffer, upload.data.byteOffset, upload.data.byteLength / 4);
      assert.ok(Math.abs(d[15] - (-0.99)) < 1e-6);   // back effect first
      assert.ok(Math.abs(d[20 + 15] - 0.99) < 1e-6); // front effect after (20 floats stride)
      back.destroy();
      front.destroy();
    } finally {
      ParticleEffect._defaultWorld = null;
      renderer.destroy();
    }
  });

  it("uploads particle textures and computes frame UVs", async () => {
    const mock = makeMockGPU();
    const renderer = await makeRenderer(mock);
    const world = makeEffectWorld();
    ParticleEffect._defaultWorld = world;
    try {
      const img = { width: 32, height: 16, data: new Uint8Array(32 * 16 * 4) };
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

      const upload = mock.log.writeBuffer.find((w) => (w.buffer.usage & GPUBufferUsage.STORAGE) !== 0);
      const d = new Float32Array(upload.data.buffer, upload.data.byteOffset, upload.data.byteLength / 4);
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

  it("constructs a compute-mode GpuParticleBackend for backend:'gpu' under a WebGPU renderer", async () => {
    const mock = makeMockGPU();
    const renderer = await makeRenderer(mock);
    const world = makeEffectWorld();
    ParticleEffect._defaultWorld = world;
    try {
      const effect = Particle.create({ backend: "gpu", renderer });
      assert.ok(effect.system._backend instanceof GpuParticleBackend);
      assert.strictEqual(effect.system._backend._mode, "compute");
      assert.strictEqual(effect.system._backend._canvas, renderer.canvas);
      effect.destroy();
    } finally {
      ParticleEffect._defaultWorld = null;
      renderer.destroy();
    }
  });

  it("auto-selects the compute GPU backend when the active world exposes a WebGPU renderer", async () => {
    const mock = makeMockGPU();
    const renderer = await makeRenderer(mock);
    const world = makeEffectWorld();
    world.setResource(Renderer, renderer);
    ParticleEffect._defaultWorld = world;
    withNavigator({ gpu: mock.gpu }, () => {
      try {
        const effect = Particle.create({});
        assert.ok(effect.system._backend instanceof GpuParticleBackend);
        assert.strictEqual(effect.system._backend._mode, "compute");
        assert.strictEqual(effect.system._backend._canvas, renderer.canvas);
        effect.destroy();
      } finally {
        ParticleEffect._defaultWorld = null;
        renderer.destroy();
      }
    });
  });
});

describe("WebGpuRenderer text glyphs", () => {
  it("batches text glyph commands into one instanced draw", async () => {
    const mock = makeMockGPU();
    const renderer = await makeRenderer(mock);
    const { world, queue } = makeWorld();
    const canvas = { width: 4, height: 4 };
    queue.push(canvas, 0, 0, 4, 4, 10, 20, 0, 1, 1, 4, 4, 0xffffff, 0, 1, true, 0);
    queue.push(canvas, 0, 0, 4, 4, 30, 20, 0, 1, 1, 4, 4, 0xffffff, 0, 1, true, 0);
    renderer.render(world);

    const draws = mock.log.draw;
    assert.strictEqual(draws.length, 1);
    assert.strictEqual(draws[0].vertexCount, 4);
    assert.strictEqual(draws[0].instanceCount, 2);
    renderer.destroy();
  });

  it("uploads a shared glyph canvas as a single texture", async () => {
    const mock = makeMockGPU();
    const renderer = await makeRenderer(mock);
    const { world, queue } = makeWorld();
    const canvas = { width: 4, height: 4 };
    queue.push(canvas, 0, 0, 4, 4, 10, 20, 0, 1, 1, 4, 4, 0xffffff, 0, 1, true, 0);
    queue.push(canvas, 0, 0, 4, 4, 30, 20, 0, 1, 1, 4, 4, 0xffffff, 0, 1, true, 0);
    renderer.render(world);

    const textures = mock.log.createTexture.filter(
      (t) => t.width === 4 && t.height === 4,
    );
    assert.strictEqual(textures.length, 1, "shared glyph canvas must create one texture");
    renderer.destroy();
  });

  it("writes the camera view-projection and glyph position for a text frame", async () => {
    const mock = makeMockGPU();
    const renderer = await makeRenderer(mock);
    const { world, queue } = makeWorld({
      camera: new Camera(0, 0, 1),
      viewport: new Viewport(0, 0, 800, 600),
    });
    const canvas = { width: 4, height: 4 };
    queue.push(canvas, 0, 0, 4, 4, 100, 50, 0, 1, 1, 4, 4, 0xffffff, 0, 1, true, 0);
    renderer.render(world);

    const uniform = mock.log.writeBuffer.find((w) => (w.buffer.usage & GPUBufferUsage.UNIFORM) !== 0 && w.byteLength === 64);
    assert.ok(uniform, "camera matrix must be written for a text frame");
    const storage = mock.log.writeBuffer.find((w) => (w.buffer.usage & GPUBufferUsage.STORAGE) !== 0);
    const d = new Float32Array(storage.data.buffer, storage.data.byteOffset, storage.data.byteLength / 4);
    assert.strictEqual(d[0], 100);
    assert.strictEqual(d[1], 50);
    renderer.destroy();
  });
});
