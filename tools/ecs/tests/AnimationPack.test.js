import { describe, it, before, after } from "node:test";
import * as assert from "node:assert";
import { AnimationPack } from "../../../ecs/animation/AnimationPack.js";
import { AnimationClip } from "../../../ecs/animation/AnimationClip.js";
import { ImageLoader } from "../../../loaders/ImageLoader.js";
import { AssetRegistry } from "../../../ecs/render/AssetRegistry.js";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function mockCanvas(w, h) {
  return { width: w, height: h };
}

function mockFrames(n) {
  return Array.from({ length: n }, (_, i) => mockCanvas(16, 16));
}

// ---------------------------------------------------------------------------
// AnimationPack.load
// ---------------------------------------------------------------------------

describe("AnimationPack.load", () => {
  const origLoadAll = ImageLoader.loadAll;
  let loadCalls;

  before(() => {
    ImageLoader.loadAll = async (map) => {
      loadCalls = map;
      const result = {};
      for (const key of Object.keys(map)) {
        result[key] = mockCanvas(16, 16);
      }
      return result;
    };
  });

  after(() => {
    ImageLoader.loadAll = origLoadAll;
  });

  it("loads multiple animations from a path config", async () => {
    loadCalls = null;
    const result = await AnimationPack.load({
      path: "assets/char",
      assetRegistry: new AssetRegistry(),
      idle: 3,
      run: 4,
    });

    assert.ok(result.idle instanceof AnimationClip);
    assert.ok(result.run instanceof AnimationClip);
    assert.strictEqual(result.idle.frameCount, 3);
    assert.strictEqual(result.run.frameCount, 4);
  });

  it("builds correct file paths", async () => {
    loadCalls = null;
    await AnimationPack.load({
      path: "assets/char",
      assetRegistry: new AssetRegistry(),
      walk: 2,
    });

    assert.ok(loadCalls);
    const keys = Object.keys(loadCalls);
    assert.strictEqual(keys.length, 2);
    assert.ok(loadCalls["walk_0"].endsWith("assets/char/walk/1.png"));
    assert.ok(loadCalls["walk_1"].endsWith("assets/char/walk/2.png"));
  });

  it("uses defaults", async () => {
    loadCalls = null;
    const result = await AnimationPack.load({
      path: "assets/char",
      assetRegistry: new AssetRegistry(),
      defaults: { fps: 12, loop: false },
      idle: 2,
    });

    assert.strictEqual(result.idle.fps, 12);
    assert.strictEqual(result.idle.loop, false);
  });

  it("supports from/to range", async () => {
    loadCalls = null;
    await AnimationPack.load({
      path: "assets/char",
      assetRegistry: new AssetRegistry(),
      anim: { from: 3, to: 6 },
    });

    assert.strictEqual(Object.keys(loadCalls).length, 4);
    assert.ok(loadCalls["anim_0"].includes("3.png"));
    assert.ok(loadCalls["anim_3"].includes("6.png"));
  });

  it("supports ping-pong", async () => {
    loadCalls = null;
    const result = await AnimationPack.load({
      path: "assets/char",
      assetRegistry: new AssetRegistry(),
      anim: { frames: 3, pingPong: true },
    });

    assert.strictEqual(result.anim.frameCount, 4); // f0-f1-f2 = 4 with ping-pong
  });

  it("applies padding", async () => {
    loadCalls = null;
    await AnimationPack.load({
      path: "assets/char",
      assetRegistry: new AssetRegistry(),
      anim: { frames: 2, padding: 3 },
    });

    assert.ok(loadCalls["anim_0"].includes("001.png"));
    assert.ok(loadCalls["anim_1"].includes("002.png"));
  });

  it("throws if path is missing", async () => {
    await assert.rejects(() => AnimationPack.load({ idle: 3, assetRegistry: new AssetRegistry() }));
  });

  it("throws if path is not a string", async () => {
    await assert.rejects(() => AnimationPack.load({ path: 42, idle: 3, assetRegistry: new AssetRegistry() }));
  });

  it("throws if no animation entries", async () => {
    await assert.rejects(() =>
      AnimationPack.load({ path: "assets", assetRegistry: new AssetRegistry() })
    );
  });

  it("throws on invalid frame count", async () => {
    await assert.rejects(() =>
      AnimationPack.load({ path: "assets", idle: 0, assetRegistry: new AssetRegistry() })
    );
  });
});

