import { describe, it, before, after } from "node:test";
import * as assert from "node:assert";
import { Image } from "../../../loaders/Image.js";
import { ImageLoader } from "../../../loaders/ImageLoader.js";
import { AnimationPack } from "../../../ecs/animation/AnimationPack.js";
import { AtlasRegion } from "../../../ecs/render/AtlasRegion.js";
import { AssetRegistry } from "../../../ecs/render/AssetRegistry.js";
import { World } from "../../../ecs/core/World.js";
import { RenderQueue } from "../../../ecs/render/RenderQueue.js";
import { CanvasContext } from "../../../ecs/render/CanvasContext.js";
import { RenderSystem } from "../../../ecs/systems/RenderSystem.js";
import { Transform, Renderable, Visible, RenderBounds } from "../../../ecs/index.js";

function mockCanvas(w, h) {
  return { width: w, height: h };
}

describe("Image.atlas", () => {
  const origResolve = AnimationPack._resolveImage;

  before(() => {
    AnimationPack._resolveImage = async (img) => mockCanvas(64, 64);
  });

  after(() => {
    AnimationPack._resolveImage = origResolve;
    Image.clear();
  });

  // ─── Grid strategy ───────────────────────────────────

  it("grid produces length = columns * rows", async () => {
    const atlas = await Image.atlas({
      image: "cards.png",
      grid: { columns: 2, rows: 2, width: 32, height: 32 },
    });
    assert.strictEqual(atlas.length, 4);
  });

  it("grid regions carry expected source coordinates (row-major)", async () => {
    const atlas = await Image.atlas({
      image: "cards.png",
      grid: { columns: 2, rows: 2, width: 32, height: 32 },
    });
    assert.deepStrictEqual([atlas[0].x, atlas[0].y], [0, 0]);
    assert.deepStrictEqual([atlas[1].x, atlas[1].y], [32, 0]);
    assert.deepStrictEqual([atlas[2].x, atlas[2].y], [0, 32]);
    assert.deepStrictEqual([atlas[3].x, atlas[3].y], [32, 32]);
    assert.strictEqual(atlas[0].width, 32);
    assert.strictEqual(atlas[0].height, 32);
  });

  it("grid honors origin and per-axis spacing", async () => {
    const atlas = await Image.atlas({
      image: "cards.png",
      grid: {
        columns: 2,
        rows: 2,
        width: 42,
        height: 60,
        origin: { x: 11, y: 2 },
        spacing: { x: 23, y: 5 },
      },
    });
    assert.strictEqual(atlas.length, 4);
    assert.deepStrictEqual([atlas[0].x, atlas[0].y], [11, 2]);
    assert.deepStrictEqual([atlas[1].x, atlas[1].y], [11 + 42 + 23, 2]);
    assert.deepStrictEqual([atlas[2].x, atlas[2].y], [11, 2 + 60 + 5]);
  });

  it("spacing is the gap between cells, so pitch = width + spacing", async () => {
    // A 896×256 kenney card sheet has 64px pitch. Trimming the 42×60 face
    // from each cell requires spacing 64 − 42 = 22 / 64 − 60 = 4; using 23
    // instead drifts each successive cell right by one pixel.
    const origResolve = AnimationPack._resolveImage;
    AnimationPack._resolveImage = async (img) => mockCanvas(896, 256);
    try {
      const good = await Image.atlas({
        image: "cards.png",
        grid: { columns: 14, rows: 4, width: 42, height: 60, origin: { x: 11, y: 2 }, spacing: { x: 22, y: 4 } },
      });
      assert.deepStrictEqual([good[0].x, good[0].y], [11, 2]);
      assert.deepStrictEqual([good[1].x, good[1].y], [75, 2]);
      assert.deepStrictEqual([good[13].x, good[13].y], [843, 2]);
      assert.deepStrictEqual([good[14].x, good[14].y], [11, 66]);
      assert.deepStrictEqual([good[55].x, good[55].y], [843, 194]);
    } finally {
      AnimationPack._resolveImage = origResolve;
    }
  });

  it("grid accepts numeric margin and spacing aliases", async () => {
    const atlas = await Image.atlas({
      image: "cards.png",
      grid: { columns: 2, rows: 1, width: 16, height: 16, margin: 4, spacing: 2 },
    });
    assert.deepStrictEqual([atlas[0].x, atlas[0].y], [4, 4]);
    assert.deepStrictEqual([atlas[1].x, atlas[1].y], [4 + 16 + 2, 4]);
  });

  it("grid derives cell size from image dimensions when width/height are omitted", async () => {
    const origResolve = AnimationPack._resolveImage;
    AnimationPack._resolveImage = async (img) => mockCanvas(896, 256);
    try {
      const atlas = await Image.atlas({
        image: "cards.png",
        grid: { columns: 14, rows: 4 },
      });
      assert.strictEqual(atlas.length, 56);
      assert.strictEqual(atlas[0].width, 64);
      assert.strictEqual(atlas[0].height, 64);
      assert.deepStrictEqual([atlas[1].x, atlas[1].y], [64, 0]);
      assert.deepStrictEqual([atlas[14].x, atlas[14].y], [0, 64]);
    } finally {
      AnimationPack._resolveImage = origResolve;
    }
  });

  it("top-level columns/rows work without a grid object", async () => {
    const origResolve = AnimationPack._resolveImage;
    AnimationPack._resolveImage = async (img) => mockCanvas(896, 256);
    try {
      const atlas = await Image.atlas({
        image: "cards.png",
        columns: 14,
        rows: 4,
      });
      assert.strictEqual(atlas.length, 56);
      assert.strictEqual(atlas[0].width, 64);
      assert.strictEqual(atlas[0].height, 64);
    } finally {
      AnimationPack._resolveImage = origResolve;
    }
  });

  it("top-level grid keys merge with a grid object", async () => {
    const origResolve = AnimationPack._resolveImage;
    AnimationPack._resolveImage = async (img) => mockCanvas(896, 256);
    try {
      const atlas = await Image.atlas({
        image: "cards.png",
        grid: { columns: 14, rows: 4 },
        margin: 2,
      });
      assert.strictEqual(atlas.length, 56);
      assert.deepStrictEqual([atlas[0].x, atlas[0].y], [2, 2]);
    } finally {
      AnimationPack._resolveImage = origResolve;
    }
  });

  // ─── Explicit region strategy ────────────────────────

  it("explicit regions preserve declaration order", async () => {
    const atlas = await Image.atlas({
      image: "ui.png",
      aceHearts: { x: 0, y: 0, width: 42, height: 60 },
      aceSpades: { x: 42, y: 0, width: 42, height: 60 },
      kingHearts: { x: 84, y: 0, width: 42, height: 60 },
    });
    assert.strictEqual(atlas.length, 3);
    assert.strictEqual(atlas[0], atlas.aceHearts);
    assert.strictEqual(atlas[1], atlas.aceSpades);
    assert.strictEqual(atlas[2], atlas.kingHearts);
  });

  it("named access returns the same object as indexed access", async () => {
    const atlas = await Image.atlas({
      image: "cards.png",
      aceHearts: { x: 0, y: 0, width: 42, height: 60 },
      aceSpades: { x: 42, y: 0, width: 42, height: 60 },
    });
    assert.ok(atlas[0] === atlas.aceHearts);
    assert.ok(atlas[1] === atlas.aceSpades);
  });

  it("regions share the single source image", async () => {
    const atlas = await Image.atlas({
      image: "cards.png",
      grid: { columns: 2, rows: 2, width: 32, height: 32 },
    });
    for (const region of atlas) {
      assert.ok(region instanceof AtlasRegion);
      assert.strictEqual(region.sourceImage, atlas[0].sourceImage);
      assert.strictEqual(region.sourceImage.width, 64);
    }
  });

  // ─── Array-like behavior ─────────────────────────────

  it("iterates with for...of", async () => {
    const atlas = await Image.atlas({
      image: "cards.png",
      grid: { columns: 2, rows: 2, width: 32, height: 32 },
    });
    const seen = [];
    for (const region of atlas) seen.push(region);
    assert.strictEqual(seen.length, 4);
    assert.ok(seen[0] === atlas[0]);
  });

  it("destructures like an array", async () => {
    const atlas = await Image.atlas({
      image: "cards.png",
      grid: { columns: 2, rows: 2, width: 32, height: 32 },
    });
    const [first, second, third] = atlas;
    assert.strictEqual(first, atlas[0]);
    assert.strictEqual(second, atlas[1]);
    assert.strictEqual(third, atlas[2]);
  });

  it("spread and Array.from work", async () => {
    const atlas = await Image.atlas({
      image: "cards.png",
      grid: { columns: 2, rows: 2, width: 32, height: 32 },
    });
    assert.strictEqual([...atlas].length, 4);
    assert.strictEqual(Array.from(atlas).length, 4);
  });

  it("named aliases are not double-allocated", async () => {
    const atlas = await Image.atlas({
      image: "ui.png",
      heart: { x: 0, y: 0, width: 16, height: 16 },
      coin: { x: 16, y: 0, width: 16, height: 16 },
    });
    const unique = new Set([...atlas, atlas.heart, atlas.coin]);
    assert.strictEqual(unique.size, 2);
  });

  // ─── Reserved names ──────────────────────────────────

  it("rejects names that collide with array behavior", async () => {
    await assert.rejects(
      () => Image.atlas({ image: "ui.png", map: { x: 0, y: 0, width: 8, height: 8 } }),
      /reserved/
    );
    await assert.rejects(
      () => Image.atlas({ image: "ui.png", length: { x: 0, y: 0, width: 8, height: 8 } }),
      /reserved/
    );
    await assert.rejects(
      () => Image.atlas({ image: "ui.png", constructor: { x: 0, y: 0, width: 8, height: 8 } }),
      /reserved/
    );
  });

  // ─── Validation ──────────────────────────────────────

  it("rejects missing image", async () => {
    await assert.rejects(() => Image.atlas({}), /image/);
  });

  it("rejects invalid grid dimensions", async () => {
    await assert.rejects(
      () => Image.atlas({ image: "cards.png", grid: { columns: 0, rows: 4, width: 42, height: 60 } }),
      /columns/
    );
    await assert.rejects(
      () => Image.atlas({ image: "cards.png", grid: { columns: 14, rows: 0, width: 42, height: 60 } }),
      /rows/
    );
    await assert.rejects(
      () => Image.atlas({ image: "cards.png", grid: { columns: 14, rows: 4, width: 0, height: 60 } }),
      /width/
    );
  });

  it("rejects invalid region dimensions", async () => {
    await assert.rejects(
      () => Image.atlas({ image: "ui.png", a: { x: 0, y: 0, width: 0, height: 16 } }),
      /width/
    );
    await assert.rejects(
      () => Image.atlas({ image: "ui.png", a: { x: 0, y: 0, width: 16, height: -1 } }),
      /height/
    );
  });

  it("rejects malformed region definitions", async () => {
    await assert.rejects(
      () => Image.atlas({ image: "ui.png", a: "nope" }),
      /region/
    );
    await assert.rejects(
      () => Image.atlas({ image: "ui.png", a: { width: 16, height: 16 } }),
      /x and y/
    );
  });

  it("rejects ambiguous configurations", async () => {
    await assert.rejects(
      () => Image.atlas({
        image: "cards.png",
        grid: { columns: 2, rows: 2, width: 32, height: 32 },
        ace: { x: 0, y: 0, width: 32, height: 32 },
      }),
      /ambiguous/
    );
  });

  it("rejects configs with nothing to slice", async () => {
    await assert.rejects(
      () => Image.atlas({ image: "cards.png" }),
      /nothing to slice/
    );
  });
});

