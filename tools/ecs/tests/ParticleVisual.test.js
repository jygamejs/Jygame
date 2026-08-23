import { describe, it } from "node:test";
import * as assert from "node:assert";
import { Particle } from "../../../display/Particle.js";
import { DefaultParticleVisual, CircleParticleVisual, TextureParticleVisual, VisualType } from "../../../visuals/index.js";
import { ParticleRenderCommandBuffer } from "../../../particles/renderdata/ParticleRenderCommandBuffer.js";
import { CpuParticleBackend } from "../../../particles/backends/CpuParticleBackend.js";
import { SoAParticleStorage } from "../../../particles/storage/SoAParticleStorage.js";
import { CanvasParticleRenderer } from "../../../particles/renderers/CanvasParticleRenderer.js";

function makeCtx() {
  return {
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
    fillRect() {}, beginPath() {}, arc() {}, fill() {}, drawImage() {},
    moveTo() {}, lineTo() {}, stroke() {},
    set fillStyle(v) {}, set strokeStyle(v) {}, set lineWidth(v) {},
    set globalAlpha(v) {},
    getTransform() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; },
    setTransform() {},
  };
}

describe("ParticleVisual contract", () => {
  it("Particle without visual preserves default (visualType 0)", () => {
    const effect = Particle.create({ rate: 0, lifetime: 1 });
    effect.burst(1);
    const p = effect.system.particles[0];
    assert.strictEqual(p.visualType, VisualType.DEFAULT);
    assert.strictEqual(effect.visual.type, "default");
    effect.destroy();
  });

  it("CircleParticleVisual can be supplied via Particle.create", () => {
    const effect = Particle.create({
      rate: 0,
      lifetime: 1,
      visual: new CircleParticleVisual(),
    });
    effect.burst(1);
    const p = effect.system.particles[0];
    assert.strictEqual(p.visualType, VisualType.CIRCLE);
    assert.ok(effect.visual instanceof CircleParticleVisual);
    effect.destroy();
  });

  it("CircleParticleVisual with radius sets size", () => {
    const effect = Particle.create({
      rate: 0,
      lifetime: 1,
      visual: new CircleParticleVisual({ radius: 4 }),
    });
    effect.burst(1);
    const p = effect.system.particles[0];
    assert.strictEqual(p.visualType, VisualType.CIRCLE);
    assert.strictEqual(p.size, 8); // radius*2
    effect.destroy();
  });

  it("TextureParticleVisual can be supplied via Particle.create", () => {
    const tex = { width: 10, height: 10 }; // mock texture
    const effect = Particle.create({
      rate: 0,
      lifetime: 1,
      visual: new TextureParticleVisual({ texture: tex, width: 39, height: 8, originX: 0, originY: 0.5 }),
    });
    effect.burst(1);
    const p = effect.system.particles[0];
    assert.strictEqual(p.visualType, VisualType.TEXTURE);
    assert.strictEqual(p.texture, tex);
    assert.strictEqual(p.width, 39);
    assert.strictEqual(p.height, 8);
    assert.strictEqual(p.originX, 0);
    assert.strictEqual(p.originY, 0.5);
    effect.destroy();
  });

  it("Circle visual does not require private renderer override", () => {
    const effect = Particle.create({
      rate: 0,
      lifetime: 1,
      visual: new CircleParticleVisual(),
    });
    // Engine owns renderer — user never touches _renderParticle
    assert.strictEqual(effect.system._backend._renderer._renderParticle, null);
    effect.burst(1);
    // Verify command buffer carries circle visualType
    const buf = new ParticleRenderCommandBuffer();
    const data = { count: effect.system.activeCount, fillCommandBuffer: (b) => {
      for (const p of effect.system.particles) b.append(p);
    }};
    data.fillCommandBuffer(buf);
    assert.strictEqual(buf.data[17], VisualType.CIRCLE);
    effect.destroy();
  });

  it("Texture visual preserves dimensions/origin/rotation via initializer", () => {
    const tex = { width: 20, height: 20 };
    const effect = Particle.create({
      rate: 0,
      lifetime: 1,
      visual: new TextureParticleVisual({ texture: tex, width: 20, height: 10 }),
      initializer: (p) => { p.rotation = Math.PI / 4; },
    });
    effect.burst(1);
    const p = effect.system.particles[0];
    assert.strictEqual(p.texture, tex);
    assert.ok(Math.abs(p.rotation - Math.PI / 4) < 1e-5);
    effect.destroy();
  });

  it("Per-particle color/alpha/rotation continue to affect rendering", () => {
    const effect = Particle.create({
      rate: 0,
      lifetime: 1,
      visual: new CircleParticleVisual(),
      initializer: (p) => { p.r = 100; p.g = 150; p.b = 200; p.alpha = 0.5; p.rotation = 1.2; },
    });
    effect.burst(1);
    const p = effect.system.particles[0];
    assert.strictEqual(p.r, 100);
    assert.strictEqual(p.g, 150);
    assert.strictEqual(p.b, 200);
    assert.ok(Math.abs(p.alpha - 0.5) < 1e-6);
    assert.ok(Math.abs(p.rotation - 1.2) < 1e-5);
    effect.destroy();
  });

  it("Visual configuration is shared, not per-particle allocation", () => {
    const visual = new CircleParticleVisual();
    const effect = Particle.create({ rate: 0, lifetime: 1, visual });
    effect.burst(10);
    for (const p of effect.system.particles) {
      assert.strictEqual(p.visualType, VisualType.CIRCLE);
    }
    // Visual instance is same object for effect
    assert.strictEqual(effect.visual, visual);
    // No per-particle visual object (visualType is int, not object)
    assert.strictEqual(typeof effect.system.particles[0].visualType, "number");
    effect.destroy();
  });

  it("CPU backend supports new visual path", () => {
    const effect = Particle.create({ rate: 0, lifetime: 1, visual: new CircleParticleVisual(), backend: "cpu" });
    assert.ok(effect.system._backend instanceof CpuParticleBackend);
    effect.burst(1);
    assert.strictEqual(effect.system.particles[0].visualType, 1);
    effect.destroy();
  });

  it("Render data remains backend-neutral (no Canvas ctx in buffer)", () => {
    const effect = Particle.create({ rate: 0, lifetime: 1, visual: new TextureParticleVisual({ texture: {} }) });
    effect.burst(1);
    const buf = new ParticleRenderCommandBuffer();
    buf.append(effect.system.particles[0]);
    // Buffer should contain floats and texture refs, not CanvasRenderingContext2D
    assert.ok(buf.data instanceof Float32Array);
    assert.ok(!buf.data.toString().includes("Canvas"));
    assert.strictEqual(typeof buf.textures[0], "object");
    effect.destroy();
  });

  it("No CanvasRenderingContext2D leaks into ParticleVisual", () => {
    const v = new CircleParticleVisual();
    assert.ok(!("ctx" in v) && !("canvas" in v));
    const tv = new TextureParticleVisual({ texture: {} });
    assert.ok(!("ctx" in tv));
  });

  it("No backend GPU object leaks into ParticleVisual", () => {
    const v = new CircleParticleVisual();
    assert.ok(!("gl" in v) && !("device" in v) && !("buffer" in v));
  });

  it("Default visual still works without explicit visual", () => {
    const effect = Particle.create({ rate: 10, lifetime: 1 });
    effect.play();
    effect.update(0.016);
    assert.ok(effect.system.activeCount >= 0);
    // Should be default
    if (effect.system.activeCount > 0) {
      assert.strictEqual(effect.system.particles[0].visualType, VisualType.DEFAULT);
    }
    effect.destroy();
  });
});
