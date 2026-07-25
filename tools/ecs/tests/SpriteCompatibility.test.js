import { describe, it } from "node:test";
import * as assert from "node:assert";
import { Sprite } from "../../../display/Sprite.js";
import { World } from "../../../ecs/core/World.js";
import { Transform } from "../../../ecs/components/Transform.js";
import { Velocity } from "../../../ecs/components/Velocity.js";
import { Collider } from "../../../ecs/components/Collider.js";
import { Renderable } from "../../../ecs/components/Renderable.js";
import { Animation } from "../../../ecs/components/Animation.js";
import { Visible } from "../../../ecs/components/Visible.js";
import { RenderBounds } from "../../../ecs/components/RenderBounds.js";
import { AssetRegistry } from "../../../ecs/render/AssetRegistry.js";
import { AnimationClip } from "../../../ecs/animation/AnimationClip.js";
import { AnimationClipRegistry } from "../../../ecs/animation/AnimationClipRegistry.js";
import { RenderSystem } from "../../../ecs/systems/RenderSystem.js";
import { RenderQueue } from "../../../ecs/render/RenderQueue.js";
import { CanvasContext } from "../../../ecs/render/CanvasContext.js";
import { SpatialHash } from "../../../collision/SpatialHash.js";
import { CollisionSystem } from "../../../ecs/systems/CollisionSystem.js";

const ALL_COMPONENTS = [Transform, Velocity, Collider, Renderable, Animation, Visible, RenderBounds];

function createWorld() {
  const world = new World();
  for (const c of ALL_COMPONENTS) world.register(c);
  return world;
}

function mockCtx() {
  let mat = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  return {
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
    fillRect() {}, beginPath() {}, arc() {}, fill() {}, drawImage() {},
    getTransform() { return mat; },
    setTransform(a, b, c, d, e, f) { mat = { a, b, c, d, e, f }; },
  };
}

// ─────────────────────────────────────────────────────────
// Construction
// ─────────────────────────────────────────────────────────
describe("Construction", () => {
  it("creates a sprite with default values", () => {
    const s = new Sprite();
    assert.ok(s instanceof Sprite);
    assert.strictEqual(s.x, 0);
    assert.strictEqual(s.y, 0);
    assert.strictEqual(s.width, 32);
    assert.strictEqual(s.height, 32);
  });

  it("creates a sprite with specified values", () => {
    const s = new Sprite(100, 200, 50, 60);
    assert.strictEqual(s.x, 100);
    assert.strictEqual(s.y, 200);
    assert.strictEqual(s.width, 50);
    assert.strictEqual(s.height, 60);
  });

  it("creates ECS entity with entity property", () => {
    const s = new Sprite();
    assert.ok(typeof s.entity === "number");
    assert.ok(s.entity > 0);
  });

  it("entity exists in world", () => {
    const s = new Sprite();
    assert.ok(s.world.isAlive(s.entity));
  });

  it("accepts custom world", () => {
    const w = createWorld();
    const s = new Sprite(0, 0, 32, 32, w);
    assert.strictEqual(s.world, w);
  });

  it("required components attached", () => {
    const s = new Sprite();
    assert.ok(s.world.has(s.entity, Transform));
    assert.ok(s.world.has(s.entity, Collider));
    assert.ok(s.world.has(s.entity, Renderable));
  });

  it("visible by default", () => {
    const s = new Sprite();
    assert.strictEqual(s.visible, true);
  });

  it("scale defaults to 1", () => {
    const s = new Sprite();
    assert.strictEqual(s.scale, 1);
  });

  it("angle defaults to 0", () => {
    const s = new Sprite();
    assert.strictEqual(s.angle, 0);
  });

  it("center positioned correctly", () => {
    const s = new Sprite(100, 100, 32, 32);
    const t = s.world.get(s.entity, Transform);
    assert.strictEqual(t.x, 116);  // 100 + 32/2
    assert.strictEqual(t.y, 116);  // 100 + 32/2
  });
});

