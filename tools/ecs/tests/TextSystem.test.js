import { describe, it, before, after } from "node:test";
import * as assert from "node:assert";
import { World } from "../../../ecs/core/World.js";
import { Transform } from "../../../ecs/components/Transform.js";
import { Renderable } from "../../../ecs/components/Renderable.js";
import { RenderBounds } from "../../../ecs/components/RenderBounds.js";
import { Text } from "../../../ecs/components/Text.js";
import { Visible } from "../../../ecs/components/Visible.js";
import { RenderQueue } from "../../../ecs/render/RenderQueue.js";
import { AtlasRegion } from "../../../ecs/render/AtlasRegion.js";
import { TextResourcePool } from "../../../ecs/render/TextResourcePool.js";
import { TextRenderMode } from "../../../ecs/render/TextRenderMode.js";
import { RenderSystem } from "../../../ecs/systems/RenderSystem.js";
import { TextSystem } from "../../../ecs/systems/TextSystem.js";
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
              draws: 0,
              drawImage(...args) { this._img = args[0]; this.draws++; },
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
              clearRect() {},
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

function makeWorld() {
  const world = new World();
  world.register(Transform);
  world.register(Renderable);
  world.register(RenderBounds);
  world.register(Text);
  world.register(Visible);
  world.setResource(RenderQueue, new RenderQueue());
  world.setResource(TextResourcePool, new TextResourcePool());
  world.addSystem(new RenderSystem());
  world.addSystem(new TextSystem());
  return world;
}

function addTextEntity(world, { x, y, fontId, handle, align = 0, letterSpacing = 0, version = 1, surfaceVersion = 1, fillColor = 0xffffff, colorEnabled = 0, layer = 1, depth = 0, renderMode = 0 }) {
  const e = world.createEntity();
  world.addMany(e, Transform, Renderable, Text, Visible);
  world.set(e, Transform, { x, y, rotation: 0, scaleX: 1, scaleY: 1, _prevX: x, _prevY: y, _interpValid: 1 });
  world.set(e, Renderable, { fillColor, layer, depth, imageSmoothing: 1 });
  world.set(e, Text, { fontHandle: fontId, contentHandle: handle, align, letterSpacing, version, colorEnabled, surfaceVersion, renderMode });
  world.set(e, Visible, { value: 1 });
  return e;
}

function collectCommands(queue) {
  const cmds = [];
  queue.forEachCommandSorted((cmd) => cmds.push(cmd));
  return cmds;
}

function surfaceOf(world, handle) {
  return world.getResource(TextResourcePool).surface(handle);
}

function surfaceCtx(world, handle) {
  return surfaceOf(world, handle).getContext("2d");
}

function resetSurfaceDrawCount(world, handle) {
  const ctx = surfaceCtx(world, handle);
  ctx.draws = 0;
}

