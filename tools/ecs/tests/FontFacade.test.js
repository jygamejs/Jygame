import { describe, it, before, after } from "node:test";
import * as assert from "node:assert";
import { Font, NativeFont, BitmapFont } from "../../../loaders/Font.js";
import { AtlasRegion } from "../../../ecs/render/AtlasRegion.js";
import { FontLoader } from "../../../loaders/FontLoader.js";
import { ImageLoader } from "../../../loaders/ImageLoader.js";

function makeImageData(w, h, colorAt) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = colorAt(x, y);
      if (!c) continue;
      const i = (y * w + x) * 4;
      data[i] = c[0];
      data[i + 1] = c[1];
      data[i + 2] = c[2];
      data[i + 3] = 255;
    }
  }
  return data;
}

function makeImage(w, h, colorAt) {
  return {
    width: w,
    height: h,
    data: makeImageData(w, h, colorAt),
    getImageData() {
      return { data: this.data, width: w, height: h };
    },
  };
}

function separatorImage() {
  return makeImage(3, 2, (x) => {
    if (x === 0) return [255, 0, 0];
    if (x === 1) return [255, 0, 255];
    return [0, 255, 0];
  });
}

function gridImage() {
  return makeImage(4, 2, () => [255, 255, 255]);
}

function imageDataFrom(img) {
  const seen = new Set();
  while (img) {
    if (typeof img.getImageData === "function") return img.getImageData();
    if (img.getContext) {
      const c = img.getContext("2d");
      if (!c || seen.has(c)) return null;
      seen.add(c);
      if (c._put) return { data: new Uint8ClampedArray(c._put.data), width: c._put.width, height: c._put.height };
      img = c._img;
      continue;
    }
    return null;
  }
  return null;
}

if (typeof global.document === "undefined") {
  global.document = {
    createElement: () => {
      const canvas = {
        width: 0,
        height: 0,
        _ctx: null,
        getContext: () => {
          if (!canvas._ctx) {
            canvas._ctx = {
              _img: null,
              drawImage(...args) { this._img = args[0]; },
              getImageData() {
                if (this._put) {
                  return { data: new Uint8ClampedArray(this._put.data), width: this._put.width, height: this._put.height };
                }
                const found = imageDataFrom(this._img);
                if (found) {
                  return { data: new Uint8ClampedArray(found.data), width: found.width, height: found.height };
                }
                return {
                  data: new Uint8ClampedArray(canvas.width * canvas.height * 4),
                  width: canvas.width,
                  height: canvas.height,
                };
              },
              fillRect() {},
              fillStyle: null,
              globalCompositeOperation: null,
              putImageData(img) { this._put = img; },
            };
          }
          return canvas._ctx;
        },
      };
      return canvas;
    },
  };
}

function snapshotLoader(fakeCache) {
  return {
    loaded: [],
    unloaded: [],
    cleared: false,
  };
}

describe("Font.load (native)", () => {
  const origLoad = FontLoader.load;
  const origUnload = FontLoader.unload;
  const origClear = FontLoader.clear;
  const calls = { loaded: [], unloaded: [], cleared: false };

  before(() => {
    FontLoader.load = async (name, path) => { calls.loaded.push([name, path]); };
    FontLoader.unload = (name) => { calls.unloaded.push(name); return true; };
    FontLoader.clear = () => { calls.cleared = true; };
  });

  after(() => {
    FontLoader.load = origLoad;
    FontLoader.unload = origUnload;
    FontLoader.clear = origClear;
    Font.clear();
  });

  it("loads a named native font", async () => {
    const font = await Font.load("Pixel", "/fonts/pixel.ttf");
    assert.ok(font instanceof NativeFont);
    assert.strictEqual(font.kind, "native");
    assert.strictEqual(font.name, "Pixel");
    assert.strictEqual(font.family, "Pixel");
    assert.strictEqual(Font.get("Pixel"), font);
    assert.ok(calls.loaded.some(([n]) => n === "Pixel"));
  });

  it("returns cached native font", async () => {
    const a = await Font.load("Hero", "/fonts/hero.ttf");
    const b = await Font.load("Hero", "/fonts/hero.ttf");
    assert.strictEqual(a, b);
  });

  it("loads a native batch map", async () => {
    const task = Font.load({ a: "/fonts/a.ttf", b: "/fonts/b.ttf" });
    const result = await task;
    assert.ok(result.a instanceof NativeFont);
    assert.ok(result.b instanceof NativeFont);
    assert.strictEqual(Font.get("a"), result.a);
  });
});