// ─────────────────────────────────────────────────────────
// Accessors
// ─────────────────────────────────────────────────────────
describe("Accessors", () => {
  it("x getter returns top-left", () => {
    const s = new Sprite(50, 60, 20, 30);
    assert.strictEqual(s.x, 50);
  });

  it("x setter updates center", () => {
    const s = new Sprite(0, 0, 20, 20);
    s.x = 100;
    assert.strictEqual(s.x, 100);
    assert.strictEqual(s.transform.x, 110);
  });

  it("y getter returns top-left", () => {
    const s = new Sprite(50, 60, 20, 30);
    assert.strictEqual(s.y, 60);
  });

  it("y setter updates center", () => {
    const s = new Sprite(0, 0, 20, 20);
    s.y = 100;
    assert.strictEqual(s.y, 100);
    assert.strictEqual(s.transform.y, 110);
  });

  it("width getter", () => {
    const s = new Sprite(0, 0, 40, 50);
    assert.strictEqual(s.width, 40);
  });

  it("width setter", () => {
    const s = new Sprite(0, 0, 40, 50);
    s.width = 80;
    assert.strictEqual(s.width, 80);
    assert.strictEqual(s.collider.width, 40);
  });

  it("height getter", () => {
    const s = new Sprite(0, 0, 40, 50);
    assert.strictEqual(s.height, 50);
  });

  it("height setter", () => {
    const s = new Sprite(0, 0, 40, 50);
    s.height = 100;
    assert.strictEqual(s.height, 100);
    assert.strictEqual(s.collider.height, 50);
  });

  it("image getter defaults to 0", () => {
    const s = new Sprite();
    assert.strictEqual(s.image, 0);
  });

  it("image setter", () => {
    const s = new Sprite();
    s.image = 5;
    assert.strictEqual(s.image, 5);
    assert.strictEqual(s.renderable.image, 5);
  });

  it("angle getter", () => {
    const s = new Sprite();
    s.transform.rotation = 1.5;
    assert.strictEqual(s.angle, 1.5);
  });

  it("angle setter", () => {
    const s = new Sprite();
    s.angle = 2.0;
    assert.strictEqual(s.angle, 2.0);
    assert.strictEqual(s.transform.rotation, 2.0);
  });

  it("scale getter with non-uniform scale", () => {
    const s = new Sprite();
    s.transform.scaleX = 2;
    s.transform.scaleY = 3;
    assert.strictEqual(s.scale, 2);
  });

  it("scale setter with object", () => {
    const s = new Sprite();
    s.scale = { x: 2, y: 3 };
    assert.strictEqual(s.transform.scaleX, 2);
    assert.strictEqual(s.transform.scaleY, 3);
  });

  it("scale setter with number", () => {
    const s = new Sprite();
    s.scale = 2;
    assert.strictEqual(s.transform.scaleX, 2);
    assert.strictEqual(s.transform.scaleY, 2);
  });

  it("transform getter returns ECS view", () => {
    const s = new Sprite();
    const t = s.transform;
    assert.strictEqual(typeof t.x, "number");
    assert.strictEqual(typeof t.y, "number");
    assert.strictEqual(typeof t.rotation, "number");
    assert.strictEqual(typeof t.scaleX, "number");
    assert.strictEqual(typeof t.scaleY, "number");
  });

  it("transform setter updates fields", () => {
    const s = new Sprite();
    s.transform = { x: 100, y: 200, rotation: 0.5, scaleX: 2, scaleY: 3 };
    assert.strictEqual(s.transform.x, 100);
    assert.strictEqual(s.transform.y, 200);
    assert.strictEqual(s.transform.rotation, 0.5);
    assert.strictEqual(s.transform.scaleX, 2);
    assert.strictEqual(s.transform.scaleY, 3);
  });

  it("collider getter returns ECS view", () => {
    const s = new Sprite(0, 0, 20, 30);
    const c = s.collider;
    assert.strictEqual(c.width, 20);
    assert.strictEqual(c.height, 30);
  });

  it("collider setter updates fields", () => {
    const s = new Sprite(0, 0, 20, 30);
    s.collider = { width: 40, height: 50 };
    assert.strictEqual(s.collider.width, 40);
    assert.strictEqual(s.collider.height, 50);
  });

  it("visible getter returns boolean", () => {
    const s = new Sprite();
    assert.strictEqual(typeof s.visible, "boolean");
  });

  it("visible setter accepts boolean", () => {
    const s = new Sprite();
    s.visible = false;
    assert.strictEqual(s.visible, false);
    s.visible = true;
    assert.strictEqual(s.visible, true);
  });
});

// ─────────────────────────────────────────────────────────
// Geometry Accessors
// ─────────────────────────────────────────────────────────
describe("Geometry Accessors", () => {
  it("left getter equals x", () => {
    const s = new Sprite(100, 200, 50, 60);
    assert.strictEqual(s.left, 100);
  });

  it("left setter updates x", () => {
    const s = new Sprite(100, 200, 50, 60);
    s.left = 150;
    assert.strictEqual(s.x, 150);
  });

  it("right getter returns x + width", () => {
    const s = new Sprite(100, 200, 50, 60);
    assert.strictEqual(s.right, 150);
  });

  it("right setter adjusts x", () => {
    const s = new Sprite(100, 200, 50, 60);
    s.right = 200;
    assert.strictEqual(s.x, 150);
  });

  it("top getter equals y", () => {
    const s = new Sprite(100, 200, 50, 60);
    assert.strictEqual(s.top, 200);
  });

  it("top setter updates y", () => {
    const s = new Sprite(100, 200, 50, 60);
    s.top = 300;
    assert.strictEqual(s.y, 300);
  });

  it("bottom getter returns y + height", () => {
    const s = new Sprite(100, 200, 50, 60);
    assert.strictEqual(s.bottom, 260);
  });

  it("bottom setter adjusts y", () => {
    const s = new Sprite(100, 200, 50, 60);
    s.bottom = 300;
    assert.strictEqual(s.y, 240);
  });

  it("centerx getter returns x + width/2", () => {
    const s = new Sprite(100, 200, 50, 60);
    assert.strictEqual(s.centerx, 125);
  });

  it("centerx setter adjusts x", () => {
    const s = new Sprite(100, 200, 50, 60);
    s.centerx = 200;
    assert.strictEqual(s.x, 175);
  });

  it("centery getter returns y + height/2", () => {
    const s = new Sprite(100, 200, 50, 60);
    assert.strictEqual(s.centery, 230);
  });

  it("centery setter adjusts y", () => {
    const s = new Sprite(100, 200, 50, 60);
    s.centery = 300;
    assert.strictEqual(s.y, 270);
  });

  it("center getter returns {x, y}", () => {
    const s = new Sprite(100, 200, 50, 60);
    const c = s.center;
    assert.strictEqual(c.x, 125);
    assert.strictEqual(c.y, 230);
  });

  it("center setter adjusts x and y", () => {
    const s = new Sprite(100, 200, 50, 60);
    s.center = { x: 300, y: 400 };
    assert.strictEqual(s.x, 275);
    assert.strictEqual(s.y, 370);
  });

  it("midtop getter returns {centerx, top}", () => {
    const s = new Sprite(100, 200, 50, 60);
    const mt = s.midtop;
    assert.strictEqual(mt.x, 125);
    assert.strictEqual(mt.y, 200);
  });

  it("midtop setter adjusts centerx and top", () => {
    const s = new Sprite(100, 200, 50, 60);
    s.midtop = { x: 200, y: 150 };
    assert.strictEqual(s.x, 175);
    assert.strictEqual(s.y, 150);
  });

  it("midbottom getter returns {centerx, bottom}", () => {
    const s = new Sprite(100, 200, 50, 60);
    const mb = s.midbottom;
    assert.strictEqual(mb.x, 125);
    assert.strictEqual(mb.y, 260);
  });

  it("midbottom setter adjusts centerx and bottom", () => {
    const s = new Sprite(100, 200, 50, 60);
    s.midbottom = { x: 200, y: 400 };
    assert.strictEqual(s.x, 175);
    assert.strictEqual(s.y, 340);
  });

  it("midright getter returns {right, centery}", () => {
    const s = new Sprite(100, 200, 50, 60);
    const mr = s.midright;
    assert.strictEqual(mr.x, 150);
    assert.strictEqual(mr.y, 230);
  });

  it("all accessors stay consistent after x/y/width/height changes", () => {
    const s = new Sprite(0, 0, 20, 20);
    s.width = 40;
    s.height = 50;
    s.x = 10;
    s.y = 10;
    assert.strictEqual(s.left, 10);
    assert.strictEqual(s.right, 50);
    assert.strictEqual(s.top, 10);
    assert.strictEqual(s.bottom, 60);
    assert.strictEqual(s.centerx, 30);
    assert.strictEqual(s.centery, 35);
  });

  it("geometry accessors with uniform scale", () => {
    const s = new Sprite(100, 200, 50, 60);
    s.scale = 2;
    assert.strictEqual(s.width, 100);
    assert.strictEqual(s.height, 120);
    assert.strictEqual(s.right, s.x + s.width);
    assert.strictEqual(s.bottom, s.y + s.height);
  });
});