// ---------------------------------------------------------------------------
// _normalize
// ---------------------------------------------------------------------------

describe("_normalize", () => {
  it("normalizes a number entry", () => {
    const r = AnimationPack._normalize("idle", 4, {});
    assert.strictEqual(r.name, "idle");
    assert.strictEqual(r.frames, 4);
    assert.strictEqual(r.fps, 8);
    assert.strictEqual(r.loop, true);
  });

  it("rejects non-positive frame count", () => {
    assert.throws(() => AnimationPack._normalize("x", -1, {}));
    assert.throws(() => AnimationPack._normalize("x", 0, {}));
    assert.throws(() => AnimationPack._normalize("x", 1.5, {}));
  });
});

// ---------------------------------------------------------------------------
// _pad
// ---------------------------------------------------------------------------

describe("_pad", () => {
  it("pads with zeros", () => {
    assert.strictEqual(AnimationPack._pad(1, 3), "001");
    assert.strictEqual(AnimationPack._pad(42, 3), "042");
    assert.strictEqual(AnimationPack._pad(100, 3), "100");
  });

  it("returns plain string when width is 0 or undefined", () => {
    assert.strictEqual(AnimationPack._pad(7, 0), "7");
    assert.strictEqual(AnimationPack._pad(7, undefined), "7");
  });
});

// ---------------------------------------------------------------------------
// _parseAtlasFrames
// ---------------------------------------------------------------------------

describe("_parseAtlasFrames", () => {
  it("parses TexturePacker Hash format", () => {
    const map = AnimationPack._parseAtlasFrames({
      frames: {
        a: { frame: { x: 1, y: 2, w: 16, h: 16 } },
        b: { frame: { x: 17, y: 2, w: 16, h: 16 } },
      },
    });
    assert.strictEqual(map.a.x, 1);
    assert.strictEqual(map.b.x, 17);
  });

  it("parses array format", () => {
    const map = AnimationPack._parseAtlasFrames({
      frames: [
        { filename: "a", frame: { x: 0, y: 0, w: 10, h: 10 } },
        { filename: "b", frame: { x: 10, y: 0, w: 10, h: 10 } },
      ],
    });
    assert.strictEqual(map.a.x, 0);
    assert.strictEqual(map.b.x, 10);
  });

  it("throws on unrecognized format", () => {
    assert.throws(() => AnimationPack._parseAtlasFrames({}));
  });
});

// ---------------------------------------------------------------------------
// _generateGridRects
// ---------------------------------------------------------------------------

describe("_generateGridRects", () => {
  it("generates rects in a row", () => {
    const rects = AnimationPack._generateGridRects(
      { frames: 3, row: 0, column: 0 },
      16, 16, 0, 0
    );
    assert.strictEqual(rects.length, 3);
    assert.deepStrictEqual(rects[0], { x: 0, y: 0, w: 16, h: 16 });
    assert.deepStrictEqual(rects[1], { x: 16, y: 0, w: 16, h: 16 });
    assert.deepStrictEqual(rects[2], { x: 32, y: 0, w: 16, h: 16 });
  });

  it("handles margin and spacing", () => {
    const rects = AnimationPack._generateGridRects(
      { frames: 2, row: 0, column: 0 },
      16, 16, 4, 2
    );
    assert.deepStrictEqual(rects[0], { x: 4, y: 4, w: 16, h: 16 });
    assert.deepStrictEqual(rects[1], { x: 4 + 16 + 2, y: 4, w: 16, h: 16 });
  });

  it("respects explicit column offset", () => {
    const rects = AnimationPack._generateGridRects(
      { frames: 2, row: 0, column: 3 },
      16, 16, 0, 0
    );
    assert.deepStrictEqual(rects[0], { x: 48, y: 0, w: 16, h: 16 });
    assert.deepStrictEqual(rects[1], { x: 64, y: 0, w: 16, h: 16 });
  });

  it("wraps to next row with columns", () => {
    const rects = AnimationPack._generateGridRects(
      { frames: 4, row: 0 }, 16, 16, 0, 0, 2
    );
    assert.strictEqual(rects.length, 4);
    assert.deepStrictEqual(rects[0], { x: 0,  y: 0,  w: 16, h: 16 });
    assert.deepStrictEqual(rects[1], { x: 16, y: 0,  w: 16, h: 16 });
    assert.deepStrictEqual(rects[2], { x: 0,  y: 16, w: 16, h: 16 });
    assert.deepStrictEqual(rects[3], { x: 16, y: 16, w: 16, h: 16 });
  });

  it("columns with non-zero margin and spacing", () => {
    const rects = AnimationPack._generateGridRects(
      { frames: 6, row: 0 }, 8, 8, 2, 1, 3
    );
    assert.strictEqual(rects.length, 6);
    assert.deepStrictEqual(rects[0], { x: 2,  y: 2, w: 8, h: 8 });
    assert.deepStrictEqual(rects[3], { x: 2, y: 2 + 8 + 1, w: 8, h: 8 });
  });
});

