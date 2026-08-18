import { describe, it, before, after } from "node:test";
import * as assert from "node:assert";
import { World } from "../../../ecs/core/World.js";
import { Transform } from "../../../ecs/components/Transform.js";
import { Renderable } from "../../../ecs/components/Renderable.js";
import { Visible } from "../../../ecs/components/Visible.js";
import { Text as TextComponent } from "../../../ecs/components/Text.js";
import { TextResourcePool } from "../../../ecs/render/TextResourcePool.js";
import { TextRenderMode } from "../../../ecs/render/TextRenderMode.js";
import { Scene } from "../../../core/Scene.js";
import { Text } from "../../../display/Text.js";
import { Font } from "../../../loaders/Font.js";
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

describe("Text facade", () => {
  const origImgLoad = ImageLoader.load;
  const origFLoad = FontLoader.load;
  let font;

  before(async () => {
    ImageLoader.load = async () => gridImage();
    FontLoader.load = async () => {};
    font = await Font.load("Grid", { image: "grid.png", characters: "AB", gridX: 2, gridY: 1 });
  });

  after(() => {
    ImageLoader.load = origImgLoad;
    FontLoader.load = origFLoad;
    Font.clear();
    Text._defaultWorld = null;
  });

  it("constructs in a bare default world", () => {
    Text._defaultWorld = null;
    const t = new Text(10, 20, font, "AB");
    assert.ok(t.world instanceof World);
    assert.ok(t.world.isAlive(t.entity));
    assert.strictEqual(t.world.has(t.entity, Transform), true);
    assert.strictEqual(t.world.has(t.entity, Renderable), true);
    assert.strictEqual(t.world.has(t.entity, Visible), true);
    assert.strictEqual(t.world.has(t.entity, TextComponent), true);
    assert.strictEqual(t.x, 10);
    assert.strictEqual(t.y, 20);
    assert.strictEqual(t.value, "AB");
    assert.strictEqual(t.font, font);
  });

  it("constructs in a scene world after enter", () => {
    const scene = new Scene();
    scene.enter();
    const t = new Text(0, 0, font, "hi");
    assert.strictEqual(Text._defaultWorld, scene.world);
    assert.strictEqual(t.world, scene.world);
    assert.strictEqual(t.value, "hi");
  });

  it("resolves font by name and object; throws for missing fonts", () => {
    Text._defaultWorld = null;
    const byName = new Text(0, 0, "Grid", "hi");
    assert.strictEqual(byName.font, font);
    const byObject = new Text(0, 0, font, "hi");
    assert.strictEqual(byObject.font, font);
    assert.throws(() => new Text(0, 0, "Nope", "hi"), /not found/);
  });

  it("rejects native fonts for world-space text with a capability error", async () => {
    const native = await Font.load("NativeFace", "/fonts/n.ttf");
    Text._defaultWorld = null;
    assert.throws(() => new Text(0, 0, native, "hi"), /does not support render mode "glyph"/);
    assert.throws(() => new Text(0, 0, "NativeFace", "hi"), /does not support render mode "glyph"/);
    assert.throws(
      () => new Text(0, 0, native, "hi", { renderMode: TextRenderMode.RASTERIZED }),
      /does not support render mode "raster"/,
    );
    assert.throws(
      () => new Text(0, 0, "NativeFace", "hi", { renderMode: TextRenderMode.RASTER }),
      /does not support render mode "raster"/,
    );
  });

  it("rejects native fonts on runtime font and renderMode changes", async () => {
    Text._defaultWorld = null;
    const t = new Text(0, 0, font, "hi");

    // bitmap/glyph → bitmap/raster → bitmap/glyph: supported
    t.renderMode = TextRenderMode.RASTERIZED;
    assert.strictEqual(t.renderMode, TextRenderMode.RASTERIZED);
    t.renderMode = TextRenderMode.GLYPH;
    assert.strictEqual(t.renderMode, TextRenderMode.GLYPH);

    // bitmap/glyph → native/glyph: throws
    const native = await Font.load("SwitchFace", "/fonts/s.ttf");
    assert.throws(() => { t.font = native; }, /does not support render mode "glyph"/);
    assert.strictEqual(t.font, font, "font unchanged after rejected swap");

    // bitmap/raster → native/raster: throws
    t.renderMode = TextRenderMode.RASTERIZED;
    assert.throws(() => { t.font = native; }, /does not support render mode "raster"/);
    assert.strictEqual(t.font, font, "font unchanged after rejected swap");
    assert.strictEqual(t.renderMode, TextRenderMode.RASTERIZED, "mode unchanged after rejected swap");
  });

  it("mutations update components, Renderable, and the pool, bumping version", () => {
    Text._defaultWorld = null;
    const t = new Text(0, 0, font, "AB");
    const w = t.world;
    const e = t.entity;
    assert.strictEqual(w.get(e, TextComponent).version, 1);
    assert.strictEqual(w.get(e, TextComponent).surfaceVersion, 1);

    t.value = "A";
    assert.strictEqual(t.value, "A");
    assert.strictEqual(w.get(e, TextComponent).version, 2);
    assert.strictEqual(w.get(e, TextComponent).surfaceVersion, 2, "content change rebuilds layout and surface");

    t.font = font;
    assert.strictEqual(w.get(e, TextComponent).fontHandle, font.id);
    assert.strictEqual(w.get(e, TextComponent).version, 3);
    assert.strictEqual(w.get(e, TextComponent).surfaceVersion, 3);

    t.color = "#ffcc00";
    assert.strictEqual(w.get(e, Renderable).fillColor, 0xffcc00);
    assert.strictEqual(t.color, "#ffcc00");
    assert.strictEqual(w.get(e, TextComponent).colorEnabled, 1);
    assert.strictEqual(w.get(e, TextComponent).version, 3, "color does not invalidate layout");
    assert.strictEqual(w.get(e, TextComponent).surfaceVersion, 4, "color rebuilds only the surface");

    t.color = "#ffffff";
    assert.strictEqual(w.get(e, Renderable).fillColor, 0xffffff);
    assert.strictEqual(t.color, "#ffffff");
    assert.strictEqual(w.get(e, TextComponent).colorEnabled, 1);
    assert.strictEqual(w.get(e, TextComponent).surfaceVersion, 5);

    t.color = null;
    assert.strictEqual(t.color, null);
    assert.strictEqual(w.get(e, TextComponent).colorEnabled, 0);
    assert.strictEqual(w.get(e, TextComponent).surfaceVersion, 6);

    t.align = "center";
    assert.strictEqual(w.get(e, TextComponent).align, 1);
    assert.strictEqual(t.align, "center");
    assert.strictEqual(w.get(e, TextComponent).version, 4);
    assert.strictEqual(w.get(e, TextComponent).surfaceVersion, 7);

    t.letterSpacing = 1.5;
    assert.strictEqual(w.get(e, TextComponent).letterSpacing, 1.5);
    assert.strictEqual(w.get(e, TextComponent).version, 5);
    assert.strictEqual(w.get(e, TextComponent).surfaceVersion, 8);

    t.layer = 2;
    assert.strictEqual(w.get(e, Renderable).layer, 2);
    t.depth = 4;
    assert.strictEqual(w.get(e, Renderable).depth, 4);

    t.x = 10;
    t.y = 20;
    assert.strictEqual(w.get(e, Transform).x, 10);
    assert.strictEqual(w.get(e, Transform).y, 20);
    t.angle = 0.5;
    assert.strictEqual(w.get(e, Transform).rotation, 0.5);
    t.scale = 2;
    assert.strictEqual(w.get(e, Transform).scaleX, 2);
    assert.strictEqual(w.get(e, Transform).scaleY, 2);
    t.visible = false;
    assert.strictEqual(w.get(e, Visible).value, 0);
    assert.strictEqual(t.visible, false);
  });

  it("destroy releases the pool slot for reuse", () => {
    Text._defaultWorld = null;
    const t = new Text(0, 0, font, "hi");
    const w = t.world;
    const pool = w.getResource(TextResourcePool);
    const handle = w.get(t.entity, TextComponent).contentHandle;
    assert.notStrictEqual(pool.get(handle), null);

    t.destroy();
    assert.strictEqual(pool.get(handle), null);
    assert.strictEqual(w.isAlive(t.entity), false);
    assert.throws(() => t.value, /destroyed/);

    const t2 = new Text(0, 0, font, "yo");
    assert.notStrictEqual(pool.get(w.get(t2.entity, TextComponent).contentHandle), null);
  });

  it("swaps Text._defaultWorld on scene enter/exit", () => {
    const prev = Text._defaultWorld;
    const scene = new Scene();
    scene.enter();
    assert.strictEqual(Text._defaultWorld, scene.world);
    scene.exit();
    assert.strictEqual(Text._defaultWorld, prev);
  });

  it("exports facade Text and component TextComponent without collision", async () => {
    const mod = await import("../../../jygame.js");
    assert.strictEqual(typeof mod.Text, "function");
    assert.strictEqual(typeof mod.TextComponent, "function");
    assert.notStrictEqual(mod.Text, mod.TextComponent);
    assert.strictEqual(typeof mod.TextSystem, "function");
    assert.strictEqual(typeof mod.TextResourcePool, "function");
  });
});

