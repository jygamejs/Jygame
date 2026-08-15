import { describe, it, before, after } from "node:test";
import * as assert from "node:assert";
import { World } from "../../../ecs/core/World.js";
import { Transform } from "../../../ecs/components/Transform.js";
import { Renderable } from "../../../ecs/components/Renderable.js";
import { RenderBounds } from "../../../ecs/components/RenderBounds.js";
import { Text } from "../../../ecs/components/Text.js";
import { Visible } from "../../../ecs/components/Visible.js";
import { RenderQueue } from "../../../ecs/render/RenderQueue.js";
import { TextResourcePool } from "../../../ecs/render/TextResourcePool.js";
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

function addTextEntity(world, { x, y, fontId, handle, align = 0, letterSpacing = 0, version = 1, fillColor = 0xffffff, layer = 1, depth = 0 }) {
  const e = world.createEntity();
  world.addMany(e, Transform, Renderable, Text, Visible);
  world.set(e, Transform, { x, y, rotation: 0, scaleX: 1, scaleY: 1, _prevX: x, _prevY: y, _interpValid: 1 });
  world.set(e, Renderable, { fillColor, layer, depth, imageSmoothing: 1 });
  world.set(e, Text, { fontHandle: fontId, contentHandle: handle, align, letterSpacing, version });
  world.set(e, Visible, { value: 1 });
  return e;
}

function collectCommands(queue) {
  const cmds = [];
  queue.forEachCommandSorted((cmd) => cmds.push(cmd));
  return cmds;
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

  it("pushes one queue command per glyph", () => {
    const world = makeWorld();
    const pool = world.getResource(TextResourcePool);
    const queue = world.getResource(RenderQueue);
    const handle = pool.allocate("AB");

    addTextEntity(world, { x: 100, y: 50, fontId: font.id, handle });
    world.update(16);

    const cmds = collectCommands(queue);
    assert.strictEqual(cmds.length, 2);
    assert.strictEqual(cmds[0].x, 100);
    assert.strictEqual(cmds[0].y, 50);
    assert.strictEqual(cmds[0].width, 2);
    assert.strictEqual(cmds[0].height, 2);
    assert.ok(cmds[0].sourceImage);
    assert.strictEqual(cmds[0].sx, 0);
    assert.strictEqual(cmds[0].sy, 0);
    assert.strictEqual(cmds[0].sw, 2);
    assert.strictEqual(cmds[0].sh, 2);
    assert.strictEqual(cmds[1].x, 102);
    assert.strictEqual(cmds[1].y, 50);
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

  it("uses raw glyphs at the default white color", () => {
    const world = makeWorld();
    const pool = world.getResource(TextResourcePool);
    const queue = world.getResource(RenderQueue);
    const handle = pool.allocate("A");
    addTextEntity(world, { x: 0, y: 0, fontId: font.id, handle });
    world.update(16);
    const cmds = collectCommands(queue);
    assert.strictEqual(cmds.length, 1);
    assert.strictEqual(cmds[0].sourceImage, font.glyph("A"));
  });

  it("tints glyphs when a color is set", () => {
    const world = makeWorld();
    const pool = world.getResource(TextResourcePool);
    const queue = world.getResource(RenderQueue);
    const handle = pool.allocate("A");
    addTextEntity(world, { x: 0, y: 0, fontId: font.id, handle, fillColor: 0xffcc00 });
    world.update(16);
    const cmds = collectCommands(queue);
    assert.strictEqual(cmds.length, 1);
    assert.notStrictEqual(cmds[0].sourceImage, font.glyph("A"));
    assert.strictEqual(cmds[0].sourceImage, font._getTinted("A", "#ffcc00"));
  });

  it("aligns left/center/right relative to the transform anchor", () => {
    const cases = [
      [0, [100, 102]],
      [1, [98, 100]],
      [2, [96, 98]],
    ];
    for (const [align, xs] of cases) {
      const world = makeWorld();
      const pool = world.getResource(TextResourcePool);
      const queue = world.getResource(RenderQueue);
      const handle = pool.allocate("AB");
      addTextEntity(world, { x: 100, y: 0, fontId: font.id, handle, align });
      world.update(16);
      assert.deepStrictEqual(collectCommands(queue).map((c) => c.x), xs, `align ${align}`);
    }
  });

  it("relayouts on version change but not when unchanged", () => {
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
    assert.strictEqual(layout2.positions, layout1.positions);
    assert.strictEqual(collectCommands(queue).length, 2);

    pool.setContent(handle, "A");
    world.set(e, Text, { version: 2 });
    world.update(16);
    assert.strictEqual(pool.layout(handle), layout1);
    assert.strictEqual(pool.layout(handle).count, 1);
    assert.strictEqual(pool.layoutVersion(handle), 2);
    assert.strictEqual(collectCommands(queue).length, 1);
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

  it("skips entities with a stale content handle", () => {
    const world = makeWorld();
    const pool = world.getResource(TextResourcePool);
    const queue = world.getResource(RenderQueue);
    const handle = pool.allocate("AB");
    addTextEntity(world, { x: 0, y: 0, fontId: font.id, handle });
    pool.release(handle);
    world.update(16);
    assert.strictEqual(collectCommands(queue).length, 0);
  });

  it("skips entities with no content handle", () => {
    const world = makeWorld();
    const pool = world.getResource(TextResourcePool);
    const queue = world.getResource(RenderQueue);
    addTextEntity(world, { x: 0, y: 0, fontId: font.id, handle: 0 });
    world.update(16);
    assert.strictEqual(collectCommands(queue).length, 0);
  });

  it("skips entities whose font was removed", async () => {
    const other = await Font.load("RemoveMe", { image: "grid.png", characters: "AB", gridX: 2, gridY: 1 });
    const world = makeWorld();
    const pool = world.getResource(TextResourcePool);
    const queue = world.getResource(RenderQueue);
    const handle = pool.allocate("AB");
    const e = addTextEntity(world, { x: 0, y: 0, fontId: other.id, handle, version: 1 });
    world.update(16);
    assert.strictEqual(collectCommands(queue).length, 2);

    Font.remove("RemoveMe");
    queue.clear();
    world.set(e, Text, { version: 2 });
    world.update(16);
    assert.strictEqual(collectCommands(queue).length, 0);
  });

  it("keeps both sprite and text commands in one queue (priority ordering)", () => {
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
    assert.strictEqual(cmds.length, 3, "1 sprite primitive + 2 text glyphs must survive one update");
    assert.strictEqual(cmds.some((c) => c.sourceImage === null), true, "sprite command present");
    assert.strictEqual(cmds.some((c) => c.sourceImage !== null), true, "text glyph commands present");
  });

  it("does not double-draw Text entities through RenderSystem", () => {
    const world = makeWorld();
    const pool = world.getResource(TextResourcePool);
    const queue = world.getResource(RenderQueue);
    const handle = pool.allocate("AB");
    addTextEntity(world, { x: 0, y: 0, fontId: font.id, handle });
    world.update(16);
    assert.strictEqual(collectCommands(queue).length, 2);
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
    assert.deepStrictEqual(collectCommands(queue).map((c) => c.depth), [0, 2, 2, 5]);
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

  it("releases content on entity destruction", () => {
    const world = makeWorld();
    const pool = world.getResource(TextResourcePool);
    const handle = pool.allocate("AB");
    const e = addTextEntity(world, { x: 0, y: 0, fontId: font.id, handle });
    world.update(16);
    assert.strictEqual(pool.get(handle), "AB");
    world.destroyEntity(e);
    assert.strictEqual(pool.get(handle), null);
  });
});