describe("Font capabilities", () => {
  const origLoad = ImageLoader.load;
  const origFLoad = FontLoader.load;

  before(() => {
    ImageLoader.load = async () => separatorImage();
    FontLoader.load = async () => {};
  });

  after(() => {
    ImageLoader.load = origLoad;
    FontLoader.load = origFLoad;
    Font.clear();
  });

  it("bitmap fonts declare glyph + raster support", async () => {
    const font = await Font.load("CapBitmap", {
      image: "sep.png",
      characters: "AB",
      separator: "#FF00FF",
    });
    assert.deepStrictEqual(font.capabilities, { glyph: true, raster: true });
    assert.strictEqual(font.supportsRenderMode(0), true, "GLYPH");
    assert.strictEqual(font.supportsRenderMode(1), true, "RASTERIZED");
    assert.strictEqual(font.supportsRenderMode("glyph"), true);
    assert.strictEqual(font.supportsRenderMode("raster"), true);
    assert.strictEqual(font.supportsRenderMode(2), false, "unknown mode");
    assert.strictEqual(font.supportsRenderMode("wave"), false);
  });

  it("native fonts declare raster (not glyph) retained support", async () => {
    const font = await Font.load("CapNative", "/fonts/cap.ttf");
    assert.deepStrictEqual(font.capabilities, { glyph: false, raster: true });
    assert.strictEqual(font.supportsRenderMode(0), false, "GLYPH unsupported");
    assert.strictEqual(font.supportsRenderMode(1), true, "RASTERIZED supported");
    assert.strictEqual(font.supportsRenderMode("glyph"), false);
    assert.strictEqual(font.supportsRenderMode("raster"), true);
  });
});

describe("NativeFont immediate rendering", () => {
  const origFLoad = FontLoader.load;

  before(() => {
    FontLoader.load = async (name) => { calls.push(["load", name]); };
  });

  after(() => {
    FontLoader.load = origFLoad;
    Font.clear();
  });

  const calls = [];

  function mockCtx() {
    const calls2 = [];
    return {
      calls: calls2,
      _font: null,
      _align: null,
      _baseline: null,
      _style: null,
      set font(v) { this._font = v; calls2.push(["font", v]); },
      get font() { return this._font; },
      set textAlign(v) { this._align = v; calls2.push(["align", v]); },
      get textAlign() { return this._align; },
      set textBaseline(v) { this._baseline = v; calls2.push(["baseline", v]); },
      get textBaseline() { return this._baseline; },
      set fillStyle(v) { this._style = v; calls2.push(["fillStyle", v]); },
      get fillStyle() { return this._style; },
      fillText(text, x, y) { calls2.push(["fillText", text, x, y]); },
      measureText(text) { return { width: text.length * 7 }; },
    };
  }

  it("exposes a single source of truth for the canvas font string", async () => {
    const font = await Font.load("FontSrc", "/fonts/src.ttf");
    assert.strictEqual(font.getCanvasFont(24), "24px FontSrc");
    assert.strictEqual(font.getCanvasFont(12, { weight: "bold" }), "bold 12px FontSrc");
    assert.strictEqual(font.getCanvasFont(16, { style: "italic", weight: "700" }), "italic 700 16px FontSrc");
    const ctx = mockCtx();
    font.applyToContext(ctx, 16);
    assert.strictEqual(ctx._font, "16px FontSrc", "applyToContext sets ctx.font through the same source");
  });

  it("renders immediate canvas text with ctx.font/fillText", async () => {
    const font = await Font.load("ImmediateFace", "/fonts/im.ttf");
    const ctx = mockCtx();
    font.render(ctx, "Hello", 10, 40, { color: "#ffffff", size: 24 });
    assert.deepStrictEqual(ctx._font, "24px ImmediateFace");
    assert.strictEqual(ctx._align, "left");
    assert.strictEqual(ctx._baseline, "top");
    assert.strictEqual(ctx._style, "#ffffff");
    assert.deepStrictEqual(ctx.calls.filter((c) => c[0] === "fillText")[0], ["fillText", "Hello", 10, 40]);
  });

  it("honors align and scale for immediate rendering", async () => {
    const font = await Font.load("ImmediateAlign", "/fonts/ia.ttf");
    const ctx = mockCtx();
    font.render(ctx, "Hi", 50, 60, { color: "#ff0000", align: "center", size: 12, scale: 2 });
    assert.deepStrictEqual(ctx._font, "24px ImmediateAlign", "size * scale = px");
    assert.strictEqual(ctx._align, "center");
  });

  it("measures native text", async () => {
    const font = await Font.load("ImmediateMeasure", "/fonts/im2.ttf");
    const ctx = mockCtx();
    const m = font.measure("ABC", { size: 10 }, ctx);
    assert.strictEqual(m.width, 21, "7px per glyph at 10px font");
    assert.strictEqual(m.height, 10);
  });
});

