import { describe, it } from "node:test";
import * as assert from "node:assert";
import { Particle } from "../../../display/Particle.js";
import { ParticleEffect } from "../../../particles/ParticleEffect.js";
import { World } from "../../../ecs/core/World.js";
import { CpuParticleBackend } from "../../../particles/backends/CpuParticleBackend.js";
import { SoAParticleStorage } from "../../../particles/storage/SoAParticleStorage.js";
import { CanvasParticleRenderer } from "../../../particles/renderers/CanvasParticleRenderer.js";
import { CanvasRenderer } from "../../../renderer/CanvasRenderer.js";
import { Renderer } from "../../../renderer/Renderer.js";
import { WebGLRenderer } from "../../../renderer/WebGLRenderer.js";
import { GpuParticleBackend } from "../../../particles/backends/GpuParticleBackend.js";
import { GpuParticleRenderer } from "../../../particles/renderers/GpuParticleRenderer.js";
import { ConeShape } from "../../../shapes/ConeShape.js";
import { ScaleModifier } from "../../../modifiers/ScaleModifier.js";
import { FadeModifier } from "../../../modifiers/FadeModifier.js";
import { VelocityModifier } from "../../../modifiers/VelocityModifier.js";
import { ModifierStack } from "../../../modifiers/ModifierStack.js";
import { makeMockGL } from "./lib/MockGL.js";
import { makeMockGPU } from "./lib/MockGPU.js";

function renderWorld(world, ctx) {
  new CanvasRenderer({ context: ctx }).render(world);
}

describe("Particle.create", () => {
  it("returns a ParticleEffect", () => {
    const effect = Particle.create();
    assert.ok(effect instanceof ParticleEffect);
    assert.ok(effect.system);
    assert.ok(effect.emitter);
    effect.destroy();
  });

  it("works with minimal options", () => {
    const effect = Particle.create({});
    assert.strictEqual(effect.system.activeCount, 0);
    effect.destroy();
  });

  it("applies position from {x, y}", () => {
    const effect = Particle.create({ position: { x: 42, y: 99 } });
    assert.strictEqual(effect.position.x, 42);
    assert.strictEqual(effect.position.y, 99);
    assert.strictEqual(effect.emitter.x, 42);
    effect.destroy();
  });

  it("applies position from [x, y]", () => {
    const effect = Particle.create({ position: [7, 8] });
    assert.strictEqual(effect.position.x, 7);
    assert.strictEqual(effect.position.y, 8);
    effect.destroy();
  });

  it("defaults position to 0, 0", () => {
    const effect = Particle.create();
    assert.strictEqual(effect.position.x, 0);
    assert.strictEqual(effect.position.y, 0);
    effect.destroy();
  });

  it("does not autoplay", () => {
    const effect = Particle.create({ rate: 100, lifetime: 1 });
    effect.update(0.1);
    assert.strictEqual(effect.system.activeCount, 0);
    effect.play();
    effect.update(0.1);
    assert.ok(effect.system.activeCount > 0);
    effect.destroy();
  });

  it("emits while stopped", () => {
    const effect = Particle.create({});
    effect.emit(5);
    assert.strictEqual(effect.system.activeCount, 5);
    effect.destroy();
  });

  it("bursts while stopped", () => {
    const effect = Particle.create({});
    effect.burst(10);
    assert.strictEqual(effect.system.activeCount, 10);
    effect.destroy();
  });

  it("applies a single lifetime value", () => {
    const effect = Particle.create({ rate: 10, lifetime: 1.5 });
    effect.play();
    effect.update(0.1);
    const p = effect.system.particles[0];
    assert.strictEqual(p.maxLife, 1.5);
    assert.ok(Math.abs(p.life - 1.4) < 1e-3);
    effect.destroy();
  });

  it("randomizes lifetime within a range", () => {
    const effect = Particle.create({ rate: 100, lifetime: [0.5, 1.5] });
    effect.play();
    effect.update(0.1);
    const particles = effect.system.particles;
    assert.ok(particles.length > 0);
    for (const p of particles) {
      assert.ok(p.maxLife >= 0.5);
      assert.ok(p.maxLife <= 1.5);
    }
    effect.destroy();
  });

  it("composes lifetime with a user initializer", () => {
    const effect = Particle.create({
      rate: 10,
      lifetime: 1,
      initializer: (p) => { p.size = 3; },
    });
    effect.play();
    effect.update(0.1);
    const p = effect.system.particles[0];
    assert.strictEqual(p.maxLife, 1);
    assert.strictEqual(p.size, 3);
    effect.destroy();
  });

  it("uses a custom shape", () => {
    const cone = new ConeShape({ radius: 10, angle: Math.PI / 2, direction: 0, speed: 50 });
    const effect = Particle.create({ rate: 10, lifetime: 1, shape: cone });
    effect.play();
    effect.update(0.1);
    assert.strictEqual(effect.emitter.shape, cone);
    effect.destroy();
  });
});