// ---------------------------------------------------------------------------
// _resolveFramesRects (fromAtlas region logic)
// ---------------------------------------------------------------------------

describe("_resolveFramesRects", () => {
  it("evenly divides a region horizontally", () => {
    const anim = { name: "test", x: 0, y: 0, width: 64, height: 16, frames: 4 };
    AnimationPack._resolveFramesRects(anim);
    assert.ok(anim._rects);
    assert.strictEqual(anim._rects.length, 4);
    assert.strictEqual(anim._rects[0].w, 16);
    assert.strictEqual(anim._rects[3].x, 48);
  });

  it("grids within a region with frameWidth/Height", () => {
    const anim = { name: "test", x: 10, y: 20, width: 48, height: 32, frames: 4, frameWidth: 24, frameHeight: 16 };
    AnimationPack._resolveFramesRects(anim);
    assert.strictEqual(anim._rects.length, 4);
    assert.deepStrictEqual(anim._rects[0], { x: 10, y: 20, w: 24, h: 16 });
    assert.deepStrictEqual(anim._rects[3], { x: 10 + 24, y: 20 + 16, w: 24, h: 16 });
  });

  it("parses explicit frame array (tuples)", () => {
    const anim = { name: "test", frames: [[0, 0, 10, 10], [10, 0, 10, 10]] };
    AnimationPack._resolveFramesRects(anim);
    assert.strictEqual(anim._rects.length, 2);
    assert.deepStrictEqual(anim._rects[0], { x: 0, y: 0, w: 10, h: 10 });
  });

  it("parses explicit frame array (objects)", () => {
    const anim = { name: "test", frames: [{ x: 5, y: 5, w: 8, h: 8 }] };
    AnimationPack._resolveFramesRects(anim);
    assert.strictEqual(anim._rects.length, 1);
    assert.deepStrictEqual(anim._rects[0], { x: 5, y: 5, w: 8, h: 8 });
  });

  it("throws if region info missing", () => {
    assert.throws(() => AnimationPack._resolveFramesRects({ name: "t", frames: 3 }));
  });
});

// ---------------------------------------------------------------------------
// _normalizeSpriteSheetEntry
// ---------------------------------------------------------------------------

describe("_normalizeSpriteSheetEntry", () => {
  it("normalizes a number entry", () => {
    const r = AnimationPack._normalizeSpriteSheetEntry("idle", 4, {}, 16, 16, 0, 0);
    assert.strictEqual(r.name, "idle");
    assert.strictEqual(r.frames, 4);
    assert.strictEqual(r.fps, 8);
    assert.strictEqual(r.row, 0);
  });

  it("rejects invalid frame count", () => {
    assert.throws(() => AnimationPack._normalizeSpriteSheetEntry("x", 0, {}, 16, 16, 0, 0));
    assert.throws(() => AnimationPack._normalizeSpriteSheetEntry("x", -1, {}, 16, 16, 0, 0));
  });
});

// ---------------------------------------------------------------------------
// _normalizeJSONAtlasEntry
// ---------------------------------------------------------------------------

