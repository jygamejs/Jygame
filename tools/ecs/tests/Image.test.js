import { describe, it, before, after } from "node:test";
import * as assert from "node:assert";
import { Image } from "../../../loaders/Image.js";
import { ImageLoader } from "../../../loaders/ImageLoader.js";
import { AnimationPack } from "../../../ecs/animation/AnimationPack.js";
import { AnimationClip } from "../../../ecs/animation/AnimationClip.js";

function mockCanvas(w, h) {
  return { width: w, height: h };
}

describe("Image.load", () => {
  const origLoad = ImageLoader.load;
  const origLoadAll = ImageLoader.loadAll;

  before(() => {
    ImageLoader.load = async (path) => mockCanvas(16, 16);
    ImageLoader.loadAll = async (map) => {
      const r = {};
      for (const k of Object.keys(map)) r[k] = mockCanvas(16, 16);
      return r;
    };
  });

  after(() => {
    ImageLoader.load = origLoad;
    ImageLoader.loadAll = origLoadAll;
    Image.clear();
  });

  it("loads a single image by path", async () => {
    const img = await Image.load("/player.png");
    assert.ok(img);
    assert.strictEqual(img.width, 16);
  });

  it("loads a named image", async () => {
    const img = await Image.load("player", "/player.png");
    assert.ok(img);
    assert.strictEqual(Image.get("player"), img);
  });

  it("returns cached named image", async () => {
    const a = await Image.load("hero", "/hero.png");
    const b = await Image.load("hero", "/hero.png");
    assert.strictEqual(a, b);
  });

  it("loads a batch", async () => {
    const task = Image.load({ a: "/a.png", b: "/b.png" });
    const result = await task;
    assert.ok(result.a);
    assert.ok(result.b);
  });

  it("has/remove/clear work", async () => {
    await Image.load("test", "/test.png");
    assert.ok(Image.has("test"));
    Image.remove("test");
    assert.ok(!Image.has("test"));
  });
});

describe("Image.animate", () => {
  const origLoad = ImageLoader.load;
  const origLoadAll = ImageLoader.loadAll;
  const origResolve = AnimationPack._resolveImage;

  before(() => {
    ImageLoader.load = async (path) => mockCanvas(64, 16);
    ImageLoader.loadAll = async (map) => {
      const r = {};
      for (const k of Object.keys(map)) r[k] = mockCanvas(16, 16);
      return r;
    };
    AnimationPack._resolveImage = async (img) => mockCanvas(64, 16);
  });

  after(() => {
    ImageLoader.load = origLoad;
    ImageLoader.loadAll = origLoadAll;
    AnimationPack._resolveImage = origResolve;
    Image.clear();
  });

  it("individual file strategy", async () => {
    const result = await Image.animate({
      path: "assets/char",
      idle: 3,
      run: 4,
    });
    assert.ok(result.idle instanceof AnimationClip);
    assert.strictEqual(result.idle.frameCount, 3);
    assert.strictEqual(result.run.frameCount, 4);
  });

  it("individual file with defaults", async () => {
    const result = await Image.animate({
      path: "assets/char",
      defaults: { fps: 12, loop: false },
      idle: 2,
    });
    assert.strictEqual(result.idle.fps, 12);
    assert.strictEqual(result.idle.loop, false);
  });

  it("sprite sheet strategy with sliceX/sliceY", async () => {
    const result = await Image.animate({
      image: "sheet.png",
      sliceX: 4,
      sliceY: 1,
      run: { from: 0, to: 3 },
    });
    assert.ok(result.run instanceof AnimationClip);
    assert.strictEqual(result.run.frameCount, 4);
  });

  it("sprite sheet number shorthand", async () => {
    const result = await Image.animate({
      image: "sheet.png",
      sliceX: 4,
      sliceY: 1,
      run: 4,
    });
    assert.ok(result.run instanceof AnimationClip);
    assert.strictEqual(result.run.frameCount, 4);
  });

  it("atlas strategy with manual regions", async () => {
    const result = await Image.animate({
      image: "atlas.png",
      walk: {
        frames: [[0, 0, 16, 16], [16, 0, 16, 16]],
      },
    });
    assert.ok(result.walk instanceof AnimationClip);
    assert.strictEqual(result.walk.frameCount, 2);
  });

  it("atlas strategy with grid region", async () => {
    const result = await Image.animate({
      image: "atlas.png",
      walk: { x: 0, y: 0, width: 64, height: 16, frames: 4 },
    });
    assert.ok(result.walk instanceof AnimationClip);
    assert.strictEqual(result.walk.frameCount, 4);
  });

  it("stores animation set by name", async () => {
    const result = await Image.animate({
      name: "player",
      path: "assets/char",
      idle: 2,
      run: 3,
    });
    assert.strictEqual(Image._animationSets.get("player"), result);
  });

  it("throws on unrecognized config", async () => {
    await assert.rejects(() =>
      Image.animate({ foo: "bar" })
    );
  });

  it("single plain entry auto-flats (no subfolder)", async () => {
    const result = await Image.animate({
      path: "assets/King",
      walk: 4,
    });
    assert.ok(result.walk instanceof AnimationClip);
    assert.strictEqual(result.walk.frameCount, 4);
  });
});

describe("Image.get/has/remove/clear", () => {
  const origLoad = ImageLoader.load;

  before(() => {
    ImageLoader.load = async (path) => mockCanvas(16, 16);
  });

  after(() => {
    ImageLoader.load = origLoad;
    Image.clear();
  });

  it("get returns null for missing key", () => {
    assert.strictEqual(Image.get("nope"), null);
  });

  it("has returns false for missing key", () => {
    assert.strictEqual(Image.has("nope"), false);
  });

  it("clear removes all caches", async () => {
    await Image.load("a", "/a.png");
    await Image.load("b", "/b.png");
    Image.clear();
    assert.strictEqual(Image.has("a"), false);
    assert.strictEqual(Image.has("b"), false);
  });
});