describe("TextSystem", () => {
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
  });

  it("emits exactly one command per text entity, however many glyphs it has", () => {
    const world = makeWorld();
    const pool = world.getResource(TextResourcePool);
    const queue = world.getResource(RenderQueue);
    const handle = pool.allocate("AB");
    addTextEntity(world, { x: 100, y: 50, fontId: font.id, handle });
    world.update(16);

    const cmds = collectCommands(queue);
    assert.strictEqual(cmds.length, 1);
    const cmd = cmds[0];
    assert.strictEqual(cmd.sourceImage, surfaceOf(world, handle), "command draws the rasterized surface");
    assert.strictEqual(cmd.x, 100);
    assert.strictEqual(cmd.y, 50);
    assert.strictEqual(cmd.width, 4, "text bitmap width, not glyph count");
    assert.strictEqual(cmd.height, 2);
    assert.strictEqual(cmd.sx, 0);
    assert.strictEqual(cmd.sy, 0);
    assert.strictEqual(cmd.sw, 4);
    assert.strictEqual(cmd.sh, 2);
  });

  it("spaces and extra words do not create extra commands", () => {
    const world = makeWorld();
    const pool = world.getResource(TextResourcePool);
    const queue = world.getResource(RenderQueue);
    const handle = pool.allocate("AB BA");
    addTextEntity(world, { x: 0, y: 0, fontId: font.id, handle });
    world.update(16);
    const cmds = collectCommands(queue);
    assert.strictEqual(cmds.length, 1);
  });

  it("sources color/layer/depth from Renderable", () => {
    const world = makeWorld();
    const pool = world.getResource(TextResourcePool);
    const queue = world.getResource(RenderQueue);
    const handle = pool.allocate("A");
    addTextEntity(world, { x: 0, y: 0, fontId: font.id, handle, fillColor: 0xffcc00, layer: 2, depth: 5 });
    world.update(16);
    const cmds = collectCommands(queue);
    assert.strictEqual(cmds.length, 1);
    assert.strictEqual(cmds[0].fillColor, 0xffcc00);
    assert.strictEqual(cmds[0].layer, 2);
    assert.strictEqual(cmds[0].depth, 5);
  });

  it("rasterizes the default (no color) text from the font's own glyph pixels", () => {
    const world = makeWorld();
    const pool = world.getResource(TextResourcePool);
    const queue = world.getResource(RenderQueue);
    const handle = pool.allocate("A");
    addTextEntity(world, { x: 0, y: 0, fontId: font.id, handle });
    world.update(16);
    assert.strictEqual(collectCommands(queue).length, 1);
    assert.strictEqual(surfaceCtx(world, handle)._img, font.glyph("A").region.sourceImage);
  });

  it("rasterizes with tint when a color is set", () => {
    const world = makeWorld();
    const pool = world.getResource(TextResourcePool);
    const queue = world.getResource(RenderQueue);
    const handle = pool.allocate("A");
    addTextEntity(world, { x: 0, y: 0, fontId: font.id, handle, fillColor: 0xffcc00, colorEnabled: 1 });
    world.update(16);
    assert.strictEqual(collectCommands(queue).length, 1);
    assert.strictEqual(surfaceCtx(world, handle)._img, font.getTintedGlyph("A", "#ffcc00").region.sourceImage);
  });

  it("does not tint at the default white fillColor unless color is enabled", () => {
    const world = makeWorld();
    const pool = world.getResource(TextResourcePool);
    const queue = world.getResource(RenderQueue);
    const handle = pool.allocate("A");
    addTextEntity(world, { x: 0, y: 0, fontId: font.id, handle, fillColor: 0xffffff, colorEnabled: 0 });
    world.update(16);
    assert.strictEqual(collectCommands(queue).length, 1);
    assert.strictEqual(surfaceCtx(world, handle)._img, font.glyph("A").region.sourceImage);
  });

  it("tints to white when color is explicitly enabled", () => {
    const world = makeWorld();
    const pool = world.getResource(TextResourcePool);
    const queue = world.getResource(RenderQueue);
    const handle = pool.allocate("A");
    addTextEntity(world, { x: 0, y: 0, fontId: font.id, handle, fillColor: 0xffffff, colorEnabled: 1 });
    world.update(16);
    assert.strictEqual(collectCommands(queue).length, 1);
    assert.strictEqual(surfaceCtx(world, handle)._img, font.getTintedGlyph("A", "#ffffff").region.sourceImage);
  });

  it("aligns by shifting the single surface relative to the anchor", () => {
    const cases = [
      [0, 100],
      [1, 98],
      [2, 96],
    ];
    for (const [align, x] of cases) {
      const world = makeWorld();
      const pool = world.getResource(TextResourcePool);
      const queue = world.getResource(RenderQueue);
      const handle = pool.allocate("AB");
      addTextEntity(world, { x: 100, y: 0, fontId: font.id, handle, align });
      world.update(16);
      const cmds = collectCommands(queue);
      assert.strictEqual(cmds.length, 1, `align ${align}`);
      assert.strictEqual(cmds[0].x, x, `align ${align}`);
      assert.strictEqual(cmds[0].width, 4, `align ${align}`);
    }
  });

  it("relays layout from cached buffers; version change relayouts in place", () => {
    const world = makeWorld();
    const pool = world.getResource(TextResourcePool);
    const queue = world.getResource(RenderQueue);
    const handle = pool.allocate("AB");
    const e = addTextEntity(world, { x: 0, y: 0, fontId: font.id, handle, version: 1 });

    world.update(16);
    const layout1 = pool.layout(handle);
    assert.ok(layout1);
    assert.strictEqual(layout1.count, 2);

    world.update(16);
    const layout2 = pool.layout(handle);
    assert.strictEqual(layout2, layout1);
    assert.strictEqual(layout2.positions, layout1.positions, "positions buffer reused");
    assert.strictEqual(layout2.chars, layout1.chars, "chars array reused");
    assert.strictEqual(collectCommands(queue).length, 1);

    pool.setContent(handle, "A");
    world.set(e, Text, { version: 2 });
    world.update(16);
    const layout3 = pool.layout(handle);
    assert.strictEqual(layout3, layout1, "layout object reused in place");
    assert.strictEqual(layout3.count, 1);
    assert.strictEqual(pool.layoutVersion(handle), 2);
    assert.strictEqual(collectCommands(queue).length, 1);
  });

  it("reuses the rasterized surface when the text is unchanged", () => {
    const world = makeWorld();
    const pool = world.getResource(TextResourcePool);
    const queue = world.getResource(RenderQueue);
    const handle = pool.allocate("AB");
    addTextEntity(world, { x: 0, y: 0, fontId: font.id, handle });
    world.update(16);
    const s1 = surfaceOf(world, handle);
    assert.ok(s1);

    resetSurfaceDrawCount(world, handle);
    world.update(16);
    assert.strictEqual(surfaceOf(world, handle), s1, "surface identity stable");
    assert.strictEqual(surfaceCtx(world, handle).draws, 0, "no re-rasterization on unchanged text");
  });

  it("does not re-rasterize when only position/rotation/scale change", () => {
    const world = makeWorld();
    const pool = world.getResource(TextResourcePool);
    const queue = world.getResource(RenderQueue);
    const handle = pool.allocate("AB");
    const e = addTextEntity(world, { x: 0, y: 0, fontId: font.id, handle });
    world.update(16);
    const s1 = surfaceOf(world, handle);

    world.set(e, Transform, { x: 50, y: 30, rotation: 0.5, scaleX: 2, scaleY: 2 });
    world.update(16);
    assert.strictEqual(surfaceOf(world, handle), s1, "surface untouched by transform changes");
    const cmds = collectCommands(queue);
    assert.strictEqual(cmds.length, 1);
    assert.strictEqual(cmds[0].x, 50);
    assert.strictEqual(cmds[0].rotation, 0.5);
    assert.strictEqual(cmds[0].scaleX, 2);
  });

  it("does not re-rasterize when only layer/depth change", () => {
    const world = makeWorld();
    const pool = world.getResource(TextResourcePool);
    const queue = world.getResource(RenderQueue);
    const handle = pool.allocate("AB");
    const e = addTextEntity(world, { x: 0, y: 0, fontId: font.id, handle, depth: 0 });
    world.update(16);
    const s1 = surfaceOf(world, handle);

    world.set(e, Renderable, { layer: 3, depth: 9 });
    world.update(16);
    assert.strictEqual(surfaceOf(world, handle), s1, "surface untouched by layer/depth changes");
    assert.strictEqual(collectCommands(queue)[0].depth, 9);
  });

  it("re-rasterizes on a color change without relayouting", () => {
    const world = makeWorld();
    const pool = world.getResource(TextResourcePool);
    const queue = world.getResource(RenderQueue);
    const handle = pool.allocate("AB");
    const e = addTextEntity(world, { x: 0, y: 0, fontId: font.id, handle, colorEnabled: 1, fillColor: 0xff0000 });
    world.update(16);
    const s1 = surfaceOf(world, handle);
    const layout1 = pool.layout(handle);
    assert.strictEqual(surfaceCtx(world, handle)._img, font.getTintedGlyph("B", "#ff0000").region.sourceImage, "tinted before the change");

    world.set(e, Renderable, { fillColor: 0x00ff00 });
    world.set(e, Text, { surfaceVersion: 2 });
    world.update(16);
    assert.strictEqual(surfaceOf(world, handle), s1, "same-size surface reused");
    assert.strictEqual(surfaceCtx(world, handle)._img, font.getTintedGlyph("B", "#00ff00").region.sourceImage, "re-rasterized with the new tint");
    assert.strictEqual(pool.layout(handle), layout1, "layout untouched by color change");
    assert.strictEqual(pool.surfaceVersion(handle), 2);
  });

  it("rebuilds layout and surface together when content changes", () => {
    const world = makeWorld();
    const pool = world.getResource(TextResourcePool);
    const queue = world.getResource(RenderQueue);
    const handle = pool.allocate("AB");
    const e = addTextEntity(world, { x: 0, y: 0, fontId: font.id, handle });
    world.update(16);
    const s1 = surfaceOf(world, handle);
    assert.strictEqual(s1.width, 4);

    pool.setContent(handle, "AB AB");
    world.set(e, Text, { version: 2, surfaceVersion: 2 });
    world.update(16);
    const s2 = surfaceOf(world, handle);
    assert.ok(s2.width >= 10, "longer text grows the surface");
    assert.strictEqual(pool.layout(handle).count, 4, "relayouted for the new content");
    assert.strictEqual(collectCommands(queue)[0].width, pool.width(handle));
  });

  it("a text becoming shorter updates its bitmap and command dimensions", () => {
    const world = makeWorld();
    const pool = world.getResource(TextResourcePool);
    const queue = world.getResource(RenderQueue);
    const handle = pool.allocate("AB");
    const e = addTextEntity(world, { x: 0, y: 0, fontId: font.id, handle });
    world.update(16);
    const s1 = surfaceOf(world, handle);
    assert.strictEqual(collectCommands(queue)[0].width, 4);

    pool.setContent(handle, "A");
    world.set(e, Text, { version: 2, surfaceVersion: 2 });
    world.update(16);
    assert.strictEqual(surfaceOf(world, handle), s1, "shorter text reuses the bigger surface");
    assert.strictEqual(pool.width(handle), 2);
    assert.strictEqual(collectCommands(queue)[0].width, 2, "command uses the new bitmap width");
    assert.strictEqual(collectCommands(queue)[0].sw, 2);
  });

  it("skips invisible text", () => {
    const world = makeWorld();
    const pool = world.getResource(TextResourcePool);
    const queue = world.getResource(RenderQueue);
    const handle = pool.allocate("AB");
    const e = addTextEntity(world, { x: 0, y: 0, fontId: font.id, handle });
    world.set(e, Visible, { value: 0 });
    world.update(16);
    assert.strictEqual(collectCommands(queue).length, 0);
  });

  it("empty text emits no command", () => {
    const world = makeWorld();
    const pool = world.getResource(TextResourcePool);
    const queue = world.getResource(RenderQueue);
    const handle = pool.allocate("");
    addTextEntity(world, { x: 0, y: 0, fontId: font.id, handle });
    world.update(16);
    assert.strictEqual(collectCommands(queue).length, 0);
    assert.strictEqual(pool.surface(handle), null);
  });

  it("skips entities with a stale or missing content handle", () => {
    const world = makeWorld();
    const pool = world.getResource(TextResourcePool);
    const queue = world.getResource(RenderQueue);
    const handle = pool.allocate("AB");
    addTextEntity(world, { x: 0, y: 0, fontId: font.id, handle });
    pool.release(handle);
    world.update(16);
    assert.strictEqual(collectCommands(queue).length, 0);

    const noHandle = pool.allocate("AB");
    addTextEntity(world, { x: 0, y: 0, fontId: font.id, handle: 0 });
    world.update(16);
    assert.strictEqual(collectCommands(queue).length, 0);
    pool.release(noHandle);
  });

  it("skips entities whose font was removed", async () => {
    const other = await Font.load("RemoveMe", { image: "grid.png", characters: "AB", gridX: 2, gridY: 1 });
    const world = makeWorld();
    const pool = world.getResource(TextResourcePool);
    const queue = world.getResource(RenderQueue);
    const handle = pool.allocate("AB");
    const e = addTextEntity(world, { x: 0, y: 0, fontId: other.id, handle, version: 1 });
    world.update(16);
    assert.strictEqual(collectCommands(queue).length, 1);

    Font.remove("RemoveMe");
    queue.clear();
    world.set(e, Text, { version: 2 });
    world.update(16);
    assert.strictEqual(collectCommands(queue).length, 0);
  });

  it("keeps sprite and text commands in one queue with priority ordering", () => {
    assert.ok(TextSystem.priority > RenderSystem.priority, "TextSystem must run after RenderSystem's queue-clear");

    const world = makeWorld();
    const pool = world.getResource(TextResourcePool);
    const queue = world.getResource(RenderQueue);

    const sprite = world.createEntity();
    world.addMany(sprite, Transform, Renderable, RenderBounds, Visible);
    world.set(sprite, Transform, { x: 10, y: 10, rotation: 0, scaleX: 1, scaleY: 1 });
    world.set(sprite, Renderable, { layer: 1, depth: 0 });
    world.set(sprite, RenderBounds, { width: 10, height: 10 });
    world.set(sprite, Visible, { value: 1 });

    const handle = pool.allocate("AB");
    addTextEntity(world, { x: 0, y: 0, fontId: font.id, handle, depth: 0 });

    world.update(16);
    const cmds = collectCommands(queue);
    assert.strictEqual(cmds.length, 2, "1 sprite + 1 text surface command");
    assert.strictEqual(cmds.some((c) => c.sourceImage === null), true, "sprite command present");
    assert.strictEqual(cmds.some((c) => c.sourceImage !== null), true, "text surface command present");
  });

  it("does not double-draw Text entities through RenderSystem", () => {
    const world = makeWorld();
    const pool = world.getResource(TextResourcePool);
    const queue = world.getResource(RenderQueue);
    const handle = pool.allocate("AB");
    addTextEntity(world, { x: 0, y: 0, fontId: font.id, handle });
    world.update(16);
    assert.strictEqual(collectCommands(queue).length, 1);
  });

  it("interleaves with sprites by layer/depth", () => {
    const world = makeWorld();
    const pool = world.getResource(TextResourcePool);
    const queue = world.getResource(RenderQueue);

    function addSprite(x, y, w, h, depth) {
      const e = world.createEntity();
      world.addMany(e, Transform, Renderable, RenderBounds, Visible);
      world.set(e, Transform, { x, y, rotation: 0, scaleX: 1, scaleY: 1 });
      world.set(e, Renderable, { layer: 1, depth });
      world.set(e, RenderBounds, { width: w, height: h });
      world.set(e, Visible, { value: 1 });
      return e;
    }

    addSprite(0, 0, 10, 10, 5);
    addSprite(0, 0, 10, 10, 0);
    const handle = pool.allocate("AB");
    addTextEntity(world, { x: 0, y: 0, fontId: font.id, handle, depth: 2 });

    world.update(16);
    assert.deepStrictEqual(collectCommands(queue).map((c) => c.depth), [0, 2, 5]);
  });

  it("two text entities keep independent rasterized surfaces", () => {
    const world = makeWorld();
    const pool = world.getResource(TextResourcePool);
    const h1 = pool.allocate("A");
    const h2 = pool.allocate("AB");
    addTextEntity(world, { x: 0, y: 0, fontId: font.id, handle: h1 });
    addTextEntity(world, { x: 0, y: 0, fontId: font.id, handle: h2 });
    world.update(16);
    const s1 = surfaceOf(world, h1);
    const s2 = surfaceOf(world, h2);
    assert.ok(s1);
    assert.ok(s2);
    assert.notStrictEqual(s1, s2);
    assert.notStrictEqual(s1.width, s2.width);
  });

  it("renders glyphs from a shared source image (atlas-style provider)", async () => {
    const font = await Font.load("AtlasLike", {
      image: "grid.png",
      characters: "AB",
      gridX: 2,
      gridY: 1,
    });
    // Rebase every glyph region into one shared source image — the same
    // conceptual operation an atlas-backed font performs. The rasterizer must
    // not care that the glyphs now share a single backing resource.
    const shared = document.createElement("canvas");
    shared.width = 8;
    shared.height = 2;
    let offset = 0;
    font._glyphs.forEach((rec) => {
      rec.region = {
        sourceImage: shared,
        sx: offset,
        sy: 0,
        sw: rec.region.sw,
        sh: rec.region.sh,
      };
      offset += rec.region.sw;
    });

    const world = makeWorld();
    const pool = world.getResource(TextResourcePool);
    const queue = world.getResource(RenderQueue);
    const handle = pool.allocate("AB");
    addTextEntity(world, { x: 0, y: 0, fontId: font.id, handle });
    world.update(16);

    const cmds = collectCommands(queue);
    assert.strictEqual(cmds.length, 1, "one command even though glyphs share a source");
    const surface = surfaceOf(world, handle);
    assert.strictEqual(cmds[0].sourceImage, surface);
    assert.strictEqual(surfaceCtx(world, handle)._img, shared, "rasterizer drew from the shared atlas source");
  });

  it("consumes an atlas-backed glyph provider identically to per-canvas glyphs", async () => {
    const font = await Font.load("AtlasProvider", {
      image: "grid.png",
      characters: "AB",
      gridX: 2,
      gridY: 1,
    });

    // Replace the font with a genuine atlas-backed provider: every glyph
    // record points into ONE shared source with a different sub-rect. This is
    // exactly what a future atlas-backed BitmapFont exposes — the glyph-record
    // contract and nothing else. TextSystem must not care.
    const atlas = document.createElement("canvas");
    atlas.width = 4;
    atlas.height = 2;
    const records = {
      A: { region: new AtlasRegion({ sourceImage: atlas, x: 0, y: 0, width: 2, height: 2 }), advance: 2, offsetX: 0, offsetY: 0 },
      B: { region: new AtlasRegion({ sourceImage: atlas, x: 2, y: 0, width: 2, height: 2 }), advance: 2, offsetX: 0, offsetY: 0 },
    };
    font.getGlyph = (ch) => records[ch] || null;
    font.advance = (ch) => {
      const r = records[ch];
      return r ? r.advance : 0;
    };

    const world = makeWorld();
    const pool = world.getResource(TextResourcePool);
    const queue = world.getResource(RenderQueue);
    const handle = pool.allocate("AB");
    addTextEntity(world, { x: 0, y: 0, fontId: font.id, handle });
    world.update(16);

    const cmds = collectCommands(queue);
    assert.strictEqual(cmds.length, 1, "one command even though glyphs share an atlas");
    const surface = surfaceOf(world, handle);
    assert.strictEqual(cmds[0].sourceImage, surface);
    assert.strictEqual(surfaceCtx(world, handle)._img, atlas, "rasterizer cut glyphs from the shared atlas");
    const layout = pool.layout(handle);
    assert.strictEqual(layout.glyphs[0].region.sourceImage, atlas, "layout stored the atlas records");
  });

  it("throws when RenderQueue is missing", () => {
    const world = new World();
    world.register(Transform);
    world.register(Renderable);
    world.register(Text);
    world.register(Visible);
    world.addSystem(new TextSystem());
    assert.throws(() => world.update(16), /RenderQueue/);
  });

  it("throws when TextResourcePool is missing", () => {
    const world = new World();
    world.register(Transform);
    world.register(Renderable);
    world.register(Text);
    world.register(Visible);
    world.setResource(RenderQueue, new RenderQueue());
    world.addSystem(new TextSystem());
    assert.throws(() => world.update(16), /TextResourcePool/);
  });

  it("releases content and surface on entity destruction", () => {
    const world = makeWorld();
    const pool = world.getResource(TextResourcePool);
    const handle = pool.allocate("AB");
    const e = addTextEntity(world, { x: 0, y: 0, fontId: font.id, handle });
    world.update(16);
    assert.strictEqual(pool.get(handle), "AB");
    assert.ok(pool.surface(handle));

    world.destroyEntity(e);
    assert.strictEqual(pool.get(handle), null);
    assert.strictEqual(pool.surface(handle), null);
  });
});