describe("_normalizeJSONAtlasEntry", () => {
  it("matches sorted frames by prefix", () => {
    const frameMap = {
      "char_03": { x: 32, y: 0, w: 16, h: 16 },
      "char_01": { x: 0, y: 0, w: 16, h: 16 },
      "char_02": { x: 16, y: 0, w: 16, h: 16 },
    };
    const r = AnimationPack._normalizeJSONAtlasEntry("idle", { prefix: "char" }, {}, frameMap);
    assert.strictEqual(r._rects.length, 3);
    assert.strictEqual(r._rects[0].x, 0);
    assert.strictEqual(r._rects[2].x, 32);
  });

  it("uses name as default prefix", () => {
    const frameMap = {
      "walk_001": { x: 0, y: 0, w: 16, h: 16 },
      "walk_002": { x: 16, y: 0, w: 16, h: 16 },
    };
    const r = AnimationPack._normalizeJSONAtlasEntry("walk", {}, {}, frameMap);
    assert.strictEqual(r._rects.length, 2);
    assert.strictEqual(r.name, "walk");
  });

  it("throws if no frames match", () => {
    assert.throws(() =>
      AnimationPack._normalizeJSONAtlasEntry("idle", { prefix: "nope" }, {}, { foo: { x: 0, y: 0, w: 1, h: 1 } })
    );
  });
});

// ---------------------------------------------------------------------------
// _extractFrames — requires DOM canvas 2d context
// ---------------------------------------------------------------------------

describe("_extractFrames", () => {
  const hasDOM = typeof document !== "undefined" && typeof document.createElement === "function";

  it("extracts frame regions from an image", { skip: !hasDOM }, () => {
    const image = document.createElement("canvas");
    image.width = 32;
    image.height = 16;

    const registry = new AssetRegistry();
    const ids = AnimationPack._extractFrames(image, [
      { x: 0, y: 0, w: 16, h: 16 },
      { x: 16, y: 0, w: 16, h: 16 },
    ], null, registry);
    assert.strictEqual(ids.length, 2);
    const a0 = registry.get(ids[0]);
    const a1 = registry.get(ids[1]);
    assert.strictEqual(a0.sw, 16);
    assert.strictEqual(a0.sh, 16);
    assert.strictEqual(a1.sx, 16);
  });

  it("applies crop", { skip: !hasDOM }, () => {
    const image = document.createElement("canvas");
    image.width = 20;
    image.height = 20;

    const registry = new AssetRegistry();
    const ids = AnimationPack._extractFrames(image, [
      { x: 0, y: 0, w: 20, h: 20 },
    ], { left: 2, top: 2, right: 2, bottom: 2 }, registry);
    const a = registry.get(ids[0]);
    assert.strictEqual(a.sw, 16);
    assert.strictEqual(a.sh, 16);
  });

  it("throws on invalid dimensions after crop", { skip: !hasDOM }, () => {
    const image = document.createElement("canvas");
    image.width = 10;
    image.height = 10;
    assert.throws(() =>
      AnimationPack._extractFrames(image, [{ x: 0, y: 0, w: 10, h: 10 }], { left: 6, right: 6 }, new AssetRegistry())
    );
  });
});

// ---------------------------------------------------------------------------
// Integration: fromSpriteSheet mocks _extractFrames to avoid DOM dependency
// ---------------------------------------------------------------------------

