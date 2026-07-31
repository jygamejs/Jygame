import { describe, it, before, after } from "node:test";
import * as assert from "node:assert";
import { Audio } from "../../../loaders/Audio.js";
import { AudioLoader } from "../../../loaders/AudioLoader.js";

if (typeof global.document === "undefined") {
  const handlers = {};
  global.document = {
    addEventListener: (event, fn, opts) => {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(fn);
    },
    removeEventListener: (event, fn) => {
      if (!handlers[event]) return;
      handlers[event] = handlers[event].filter(h => h !== fn);
    },
    dispatchEvent: (event) => {
      const fns = handlers[event.type];
      if (fns) fns.forEach(fn => fn());
    },
  };
}

function mockAudio() {
  const audio = {
    src: "",
    preload: "none",
    volume: 1,
    loop: false,
    currentTime: 0,
    duration: 1,
    paused: false,
    ended: false,
    muted: false,
    onended: null,
    play: () => Promise.resolve(),
    pause: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  audio.cloneNode = () => ({
    ...audio,
    cloneNode: () => ({ ...audio }),
  });
  return audio;
}

describe("Audio.load", () => {
  const origLoad = AudioLoader.load;
  const origGet = AudioLoader.get;
  const origHas = AudioLoader.has;
  const origUnload = AudioLoader.unload;
  const origClear = AudioLoader.clear;
  const fakeCache = new Map();

  before(() => {
    AudioLoader.load = async (path) => {
      const a = mockAudio();
      fakeCache.set(path, a);
      return a;
    };
    AudioLoader.get = (key) => fakeCache.get(key) || null;
    AudioLoader.has = (key) => fakeCache.has(key);
    AudioLoader.unload = (key) => fakeCache.delete(key);
    AudioLoader.clear = () => fakeCache.clear();
  });

  after(() => {
    AudioLoader.load = origLoad;
    AudioLoader.get = origGet;
    AudioLoader.has = origHas;
    AudioLoader.unload = origUnload;
    AudioLoader.clear = origClear;
    Audio.clear();
  });

  it("loads a single audio by path", async () => {
    const a = await Audio.load("/sounds/jump.wav");
    assert.ok(a);
  });

  it("loads a named audio", async () => {
    const a = await Audio.load("jump", "/sounds/jump.wav");
    assert.ok(a);
    assert.strictEqual(Audio.get("jump"), a);
  });

  it("returns cached named audio", async () => {
    const a = await Audio.load("hero", "/sounds/hero.wav");
    const b = await Audio.load("hero", "/sounds/hero.wav");
    assert.strictEqual(a, b);
  });

  it("loads a batch", async () => {
    const task = Audio.load({ a: "/sounds/a.wav", b: "/sounds/b.wav" });
    const result = await task;
    assert.ok(result.a);
    assert.ok(result.b);
  });

  it("has/remove/clear work", async () => {
    await Audio.load("test", "/sounds/test.wav");
    assert.ok(Audio.has("test"));
    Audio.remove("test");
    assert.ok(!Audio.has("test"));
  });
});

describe("Audio.play", () => {
  const origLoad = AudioLoader.load;
  const origGet = AudioLoader.get;
  const origHas = AudioLoader.has;
  const origUnload = AudioLoader.unload;
  const origClear = AudioLoader.clear;
  const fakeCache = new Map();

  before(() => {
    AudioLoader.load = async (path) => {
      const a = mockAudio();
      fakeCache.set(path, a);
      return a;
    };
    AudioLoader.get = (key) => fakeCache.get(key) || null;
    AudioLoader.has = (key) => fakeCache.has(key);
    AudioLoader.unload = (key) => fakeCache.delete(key);
    AudioLoader.clear = () => fakeCache.clear();
    Audio.group("master");
    global.document.dispatchEvent({ type: "pointerdown" });
  });

  after(() => {
    AudioLoader.load = origLoad;
    AudioLoader.get = origGet;
    AudioLoader.has = origHas;
    AudioLoader.unload = origUnload;
    AudioLoader.clear = origClear;
    Audio.clear();
  });

  it("throws when key is not loaded", () => {
    assert.throws(() => Audio.play("nope"), /not loaded/);
  });

  it("plays a loaded sound", async () => {
    await Audio.load("jump", "/sounds/jump.wav");
    const instance = Audio.play("jump");
    assert.ok(instance);
    assert.strictEqual(typeof instance.volume, "number");
    instance.stop();
  });

  it("plays with volume option", async () => {
    await Audio.load("boom", "/sounds/boom.wav");
    const instance = Audio.play("boom", { volume: 0.5 });
    assert.ok(instance);
    instance.stop();
  });

  it("plays with spatial options", async () => {
    await Audio.load("explode", "/sounds/explode.wav");
    const instance = Audio.play("explode", { x: 100, y: 200 });
    assert.ok(instance);
    instance.stop();
  });

  it("caches Sound for reuse", async () => {
    await Audio.load("click", "/sounds/click.wav");
    const a = Audio.play("click");
    const b = Audio.play("click");
    assert.ok(a);
    assert.ok(b);
    a.stop();
    b.stop();
  });
});

describe("Audio.music", () => {
  const origLoad = AudioLoader.load;
  const origGet = AudioLoader.get;
  const origHas = AudioLoader.has;
  const origUnload = AudioLoader.unload;
  const origClear = AudioLoader.clear;
  const fakeCache = new Map();

  before(() => {
    AudioLoader.load = async (path) => {
      const a = mockAudio();
      fakeCache.set(path, a);
      return a;
    };
    AudioLoader.get = (key) => fakeCache.get(key) || null;
    AudioLoader.has = (key) => fakeCache.has(key);
    AudioLoader.unload = (key) => fakeCache.delete(key);
    AudioLoader.clear = () => fakeCache.clear();
  });

  after(() => {
    AudioLoader.load = origLoad;
    AudioLoader.get = origGet;
    AudioLoader.has = origHas;
    AudioLoader.unload = origUnload;
    AudioLoader.clear = origClear;
    Audio.clear();
  });

  it("throws when key is not loaded", () => {
    assert.throws(() => Audio.music("nope"), /not found/);
  });

  it("returns a Music instance from loaded asset", async () => {
    await Audio.load("bgm", "/sounds/bg.ogg");
    const m = Audio.music("bgm");
    assert.ok(m);
    assert.strictEqual(typeof m.play, "function");
    assert.strictEqual(typeof m.fadeIn, "function");
    assert.strictEqual(typeof m.fadeOut, "function");
  });

  it("caches Music instance", async () => {
    await Audio.load("loop", "/sounds/loop.ogg");
    const a = Audio.music("loop");
    const b = Audio.music("loop");
    assert.strictEqual(a, b);
  });
});

describe("Audio.get/has/remove/clear", () => {
  const origLoad = AudioLoader.load;
  const origGet = AudioLoader.get;
  const origHas = AudioLoader.has;
  const origUnload = AudioLoader.unload;
  const origClear = AudioLoader.clear;
  const fakeCache = new Map();

  before(() => {
    AudioLoader.load = async (path) => {
      const a = mockAudio();
      fakeCache.set(path, a);
      return a;
    };
    AudioLoader.get = (key) => fakeCache.get(key) || null;
    AudioLoader.has = (key) => fakeCache.has(key);
    AudioLoader.unload = (key) => fakeCache.delete(key);
    AudioLoader.clear = () => fakeCache.clear();
  });

  after(() => {
    AudioLoader.load = origLoad;
    AudioLoader.get = origGet;
    AudioLoader.has = origHas;
    AudioLoader.unload = origUnload;
    AudioLoader.clear = origClear;
    Audio.clear();
  });

  it("get returns null for missing key", () => {
    assert.strictEqual(Audio.get("nope"), null);
  });

  it("has returns false for missing key", () => {
    assert.strictEqual(Audio.has("nope"), false);
  });

  it("clear removes all caches", async () => {
    await Audio.load("a", "/sounds/a.wav");
    await Audio.load("b", "/sounds/b.wav");
    Audio.clear();
    assert.strictEqual(Audio.has("a"), false);
    assert.strictEqual(Audio.has("b"), false);
  });
});

describe("Audio.group", () => {
  after(() => { Audio.clear(); });

  it("returns a group by name", () => {
    const g = Audio.group("sfx");
    assert.ok(g);
    assert.strictEqual(typeof g.volume, "number");
  });

  it("creates groups on demand", () => {
    const g = Audio.group("custom");
    assert.ok(g);
  });
});

describe("Audio.listener", () => {
  after(() => { Audio.clear(); });

  it("exposes the listener", () => {
    const l = Audio.listener;
    assert.ok(l);
    assert.strictEqual(typeof l.x, "number");
    assert.strictEqual(typeof l.y, "number");
  });
});

describe("Audio.volume", () => {
  after(() => { Audio.clear(); });

  it("get/set volume", () => {
    Audio.volume = 0.5;
    assert.strictEqual(Audio.volume, 0.5);
  });
});

describe("Audio.mute/unmute", () => {
  after(() => { Audio.clear(); });

  it("mute and unmute", () => {
    Audio.mute();
    assert.ok(Audio.muted);
    Audio.unmute();
    assert.ok(!Audio.muted);
  });
});

describe("Audio.pauseAll/resumeAll/stopAll", () => {
  after(() => { Audio.clear(); });

  it("are functions", () => {
    assert.strictEqual(typeof Audio.pauseAll, "function");
    assert.strictEqual(typeof Audio.resumeAll, "function");
    assert.strictEqual(typeof Audio.stopAll, "function");
  });
});

describe("Audio surface is clean", () => {
  after(() => { Audio.clear(); });

  it("does not expose engine APIs", () => {
    assert.strictEqual(Audio.define, undefined);
    assert.strictEqual(Audio.undefine, undefined);
    assert.strictEqual(Audio.setManager, undefined);
    assert.strictEqual(Audio.manager, undefined);
    assert.strictEqual(Audio.snapshot, undefined);
    assert.strictEqual(Audio.restoreSnapshot, undefined);
    assert.strictEqual(Audio.transition, undefined);
    assert.strictEqual(Audio.suspend, undefined);
    assert.strictEqual(Audio.resume, undefined);
    assert.strictEqual(Audio.update, undefined);
    assert.strictEqual(Audio.flush, undefined);
    assert.strictEqual(Audio.masterVolume, undefined);
    assert.strictEqual(Audio.masterMuted, undefined);
  });

  it("exposes the expected API surface", () => {
    const keys = Object.keys(Audio).filter(k => !k.startsWith("_"));
    const expected = [
      "load", "play", "music", "group",
      "mute", "unmute", "muted",
      "volume",
      "pauseAll", "resumeAll", "stopAll",
      "get", "has", "remove", "clear",
      "listener",
    ];
    for (const key of expected) {
      assert.ok(key in Audio, `Audio.${key} should exist`);
    }
  });
});

describe("Audio backend auto-selection", () => {
  const origLoad = AudioLoader.load;
  const origLoadBuffer = AudioLoader.loadBuffer;
  const origGet = AudioLoader.get;
  const origHas = AudioLoader.has;
  const origUnload = AudioLoader.unload;
  const origClear = AudioLoader.clear;
  const origWindow = global.window;
  const fakeCache = new Map();

  function mockAudioContext() {
    const gain = () => ({
      gain: { value: 1 },
      connect: () => {},
      disconnect: () => {},
    });
    return {
      destination: {},
      state: "running",
      currentTime: 0,
      listener: {
        positionX: { value: 0 },
        positionY: { value: 0 },
        positionZ: { value: 0 },
      },
      createGain: gain,
      createBufferSource: () => ({
        buffer: null,
        loop: false,
        connect: () => {},
        disconnect: () => {},
        start: () => {},
        stop: () => {},
        onended: null,
      }),
      createPanner: () => ({
        connect: () => {},
        disconnect: () => {},
        distanceModel: "",
        refDistance: 0,
        maxDistance: 0,
        rolloffFactor: 0,
        positionX: { value: 0 },
        positionY: { value: 0 },
        positionZ: { value: 0 },
      }),
      suspend: async () => {},
      resume: async () => {},
      close: async () => {},
    };
  }

  before(() => {
    Audio.clear();
    global.window = {
      AudioContext: mockAudioContext,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    AudioLoader.load = async (path) => {
      const a = mockAudio();
      fakeCache.set(path, a);
      return a;
    };
    AudioLoader.loadBuffer = async (path) => ({ path, duration: 1 });
    AudioLoader.get = (key) => fakeCache.get(key) || null;
    AudioLoader.has = (key) => fakeCache.has(key);
    AudioLoader.unload = (key) => fakeCache.delete(key);
    AudioLoader.clear = () => fakeCache.clear();
  });

  after(() => {
    Audio.clear();
    AudioLoader.load = origLoad;
    AudioLoader.loadBuffer = origLoadBuffer;
    AudioLoader.get = origGet;
    AudioLoader.has = origHas;
    AudioLoader.unload = origUnload;
    AudioLoader.clear = origClear;
    if (origWindow === undefined) {
      delete global.window;
    } else {
      global.window = origWindow;
    }
  });

  it("uses AudioLoader.loadBuffer (WebAudio) when AudioContext exists", async () => {
    const paths = [];
    const origBuffer = AudioLoader.loadBuffer;
    AudioLoader.loadBuffer = async (path) => {
      paths.push(path);
      return { path, duration: 1 };
    };
    const asset = await Audio.load("/sounds/auto.wav");
    assert.deepStrictEqual(paths, ["/sounds/auto.wav"]);
    assert.ok(asset);
    assert.ok(asset.duration);
    AudioLoader.loadBuffer = origBuffer;
  });

  it("plays a named WebAudio asset end-to-end", async () => {
    await Audio.load("blip", "/sounds/blip.wav");
    global.document.dispatchEvent({ type: "pointerdown" });
    const instance = Audio.play("blip");
    assert.ok(instance);
    instance.stop();
  });

  it("falls back to HTML audio when window.AudioContext is missing", async () => {
    Audio.clear();
    global.window = {};
    const paths = [];
    const origLoad = AudioLoader.load;
    AudioLoader.load = async (path) => {
      paths.push(path);
      const a = mockAudio();
      fakeCache.set(path, a);
      return a;
    };
    const asset = await Audio.load("/sounds/fallback.mp3");
    assert.deepStrictEqual(paths, ["/sounds/fallback.mp3"]);
    assert.ok(asset);
    assert.strictEqual(typeof asset.play, "function");
    AudioLoader.load = origLoad;
  });
});