describe("Font.load (bitmap validation)", () => {
  const origLoad = ImageLoader.load;
  const origFLoad = FontLoader.load;

  before(() => {
    ImageLoader.load = async () => separatorImage();
    FontLoader.load = async () => {};
  });

  after(() => {
    ImageLoader.load = origLoad;
    FontLoader.load = origFLoad;
    Font.clear();
  });

  it("throws when no slicing strategy is given", () => {
    assert.throws(
      () => Font.load("F", { image: "f.png", characters: "AB" }),
      /slicing strategy/
    );
  });

  it("throws when both strategies are given", () => {
    assert.throws(
      () => Font.load("F", {
        image: "f.png",
        characters: "AB",
        separator: "#FF00FF",
        gridX: 2,
        gridY: 1,
      }),
      /cannot specify both/
    );
  });

  it("throws when only one grid axis is given", () => {
    assert.throws(
      () => Font.load("F", { image: "f.png", characters: "AB", gridX: 2 }),
      /both gridX and gridY/
    );
  });

  it("throws when a bare bitmap config has no name", () => {
    assert.throws(
      () => Font.load({ image: "f.png", characters: "AB", separator: "#FF00FF" }),
      /requires a name/
    );
  });

  it("throws on a mixed batch map", () => {
    assert.throws(
      () => Font.load({
        a: "/fonts/a.ttf",
        b: { image: "f.png", characters: "AB", separator: "#FF00FF" },
      }),
      /all paths/
    );
  });
});

describe("Font.load (bitmap separator)", () => {
  const origLoad = ImageLoader.load;
  const origFLoad = FontLoader.load;

  before(() => {
    ImageLoader.load = async (path) => separatorImage();
    FontLoader.load = async () => {};
  });

  after(() => {
    ImageLoader.load = origLoad;
    FontLoader.load = origFLoad;
    Font.clear();
  });

  it("loads and slices a separator font", async () => {
    const font = await Font.load("SepFont", {
      image: "sep.png",
      characters: "AB",
      separator: "#FF00FF",
    });
    assert.ok(font instanceof BitmapFont);
    assert.strictEqual(font.kind, "bitmap");
    assert.strictEqual(font.name, "SepFont");
    assert.deepStrictEqual(font.measure("AB"), { width: 2, height: 2 });
  });

  it("throws when glyph count does not match characters", async () => {
    await assert.rejects(
      Font.load("BadFont", {
        image: "sep.png",
        characters: "ABC",
        separator: "#FF00FF",
      }),
      /found 2 glyphs/
    );
  });

  it("applies spacing to advances", async () => {
    const font = await Font.load("Spaced", {
      image: "sep.png",
      characters: "AB",
      separator: "#FF00FF",
      spacing: 2,
    });
    assert.deepStrictEqual(font.measure("A"), { width: 3, height: 2 });
  });
});