describe("fromSpriteSheet (mocked _resolveImage)", () => {
  const origResolve = AnimationPack._resolveImage;

  before(() => {
    AnimationPack._resolveImage = async (img) => img;
  });

  after(() => {
    AnimationPack._resolveImage = origResolve;
  });

  it("extracts frames from a sprite sheet", async () => {
    const result = await AnimationPack.fromSpriteSheet({
      image: "sheet.png",
      assetRegistry: new AssetRegistry(),
      frameWidth: 16,
      frameHeight: 16,
      idle: 4,
    });
    assert.ok(result.idle instanceof AnimationClip);
    assert.strictEqual(result.idle.frameCount, 4);
  });

  it("respects row offset", async () => {
    const result = await AnimationPack.fromSpriteSheet({
      image: "sheet.png",
      assetRegistry: new AssetRegistry(),
      frameWidth: 16,
      frameHeight: 16,
      walk: { frames: 3, row: 1 },
    });
    assert.strictEqual(result.walk.frameCount, 3);
  });

  it("respects margin and spacing", async () => {
    const result = await AnimationPack.fromSpriteSheet({
      image: "sheet.png",
      assetRegistry: new AssetRegistry(),
      frameWidth: 16,
      frameHeight: 16,
      margin: 4,
      spacing: 2,
      idle: 2,
    });
    assert.strictEqual(result.idle.frameCount, 2);
  });

  it("applies crop", async () => {
    const result = await AnimationPack.fromSpriteSheet({
      image: "sheet.png",
      assetRegistry: new AssetRegistry(),
      frameWidth: 20,
      frameHeight: 20,
      idle: { frames: 1, crop: { left: 2, top: 2, right: 2, bottom: 2 } },
    });
    assert.strictEqual(result.idle.frameCount, 1);
  });

  it("supports ping-pong", async () => {
    const result = await AnimationPack.fromSpriteSheet({
      image: "sheet.png",
      assetRegistry: new AssetRegistry(),
      frameWidth: 16,
      frameHeight: 16,
      anim: { frames: 3, pingPong: true },
    });
    assert.strictEqual(result.anim.frameCount, 4);
  });

  it("throws if image is missing", async () => {
    await assert.rejects(() =>
      AnimationPack.fromSpriteSheet({ frameWidth: 16, frameHeight: 16, idle: 1, assetRegistry: new AssetRegistry() })
    );
  });

  it("throws if frameWidth/Height missing", async () => {
    await assert.rejects(() =>
      AnimationPack.fromSpriteSheet({ image: "sheet.png", idle: 1, assetRegistry: new AssetRegistry() })
    );
  });

  it("throws if no animation entries", async () => {
    await assert.rejects(() =>
      AnimationPack.fromSpriteSheet({ image: "sheet.png", frameWidth: 16, frameHeight: 16, assetRegistry: new AssetRegistry() })
    );
  });
});

// ---------------------------------------------------------------------------
// Integration: fromAtlas (mocked _extractFrames)
// ---------------------------------------------------------------------------

describe("fromAtlas (mocked _resolveImage)", () => {
  const origResolve = AnimationPack._resolveImage;

  before(() => {
    AnimationPack._resolveImage = async (img) => img;
  });

  after(() => {
    AnimationPack._resolveImage = origResolve;
  });

  it("extracts region as evenly divided frames", async () => {
    const result = await AnimationPack.fromAtlas({
      image: "atlas.png",
      assetRegistry: new AssetRegistry(),
      walk: { x: 0, y: 0, width: 64, height: 16, frames: 4 },
    });
    assert.strictEqual(result.walk.frameCount, 4);
  });

  it("extracts grid within a region", async () => {
    const result = await AnimationPack.fromAtlas({
      image: "atlas.png",
      assetRegistry: new AssetRegistry(),
      anim: { x: 0, y: 0, width: 48, height: 32, frames: 4, frameWidth: 24, frameHeight: 16 },
    });
    assert.strictEqual(result.anim.frameCount, 4);
  });

  it("accepts explicit frame array", async () => {
    const result = await AnimationPack.fromAtlas({
      image: "atlas.png",
      assetRegistry: new AssetRegistry(),
      anim: { frames: [[0, 0, 10, 10], [10, 0, 10, 10]] },
    });
    assert.strictEqual(result.anim.frameCount, 2);
  });

  it("supports ping-pong", async () => {
    const result = await AnimationPack.fromAtlas({
      image: "atlas.png",
      assetRegistry: new AssetRegistry(),
      anim: { x: 0, y: 0, width: 32, height: 16, frames: 3, pingPong: true },
    });
    assert.strictEqual(result.anim.frameCount, 4);
  });

  it("applies crop", async () => {
    const result = await AnimationPack.fromAtlas({
      image: "atlas.png",
      assetRegistry: new AssetRegistry(),
      anim: { x: 0, y: 0, width: 20, height: 20, frames: 1, crop: { left: 2, top: 2, right: 2, bottom: 2 } },
    });
    assert.strictEqual(result.anim.frameCount, 1);
  });

  it("throws if image missing", async () => {
    await assert.rejects(() =>
      AnimationPack.fromAtlas({ anim: { x: 0, y: 0, width: 32, height: 16, frames: 2 }, assetRegistry: new AssetRegistry() })
    );
  });

  it("throws if region info missing", async () => {
    await assert.rejects(() =>
      AnimationPack.fromAtlas({ image: "atlas.png", anim: { frames: 2 }, assetRegistry: new AssetRegistry() })
    );
  });
});