describe("Particle position", () => {
  it("supports live x/y mutation", () => {
    const effect = Particle.create({ position: { x: 10, y: 20 } });
    effect.position.x = 5;
    assert.strictEqual(effect.position.x, 5);
    assert.strictEqual(effect.position.y, 20);
    assert.strictEqual(effect.emitter.x, 5);
    effect.position.y = 30;
    assert.strictEqual(effect.position.y, 30);
    effect.destroy();
  });

  it("supports assignment of {x, y}", () => {
    const effect = Particle.create();
    effect.position = { x: 1, y: 2 };
    assert.strictEqual(effect.position.x, 1);
    assert.strictEqual(effect.position.y, 2);
    effect.destroy();
  });

  it("supports assignment of [x, y]", () => {
    const effect = Particle.create();
    effect.position = [7, 8];
    assert.strictEqual(effect.position.x, 7);
    assert.strictEqual(effect.position.y, 8);
    effect.destroy();
  });

  it("supports position.set(x, y)", () => {
    const effect = Particle.create();
    effect.position.set(3, 4);
    assert.strictEqual(effect.position.x, 3);
    assert.strictEqual(effect.position.y, 4);
    effect.destroy();
  });

  it("moves via move(dx, dy)", () => {
    const effect = Particle.create({ position: { x: 10, y: 20 } });
    effect.move(10, 20);
    assert.strictEqual(effect.position.x, 20);
    assert.strictEqual(effect.position.y, 40);
    effect.destroy();
  });
});

describe("Particle follow", () => {
  it("tracks a target through the default getter", () => {
    const target = { transform: { x: 100, y: 200 } };
    const effect = Particle.create({ rate: 10, lifetime: 1, follow: target });
    effect.play();
    effect.update(0.1);
    assert.strictEqual(effect.following, true);
    assert.strictEqual(effect.position.x, 100);
    assert.strictEqual(effect.position.y, 200);
    target.transform.x = 150;
    effect.update(0.1);
    assert.strictEqual(effect.position.x, 150);
    effect.destroy();
  });

  it("accepts a custom getter via { target, getter }", () => {
    const player = { weapon: { x: 5, y: 6 } };
    const effect = Particle.create({
      rate: 10,
      lifetime: 1,
      follow: { target: player, getter: (p) => p.weapon },
    });
    effect.play();
    effect.update(0.1);
    assert.strictEqual(effect.position.x, 5);
    assert.strictEqual(effect.position.y, 6);
    effect.destroy();
  });

  it("unfollows", () => {
    const target = { transform: { x: 100, y: 200 } };
    const effect = Particle.create({ rate: 10, lifetime: 1, follow: target });
    effect.play();
    effect.update(0.1);
    assert.strictEqual(effect.following, true);
    effect.unfollow();
    assert.strictEqual(effect.following, false);
    target.transform.x = 999;
    effect.update(0.1);
    assert.strictEqual(effect.position.x, 100);
    effect.destroy();
  });
});