describe("Font.load (bitmap grid)", () => {
  const origLoad = ImageLoader.load;
  const origFLoad = FontLoader.load;

  before(() => {
    ImageLoader.load = async (path) => gridImage();
    FontLoader.load = async () => {};
  });

  after(() => {
    ImageLoader.load = origLoad;
    FontLoader.load = origFLoad;
    Font.clear();
  });

  it("loads and slices a grid font", async () => {
    const font = await Font.load("GridFont", {
      image: "grid.png",
      characters: "AB",
      gridX: 2,
      gridY: 1,
    });
    assert.ok(font instanceof BitmapFont);
    assert.deepStrictEqual(font.measure("AB"), { width: 4, height: 2 });
  });

  it("throws when characters exceed grid capacity", async () => {
    await assert.rejects(
      Font.load("Tiny", {
        image: "grid.png",
        characters: "ABC",
        gridX: 1,
        gridY: 1,
      }),
      /exceed grid capacity/
    );
  });

  it("loads a bitmap batch array", async () => {
    const task = Font.load([
      { name: "G1", image: "grid.png", characters: "AB", gridX: 2, gridY: 1 },
      { name: "G2", image: "grid.png", characters: "AB", gridX: 2, gridY: 1 },
    ]);
    const result = await task;
    assert.ok(result.G1 instanceof BitmapFont);
    assert.ok(result.G2 instanceof BitmapFont);
    assert.strictEqual(Font.get("G1"), result.G1);
  });

  it("loads a bitmap batch map", async () => {
    const task = Font.load({
      G1: { image: "grid.png", characters: "AB", gridX: 2, gridY: 1 },
      G2: { image: "grid.png", characters: "AB", gridX: 2, gridY: 1 },
    });
    const result = await task;
    assert.ok(result.G1 instanceof BitmapFont);
    assert.ok(result.G2 instanceof BitmapFont);
  });

  it("loads a single config object with a name", async () => {
    const task = Font.load({
      name: "Single",
      image: "grid.png",
      characters: "AB",
      gridX: 2,
      gridY: 1,
    });
    const font = await task;
    assert.ok(font instanceof BitmapFont);
    assert.strictEqual(font.name, "Single");
  });
});