// ─────────────────────────────────────────────────────────
// Bounds
// ─────────────────────────────────────────────────────────
describe("Bounds", () => {
  it("bounds matches sprite geometry after construction", () => {
    const s = new Sprite(100, 200, 50, 60);
    const b = s.bounds;
    assert.strictEqual(b.x, s.x);
    assert.strictEqual(b.y, s.y);
    assert.strictEqual(b.width, s.width);
    assert.strictEqual(b.height, s.height);
  });

  it("bounds center matches sprite center", () => {
    const s = new Sprite(100, 200, 50, 60);
    assert.strictEqual(s.bounds.centerx, s.centerx);
    assert.strictEqual(s.bounds.centery, s.centery);
    assert.deepStrictEqual(s.bounds.center, s.center);
  });

  it("bounds left/right/top/bottom match sprite accessors", () => {
    const s = new Sprite(100, 200, 50, 60);
    assert.strictEqual(s.bounds.left, s.left);
    assert.strictEqual(s.bounds.right, s.right);
    assert.strictEqual(s.bounds.top, s.top);
    assert.strictEqual(s.bounds.bottom, s.bottom);
  });

  it("bounds stays live after position change", () => {
    const s = new Sprite(100, 200, 50, 60);
    s.x = 300;
    s.y = 400;
    assert.strictEqual(s.bounds.x, 300);
    assert.strictEqual(s.bounds.y, 400);
  });

  it("bounds stays live after scale change", () => {
    const s = new Sprite(100, 200, 50, 60);
    s.scale = 2;
    assert.strictEqual(s.bounds.width, 100);
    assert.strictEqual(s.bounds.height, 120);
    // center stays fixed, so top-left shifts
    assert.strictEqual(s.bounds.x, s.x);
    assert.strictEqual(s.bounds.y, s.y);
  });

  it("bounds stays live after width/height change", () => {
    const s = new Sprite(100, 200, 50, 60);
    s.width = 80;
    s.height = 90;
    assert.strictEqual(s.bounds.width, 80);
    assert.strictEqual(s.bounds.height, 90);
    assert.strictEqual(s.bounds.x, s.x);
    assert.strictEqual(s.bounds.y, s.y);
  });

  it("bounds.collides returns true for overlapping sprites", () => {
    const a = new Sprite(0, 0, 100, 100);
    const b = new Sprite(50, 50, 100, 100);
    assert.strictEqual(a.bounds.collides(b.bounds), true);
  });

  it("bounds.collides returns false for separated sprites", () => {
    const a = new Sprite(0, 0, 100, 100);
    const b = new Sprite(200, 200, 100, 100);
    assert.strictEqual(a.bounds.collides(b.bounds), false);
  });

  it("bounds.collides accepts bare Rect-style objects", () => {
    const s = new Sprite(50, 50, 100, 100);
    assert.strictEqual(s.bounds.collides({ x: 0, y: 0, width: 200, height: 200 }), true);
    assert.strictEqual(s.bounds.collides({ x: 200, y: 200, width: 50, height: 50 }), false);
  });

  it("bounds.collides accepts Rect with w/h naming", () => {
    const s = new Sprite(50, 50, 100, 100);
    assert.strictEqual(s.bounds.collides({ x: 0, y: 0, w: 200, h: 200 }), true);
    assert.strictEqual(s.bounds.collides({ x: 200, y: 200, w: 50, h: 50 }), false);
  });

  it("bounds.overlap returns intersection rect for overlapping sprites", () => {
    const a = new Sprite(0, 0, 100, 100);
    const b = new Sprite(50, 50, 100, 100);
    const r = a.bounds.overlap(b.bounds);
    assert.ok(r);
    assert.strictEqual(r.x, 50);
    assert.strictEqual(r.y, 50);
    assert.strictEqual(r.width, 50);
    assert.strictEqual(r.height, 50);
  });

  it("bounds.overlap returns null for separated sprites", () => {
    const a = new Sprite(0, 0, 100, 100);
    const b = new Sprite(200, 200, 100, 100);
    assert.strictEqual(a.bounds.overlap(b.bounds), null);
  });

  it("bounds.contains returns true for point inside", () => {
    const s = new Sprite(50, 50, 100, 100);
    assert.strictEqual(s.bounds.contains({ x: 75, y: 75 }), true);
  });

  it("bounds.contains returns false for point outside", () => {
    const s = new Sprite(50, 50, 100, 100);
    assert.strictEqual(s.bounds.contains({ x: 0, y: 0 }), false);
  });

  it("bounds has no setter", () => {
    const s = new Sprite(0, 0, 32, 32);
    assert.strictEqual(Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(s), "bounds"
    ).set, undefined);
  });

  it("same bounds object instance on repeated access", () => {
    const s = new Sprite(0, 0, 32, 32);
    assert.strictEqual(s.bounds, s.bounds);
  });

  it("bounds throws after destroy", () => {
    const s = new Sprite(0, 0, 32, 32);
    s.destroy();
    assert.throws(() => s.bounds, /destroyed/);
  });
});