describe("TextSystem render modes", () => {
  const origImgLoad = ImageLoader.load;
  const origFLoad = FontLoader.load;
  let font;

  before(async () => {
    ImageLoader.load = async () => gridImage();
    FontLoader.load = async () => {};
    font = await Font.load("ModeGrid", { image: "grid.png", characters: "AB", gridX: 2, gridY: 1 });
  });

  after(() => {
    ImageLoader.load = origImgLoad;
    FontLoader.load = origFLoad;
    Font.clear();
  });

  it("defaults to RASTERIZED — one command, one surface", () => {
    const world = makeWorld();
    const pool = world.getResource(TextResourcePool);
    const queue = world.getResource(RenderQueue);
    const handle = pool.allocate("AB");
    addTextEntity(world, { x: 100, y: 50, fontId: font.id, handle });
    world.update(16);

    const cmds = collectCommands(queue);
    assert.strictEqual(cmds.length, 1, "rasterized default emits one command");
    assert.ok(pool.surface(handle), "rasterized mode builds a surface");
  });

  it("GLYPH mode emits one command per glyph and no rasterized surface", () => {
    const world = makeWorld();
    const pool = world.getResource(TextResourcePool);
    const queue = world.getResource(RenderQueue);
    const handle = pool.allocate("AB");
    addTextEntity(world, { x: 100, y: 50, fontId: font.id, handle, renderMode: TextRenderMode.GLYPH });
    world.update(16);

    const cmds = collectCommands(queue);
    assert.strictEqual(cmds.length, 2, "one command per glyph");
    assert.strictEqual(pool.surface(handle), null, "glyph mode never rasterizes");
    assert.strictEqual(cmds[0].sourceImage, font.glyph("A").region.sourceImage, "glyph A region source");
    assert.strictEqual(cmds[0].sx, 0);
    assert.strictEqual(cmds[1].sourceImage, font.glyph("B").region.sourceImage, "glyph B region source");
    // Entity-local centers: A = -1, B = +1 (width 4, glyphs 2px) → world 99 / 101
    assert.ok(Math.abs(cmds[0].x - 99) < 1e-5, `A x = ${cmds[0].x}`);
    assert.ok(Math.abs(cmds[1].x - 101) < 1e-5, `B x = ${cmds[1].x}`);
    assert.ok(Math.abs(cmds[0].y - 50) < 1e-5);
    assert.ok(Math.abs(cmds[1].y - 50) < 1e-5);
  });

  it("GLYPH mode reuses the shared layout across frames", () => {
    const world = makeWorld();
    const pool = world.getResource(TextResourcePool);
    const queue = world.getResource(RenderQueue);
    const handle = pool.allocate("AB");
    addTextEntity(world, { x: 0, y: 0, fontId: font.id, handle, renderMode: TextRenderMode.GLYPH });
    world.update(16);
    const layout1 = pool.layout(handle);

    queue.clear();
    world.update(16);
    const layout2 = pool.layout(handle);
    assert.strictEqual(layout2, layout1, "layout object reused — no relayout on unchanged text");
    assert.strictEqual(layout2.positions, layout1.positions, "positions buffer reused");
    assert.strictEqual(collectCommands(queue).length, 2);
  });

  it("GLYPH mode resolves tinted glyph records for colored text", () => {
    const world = makeWorld();
    const pool = world.getResource(TextResourcePool);
    const queue = world.getResource(RenderQueue);
    const handle = pool.allocate("A");
    addTextEntity(world, { x: 0, y: 0, fontId: font.id, handle, fillColor: 0xffcc00, colorEnabled: 1, renderMode: TextRenderMode.GLYPH });
    world.update(16);

    const cmds = collectCommands(queue);
    assert.strictEqual(cmds.length, 1);
    assert.strictEqual(cmds[0].sourceImage, font.getTintedGlyph("A", "#ffcc00").region.sourceImage,
      "glyph path consumes tinted records through the font provider");
  });

  it("GLYPH mode preserves atlas-shared sourceImage across commands", async () => {
    const atlasFont = await Font.load("AtlasModeGrid", { image: "grid.png", characters: "AB", gridX: 2, gridY: 1 });
    const world = makeWorld();
    const pool = world.getResource(TextResourcePool);
    const queue = world.getResource(RenderQueue);

    // Build an atlas-backed provider: both glyphs share one sourceImage.
    const atlas = document.createElement("canvas");
    atlas.width = 4;
    atlas.height = 2;
    const records = {
      A: { region: new AtlasRegion({ sourceImage: atlas, x: 0, y: 0, width: 2, height: 2 }), advance: 2, offsetX: 0, offsetY: 0 },
      B: { region: new AtlasRegion({ sourceImage: atlas, x: 2, y: 0, width: 2, height: 2 }), advance: 2, offsetX: 0, offsetY: 0 },
    };
    atlasFont.getGlyph = (ch) => records[ch] || null;
    atlasFont.advance = (ch) => {
      const r = records[ch];
      return r ? r.advance : 0;
    };

    const handle = pool.allocate("AB");
    addTextEntity(world, { x: 0, y: 0, fontId: atlasFont.id, handle, renderMode: TextRenderMode.GLYPH });
    world.update(16);

    const cmds = collectCommands(queue);
    assert.strictEqual(cmds.length, 2);
    assert.strictEqual(cmds[0].sourceImage, atlas, "glyph A shares the atlas source");
    assert.strictEqual(cmds[1].sourceImage, atlas, "glyph B shares the atlas source");
    assert.strictEqual(cmds[0].sx, 0, "glyph A sub-rect");
    assert.strictEqual(cmds[1].sx, 2, "glyph B sub-rect");
  });

  it("GLYPH mode applies entity rotation and scale", () => {
    const world = makeWorld();
    const pool = world.getResource(TextResourcePool);
    const queue = world.getResource(RenderQueue);
    const handle = pool.allocate("A");
    const e = addTextEntity(world, { x: 100, y: 50, fontId: font.id, handle, renderMode: TextRenderMode.GLYPH });
    world.set(e, Transform, { x: 100, y: 50, rotation: Math.PI / 2, scaleX: 2, scaleY: 2, _prevX: 100, _prevY: 50, _interpValid: 1 });
    world.update(16);

    const cmds = collectCommands(queue);
    assert.strictEqual(cmds.length, 1);
    // Single glyph centered at local (0,0): world position stays at the anchor.
    assert.ok(Math.abs(cmds[0].x - 100) < 1e-5);
    assert.ok(Math.abs(cmds[0].y - 50) < 1e-5);
    // Transform.rotation is stored f32, so compare against the quantized value.
    assert.ok(Math.abs(cmds[0].rotation - Math.fround(Math.PI / 2)) < 1e-6);
    assert.strictEqual(cmds[0].scaleX, 2);
    assert.strictEqual(cmds[0].scaleY, 2);
  });

  it("both modes share identical layout geometry", () => {
    const world = makeWorld();
    const pool = world.getResource(TextResourcePool);
    const queue = world.getResource(RenderQueue);

    const hRaster = pool.allocate("AB");
    const hGlyph = pool.allocate("AB");
    addTextEntity(world, { x: 0, y: 0, fontId: font.id, handle: hRaster, renderMode: TextRenderMode.RASTERIZED });
    addTextEntity(world, { x: 0, y: 0, fontId: font.id, handle: hGlyph, renderMode: TextRenderMode.GLYPH });
    world.update(16);

    const rasterLayout = pool.layout(hRaster);
    const glyphLayout = pool.layout(hGlyph);
    assert.strictEqual(rasterLayout.count, glyphLayout.count, "same glyph count");
    assert.strictEqual(rasterLayout.width, glyphLayout.width, "same width");
    assert.strictEqual(rasterLayout.height, glyphLayout.height, "same height");
    assert.strictEqual(rasterLayout.drawX, glyphLayout.drawX, "same alignment offset");
    assert.deepStrictEqual(
      Array.from(rasterLayout.positions.slice(0, rasterLayout.count * 2)),
      Array.from(glyphLayout.positions.slice(0, glyphLayout.count * 2)),
      "identical glyph positions"
    );
    assert.deepStrictEqual(rasterLayout.chars, glyphLayout.chars, "identical chars");
  });

  it("switching modes does not rebuild the layout", () => {
    const world = makeWorld();
    const pool = world.getResource(TextResourcePool);
    const queue = world.getResource(RenderQueue);
    const handle = pool.allocate("AB");
    const e = addTextEntity(world, { x: 0, y: 0, fontId: font.id, handle, renderMode: TextRenderMode.RASTERIZED });
    world.update(16);
    const layout1 = pool.layout(handle);

    world.set(e, Text, { renderMode: TextRenderMode.GLYPH });
    world.update(16);
    assert.strictEqual(pool.layout(handle), layout1, "glyph switch reuses the layout");
    assert.strictEqual(collectCommands(queue).length, 2);

    world.set(e, Text, { renderMode: TextRenderMode.RASTERIZED });
    world.update(16);
    assert.strictEqual(pool.layout(handle), layout1, "raster switch reuses the layout");
    assert.strictEqual(collectCommands(queue).length, 1);
  });

  it("switching back to RASTERIZED reuses the cached surface", () => {
    const world = makeWorld();
    const pool = world.getResource(TextResourcePool);
    const queue = world.getResource(RenderQueue);
    const handle = pool.allocate("AB");
    const e = addTextEntity(world, { x: 0, y: 0, fontId: font.id, handle, renderMode: TextRenderMode.RASTERIZED });
    world.update(16);
    const s1 = pool.surface(handle);
    assert.ok(s1);

    world.set(e, Text, { renderMode: TextRenderMode.GLYPH });
    world.update(16);
    assert.strictEqual(pool.surface(handle), s1, "surface remains cached while in glyph mode");

    world.set(e, Text, { renderMode: TextRenderMode.RASTERIZED });
    world.update(16);
    assert.strictEqual(pool.surface(handle), s1, "surface reused on switch back — no re-rasterization");
  });

  it("modes switch cleanly across four states without stale output", () => {
    const world = makeWorld();
    const pool = world.getResource(TextResourcePool);
    const queue = world.getResource(RenderQueue);
    const handle = pool.allocate("AB");
    const e = addTextEntity(world, { x: 0, y: 0, fontId: font.id, handle, renderMode: TextRenderMode.RASTERIZED });

    world.update(16);
    assert.strictEqual(collectCommands(queue).length, 1, "R1");
    const layout1 = pool.layout(handle);
    const s1 = pool.surface(handle);

    world.set(e, Text, { renderMode: TextRenderMode.GLYPH });
    queue.clear();
    world.update(16);
    assert.strictEqual(collectCommands(queue).length, 2, "G1");
    assert.strictEqual(pool.layout(handle), layout1);

    world.set(e, Text, { renderMode: TextRenderMode.RASTERIZED });
    queue.clear();
    world.update(16);
    assert.strictEqual(collectCommands(queue).length, 1, "R2");
    assert.strictEqual(pool.surface(handle), s1, "surface survives the round-trip");

    world.set(e, Text, { renderMode: TextRenderMode.GLYPH });
    queue.clear();
    world.update(16);
    assert.strictEqual(collectCommands(queue).length, 2, "G2");
    assert.strictEqual(pool.layout(handle), layout1, "layout stable across all switches");
  });

  it("empty content produces no commands in either mode", () => {
    const world = makeWorld();
    const pool = world.getResource(TextResourcePool);
    const queue = world.getResource(RenderQueue);

    const h1 = pool.allocate("");
    const h2 = pool.allocate("");
    addTextEntity(world, { x: 0, y: 0, fontId: font.id, handle: h1, renderMode: TextRenderMode.RASTERIZED });
    addTextEntity(world, { x: 0, y: 0, fontId: font.id, handle: h2, renderMode: TextRenderMode.GLYPH });
    world.update(16);
    assert.strictEqual(collectCommands(queue).length, 0);
    assert.strictEqual(pool.surface(h1), null);
    assert.strictEqual(pool.surface(h2), null);
  });

  it("GLYPH mode respects visibility early-out", () => {
    const world = makeWorld();
    const pool = world.getResource(TextResourcePool);
    const queue = world.getResource(RenderQueue);
    const handle = pool.allocate("AB");
    const e = addTextEntity(world, { x: 0, y: 0, fontId: font.id, handle, renderMode: TextRenderMode.GLYPH });
    world.set(e, Visible, { value: 0 });
    world.update(16);
    assert.strictEqual(collectCommands(queue).length, 0, "invisible glyph text emits nothing");
  });

  it("two entities with different modes interleave by layer/depth", () => {
    const world = makeWorld();
    const pool = world.getResource(TextResourcePool);
    const queue = world.getResource(RenderQueue);

    // Rasterized at depth 5 → one command; glyph at depth 2 → two commands.
    const hRaster = pool.allocate("AB");
    const hGlyph = pool.allocate("AB");
    addTextEntity(world, { x: 0, y: 0, fontId: font.id, handle: hRaster, depth: 5, renderMode: TextRenderMode.RASTERIZED });
    addTextEntity(world, { x: 0, y: 0, fontId: font.id, handle: hGlyph, depth: 2, renderMode: TextRenderMode.GLYPH });
    world.update(16);

    const cmds = collectCommands(queue);
    assert.strictEqual(cmds.length, 3, "1 rasterized + 2 glyph commands");
    assert.deepStrictEqual(cmds.map((c) => c.depth), [2, 2, 5], "glyph commands sort before the rasterized command");
  });

  it("GLYPH mode passes color/layer/depth/imageSmoothing through", () => {
    const world = makeWorld();
    const pool = world.getResource(TextResourcePool);
    const queue = world.getResource(RenderQueue);
    const handle = pool.allocate("A");
    addTextEntity(world, { x: 0, y: 0, fontId: font.id, handle, fillColor: 0xffcc00, colorEnabled: 0, layer: 3, depth: 9, renderMode: TextRenderMode.GLYPH });
    world.update(16);

    const cmds = collectCommands(queue);
    assert.strictEqual(cmds.length, 1);
    assert.strictEqual(cmds[0].fillColor, 0xffcc00);
    assert.strictEqual(cmds[0].layer, 3);
    assert.strictEqual(cmds[0].depth, 9);
    assert.strictEqual(cmds[0].imageSmoothing, true);
  });
});