describe("BitmapFont.render", () => {
  const origLoad = ImageLoader.load;
  const origFLoad = FontLoader.load;

  before(() => {
    ImageLoader.load = async (path) => gridImage();
    FontLoader.load = async () => {};
  });

  after(() => {
    ImageLoader.load = origLoad;
    FontLoader.load = origFLoad;
    Font.clear();
  });

  let fontId = 0;

  async function loadFont(options = {}) {
    fontId++;
    return Font.load("Draw" + fontId, {
      image: "grid.png",
      characters: "AB",
      gridX: 2,
      gridY: 1,
      ...options,
    });
  }

  function makeCtx() {
    const calls = [];
    return {
      calls,
      drawImage: (img, sx, sy, sw, sh, dx, dy, dw, dh) => {
        calls.push({ img, x: dx, y: dy, w: dw, h: dh, sx, sy, sw, sh });
      },
    };
  }

  it("draws each glyph left-aligned", async () => {
    const font = await loadFont();
    const ctx = makeCtx();
    font.render(ctx, "AB", 10, 0);
    assert.strictEqual(ctx.calls.length, 2);
    assert.strictEqual(ctx.calls[0].x, 10);
    assert.strictEqual(ctx.calls[1].x, 12);
  });

  it("draws each glyph through its region rect", async () => {
    const font = await loadFont();
    const ctx = makeCtx();
    font.render(ctx, "AB", 0, 0);
    assert.strictEqual(ctx.calls.length, 2);
    assert.strictEqual(ctx.calls[0].sx, 0);
    assert.strictEqual(ctx.calls[0].sy, 0);
    assert.strictEqual(ctx.calls[0].sw, 2);
    assert.strictEqual(ctx.calls[0].sh, 2);
    assert.strictEqual(ctx.calls[0].img, font.glyph("A").region.sourceImage,
      "render draws the glyph record's region source");
  });

  it("applies scale to positions and sizes", async () => {
    const font = await loadFont();
    const ctx = makeCtx();
    font.render(ctx, "A", 10, 0, { scale: 2 });
    assert.strictEqual(ctx.calls.length, 1);
    assert.strictEqual(ctx.calls[0].x, 10);
    assert.strictEqual(ctx.calls[0].w, 4);
    assert.strictEqual(ctx.calls[0].h, 4);
  });

  it("centers text", async () => {
    const font = await loadFont();
    const ctx = makeCtx();
    font.render(ctx, "AB", 10, 0, { align: "center" });
    assert.strictEqual(ctx.calls.length, 2);
    assert.strictEqual(ctx.calls[0].x, 8);
  });

  it("right-aligns text", async () => {
    const font = await loadFont();
    const ctx = makeCtx();
    font.render(ctx, "AB", 10, 0, { align: "right" });
    assert.strictEqual(ctx.calls[0].x, 6);
  });

  it("tints glyphs with a color", async () => {
    const font = await loadFont();
    const ctx = makeCtx();
    font.render(ctx, "A", 0, 0, { color: "#ff0000" });
    assert.strictEqual(ctx.calls.length, 1);
    assert.ok(ctx.calls[0].img);
  });

  it("uses spaceWidth for space advance", async () => {
    const font = await loadFont({ spaceWidth: 8 });
    assert.deepStrictEqual(font.measure("A B"), { width: 12, height: 2 });
  });
});

describe("Font.get/has/remove/clear", () => {
  const origLoad = FontLoader.load;
  const origUnload = FontLoader.unload;
  const origClear = FontLoader.clear;
  const calls = { unloaded: [], cleared: false };

  before(() => {
    FontLoader.load = async () => {};
    FontLoader.unload = (name) => { calls.unloaded.push(name); return true; };
    FontLoader.clear = () => { calls.cleared = true; };
  });

  after(() => {
    FontLoader.load = origLoad;
    FontLoader.unload = origUnload;
    FontLoader.clear = origClear;
    Font.clear();
  });

  it("get returns null for missing key", () => {
    assert.strictEqual(Font.get("nope"), null);
  });

  it("has returns false for missing key", () => {
    assert.strictEqual(Font.has("nope"), false);
  });

  it("remove unloads native fonts", async () => {
    await Font.load("X", "/fonts/x.ttf");
    const removed = Font.remove("X");
    assert.strictEqual(removed, true);
    assert.strictEqual(Font.has("X"), false);
    assert.ok(calls.unloaded.includes("X"));
  });

  it("remove returns false for missing key", () => {
    assert.strictEqual(Font.remove("nope"), false);
  });

  it("clear empties registry and loader", async () => {
    await Font.load("a", "/fonts/a.ttf");
    await Font.load("b", "/fonts/b.ttf");
    Font.clear();
    assert.strictEqual(Font.has("a"), false);
    assert.strictEqual(Font.has("b"), false);
    assert.strictEqual(calls.cleared, true);
  });
});