// ─────────────────────────────────────────────────────────
// Lazy Size Resolution
// ─────────────────────────────────────────────────────────
describe("Lazy Size Resolution", () => {
  it("nativeWidth is 0 for bare new Sprite()", () => {
    const s = new Sprite();
    assert.strictEqual(s.nativeWidth, 0);
    assert.strictEqual(s.nativeHeight, 0);
  });

  it("nativeWidth is 0 for new Sprite(x, y) with no size", () => {
    const s = new Sprite(100, 200);
    assert.strictEqual(s.nativeWidth, 0);
    assert.strictEqual(s.nativeHeight, 0);
  });

  it("nativeWidth equals explicit constructor width/height", () => {
    const s = new Sprite(100, 200, 50, 60);
    assert.strictEqual(s.nativeWidth, 50);
    assert.strictEqual(s.nativeHeight, 60);
  });

  it("image setter resolves native size from AssetRegistry", () => {
    const s = new Sprite();
    const reg = new AssetRegistry();
    const img = { sourceImage: {}, sw: 64, sh: 48 };
    const assetId = reg.register(img);
    s.world.setResource(AssetRegistry, reg);

    s.image = assetId;
    assert.strictEqual(s.nativeWidth, 64);
    assert.strictEqual(s.nativeHeight, 48);
  });

  it("image setter does not overwrite already-resolved native size", () => {
    const s = new Sprite(0, 0, 100, 100);
    const reg = new AssetRegistry();
    const img = { sourceImage: {}, sw: 64, sh: 48 };
    const assetId = reg.register(img);
    s.world.setResource(AssetRegistry, reg);

    s.image = assetId;
    assert.strictEqual(s.nativeWidth, 100);
    assert.strictEqual(s.nativeHeight, 100);
  });

  it("animation.play() resolves native size from first frame", () => {
    const s = new Sprite();
    const w = s.world;

    const reg = new AssetRegistry();
    const assetId = reg.register({ sourceImage: {}, sw: 80, sh: 60 });
    w.setResource(AssetRegistry, reg);

    const clipReg = new AnimationClipRegistry();
    w.setResource(AnimationClipRegistry, clipReg);

    const clip = new AnimationClip({ frames: [assetId], fps: 10, loop: true });
    s.animation.add("idle", clip);
    s.animation.play("idle");

    assert.strictEqual(s.nativeWidth, 80);
    assert.strictEqual(s.nativeHeight, 60);
  });

  it("animation.play() does not overwrite explicit native size", () => {
    const s = new Sprite(0, 0, 200, 200);
    const w = s.world;

    const reg = new AssetRegistry();
    const assetId = reg.register({ sourceImage: {}, sw: 80, sh: 60 });
    w.setResource(AssetRegistry, reg);

    const clipReg = new AnimationClipRegistry();
    w.setResource(AnimationClipRegistry, clipReg);

    const clip = new AnimationClip({ frames: [assetId], fps: 10, loop: true });
    s.animation.add("idle", clip);
    s.animation.play("idle");

    assert.strictEqual(s.nativeWidth, 200);
    assert.strictEqual(s.nativeHeight, 200);
  });

  it("play() resolves RenderBounds from first frame when native was 0", () => {
    const s = new Sprite();
    const w = s.world;

    const reg = new AssetRegistry();
    const assetId = reg.register({ sourceImage: {}, sw: 80, sh: 60 });
    w.setResource(AssetRegistry, reg);

    const clipReg = new AnimationClipRegistry();
    w.setResource(AnimationClipRegistry, clipReg);

    const clip = new AnimationClip({ frames: [assetId], fps: 10, loop: true });
    s.animation.add("idle", clip);
    s.animation.play("idle");

    assert.strictEqual(s.width, 80);
    assert.strictEqual(s.height, 60);
  });

  it("subsequent play() does not change already-resolved size", () => {
    const s = new Sprite();
    const w = s.world;

    const reg = new AssetRegistry();
    const id1 = reg.register({ sourceImage: {}, sw: 80, sh: 60 });
    const id2 = reg.register({ sourceImage: {}, sw: 100, sh: 75 });
    w.setResource(AssetRegistry, reg);

    const clipReg = new AnimationClipRegistry();
    w.setResource(AnimationClipRegistry, clipReg);

    s.animation.add("idle", new AnimationClip({ frames: [id1], fps: 10, loop: true }));
    s.animation.add("walk", new AnimationClip({ frames: [id2], fps: 10, loop: true }));
    s.animation.play("idle");
    assert.strictEqual(s.nativeWidth, 80);

    s.animation.play("walk");
    assert.strictEqual(s.nativeWidth, 80);
  });
});

// ─────────────────────────────────────────────────────────
// Constructor Overloading
// ─────────────────────────────────────────────────────────
describe("Constructor Overloading", () => {
  it("new Sprite() — zero args", () => {
    const s = new Sprite();
    assert.strictEqual(s.x, 0);
    assert.strictEqual(s.y, 0);
    assert.strictEqual(s.width, 32);
    assert.strictEqual(s.height, 32);
    assert.strictEqual(s.nativeWidth, 0);
  });

  it("new Sprite(x, y) — position only", () => {
    const s = new Sprite(100, 200);
    assert.strictEqual(s.x, 100);
    assert.strictEqual(s.y, 200);
    assert.strictEqual(s.width, 32);
    assert.strictEqual(s.height, 32);
    assert.strictEqual(s.nativeWidth, 0);
  });

  it("new Sprite(x, y, w, h) — full rect", () => {
    const s = new Sprite(100, 200, 50, 60);
    assert.strictEqual(s.x, 100);
    assert.strictEqual(s.y, 200);
    assert.strictEqual(s.width, 50);
    assert.strictEqual(s.height, 60);
    assert.strictEqual(s.nativeWidth, 50);
  });

  it("new Sprite(x, y, w, h, assetId) — with image", () => {
    const s = new Sprite(100, 200, 50, 60, 42);
    assert.strictEqual(s.x, 100);
    assert.strictEqual(s.y, 200);
    assert.strictEqual(s.width, 50);
    assert.strictEqual(s.height, 60);
    assert.strictEqual(s.image, 42);
  });

  it("new Sprite(imageAssetId) — image only, default size", () => {
    const s = new Sprite(99);
    assert.strictEqual(s.x, 99);
    assert.strictEqual(s.y, 0);
    assert.strictEqual(s.width, 32);
    assert.strictEqual(s.height, 32);
  });

  it("new Sprite(x, y, w, h, world) — backward compat with world arg", () => {
    const w = new World();
    for (const c of ALL_COMPONENTS) w.register(c);
    const s = new Sprite(100, 200, 50, 60, w);
    assert.strictEqual(s.world, w);
    assert.strictEqual(s.x, 100);
    assert.strictEqual(s.y, 200);
    assert.strictEqual(s.width, 50);
    assert.strictEqual(s.height, 60);
  });

  it("new Sprite(x, y, w, h, world) — backward compat with world arg", () => {
    const w = new World();
    for (const c of ALL_COMPONENTS) w.register(c);
    const s = new Sprite(100, 200, 50, 60, w);
    assert.strictEqual(s.world, w);
    assert.strictEqual(s.x, 100);
    assert.strictEqual(s.y, 200);
    assert.strictEqual(s.width, 50);
    assert.strictEqual(s.height, 60);
  });

  it("new Sprite(imgObject) auto-registers image-like objects", () => {
    const s = new Sprite();
    const reg = new AssetRegistry();
    s.world.setResource(AssetRegistry, reg);
    const fakeImg = { width: 64, height: 48 };

    s.image = fakeImg;
    assert.strictEqual(s.image, 1);
    assert.strictEqual(s.nativeWidth, 64);
    assert.strictEqual(s.nativeHeight, 48);
    assert.strictEqual(s.width, 64);
  });
});