describe("Text renderMode", () => {
  const origImgLoad = ImageLoader.load;
  const origFLoad = FontLoader.load;
  let font;

  before(async () => {
    ImageLoader.load = async () => gridImage();
    FontLoader.load = async () => {};
    font = await Font.load("ModeFacade", { image: "grid.png", characters: "AB", gridX: 2, gridY: 1 });
  });

  after(() => {
    ImageLoader.load = origImgLoad;
    FontLoader.load = origFLoad;
    Font.clear();
    Text._defaultWorld = null;
  });

  it("defaults to GLYPH", () => {
    Text._defaultWorld = null;
    const t = new Text(0, 0, font, "hi");
    assert.strictEqual(t.renderMode, TextRenderMode.GLYPH);
    assert.strictEqual(t.world.get(t.entity, TextComponent).renderMode, TextRenderMode.GLYPH);
  });

  it("setter/getter round-trips GLYPH and RASTERIZED", () => {
    Text._defaultWorld = null;
    const t = new Text(0, 0, font, "hi");
    t.renderMode = TextRenderMode.GLYPH;
    assert.strictEqual(t.renderMode, TextRenderMode.GLYPH);
    assert.strictEqual(t.world.get(t.entity, TextComponent).renderMode, TextRenderMode.GLYPH);

    t.renderMode = TextRenderMode.RASTERIZED;
    assert.strictEqual(t.renderMode, TextRenderMode.RASTERIZED);
    assert.strictEqual(t.world.get(t.entity, TextComponent).renderMode, TextRenderMode.RASTERIZED);
  });

  it("accepts string mode names", () => {
    Text._defaultWorld = null;
    const t = new Text(0, 0, font, "hi");
    t.renderMode = "glyph";
    assert.strictEqual(t.renderMode, TextRenderMode.GLYPH);
    t.renderMode = "raster";
    assert.strictEqual(t.renderMode, TextRenderMode.RASTERIZED);
    t.renderMode = "rasterized";
    assert.strictEqual(t.renderMode, TextRenderMode.RASTERIZED);
  });

  it("rejects invalid mode values", () => {
    Text._defaultWorld = null;
    const t = new Text(0, 0, font, "hi");
    assert.throws(() => { t.renderMode = 2; }, /renderMode/);
    assert.throws(() => { t.renderMode = "wave"; }, /renderMode/);
    assert.throws(() => { t.renderMode = null; }, /renderMode/);
  });

  it("constructor options.renderMode selects the mode", () => {
    Text._defaultWorld = null;
    const t = new Text(0, 0, font, "hi", { renderMode: TextRenderMode.GLYPH });
    assert.strictEqual(t.renderMode, TextRenderMode.GLYPH);
    const t2 = new Text(0, 0, font, "hi", { renderMode: TextRenderMode.RASTERIZED });
    assert.strictEqual(t2.renderMode, TextRenderMode.RASTERIZED);
    const t3 = new Text(0, 0, font, "hi", { renderMode: TextRenderMode.RASTER });
    assert.strictEqual(t3.renderMode, TextRenderMode.RASTERIZED);
    const t4 = new Text(0, 0, font, "hi", { renderMode: "raster" });
    assert.strictEqual(t4.renderMode, TextRenderMode.RASTERIZED);
  });

  it("RASTER aliases RASTERIZED", () => {
    Text._defaultWorld = null;
    const t = new Text(0, 0, font, "hi");
    t.renderMode = TextRenderMode.RASTER;
    assert.strictEqual(t.renderMode, TextRenderMode.RASTERIZED);
    assert.strictEqual(TextRenderMode.RASTER, TextRenderMode.RASTERIZED);
  });

  it("changing renderMode does not bump version or surfaceVersion", () => {
    Text._defaultWorld = null;
    const t = new Text(0, 0, font, "hi");
    const w = t.world;
    const e = t.entity;
    const v = w.get(e, TextComponent).version;
    const sv = w.get(e, TextComponent).surfaceVersion;

    t.renderMode = TextRenderMode.GLYPH;
    assert.strictEqual(w.get(e, TextComponent).version, v, "version unchanged");
    assert.strictEqual(w.get(e, TextComponent).surfaceVersion, sv, "surfaceVersion unchanged");

    t.renderMode = TextRenderMode.RASTERIZED;
    assert.strictEqual(w.get(e, TextComponent).version, v, "version unchanged after second switch");
    assert.strictEqual(w.get(e, TextComponent).surfaceVersion, sv, "surfaceVersion unchanged after second switch");
  });

  it("exports TextRenderMode from jygame", async () => {
    const mod = await import("../../../jygame.js");
    assert.strictEqual(mod.TextRenderMode.GLYPH, 0, "GLYPH is the default (zero)");
    assert.strictEqual(mod.TextRenderMode.RASTERIZED, 1);
  });
});