describe("BitmapFont background & caseInsensitive", () => {
  const origLoad = ImageLoader.load;
  const origFLoad = FontLoader.load;

  before(() => {
    ImageLoader.load = async (path) => {
      if (path === "sep.png") {
        return makeImage(5, 2, (x, y) => {
          if (x === 0 || x === 4) return [127, 127, 127];
          if (x === 1 && y === 1) return [255, 0, 0];
          return [0, 0, 0];
        });
      }
      return gridImage();
    };
    FontLoader.load = async () => {};
  });

  after(() => {
    ImageLoader.load = origLoad;
    FontLoader.load = origFLoad;
    Font.clear();
  });

  function makeCtx() {
    const calls = [];
    return {
      calls,
      drawImage: (img, sx, sy, sw, sh, dx, dy, dw, dh) => {
        calls.push({ img, x: dx, y: dy, w: dw, h: dh, sx, sy, sw, sh });
      },
    };
  }

  it("background color is ignored during separator slicing", async () => {
    const font = await Font.load("Bg", {
      image: "sep.png",
      characters: "A",
      separator: "#7F7F7F",
      background: "#000000",
    });
    assert.deepStrictEqual(font.measure("A"), { width: 1, height: 1 });
  });

  it("without background, opaque pixels count as glyph content", async () => {
    const font = await Font.load("NoBg", {
      image: "sep.png",
      characters: "A",
      separator: "#7F7F7F",
    });
    assert.deepStrictEqual(font.measure("A"), { width: 3, height: 2 });
  });

  it("caseInsensitive renders lowercase using uppercase glyphs", async () => {
    const font = await Font.load("CI", {
      image: "grid.png",
      characters: "AB",
      gridX: 2,
      gridY: 1,
      caseInsensitive: true,
    });
    assert.deepStrictEqual(font.measure("ab"), font.measure("AB"));
    const ctx = makeCtx();
    font.render(ctx, "ab", 0, 0);
    assert.strictEqual(ctx.calls.length, 2);
  });

  it("caseInsensitive works when rendering with a color tint", async () => {
    const font = await Font.load("CITint", {
      image: "grid.png",
      characters: "AB",
      gridX: 2,
      gridY: 1,
      caseInsensitive: true,
    });
    const ctx = makeCtx();
    font.render(ctx, "ab", 0, 0, { color: "#ff0000" });
    assert.strictEqual(ctx.calls.length, 2);
  });

  it("colors restricts tinting to the glyph's character colors", async () => {
    const prev = ImageLoader.load;
    ImageLoader.load = async () =>
      makeImage(2, 2, (x, y) => {
        if (x === 0 && y === 0) return [180, 180, 180];
        if (x === 1 && y === 1) return [255, 0, 0];
        return null;
      });
    try {
      const font = await Font.load("Colors", {
        image: "colors.png",
        characters: "A",
        gridX: 1,
        gridY: 1,
        colors: ["#FF0000"],
      });
      const tinted = font.getTintedGlyph("A", "#00ff00").region.sourceImage;
      const out = tinted.getContext("2d").getImageData(0, 0, 2, 2).data;
      assert.deepStrictEqual([out[0], out[1], out[2], out[3]], [180, 180, 180, 255]);
      assert.deepStrictEqual([out[12], out[13], out[14], out[15]], [0, 255, 0, 255]);
    } finally {
      ImageLoader.load = prev;
    }
  });

  it("colors accepts a single color string", async () => {
    const prev = ImageLoader.load;
    ImageLoader.load = async () =>
      makeImage(2, 2, (x, y) => {
        if (x === 0 && y === 0) return [180, 180, 180];
        if (x === 1 && y === 1) return [255, 0, 0];
        return null;
      });
    try {
      const font = await Font.load("ColorsOne", {
        image: "colors.png",
        characters: "A",
        gridX: 1,
        gridY: 1,
        colors: "#FF0000",
      });
      const tinted = font.getTintedGlyph("A", "#00ff00").region.sourceImage;
      const out = tinted.getContext("2d").getImageData(0, 0, 2, 2).data;
      assert.deepStrictEqual([out[0], out[1], out[2], out[3]], [180, 180, 180, 255]);
      assert.deepStrictEqual([out[12], out[13], out[14], out[15]], [0, 255, 0, 255]);
    } finally {
      ImageLoader.load = prev;
    }
  });

  it("without caseInsensitive, missing glyphs are skipped", async () => {
    const font = await Font.load("CS", {
      image: "grid.png",
      characters: "AB",
      gridX: 2,
      gridY: 1,
    });
    assert.deepStrictEqual(font.measure("ab"), { width: 0, height: 2 });
    const ctx = makeCtx();
    font.render(ctx, "ab", 0, 0);
    assert.strictEqual(ctx.calls.length, 0);
  });
});

