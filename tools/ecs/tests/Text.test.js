import { describe, it, before, after } from "node:test";
import * as assert from "node:assert";
import { World } from "../../../ecs/core/World.js";
import { Transform } from "../../../ecs/components/Transform.js";
import { Renderable } from "../../../ecs/components/Renderable.js";
import { Visible } from "../../../ecs/components/Visible.js";
import { Text as TextComponent } from "../../../ecs/components/Text.js";
import { TextResourcePool } from "../../../ecs/render/TextResourcePool.js";
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

  it("rejects native fonts for world-space text", async () => {
    const native = await Font.load("NativeFace", "/fonts/n.ttf");
    Text._defaultWorld = null;
    assert.throws(() => new Text(0, 0, native, "hi"), /native/);
    assert.throws(() => new Text(0, 0, "NativeFace", "hi"), /native/);
  });

  it("mutations update components, Renderable, and the pool, bumping version", () => {
    Text._defaultWorld = null;
    const t = new Text(0, 0, font, "AB");
    const w = t.world;
    const e = t.entity;
    assert.strictEqual(w.get(e, TextComponent).version, 1);

    t.value = "A";
    assert.strictEqual(t.value, "A");
    assert.strictEqual(w.get(e, TextComponent).version, 2);

    t.font = font;
    assert.strictEqual(w.get(e, TextComponent).fontHandle, font.id);
    assert.strictEqual(w.get(e, TextComponent).version, 3);

    t.color = "#ffcc00";
    assert.strictEqual(w.get(e, Renderable).fillColor, 0xffcc00);
    assert.strictEqual(t.color, "#ffcc00");
    assert.strictEqual(w.get(e, TextComponent).version, 4);

    t.align = "center";
    assert.strictEqual(w.get(e, TextComponent).align, 1);
    assert.strictEqual(t.align, "center");
    assert.strictEqual(w.get(e, TextComponent).version, 5);

    t.letterSpacing = 1.5;
    assert.strictEqual(w.get(e, TextComponent).letterSpacing, 1.5);
    assert.strictEqual(w.get(e, TextComponent).version, 6);

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