describe("Particle state", () => {
  it("visible = false skips rendering", () => {
    const effect = Particle.create();
    let rendered = 0;
    effect.system.render = () => { rendered++; };
    effect.visible = false;
    effect.render({});
    assert.strictEqual(rendered, 0);
    effect.visible = true;
    effect.render({});
    assert.strictEqual(rendered, 1);
    effect.destroy();
  });

  it("enabled = false skips update and render", () => {
    const effect = Particle.create({});
    effect.burst(5);
    let updated = 0;
    effect.system.update = (dt) => { updated++; };
    effect.enabled = false;
    effect.update(0.1);
    effect.render({});
    assert.strictEqual(updated, 0);
    assert.strictEqual(effect.system.activeCount, 5);
    effect.enabled = true;
    effect.update(0.1);
    assert.strictEqual(updated, 1);
    effect.destroy();
  });

  it("restart() resumes emission after a stop", () => {
    const effect = Particle.create({ rate: 50, lifetime: 1 });
    effect.play();
    effect.update(0.2);
    assert.ok(effect.system.activeCount > 0);
    effect.restart();
    assert.strictEqual(effect.system.activeCount, 0);
    effect.update(0.2);
    assert.ok(effect.system.activeCount > 0);
    effect.destroy();
  });

  it("clear() kills all alive particles", () => {
    const effect = Particle.create({});
    effect.burst(10);
    assert.strictEqual(effect.system.activeCount, 10);
    effect.clear();
    assert.strictEqual(effect.system.activeCount, 0);
    effect.destroy();
  });

  it("destroy() halts everything", () => {
    const effect = Particle.create({ rate: 50, lifetime: 1 });
    effect.play();
    effect.destroy();
    assert.strictEqual(effect.active, false);
    assert.strictEqual(effect.finished, true);
    effect.update(0.1);
    effect.play();
    assert.strictEqual(effect.active, false);
  });
});

describe("Particle completion", () => {
  it("fires onFinish once when empty and stopped", () => {
    let called = 0;
    const effect = Particle.create({ rate: 0, lifetime: 0.1 });
    effect.onFinish(() => { called++; });
    effect.burst(1);
    effect.update(0.2);
    assert.strictEqual(called, 1);
    assert.strictEqual(effect.finished, true);
    effect.update(0.2);
    assert.strictEqual(called, 1);
  });
});

describe("Particle World integration", () => {
  function mockCtx() {
    return {
      save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
      fillRect() {}, beginPath() {}, arc() {}, fill() {}, drawImage() {},
      moveTo() {}, lineTo() {}, stroke() {},
      set fillStyle(v) {}, set strokeStyle(v) {}, set lineWidth(v) {},
      getTransform() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; },
      setTransform() {},
    };
  }

  it("registers into the active World and is updated/rendered automatically", () => {
    const world = new World();
    ParticleEffect._defaultWorld = world;
    try {
      const effect = Particle.create({});
      assert.ok(world._effects.includes(effect));
      assert.strictEqual(effect._world, world);

      let updated = 0;
      effect.update = (dt) => { updated++; };
      world.update(16);
      assert.strictEqual(updated, 1);

      let rendered = 0;
      effect.render = (ctx) => { rendered++; };
      renderWorld(world, mockCtx());
      assert.strictEqual(rendered, 1);

      effect.destroy();
      assert.ok(!world._effects.includes(effect));
    } finally {
      ParticleEffect._defaultWorld = null;
    }
  });

  it("sorts effects by depth before rendering", () => {
    const world = new World();
    ParticleEffect._defaultWorld = world;
    try {
      const a = Particle.create();
      a.depth = 10;
      const b = Particle.create();
      b.depth = -5;
      const c = Particle.create();
      c.depth = 0;
      const order = [];
      for (const fx of world._effects) {
        fx.render = (ctx) => { order.push(fx.depth); };
      }
      renderWorld(world, mockCtx());
      assert.deepStrictEqual(order, [-5, 0, 10]);
      a.destroy();
      b.destroy();
      c.destroy();
    } finally {
      ParticleEffect._defaultWorld = null;
    }
  });

  it("does not register when no World is active", () => {
    ParticleEffect._defaultWorld = null;
    const effect = Particle.create({});
    assert.strictEqual(effect._world, null);
    effect.destroy();
  });
});