// ---------------------------------------------------------------------------
// Integration: fromJSONAtlas (mocked _extractFrames)
// ---------------------------------------------------------------------------

describe("fromJSONAtlas (mocked _resolveImage/_loadJSON)", () => {
  const origResolve = AnimationPack._resolveImage;
  const origLoadJSON = AnimationPack._loadJSON;

  before(() => {
    AnimationPack._resolveImage = async (img) => img;
    AnimationPack._loadJSON = async () => _jsonStore.current;
  });

  after(() => {
    AnimationPack._resolveImage = origResolve;
    AnimationPack._loadJSON = origLoadJSON;
  });

  const _jsonStore = { current: null };

  it("matches frames by prefix", async () => {
    _jsonStore.current = {
      frames: {
        "char_idle_0001": { frame: { x: 0, y: 0, w: 16, h: 16 } },
        "char_idle_0002": { frame: { x: 16, y: 0, w: 16, h: 16 } },
        "char_walk_0001": { frame: { x: 32, y: 0, w: 16, h: 16 } },
      },
    };

    const result = await AnimationPack.fromJSONAtlas({
      image: "atlas.png",
      assetRegistry: new AssetRegistry(),
      json: "ignored.json",
      idle: { prefix: "char_idle" },
    });

    assert.ok(result.idle instanceof AnimationClip);
    assert.strictEqual(result.idle.frameCount, 2);
  });

  it("sorts frames by trailing number", async () => {
    _jsonStore.current = {
      frames: {
        "frame_3": { frame: { x: 32, y: 0, w: 16, h: 16 } },
        "frame_1": { frame: { x: 0, y: 0, w: 16, h: 16 } },
        "frame_2": { frame: { x: 16, y: 0, w: 16, h: 16 } },
      },
    };

    const result = await AnimationPack.fromJSONAtlas({
      image: "atlas.png",
      assetRegistry: new AssetRegistry(),
      json: "ignored.json",
      anim: { prefix: "frame" },
    });

    assert.strictEqual(result.anim.frameCount, 3);
  });

  it("uses animation name as default prefix", async () => {
    _jsonStore.current = {
      frames: {
        "walk_001": { frame: { x: 0, y: 0, w: 16, h: 16 } },
        "walk_002": { frame: { x: 16, y: 0, w: 16, h: 16 } },
      },
    };

    const result = await AnimationPack.fromJSONAtlas({
      image: "atlas.png",
      assetRegistry: new AssetRegistry(),
      json: "ignored.json",
      walk: {},
    });

    assert.ok(result.walk instanceof AnimationClip);
    assert.strictEqual(result.walk.frameCount, 2);
  });

  it("handles TexturePacker array format", async () => {
    _jsonStore.current = {
      frames: [
        { filename: "sprite_01", frame: { x: 0, y: 0, w: 16, h: 16 } },
        { filename: "sprite_02", frame: { x: 16, y: 0, w: 16, h: 16 } },
      ],
    };

    const result = await AnimationPack.fromJSONAtlas({
      image: "atlas.png",
      assetRegistry: new AssetRegistry(),
      json: "ignored.json",
      sprite: { prefix: "sprite" },
    });

    assert.strictEqual(result.sprite.frameCount, 2);
  });

  it("throws if no frames match prefix", async () => {
    _jsonStore.current = {
      frames: { "foo_01": { frame: { x: 0, y: 0, w: 16, h: 16 } } },
    };

    await assert.rejects(() =>
      AnimationPack.fromJSONAtlas({ image: "atlas.png", assetRegistry: new AssetRegistry(), json: "ignored.json", bar: {} }),
      /no frames matched prefix/
    );
  });

  it("throws if image missing", async () => {
    await assert.rejects(() =>
      AnimationPack.fromJSONAtlas({ assetRegistry: new AssetRegistry(), json: "ignored.json", anim: {} })
    );
  });

  it("throws if json missing", async () => {
    await assert.rejects(() =>
      AnimationPack.fromJSONAtlas({ image: "atlas.png", assetRegistry: new AssetRegistry(), anim: {} })
    );
  });
});
