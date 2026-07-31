import { describe, it, before, after } from "node:test";
import * as assert from "node:assert";
import { Font, NativeFont, BitmapFont } from "../../../loaders/Font.js";
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
                const img = this._img;
                if (img && typeof img.getImageData === "function") return img.getImageData();
                return {
                  data: new Uint8ClampedArray(canvas.width * canvas.height * 4),
                  width: canvas.width,
                  height: canvas.height,
                };
              },
              fillRect() {},
              fillStyle: null,
              globalCompositeOperation: null,
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
      drawImage: (img, x, y, w, h) => { calls.push({ img, x, y, w, h }); },
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

describe("Font surface is clean", () => {
  after(() => { Font.clear(); });

  it("exposes only the expected API surface", () => {
    const keys = Object.keys(Font).filter((k) => !k.startsWith("_"));
    const expected = ["load", "get", "has", "remove", "clear"];
    assert.deepStrictEqual(keys, expected);
  });
});