// ─────────────────────────────────────────────────────────
// Velocity (lazy creation)
// ─────────────────────────────────────────────────────────
describe("Velocity (lazy)", () => {
  it("velocity.x defaults to 0", () => {
    const s = new Sprite();
    assert.strictEqual(s.velocity.x, 0);
  });

  it("velocity.y defaults to 0", () => {
    const s = new Sprite();
    assert.strictEqual(s.velocity.y, 0);
  });

  it("velocity is created lazily on first access", () => {
    const s = new Sprite();
    assert.ok(!s.world.has(s.entity, Velocity));
    const v = s.velocity;
    assert.ok(s.world.has(s.entity, Velocity));
  });

  it("velocity setter updates values", () => {
    const s = new Sprite();
    s.velocity = { x: 5, y: -3 };
    assert.strictEqual(s.velocity.x, 5);
    assert.strictEqual(s.velocity.y, -3);
  });

  it("velocity persists in ECS", () => {
    const s = new Sprite();
    s.velocity.x = 10;
    s.velocity.y = 20;
    const ecsVel = s.world.get(s.entity, Velocity);
    assert.strictEqual(ecsVel.x, 10);
    assert.strictEqual(ecsVel.y, 20);
  });

  it("velocity getter returns same ECS view", () => {
    const s = new Sprite();
    const v1 = s.velocity;
    v1.x = 42;
    const v2 = s.velocity;
    assert.strictEqual(v2.x, 42);
  });
});

// ─────────────────────────────────────────────────────────
// Style
// ─────────────────────────────────────────────────────────
describe("Style", () => {
  it("style.fill defaults to white", () => {
    const s = new Sprite();
    assert.strictEqual(s.style.fill, "#ffffff");
  });

  it("style.fill setter converts hex string to color", () => {
    const s = new Sprite();
    s.style.fill = "#ff0000";
    assert.strictEqual(s.renderable.fillColor, 0xff0000);
  });

  it("style.shape defaults to rect", () => {
    const s = new Sprite();
    assert.strictEqual(s.style.shape, "rect");
  });

  it("style.shape setter to circle", () => {
    const s = new Sprite();
    s.style.shape = "circle";
    assert.strictEqual(s.renderable.shape, 1);
    assert.strictEqual(s.style.shape, "circle");
  });

  it("style.shape setter back to rect", () => {
    const s = new Sprite();
    s.style.shape = "circle";
    s.style.shape = "rect";
    assert.strictEqual(s.renderable.shape, 0);
  });

  it("style wrapper is cached (same object)", () => {
    const s = new Sprite();
    const w1 = s.style;
    const w2 = s.style;
    assert.strictEqual(w1, w2);
  });
});

// ─────────────────────────────────────────────────────────
// Animation
// ─────────────────────────────────────────────────────────
describe("Animation", () => {
  it("animation.playing defaults to false", () => {
    const s = new Sprite();
    assert.strictEqual(s.animation.playing, false);
  });

  it("animation.playing setter", () => {
    const s = new Sprite();
    s.animation.playing = true;
    assert.strictEqual(s.animation.playing, true);
  });

  it("animation wrapper is cached", () => {
    const s = new Sprite();
    const a1 = s.animation;
    const a2 = s.animation;
    assert.strictEqual(a1, a2);
  });

  it("animation component created lazily", () => {
    const s = new Sprite();
    assert.ok(!s.world.has(s.entity, Animation));
    s.animation;
    assert.ok(s.world.has(s.entity, Animation));
  });

  it("animation.add stores clip", () => {
    const s = new Sprite();
    const clip = { frames: [1, 2, 3], fps: 10, loop: true };
    s.animation.add("walk", clip);
    assert.strictEqual(s.animation.animations.get("walk"), clip);
  });

  it("animation.play sets clipId and playing", () => {
    const s = new Sprite();
    const clip = { frames: [1, 2, 3], fps: 10, loop: true };
    s.animation.add("walk", clip);
    s.animation.play("walk");
    assert.strictEqual(s.animation.current, "walk");
    assert.strictEqual(s.animation.playing, true);
  });

  it("animation.pause stops playing", () => {
    const s = new Sprite();
    s.animation.playing = true;
    s.animation.pause();
    assert.strictEqual(s.animation.playing, false);
  });

  it("animation.resume continues", () => {
    const s = new Sprite();
    s.animation.play("walk"); // sets current
    s.animation.pause();
    s.animation.resume();
    assert.strictEqual(s.animation.playing, true);
  });

  it("animation.stop resets frame and elapsed", () => {
    const s = new Sprite();
    s.animation.playing = true;
    s.animation.stop();
    assert.strictEqual(s.animation.playing, false);
  });

  it("onComplete stores callback", () => {
    const s = new Sprite();
    let called = false;
    s.animation.onComplete(() => called = true);
    // trigger via internal callback mechanism (if applicable)
    assert.strictEqual(typeof s._animCallback, "function");
  });

  it("play() with same name is no-op (elapsed unchanged)", () => {
    const s = new Sprite();
    s.animation.play("walk");
    const comp = s.world.get(s.entity, Animation);
    comp.elapsed = 0.5;
    s.animation.play("walk");
    assert.strictEqual(comp.elapsed, 0.5);
  });

  it("play() switches animation when name differs", () => {
    const s = new Sprite();
    s.animation.play("walk");
    s.animation.play("run");
    assert.strictEqual(s.animation.current, "run");
  });

  it("restart() always resets elapsed to 0", () => {
    const s = new Sprite();
    s.animation.play("walk");
    const comp = s.world.get(s.entity, Animation);
    comp.elapsed = 0.5;
    s.animation.restart("walk");
    assert.strictEqual(comp.elapsed, 0);
  });

  it("restart() switches to a different animation", () => {
    const s = new Sprite();
    s.animation.play("walk");
    s.animation.restart("run");
    assert.strictEqual(s.animation.current, "run");
  });
});

