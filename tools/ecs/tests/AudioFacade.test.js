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
  const loadCalls = [];

  before(() => {
    AudioLoader.load = async (path) => {
      const a = mockAudio();
      fakeCache.set(path, a);
      loadCalls.push(path);
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

  it("throws when key is not loaded and is not a path", async () => {
    await assert.rejects(Audio.music("nope"), /not found/);
  });

  it("returns a Music instance from loaded asset", async () => {
    await Audio.load("bgm", "/sounds/bg.ogg");
    const m = await Audio.music("bgm");
    assert.ok(m);
    assert.strictEqual(typeof m.play, "function");
    assert.strictEqual(typeof m.fadeIn, "function");
    assert.strictEqual(typeof m.fadeOut, "function");
  });

  it("loads a clip by path and returns a Music handle", async () => {
    const before = loadCalls.length;
    const m = await Audio.music("/sounds/fresh.ogg");
    assert.ok(m);
    assert.strictEqual(typeof m.play, "function");
    assert.strictEqual(typeof m.fadeIn, "function");
    assert.strictEqual(typeof m.fadeOut, "function");
    assert.strictEqual(loadCalls.length, before + 1, "the clip was fetched on demand");
    assert.ok(loadCalls.includes("/sounds/fresh.ogg"));
  });

  it("loads a named clip and registers it for Audio.play", async () => {
    const m = await Audio.music("theme", "/sounds/theme.ogg");
    assert.ok(m);
    assert.strictEqual(typeof m.play, "function");
    // The asset is registered under both the name and the path.
    const viaName = await Audio.music("theme");
    assert.strictEqual(viaName, m, "music handle cached per key");
    const viaPath = await Audio.music("/sounds/theme.ogg");
    assert.strictEqual(viaPath, m, "path aliases the same music handle");
    assert.strictEqual(Audio.has("theme"), true, "asset registered under the name");
    assert.strictEqual(Audio.has("/sounds/theme.ogg"), true, "asset registered under the path");
    assert.doesNotThrow(() => Audio.play("theme"), "Audio.play reaches the loaded asset");
  });

  it("caches Music instance", async () => {
    await Audio.load("loop", "/sounds/loop.ogg");
    const a = await Audio.music("loop");
    const b = await Audio.music("loop");
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

describe("Audio sound handle (Audio.load returns Sound)", () => {
  const origLoad = AudioLoader.load;
  const origGet = AudioLoader.get;
  const origHas = AudioLoader.has;
  const origUnload = AudioLoader.unload;
  const origClear = AudioLoader.clear;
  const fakeCache = new Map();

  function unlock() {
    global.document.dispatchEvent({ type: "pointerdown" });
  }

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

  it("unnamed load returns a usable sound handle", async () => {
    Audio.clear();
    const shot = await Audio.load("/sounds/shot.wav");
    assert.ok(shot);
    assert.strictEqual(typeof shot.play, "function");
    assert.strictEqual(typeof shot.volume, "number");
  });

  it("named load registers the sound handle", async () => {
    Audio.clear();
    const shot = await Audio.load("shot", "/sounds/shot.wav");
    assert.ok(shot);
    assert.strictEqual(Audio.get("shot"), shot);
    assert.strictEqual(Audio.has("shot"), true);
  });

  it("sound configuration persists on the handle", async () => {
    Audio.clear();
    const shot = await Audio.load("shot", "/sounds/shot.wav");
    shot.volume = 0.7;
    shot.loop = true;
    assert.strictEqual(shot.volume, 0.7);
    assert.strictEqual(shot.loop, true);
    unlock();
    const inst = shot.play();
    assert.ok(inst);
    assert.strictEqual(inst.loop, true);
    inst.stop();
  });

  it("repeated play() starts independent occurrences", async () => {
    Audio.clear();
    const shot = await Audio.load("shot", "/sounds/shot.wav");
    unlock();
    const a = shot.play();
    const b = shot.play();
    const c = shot.play();
    assert.ok(a);
    assert.ok(b);
    assert.ok(c);
    assert.notStrictEqual(a, b);
    assert.notStrictEqual(shot, a);
    a.stop();
    b.stop();
    c.stop();
    const again = shot.play();
    assert.ok(again);
    again.stop();
  });

  it("registry playback still works after named load", async () => {
    Audio.clear();
    await Audio.load("shot", "/sounds/shot.wav");
    unlock();
    const instance = Audio.play("shot");
    assert.ok(instance);
    instance.stop();
  });

  it("load(name) resolves to the same handle as load(name, path)", async () => {
    Audio.clear();
    const shot = await Audio.load("shot", "/sounds/shot.wav");
    const again = await Audio.load("shot");
    assert.strictEqual(again, shot);
  });

  it("load(path) after named load reuses the same handle", async () => {
    Audio.clear();
    const shot = await Audio.load("shot", "/sounds/shot.wav");
    const byPath = await Audio.load("/sounds/shot.wav");
    assert.strictEqual(byPath, shot);
  });

  it("batch load resolves to sound handles", async () => {
    Audio.clear();
    const task = Audio.load({ a: "/sounds/a.wav", b: "/sounds/b.wav" });
    const result = await task;
    assert.strictEqual(typeof result.a.play, "function");
    assert.strictEqual(typeof result.b.play, "function");
    assert.strictEqual(Audio.get("a"), result.a);
    assert.strictEqual(Audio.get("b"), result.b);
  });

  it("defers play() while gated, plays after the unlock gesture", async () => {
    Audio.clear();
    const shot = await Audio.load("shot", "/sounds/shot.wav");
    assert.strictEqual(shot.play(), null);
    unlock();
    const inst = shot.play();
    assert.ok(inst);
    inst.stop();
  });
});

describe("Audio per-sound backend selection", () => {
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

  function setWindow() {
    global.window = {
      AudioContext: mockAudioContext,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
  }

  function unlock() {
    global.document.dispatchEvent({ type: "pointerdown" });
  }

  before(() => {
    Audio.clear();
    setWindow();
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

  it("default load uses automatic backend selection (web here)", async () => {
    Audio.clear();
    const s = await Audio.load("/sounds/auto.wav");
    assert.ok(s);
    assert.strictEqual(s._backend.kind, "web");
  });

  it("default load falls back to html when AudioContext is missing", async () => {
    Audio.clear();
    global.window = {};
    const s = await Audio.load("/sounds/fallback.wav");
    assert.strictEqual(s._backend.kind, "html");
    setWindow();
  });

  it("explicit web backend", async () => {
    Audio.clear();
    const s = await Audio.load("/sounds/web.wav", { backend: "web" });
    assert.strictEqual(s._backend.kind, "web");
  });

  it("explicit html backend", async () => {
    Audio.clear();
    const s = await Audio.load("/sounds/html.wav", { backend: "html" });
    assert.strictEqual(s._backend.kind, "html");
    assert.strictEqual(typeof s.play, "function");
  });

  it("mixed backends can both play independently", async () => {
    Audio.clear();
    const a = await Audio.load("/sounds/a.wav", { backend: "web" });
    const b = await Audio.load("/sounds/b.mp3", { backend: "html" });
    assert.strictEqual(a._backend.kind, "web");
    assert.strictEqual(b._backend.kind, "html");
    unlock();
    const ia = a.play();
    const ib = b.play();
    assert.ok(ia);
    assert.ok(ib);
    ia.stop();
    ib.stop();
  });

  it("backend persists across plays", async () => {
    Audio.clear();
    const s = await Audio.load("/sounds/p.wav", { backend: "web" });
    unlock();
    s.play();
    s.play();
    assert.strictEqual(s._backend.kind, "web");
  });

  it("named load with backend works through Audio.play", async () => {
    Audio.clear();
    await Audio.load("shot", "/sounds/shot.wav", { backend: "web" });
    assert.strictEqual(Audio.get("shot")._backend.kind, "web");
    unlock();
    const inst = Audio.play("shot");
    assert.ok(inst);
    inst.stop();
    assert.strictEqual(Audio.get("shot")._backend.kind, "web");
  });

  it("music preserves the asset's backend", async () => {
    Audio.clear();
    await Audio.load("theme", "/sounds/theme.mp3", { backend: "html" });
    const m = await Audio.music("theme");
    assert.strictEqual(m._backend.kind, "html");
  });

  it("batch string form uses automatic selection", async () => {
    Audio.clear();
    const r = await Audio.load({ a: "/sounds/a.wav", b: "/sounds/b.wav" });
    assert.ok(r.a);
    assert.ok(r.b);
    assert.strictEqual(r.a._backend.kind, "web");
  });

  it("batch object form supports per-asset backend", async () => {
    Audio.clear();
    const r = await Audio.load({
      coin: { path: "/sounds/coin.wav", backend: "web" },
      theme: { path: "/sounds/theme.mp3", backend: "html" },
    });
    assert.strictEqual(r.coin._backend.kind, "web");
    assert.strictEqual(r.theme._backend.kind, "html");
  });

  it("invalid backend produces a descriptive error", async () => {
    Audio.clear();
    await assert.rejects(
      Audio.load("/sounds/bad.wav", { backend: "something" }),
      /unknown backend "something"/
    );
  });

  it("cache conflict throws and does not mutate the backend", async () => {
    Audio.clear();
    await Audio.load("shot", "/sounds/shot.wav", { backend: "web" });
    await assert.rejects(
      Audio.load("shot", "/sounds/shot.wav", { backend: "html" }),
      /already loaded with the "web" backend/
    );
    assert.strictEqual(Audio.get("shot")._backend.kind, "web");
  });
});

describe("Audio.backend & Audio.effects", () => {
  const origLoad = AudioLoader.load;
  const origGet = AudioLoader.get;
  const origHas = AudioLoader.has;
  const origUnload = AudioLoader.unload;
  const origClear = AudioLoader.clear;
  const origWindow = global.window;
  const fakeCache = new Map();

  before(() => {
    Audio.clear();
    Audio.backend = null;
    global.window = {
      AudioContext: function AudioContext() {},
      addEventListener: () => {},
      removeEventListener: () => {},
    };
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
    Audio.backend = null;
    Audio.clear();
    AudioLoader.load = origLoad;
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

  it("backend defaults to web when AudioContext exists", () => {
    assert.strictEqual(Audio.backend, "web");
  });

  it("backend forces auto-selection for the whole manager", async () => {
    Audio.clear();
    Audio.backend = "html";
    const s = await Audio.load("/sounds/forced.wav");
    assert.strictEqual(s._backend.kind, "html");
    Audio.backend = null;
  });

  it("backend resets to automatic with null or auto", () => {
    Audio.backend = "html";
    Audio.backend = "auto";
    assert.strictEqual(Audio.backend, "web");
    Audio.backend = "html";
    Audio.backend = null;
    assert.strictEqual(Audio.backend, "web");
  });

  it("backend rejects invalid values", () => {
    assert.throws(() => { Audio.backend = "nope"; }, /unknown backend "nope"/);
  });

  it("exposes the master effect chain", () => {
    const chain = Audio.effects;
    assert.ok(chain);
    assert.strictEqual(typeof chain.add, "function");
    assert.strictEqual(typeof chain.remove, "function");
    assert.strictEqual(typeof chain.clear, "function");
  });
});

describe("Audio.music effects, attenuation, autoplay", () => {
  const origLoad = AudioLoader.load;
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
      sampleRate: 44100,
      listener: {
        positionX: { value: 0 },
        positionY: { value: 0 },
        positionZ: { value: 0 },
      },
      createGain: gain,
      createBuffer: () => ({ getChannelData: () => new Float32Array(10) }),
      createBufferSource: () => ({
        buffer: null,
        loop: false,
        connect: () => {},
        disconnect: () => {},
        start: () => {},
        stop: () => {},
        onended: null,
      }),
      createBiquadFilter: () => ({
        type: "",
        frequency: { value: 0 },
        Q: { value: 0 },
        connect: () => {},
        disconnect: () => {},
      }),
      createDelay: () => ({
        delayTime: { value: 0 },
        connect: () => {},
        disconnect: () => {},
      }),
      createWaveShaper: () => ({
        curve: null,
        connect: () => {},
        disconnect: () => {},
      }),
      createDynamicsCompressor: () => ({
        threshold: { value: 0 },
        ratio: { value: 0 },
        attack: { value: 0 },
        release: { value: 0 },
        knee: { value: 0 },
        connect: () => {},
        disconnect: () => {},
      }),
      createConvolver: () => ({
        buffer: null,
        connect: () => {},
        disconnect: () => {},
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

  function setWindow() {
    global.window = {
      AudioContext: mockAudioContext,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
  }

  function resetFacadeState() {
    Audio.autoplay = "gated";
    Audio.backend = null;
    Audio.attenuation = "linear";
    Audio.inverseRolloff = 4;
    Audio.clear();
  }

  before(() => {
    resetFacadeState();
    setWindow();
    AudioLoader.load = async (path) => {
      const a = mockAudio();
      fakeCache.set(path, a);
      return a;
    };
    AudioLoader.loadBuffer = async (path) => ({ path, duration: 1, sampleRate: 44100 });
    AudioLoader.get = (key) => fakeCache.get(key) || null;
    AudioLoader.has = (key) => fakeCache.has(key);
    AudioLoader.unload = (key) => fakeCache.delete(key);
    AudioLoader.clear = () => fakeCache.clear();
  });

  after(() => {
    resetFacadeState();
    AudioLoader.load = origLoad;
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

  it("music exposes an effect chain", async () => {
    Audio.clear();
    await Audio.load("theme", "/sounds/theme.mp3");
    const m = await Audio.music("theme");
    assert.ok(m.effects);
    assert.strictEqual(typeof m.effects.add, "function");
    assert.strictEqual(typeof m.effects.remove, "function");
    assert.strictEqual(typeof m.effects.clear, "function");
  });

  it("attenuation get/set and validation", () => {
    Audio.attenuation = "quadratic";
    assert.strictEqual(Audio.attenuation, "quadratic");
    Audio.attenuation = "inverse";
    assert.strictEqual(Audio.attenuation, "inverse");
    Audio.attenuation = "linear";
    assert.strictEqual(Audio.attenuation, "linear");
    assert.throws(() => { Audio.attenuation = "bogus"; }, /Invalid attenuation/);
  });

  it("inverseRolloff get/set", () => {
    Audio.inverseRolloff = 2;
    assert.strictEqual(Audio.inverseRolloff, 2);
    Audio.inverseRolloff = 4;
  });

  it("autoplay defaults to gated and validates values", () => {
    assert.strictEqual(Audio.autoplay, "gated");
    assert.throws(() => { Audio.autoplay = "sometimes"; }, /unknown autoplay mode "sometimes"/);
  });

  it("autoplay 'none' plays immediately without a gesture", async () => {
    Audio.clear();
    Audio.autoplay = "none";
    const s = await Audio.load("/sounds/none.wav");
    const inst = s.play();
    assert.ok(inst);
    inst.stop();
    Audio.autoplay = "gated";
  });
});