describe("Particle rotation", () => {
  it("forwards to a ConeShape direction", () => {
    const cone = new ConeShape({ radius: 10, angle: Math.PI / 2, direction: 0, speed: 50 });
    const effect = Particle.create({ shape: cone });
    effect.rotation = -Math.PI / 2;
    assert.strictEqual(cone._coneDirection, -Math.PI / 2);
    assert.strictEqual(effect.rotation, -Math.PI / 2);
    effect.destroy();
  });
});

describe("Particle capacity", () => {
  it("estimates capacity from rate and lifetime", () => {
    const effect = Particle.create({ rate: 100, lifetime: 2 });
    assert.ok(effect.system.capacity >= 300);
    effect.destroy();
  });

  it("honors an explicit capacity", () => {
    const effect = Particle.create({ capacity: 500 });
    assert.ok(effect.system.capacity >= 500);
    effect.destroy();
  });
});

describe("Particle engine-owned configuration", () => {
  it("uses the CPU backend by default", () => {
    const effect = Particle.create({ rate: 10, lifetime: 1 });
    assert.ok(effect.system._backend instanceof CpuParticleBackend);
    effect.destroy();
  });

  it("accepts backend: \"cpu\"", () => {
    const effect = Particle.create({ rate: 10, lifetime: 1, backend: "cpu" });
    assert.ok(effect.system._backend instanceof CpuParticleBackend);
    effect.destroy();
  });

  it("resolves a CanvasParticleRenderer for the CPU backend", () => {
    const effect = Particle.create({ rate: 10, lifetime: 1 });
    assert.ok(effect.system._backend._renderer instanceof CanvasParticleRenderer);
    effect.destroy();
  });

  it("uses the engine-owned SoA storage by default", () => {
    const effect = Particle.create({ rate: 10, lifetime: 1 });
    assert.ok(effect.system._backend._storage instanceof SoAParticleStorage);
    effect.destroy();
  });

  it("accepts backend: \"gpu\" only when a WebGL2 context is available", () => {
    assert.throws(
      () => Particle.create({ rate: 10, lifetime: 1, backend: "gpu" }),
      /WebGL2 context/,
    );
  });

  it("accepts backend: \"gpu\" when a renderer provides a WebGL2 context", () => {
    const { gl } = makeMockGL();
    const renderer = new WebGLRenderer({ context: gl, width: 800, height: 600 });
    try {
      const effect = Particle.create({ rate: 10, lifetime: 1, backend: "gpu", renderer });
      assert.ok(effect.system._backend instanceof GpuParticleBackend);
      assert.ok(effect.system._backend._renderer instanceof GpuParticleRenderer);
      assert.strictEqual(effect.system._backend._renderer._gl, renderer.gl);
      effect.destroy();
    } finally {
      renderer.destroy();
    }
  });

  it("accepts backend: \"gpu\" when a renderer provides a WebGPU canvas", () => {
    const mock = makeMockGPU();
    const canvas = { width: 800, height: 600, getContext: (kind) => (kind === "webgpu" ? mock.context : null) };
    const renderer = { canvas };
    const effect = Particle.create({ rate: 10, lifetime: 1, backend: "gpu", renderer });
    assert.ok(effect.system._backend instanceof GpuParticleBackend);
    assert.strictEqual(effect.system._backend._mode, "compute");
    assert.strictEqual(effect.system._backend._canvas, canvas);
    effect.destroy();
  });

  it("auto-selects the GPU backend when the active world exposes a WebGL renderer", () => {
    const { gl } = makeMockGL();
    const renderer = new WebGLRenderer({ context: gl, width: 800, height: 600 });
    const world = new World();
    world.setResource(Renderer, renderer);
    ParticleEffect._defaultWorld = world;
    try {
      const effect = Particle.create({ rate: 10, lifetime: 1 });
      assert.ok(effect.system._backend instanceof GpuParticleBackend);
      effect.destroy();
    } finally {
      ParticleEffect._defaultWorld = null;
      renderer.destroy();
    }
  });

  it("runs facade modifiers on the auto-selected GPU backend", () => {
    const { gl } = makeMockGL();
    const renderer = new WebGLRenderer({ context: gl, width: 800, height: 600 });
    const world = new World();
    world.setResource(Renderer, renderer);
    ParticleEffect._defaultWorld = world;
    try {
      const effect = Particle.create({
        modifiers: [
          new ScaleModifier({ from: 10, to: 0 }),
          new FadeModifier({ mode: "out" }),
        ],
        lifetime: [0.5, 1],
      });
      const backend = effect.system._backend;
      assert.ok(backend instanceof GpuParticleBackend);
      // The facade wraps the modifiers in a ModifierStack; the GPU backend
      // must compile its child descriptors into program passes.
      backend._rebuildProgram();
      assert.ok(backend._program, "GPU program must be compiled from the ModifierStack");
      assert.ok(backend._program.visualPass.length >= 2, "scale + fade both compile");

      effect.burst(1);
      backend.update(1 / 60);
      const p = backend.particles[0];
      assert.ok(p.size < 10, "ScaleModifier applied on the GPU backend");
      assert.ok(p.alpha < 1, "FadeModifier applied on the GPU backend");
      effect.destroy();
    } finally {
      ParticleEffect._defaultWorld = null;
      renderer.destroy();
    }
  });

  it("ModifierStack.toDescriptor() returns its flattened child descriptors", () => {
    const stack = new ModifierStack([
      new ScaleModifier({ from: 6, to: 0 }),
      new FadeModifier({ mode: "out" }),
    ]);
    const inner = new ModifierStack([new VelocityModifier({ drag: 0.5 })]);
    stack.add(inner);

    const d = stack.toDescriptor();
    assert.ok(Array.isArray(d), "stack descriptor is a flat list");
    assert.deepStrictEqual(
      d.map((x) => x.type),
      ["scale", "fade", "velocity"],
      "nested stacks flatten recursively",
    );
  });

  it("accepts a backend instance", () => {
    const backend = new CpuParticleBackend({});
    const effect = Particle.create({ rate: 10, lifetime: 1, backend });
    assert.strictEqual(effect.system._backend, backend);
    effect.destroy();
  });

  it("ignores renderer/storage/renderParticle options — the engine owns them", () => {
    const effect = Particle.create({
      rate: 10,
      lifetime: 1,
      renderer: { render() {}, destroy() {} },
      storage: {},
      renderParticle: () => {},
    });
    assert.ok(effect.system._backend instanceof CpuParticleBackend);
    assert.ok(effect.system._backend._renderer instanceof CanvasParticleRenderer);
    assert.ok(effect.system._backend._storage instanceof SoAParticleStorage);
    effect.destroy();
  });

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

  it("falls back to CPU when the GPU renderer is unavailable even if WebGPU is available", () => {
    withNavigator({ gpu: {} }, () => {
      const effect = Particle.create({ rate: 10, lifetime: 1 });
      assert.ok(effect.system._backend instanceof CpuParticleBackend);
      effect.destroy();
    });
  });

  it("falls back to CPU when WebGPU is unavailable", () => {
    withNavigator(undefined, () => {
      const effect = Particle.create({ rate: 10, lifetime: 1 });
      assert.ok(effect.system._backend instanceof CpuParticleBackend);
      effect.destroy();
    });
  });
});