// ─── Caching ─────────────────────────────────────────

describe("Image.atlas caching", () => {
  it("loads the source image only once for repeated atlas calls", async () => {
    const origLoad = ImageLoader.load;
    const origResolve = AnimationPack._resolveImage;
    let loads = 0;
    const memo = new Map();
    ImageLoader.load = async (path) => {
      if (!memo.has(path)) {
        memo.set(path, mockCanvas(128, 128));
        loads++;
      }
      return memo.get(path);
    };
    AnimationPack._resolveImage = async (img) => {
      if (typeof img === "string") return ImageLoader.load(img);
      return img;
    };

    try {
      const a = await Image.atlas({ image: "shared.png", grid: { columns: 2, rows: 2, width: 32, height: 32 } });
      const b = await Image.atlas({ image: "shared.png", grid: { columns: 2, rows: 2, width: 32, height: 32 } });
      assert.strictEqual(loads, 1);
      assert.strictEqual(a[0].sourceImage, b[0].sourceImage);
    } finally {
      ImageLoader.load = origLoad;
      AnimationPack._resolveImage = origResolve;
      Image.clear();
    }
  });
});

// ─── Rendering compatibility ─────────────────────────────────────────────

describe("Image.atlas rendering compatibility", () => {
  const origResolve = AnimationPack._resolveImage;

  before(() => {
    AnimationPack._resolveImage = async (img) => mockCanvas(64, 64);
  });

  after(() => {
    AnimationPack._resolveImage = origResolve;
    Image.clear();
  });

  it("registers an atlas region as a renderable asset", async () => {
    const atlas = await Image.atlas({
      image: "cards.png",
      grid: { columns: 2, rows: 2, width: 32, height: 32 },
    });
    const reg = new AssetRegistry();
    const id = reg.register(atlas[1]);
    const asset = reg.get(id);
    assert.ok(asset.sourceImage === atlas[1].sourceImage);
    assert.strictEqual(asset.sx, 32);
    assert.strictEqual(asset.sy, 0);
    assert.strictEqual(asset.sw, 32);
    assert.strictEqual(asset.sh, 32);
  });

  it("RenderSystem pushes the region's source rect to the queue", async () => {
    const atlas = await Image.atlas({
      image: "cards.png",
      grid: { columns: 2, rows: 2, width: 32, height: 32 },
    });
    const reg = new AssetRegistry();
    const assetId = reg.register(atlas[1]);

    const world = new World();
    world.register(Transform);
    world.register(Renderable);
    world.register(Visible);
    world.register(RenderBounds);
    const queue = new RenderQueue();
    world.setResource(RenderQueue, queue);
    world.setResource(AssetRegistry, reg);
    world.setResource(CanvasContext, {
      save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
      fillRect() {}, beginPath() {}, arc() {}, fill() {}, drawImage() {},
    });
    world.addSystem(new RenderSystem());

    const e = world.createEntity();
    world.addComponent(e, Transform);
    world.addComponent(e, Renderable);
    world.addComponent(e, Visible);
    world.addComponent(e, RenderBounds);
    world.setComponent(e, Transform, { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
    world.setComponent(e, Renderable, { image: assetId, fillColor: 0xffffff, shape: 0, layer: 1 });
    world.setComponent(e, Visible, { value: 1 });
    world.setComponent(e, RenderBounds, { width: 32, height: 32 });

    world.update(16);
    const cmd = queue._commands[0];
    assert.strictEqual(cmd.sourceImage, atlas[0].sourceImage);
    assert.strictEqual(cmd.sx, 32);
    assert.strictEqual(cmd.sy, 0);
    assert.strictEqual(cmd.sw, 32);
    assert.strictEqual(cmd.sh, 32);
  });
});
