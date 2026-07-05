import { describe, it } from "node:test";
import * as assert from "node:assert";
import {
  World,
  Transform,
  WorldTransform,
  Parent,
  HierarchySystem,
  AudioSource,
  AudioSystem,
} from "../../../ecs/index.js";
import { AudioManager } from "../../../audio/AudioManager.js";
import { Camera } from "../../../camera/Camera.js";

class MockInstance {
  constructor() {
    this.x = 0;
    this.y = 0;
    this._spatial = true;
    this._sound = null;
  }
  stop() {}
}

function createSetup() {
  const w = new World();
  w.register(Transform);
  w.register(WorldTransform);
  w.register(AudioSource);
  w.register(Parent);
  w.initHierarchy();
  w.addSystem(new HierarchySystem());
  const audio = new AudioManager();
  audio.play = () => new MockInstance();
  w.setResource(AudioManager, audio);
  const audioSystem = new AudioSystem();
  w.addSystem(audioSystem);
  w.setResource(AudioSystem, audioSystem);
  return { w, audio, audioSystem };
}

function makeEntity(w) {
  const e = w.createEntity();
  w.addComponent(e, Transform);
  w.addComponent(e, WorldTransform);
  w.set(e, Transform, { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
  return e;
}

describe("AudioSource", () => {
  it("is a tag component with no schema", () => {
    assert.strictEqual(AudioSource.schema, undefined);
  });

  it("can be added to an entity", () => {
    const { w } = createSetup();
    const e = makeEntity(w);
    w.addComponent(e, AudioSource);
    assert.ok(w.has(e, AudioSource));
  });
});

describe("AudioSystem — configure and stop", () => {
  it("configure stores config", () => {
    const { w, audioSystem } = createSetup();
    const e = makeEntity(w);
    audioSystem.configure(e, "test", { volume: 0.5 });
    assert.ok(audioSystem._configs.has(e));
  });

  it("stop cleans up config and instance", () => {
    const { w, audioSystem } = createSetup();
    const e = makeEntity(w);
    audioSystem.configure(e, "test");
    audioSystem.stop(e);
    assert.ok(!audioSystem._configs.has(e));
    assert.ok(!audioSystem._instances.has(e));
  });
});

describe("AudioSystem — playback lifecycle", () => {
  it("play creates an instance via AudioManager", () => {
    const { w, audioSystem } = createSetup();
    const e = makeEntity(w);
    audioSystem.play(e, "test-sfx");
    assert.ok(audioSystem._instances.has(e));
    const instance = audioSystem._instances.get(e);
    assert.ok(instance);
    audioSystem.stop(e);
  });

  it("play stores config and instance", () => {
    const { w, audioSystem } = createSetup();
    const e = makeEntity(w);
    audioSystem.play(e, "test-sfx");
    assert.ok(audioSystem._configs.has(e));
    assert.ok(audioSystem._instances.has(e));
    audioSystem.stop(e);
  });
});

describe("AudioSystem — position synchronization", () => {
  it("update syncs WorldTransform to instance", () => {
    const { w, audioSystem } = createSetup();
    const e = makeEntity(w);
    w.addComponent(e, AudioSource);
    w.set(e, Transform, { x: 100, y: 200, rotation: 0, scaleX: 1, scaleY: 1 });
    w.update(0);
    audioSystem.play(e, "test-sfx");
    const instance = audioSystem._instances.get(e);
    w.set(e, Transform, { x: 300, y: 400, rotation: 0, scaleX: 1, scaleY: 1 });
    w.update(0);
    assert.strictEqual(instance.x, 300);
    assert.strictEqual(instance.y, 400);
    audioSystem.stop(e);
  });

  it("no allocation on update", () => {
    const { w, audioSystem } = createSetup();
    const e = makeEntity(w);
    w.addComponent(e, AudioSource);
    w.update(0);
    audioSystem.play(e, "test-sfx");
    w.update(0);
    assert.ok(audioSystem._instances.has(e));
    audioSystem.stop(e);
  });
});

describe("AudioSystem — entity destruction cleanup", () => {
  it("destroyed entity is cleaned up via callback", () => {
    const { w, audioSystem } = createSetup();
    const e = makeEntity(w);
    audioSystem.play(e, "test-sfx");
    assert.ok(audioSystem._instances.has(e));
    w.destroyEntity(e);
    assert.ok(!audioSystem._instances.has(e));
    assert.ok(!audioSystem._configs.has(e));
  });

  it("multiple entities cleaned up on destroy", () => {
    const { w, audioSystem } = createSetup();
    const entities = [];
    for (let i = 0; i < 5; i++) {
      const e = makeEntity(w);
      audioSystem.play(e, `test-${i}`);
      entities.push(e);
    }
    for (const e of entities) {
      w.destroyEntity(e);
    }
    assert.strictEqual(audioSystem._instances.size, 0);
    assert.strictEqual(audioSystem._configs.size, 0);
  });
});

describe("AudioSystem — listener synchronization", () => {
  it("update syncs Camera.main to listener", () => {
    const { w, audio } = createSetup();
    const cam = new Camera(50, 60);
    Camera.setMain(cam);
    assert.strictEqual(audio.listener.x, 0);
    w.update(0);
    assert.strictEqual(audio.listener.x, 50);
    assert.strictEqual(audio.listener.y, 60);
  });

  it("no Camera.main does not crash", () => {
    const { w } = createSetup();
    Camera.main = null;
    assert.doesNotThrow(() => w.update(0));
  });
});

describe("World.addAudioSource", () => {
  it("adds AudioSource and configures the system", () => {
    const { w, audioSystem } = createSetup();
    const e = makeEntity(w);
    w.addAudioSource(e, "test", { volume: 0.8 });
    assert.ok(w.has(e, AudioSource));
    assert.ok(audioSystem._configs.has(e));
  });
});
