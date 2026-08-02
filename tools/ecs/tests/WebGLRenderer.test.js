import { describe, it } from "node:test";
import * as assert from "node:assert";
import { WebGLRenderer } from "../../../renderer/WebGLRenderer.js";
import { World } from "../../../ecs/core/World.js";
import { RenderQueue } from "../../../ecs/render/RenderQueue.js";
import { RenderConfig } from "../../../view/RenderConfig.js";
import { Camera } from "../../../view/Camera.js";
import { Viewport } from "../../../view/Viewport.js";
import { Diagnostics, MetricCategory, MetricUnit, MetricType } from "../../../debug/index.js";
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

  it("endFrame composites the immediate overlay as a fullscreen quad", () => {
    const previous = globalThis.document;
    globalThis.document = {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: (kind) => (kind === "2d" ? { clearRect() {} } : null),
      }),
    };
    try {
      const { gl, calls } = makeMockGL();
      const renderer = new WebGLRenderer({ context: gl, width: 800, height: 600 });
      renderer.endFrame();
      assert.ok(calls.drawArrays.some((c) => c.mode === gl.TRIANGLE_STRIP && c.count === 4));
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
});