describe("Font numeric ids and glyph accessors", () => {
  const origLoad = ImageLoader.load;
  const origFLoad = FontLoader.load;

  before(() => {
    ImageLoader.load = async (path) => gridImage();
    FontLoader.load = async () => {};
  });

  after(() => {
    ImageLoader.load = origLoad;
    FontLoader.load = origFLoad;
    Font.clear();
  });

  it("assigns distinct monotonic ids to loaded fonts", async () => {
    const a = await Font.load("IdA", "/fonts/a.ttf");
    const b = await Font.load("IdB", "/fonts/b.ttf");
    assert.ok(typeof a.id === "number" && a.id > 0);
    assert.ok(typeof b.id === "number" && b.id > a.id);
  });

  it("cached loads keep the same id", async () => {
    const a = await Font.load("IdCache", "/fonts/cache.ttf");
    const b = await Font.load("IdCache", "/fonts/cache.ttf");
    assert.strictEqual(a, b);
    assert.strictEqual(a.id, b.id);
  });

  it("byId returns the registered font and null for unknown ids", async () => {
    const font = await Font.load("IdLookup", "/fonts/lookup.ttf");
    assert.strictEqual(Font.byId(font.id), font);
    assert.strictEqual(Font.byId(-1), null);
    assert.strictEqual(Font.byId(0xFFFFFF), null);
  });

  it("remove clears the id mapping without reusing the id", async () => {
    const a = await Font.load("IdRemove", "/fonts/remove.ttf");
    const oldId = a.id;
    assert.strictEqual(Font.remove("IdRemove"), true);
    assert.strictEqual(Font.byId(oldId), null);
    const b = await Font.load("IdRemove", "/fonts/remove.ttf");
    assert.ok(b.id > oldId);
  });

  it("clear clears the id mapping but keeps the counter monotonic", async () => {
    const a = await Font.load("IdClearA", "/fonts/ca.ttf");
    Font.clear();
    assert.strictEqual(Font.byId(a.id), null);
    const b = await Font.load("IdClearB", "/fonts/cb.ttf");
    assert.ok(b.id > a.id);
  });

  it("bitmap glyph/advance/lineHeight delegate to the private data", async () => {
    const font = await Font.load("Acc", {
      image: "grid.png",
      characters: "AB",
      gridX: 2,
      gridY: 1,
    });
    assert.strictEqual(font.glyph("A"), font._glyph("A"));
    assert.strictEqual(font.advance("A"), font._advance("A"));
    assert.strictEqual(font.lineHeight, font._lineHeight);
    assert.strictEqual(font.glyph("Z"), null);
    assert.strictEqual(font.advance("Z"), 0);
  });

  it("bitmap accessors honor caseInsensitive mode", async () => {
    const font = await Font.load("AccCI", {
      image: "grid.png",
      characters: "AB",
      gridX: 2,
      gridY: 1,
      caseInsensitive: true,
    });
    assert.strictEqual(font.glyph("a"), font.glyph("A"));
    assert.strictEqual(font.advance("a"), font.advance("A"));
  });

  it("glyph() returns a region+metrics record, not a canvas", async () => {
    const font = await Font.load("GlyphRec", {
      image: "grid.png",
      characters: "AB",
      gridX: 2,
      gridY: 1,
    });
    const g = font.glyph("A");
    assert.ok(g && typeof g === "object");
    assert.ok(g.region, "glyph carries a renderable region");
    assert.ok(g.region instanceof AtlasRegion, "region is the canonical AtlasRegion descriptor");
    assert.strictEqual(g.region.sx, 0);
    assert.strictEqual(g.region.sy, 0);
    assert.strictEqual(g.region.sw, 2);
    assert.strictEqual(g.region.sh, 2);
    assert.ok(g.region.sourceImage, "region references a backing resource");
    assert.strictEqual(typeof g.advance, "number");
    assert.strictEqual(g.advance, 2);
    assert.strictEqual(g.offsetX, 0);
    assert.strictEqual(g.offsetY, 0);
    assert.strictEqual(font.glyph("A"), g, "glyph records are stable — no per-call allocation");
    assert.strictEqual(font.getGlyph("A"), g, "getGlyph is the same record API");
  });

  it("glyph records can share one sourceImage with different regions (atlas-style)", async () => {
    const font = await Font.load("AtlasRec", {
      image: "grid.png",
      characters: "AB",
      gridX: 2,
      gridY: 1,
    });
    // Rebase every glyph region into one shared source — the same operation an
    // atlas-backed font performs at load time. Consumers of the records (layout,
    // rasterization) must not care that the backing is now shared.
    const shared = document.createElement("canvas");
    shared.width = 8;
    shared.height = 2;
    let offset = 0;
    font._glyphs.forEach((rec) => {
      rec.region = new AtlasRegion({
        sourceImage: shared,
        x: offset,
        y: 0,
        width: rec.region.sw,
        height: rec.region.sh,
      });
      offset += rec.region.sw;
    });

    const a = font.glyph("A");
    const b = font.glyph("B");
    assert.strictEqual(a.region.sourceImage, b.region.sourceImage, "records point at the same source");
    assert.strictEqual(a.region.sourceImage, shared);
    assert.deepStrictEqual([a.region.sx, a.region.sw], [0, 2]);
    assert.deepStrictEqual([b.region.sx, b.region.sw], [2, 2]);
    assert.strictEqual(font.advance("A"), 2, "metrics unchanged by the shared backing");
    assert.strictEqual(a.region.sx + a.region.sw, b.region.sx, "regions tile the shared source");
  });

  it("getTintedGlyph returns a record whose region points at the tinted source", async () => {
    const font = await Font.load("TintRec2", {
      image: "grid.png",
      characters: "AB",
      gridX: 2,
      gridY: 1,
    });
    const base = font.glyph("A");
    const tinted = font.getTintedGlyph("A", "#ff0000");
    assert.ok(tinted);
    assert.ok(tinted.region instanceof AtlasRegion);
    assert.strictEqual(tinted.region.sw, base.region.sw);
    assert.strictEqual(tinted.region.sh, base.region.sh);
    assert.strictEqual(tinted.region.sx, 0, "tinted region is the whole tinted source box");
    assert.strictEqual(tinted.region.sy, 0);
    assert.strictEqual(tinted.advance, base.advance);
    assert.strictEqual(tinted.offsetX, base.offsetX);
    assert.strictEqual(tinted.offsetY, base.offsetY);
    assert.notStrictEqual(tinted.region.sourceImage, base.region.sourceImage);
    assert.strictEqual(font.getTintedGlyph("A", "#ff0000"), tinted, "tinted records are cached");
  });

  it("getTintedGlyph returns a record sharing the base metrics", async () => {
    const font = await Font.load("TintRec", {
      image: "grid.png",
      characters: "AB",
      gridX: 2,
      gridY: 1,
    });
    const base = font.glyph("A");
    const tinted = font.getTintedGlyph("A", "#ff0000");
    assert.ok(tinted);
    assert.strictEqual(tinted.region.sw, base.region.sw);
    assert.strictEqual(tinted.region.sh, base.region.sh);
    assert.strictEqual(tinted.advance, base.advance);
    assert.strictEqual(tinted.offsetX, base.offsetX);
    assert.strictEqual(tinted.offsetY, base.offsetY);
    assert.notStrictEqual(tinted.region.sourceImage, base.region.sourceImage);
    assert.strictEqual(font.getTintedGlyph("A", "#ff0000"), tinted, "tinted records are cached");
  });
});

describe("Font surface is clean", () => {
  after(() => { Font.clear(); });

  it("exposes only the expected API surface", () => {
    const keys = Object.keys(Font).filter((k) => !k.startsWith("_"));
    const expected = ["load", "get", "has", "byId", "remove", "clear"];
    assert.deepStrictEqual(keys, expected);
  });
});