// ─────────────────────────────────────────────────────────
// Entity Lifecycle
// ─────────────────────────────────────────────────────────
describe("Entity lifecycle", () => {
  it("destroy destroys ECS entity", () => {
    const s = new Sprite();
    const eid = s.entity;
    s.destroy();
    assert.ok(!s.world.isAlive(eid));
  });

  it("destroy removes from groups", () => {
    const s = new Sprite();
    s.groups.push({});
    s.destroy();
    assert.strictEqual(s.groups.length, 0);
  });

  it("destroy is idempotent", () => {
    const s = new Sprite();
    s.destroy();
    s.destroy(); // should not throw
  });

  it("destroyed sprite throws on access", () => {
    const s = new Sprite();
    s.destroy();
    assert.throws(() => s.x, /Sprite.*destroyed/);
    assert.throws(() => { s.x = 1; }, /Sprite.*destroyed/);
    assert.throws(() => s.visible, /Sprite.*destroyed/);
    assert.throws(() => { s.velocity; }, /Sprite.*destroyed/);
  });

  it("kill removes from groups only", () => {
    const s = new Sprite();
    const eid = s.entity;
    s.kill();
    assert.ok(s.world.isAlive(eid));
  });

  it("entity getter returns entity ID", () => {
    const s = new Sprite();
    assert.ok(typeof s.entity === "number");
    assert.ok(s.entity > 0);
  });

  it("world getter returns owning world", () => {
    const s = new Sprite();
    assert.ok(s.world instanceof World);
  });
});

// ─────────────────────────────────────────────────────────
// ECS Synchronization
// ─────────────────────────────────────────────────────────
describe("ECS synchronization", () => {
  it("mutating ECS updates sprite.x", () => {
    const s = new Sprite(0, 0, 20, 20);
    s.transform.x = 110;
    assert.strictEqual(s.x, 100);
  });

  it("mutating sprite.x updates ECS", () => {
    const s = new Sprite(0, 0, 20, 20);
    s.x = 100;
    assert.strictEqual(s.transform.x, 110);
  });

  it("mutating ECS collider does NOT affect sprite.width", () => {
    const s = new Sprite(0, 0, 20, 20);
    s.collider.width = 40;
    assert.strictEqual(s.width, 20);
  });

  it("setting sprite.width does not affect collider", () => {
    const s = new Sprite(0, 0, 20, 20);
    s.width = 40;
    assert.strictEqual(s.collider.width, 20);
  });

  it("mutating sprite.visible updates ECS", () => {
    const s = new Sprite();
    s.visible = false;
    assert.strictEqual(s.world.get(s.entity, Visible).value, 0);
    s.visible = true;
    assert.strictEqual(s.world.get(s.entity, Visible).value, 1);
  });

  it("ecs and sprite share same transform state", () => {
    const s = new Sprite();
    const tEcs = s.world.get(s.entity, Transform);
    tEcs.x = 50;
    assert.strictEqual(s.transform.x, 50);
  });
});

// ─────────────────────────────────────────────────────────
// Multiple Sprites
// ─────────────────────────────────────────────────────────
describe("Multiple sprites", () => {
  it("two sprites have different entities", () => {
    const a = new Sprite();
    const b = new Sprite();
    assert.notStrictEqual(a.entity, b.entity);
  });

  it("two sprites have independent positions", () => {
    const a = new Sprite(10, 20, 32, 32);
    const b = new Sprite(100, 200, 32, 32);
    assert.strictEqual(a.x, 10);
    assert.strictEqual(a.y, 20);
    assert.strictEqual(b.x, 100);
    assert.strictEqual(b.y, 200);
  });

  it("two sprites can share same world", () => {
    const w = createWorld();
    const a = new Sprite(0, 0, 32, 32, w);
    const b = new Sprite(0, 0, 32, 32, w);
    assert.strictEqual(a.world, b.world);
  });
});

// ─────────────────────────────────────────────────────────
// Custom World
// ─────────────────────────────────────────────────────────
describe("Custom world", () => {
  it("uses provided world", () => {
    const w = createWorld();
    const s = new Sprite(0, 0, 32, 32, w);
    assert.strictEqual(s.world, w);
  });

  it("entity created in provided world", () => {
    const w = createWorld();
    const s = new Sprite(0, 0, 32, 32, w);
    assert.ok(w.isAlive(s.entity));
    assert.strictEqual(w.has(s.entity, Transform), true);
  });
});

// ─────────────────────────────────────────────────────────
// Groups
// ─────────────────────────────────────────────────────────
describe("Groups", () => {
  it("groups defaults to empty array", () => {
    const s = new Sprite();
    assert.deepStrictEqual(s.groups, []);
  });

  it("groups setter", () => {
    const s = new Sprite();
    const g = [{}];
    s.groups = g;
    assert.strictEqual(s.groups, g);
  });

  it("kill removes from groups", () => {
    const s = new Sprite();
    const g = { remove(sp) { sp.groups.splice(sp.groups.indexOf(this), 1); } };
    s.groups.push(g);
    assert.strictEqual(s.groups.length, 1);
    s.kill();
    assert.strictEqual(s.groups.length, 0);
  });
});

// ─────────────────────────────────────────────────────────
// Renderable
// ─────────────────────────────────────────────────────────
describe("Renderable", () => {
  it("renderable.image defaults to 0", () => {
    const s = new Sprite();
    assert.strictEqual(s.renderable.image, 0);
  });

  it("renderable.fillColor defaults to 0xffffff", () => {
    const s = new Sprite();
    assert.strictEqual(s.renderable.fillColor, 0xffffff);
  });

  it("renderable setter updates fields", () => {
    const s = new Sprite();
    s.renderable = { image: 3, fillColor: 0xff0000, shape: 1, layer: 5 };
    assert.strictEqual(s.renderable.image, 3);
    assert.strictEqual(s.renderable.fillColor, 0xff0000);
    assert.strictEqual(s.renderable.shape, 1);
    assert.strictEqual(s.renderable.layer, 5);
  });
});

// ─────────────────────────────────────────────────────────
// Error Handling
// ─────────────────────────────────────────────────────────
describe("Error handling", () => {
  it("destroyed sprite throws on transform access", () => {
    const s = new Sprite();
    s.destroy();
    assert.throws(() => s.transform, /destroyed/);
  });

  it("destroyed sprite throws on velocity access", () => {
    const s = new Sprite();
    s.destroy();
    assert.throws(() => s.velocity, /destroyed/);
  });

  it("destroyed sprite throws on visible access", () => {
    const s = new Sprite();
    s.destroy();
    assert.throws(() => s.visible, /destroyed/);
  });

  it("destroyed sprite throws on animation access", () => {
    const s = new Sprite();
    s.destroy();
    assert.throws(() => s.animation, /destroyed/);
  });

  it("destroyed sprite throws on style access", () => {
    const s = new Sprite();
    s.destroy();
    assert.throws(() => s.style, /destroyed/);
  });
});

// ─────────────────────────────────────────────────────────
// Performance
// ─────────────────────────────────────────────────────────
describe("Performance", () => {
  it("style wrapper is cached (no allocation per access)", () => {
    const s = new Sprite();
    const w1 = s.style;
    const w2 = s.style;
    assert.strictEqual(w1, w2);
  });

  it("animation wrapper is cached", () => {
    const s = new Sprite();
    const a1 = s.animation;
    const a2 = s.animation;
    assert.strictEqual(a1, a2);
  });

  it("create many sprites", () => {
    const sprites = [];
    for (let i = 0; i < 500; i++) {
      sprites.push(new Sprite(i, i, 32, 32));
    }
    assert.strictEqual(sprites.length, 500);
    for (const s of sprites) {
      assert.ok(s.world.isAlive(s.entity));
    }
  });
});

// ─────────────────────────────────────────────────────────
// API Stability (survives engine mutations)
// ─────────────────────────────────────────────────────────
describe("API Stability", () => {
  it("animation API survives component add (migration)", () => {
    const s = new Sprite();
    s.animation.playing = true;
    assert.strictEqual(s.animation.playing, true);

    s.world.add(s.entity, Velocity);

    assert.strictEqual(s.animation.playing, true);
    s.animation.playing = false;
    assert.strictEqual(s.animation.playing, false);
  });

  it("animation.play() survives migration", () => {
    const s = new Sprite();
    const clip = { frames: [1, 2, 3], fps: 10, loop: true };
    s.animation.add("walk", clip);
    s.animation.play("walk");
    assert.strictEqual(s.animation.playing, true);
    assert.strictEqual(s.animation.current, "walk");

    s.world.add(s.entity, Velocity);

    assert.strictEqual(s.animation.playing, true);
    assert.strictEqual(s.animation.current, "walk");
    s.animation.pause();
    assert.strictEqual(s.animation.playing, false);
    s.animation.resume();
    assert.strictEqual(s.animation.playing, true);
    s.animation.stop();
    assert.strictEqual(s.animation.playing, false);
  });

  it("animation API survives multiple migrations", () => {
    const s = new Sprite();
    s.animation.playing = true;

    s.world.add(s.entity, Velocity);
    assert.strictEqual(s.animation.playing, true);

    s.world.add(s.entity, RenderBounds);
    assert.strictEqual(s.animation.playing, true);

    s.animation.pause();
    assert.strictEqual(s.animation.playing, false);
  });

  it("style API survives migration", () => {
    const s = new Sprite();
    s.style.fill = "#ff0000";
    assert.strictEqual(s.style.fill, "#ff0000");
    assert.strictEqual(s.style.shape, "rect");

    s.world.add(s.entity, Velocity);

    assert.strictEqual(s.style.fill, "#ff0000");
    assert.strictEqual(s.style.shape, "rect");
    s.style.shape = "circle";
    assert.strictEqual(s.style.shape, "circle");
    assert.strictEqual(s.renderable.shape, 1);
  });

  it("style API survives multiple migrations", () => {
    const s = new Sprite();
    s.style.fill = "#00ff00";

    s.world.add(s.entity, Velocity);
    assert.strictEqual(s.style.fill, "#00ff00");

    s.world.add(s.entity, RenderBounds);
    assert.strictEqual(s.style.fill, "#00ff00");

    s.style.fill = "#0000ff";
    assert.strictEqual(s.style.fill, "#0000ff");
  });

  it("simple APIs survive migration", () => {
    const s = new Sprite(100, 200, 50, 60);
    s.visible = false;
    s.image = 42;
    s.angle = 1.5;

    s.world.add(s.entity, Velocity);

    assert.strictEqual(s.x, 100);
    assert.strictEqual(s.y, 200);
    assert.strictEqual(s.width, 50);
    assert.strictEqual(s.height, 60);
    assert.strictEqual(s.visible, false);
    assert.strictEqual(s.image, 42);
    assert.strictEqual(s.angle, 1.5);
    assert.strictEqual(s.scale, 1);

    s.x = 150;
    assert.strictEqual(s.transform.x, 175);
  });

  it("destroyed sprite still throws after API use", () => {
    const s = new Sprite();
    s.animation.playing = true;
    s.style.fill = "#ff0000";
    s.world.add(s.entity, Velocity);
    s.animation.pause();
    s.style.shape = "circle";
    s.destroy();

    assert.throws(() => s.animation, /destroyed/);
    assert.throws(() => s.style, /destroyed/);
    assert.throws(() => s.x, /destroyed/);
    assert.throws(() => s.transform, /destroyed/);
  });
});

// ─────────────────────────────────────────────────────────
// Legacy API Compatibility
// ─────────────────────────────────────────────────────────
describe("Legacy API compatibility", () => {
  it("constructor(x, y, w, h) without world works", () => {
    const s = new Sprite(10, 20, 30, 40);
    assert.strictEqual(s.x, 10);
    assert.strictEqual(s.y, 20);
    assert.strictEqual(s.width, 30);
    assert.strictEqual(s.height, 40);
  });

  it("kill() legacy method works", () => {
    const s = new Sprite();
    s.kill();
    assert.ok(s.world.isAlive(s.entity));
  });

  it("destroy() method added", () => {
    const s = new Sprite();
    s.destroy();
    assert.ok(!s.world.isAlive(s.entity));
  });

  it("setDefaultWorld overrides default", () => {
    const w = createWorld();
    Sprite.setDefaultWorld(w);
    const s = new Sprite();
    assert.strictEqual(s.world, w);
    Sprite._defaultWorld = null; // reset
  });
});

// ─────────────────────────────────────────────────────────
// Render Integration
// ─────────────────────────────────────────────────────────
describe("Render Integration", () => {
  function setupSpriteWorld() {
    const world = new World();
    for (const c of ALL_COMPONENTS) world.register(c);
    const queue = new RenderQueue();
    world.setResource(RenderQueue, queue);
    world.setResource(CanvasContext, mockCtx());
    world.addSystem(new RenderSystem());
    Sprite.setDefaultWorld(world);
    return { world, queue };
  }

  it("sprite.width is reflected in render command", () => {
    const { queue } = setupSpriteWorld();
    const s = new Sprite(100, 200, 40, 50);
    s.world.update(16);
    assert.strictEqual(queue._commands[0].width, 40);
    assert.strictEqual(queue._commands[0].height, 50);
  });

  it("sprite.width = 200 updates render command width", () => {
    const { queue } = setupSpriteWorld();
    const s = new Sprite(100, 200, 40, 50);
    s.width = 200;
    s.world.update(16);
    assert.strictEqual(queue._commands[0].width, 200);
  });

  it("sprite.scale = 2 changes scaleX/scaleY but not base width in render command", () => {
    const { queue } = setupSpriteWorld();
    const s = new Sprite(100, 200, 40, 50);
    s.scale = 2;
    s.world.update(16);
    assert.strictEqual(queue._commands[0].width, 40);
    assert.strictEqual(queue._commands[0].scaleX, 2);
    assert.strictEqual(queue._commands[0].scaleY, 2);
  });

  it("lazy resolution from animation updates render command width", () => {
    const { world, queue } = setupSpriteWorld();
    const s = new Sprite();

    const reg = new AssetRegistry();
    const assetId = reg.register({ sourceImage: {}, sw: 80, sh: 60 });
    world.setResource(AssetRegistry, reg);

    const clipReg = new AnimationClipRegistry();
    world.setResource(AnimationClipRegistry, clipReg);

    s.animation.add("idle", new AnimationClip({ frames: [assetId], fps: 10, loop: true }));
    s.animation.play("idle");
    s.world.update(16);

    assert.strictEqual(queue._commands[0].width, 80);
    assert.strictEqual(queue._commands[0].height, 60);
  });

  it("image setter resolves native size and updates render command", () => {
    const { world, queue } = setupSpriteWorld();
    const s = new Sprite();

    const reg = new AssetRegistry();
    const assetId = reg.register({ sourceImage: {}, sw: 64, sh: 48 });
    world.setResource(AssetRegistry, reg);

    s.image = assetId;
    s.world.update(16);

    assert.strictEqual(queue._commands[0].width, 64);
    assert.strictEqual(queue._commands[0].height, 48);
  });
});

// ─────────────────────────────────────────────────────────
// Geometry + Animation + Spatial Hash
// ─────────────────────────────────────────────────────────
describe("Geometry Integration", () => {
  it("explicit sprite.width override after animation resolves", () => {
    const s = new Sprite();
    const w = s.world;

    const reg = new AssetRegistry();
    const assetId = reg.register({ sourceImage: {}, sw: 80, sh: 60 });
    w.setResource(AssetRegistry, reg);

    const clipReg = new AnimationClipRegistry();
    w.setResource(AnimationClipRegistry, clipReg);

    s.animation.add("idle", new AnimationClip({ frames: [assetId], fps: 10, loop: true }));
    s.animation.play("idle");
    assert.strictEqual(s.nativeWidth, 80);

    s.width = 200;
    assert.strictEqual(s.width, 200);
    assert.strictEqual(s.nativeWidth, 80);
  });

  it("scale then size: width set after scale is rendered size", () => {
    const s = new Sprite(0, 0, 50, 60);
    s.scale = 2;
    s.width = 100;
    assert.strictEqual(s.width, 100);
    assert.strictEqual(s.scale, 2);
  });

  it("size then scale: width set before scale changes rendered size", () => {
    const s = new Sprite(0, 0, 50, 60);
    s.width = 100;
    s.scale = 2;
    assert.strictEqual(s.width, 200);
    assert.strictEqual(s.scale, 2);
  });

  it("spatial hash picks up collider size after geometry changes", () => {
    const world = new World();
    for (const c of ALL_COMPONENTS) world.register(c);
    const queue = new RenderQueue();
    world.setResource(RenderQueue, queue);
    world.setResource(CanvasContext, mockCtx());
    world.addSystem(new RenderSystem());

    const hash = new SpatialHash(64);
    world.setResource(SpatialHash, hash);
    world.addSystem(new CollisionSystem());

    Sprite.setDefaultWorld(world);
    const s = new Sprite(0, 0, 32, 32);

    world.update(16);
    const hits1 = hash.queryRect({ left: 0, right: 10, top: 0, bottom: 10 });
    assert.strictEqual(hits1.length, 1);

    s.collider = { width: 4, height: 4 };
    world.update(16);
    const hits2 = hash.queryRect({ left: 0, right: 10, top: 0, bottom: 10 });
    assert.strictEqual(hits2.length, 0);
  });
});
