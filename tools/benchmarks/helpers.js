import { World } from "../../ecs/core/World.js";
import { Transform } from "../../ecs/components/Transform.js";
import { Velocity } from "../../ecs/components/Velocity.js";
import { Collider } from "../../ecs/components/Collider.js";
import { Renderable } from "../../ecs/components/Renderable.js";
import { RenderBounds } from "../../ecs/components/RenderBounds.js";
import { Visible } from "../../ecs/components/Visible.js";
import { Animation } from "../../ecs/components/Animation.js";
import { Trail } from "../../ecs/components/Trail.js";
import { StaticTag } from "../../ecs/components/tags/StaticTag.js";
import { ProjectileTag } from "../../ecs/components/tags/ProjectileTag.js";
import { PlayerTag } from "../../ecs/components/tags/PlayerTag.js";
import { EnemyTag } from "../../ecs/components/tags/EnemyTag.js";
import { SpatialHash } from "../../collision/SpatialHash.js";
import { MovementSystem } from "../../ecs/systems/MovementSystem.js";
import { CollisionSystem } from "../../ecs/systems/CollisionSystem.js";
import { RenderSystem } from "../../ecs/systems/RenderSystem.js";
import { TrailSystem } from "../../ecs/systems/TrailSystem.js";
import { RenderQueue } from "../../ecs/render/RenderQueue.js";
import { CanvasContext } from "../../ecs/render/CanvasContext.js";
import { TrailManager } from "../../ecs/trails/TrailManager.js";
import { Camera } from "../../camera/Camera.js";

export const ALL_COMPONENTS = [
  Transform, Velocity, Collider, Renderable, RenderBounds, Visible, Animation, Trail,
  StaticTag, ProjectileTag, PlayerTag, EnemyTag,
];

export function createWorld() {
  const world = new World();
  for (const C of ALL_COMPONENTS) world.register(C);
  return world;
}

export function createSpatialHash() {
  return new SpatialHash();
}

export function populateEntities(world, count, components, options = {}) {
  const {
    randomPositions = false,
    randomVelocities = false,
    randomSizes = false,
    seed = 42,
  } = options;

  let rng = seed;
  function rand() {
    rng = (rng * 16807) % 2147483647;
    return (rng - 1) / 2147483646;
  }

  const eids = new Array(count);
  for (let i = 0; i < count; i++) {
    const eid = world.createEntity();
    world.addMany(eid, ...components);
    eids[i] = eid;

    if (randomPositions) {
      world.setComponent(eid, Transform, { x: rand() * 800 - 400, y: rand() * 600 - 300 });
    }
    if (randomVelocities) {
      world.setComponent(eid, Velocity, { x: rand() * 200 - 100, y: rand() * 200 - 100 });
    }
    if (randomSizes && components.includes(Collider)) {
      world.setComponent(eid, Collider, { width: rand() * 32 + 8, height: rand() * 32 + 8 });
    }
    if (components.includes(Visible)) {
      world.setComponent(eid, Visible, { value: 1 });
    }
  }
  return eids;
}

export function addSystem(world, SystemClass) {
  world.addSystem(new SystemClass());
}

export function addAllDefaultSystems(world) {
  world.addSystem(new MovementSystem());
  world.addSystem(new CollisionSystem());
  world.addSystem(new RenderSystem());
  world.addSystem(new TrailSystem());
}

export function registerDefaultResources(world) {
  world.setResource(SpatialHash, new SpatialHash());
  world.setResource(RenderQueue, new RenderQueue());
  world.setResource(TrailManager, new TrailManager());
  world.setResource(AnimationClipRegistry, { clips: new Map() });
}

export function createCanvasMock() {
  let pathCount = 0;
  let saveCount = 0;
  let restoreCount = 0;
  let commands = [];
  let mat = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

  function applyTranslate(x, y) {
    mat = { a: mat.a, b: mat.b, c: mat.c, d: mat.d, e: mat.a * x + mat.c * y + mat.e, f: mat.b * x + mat.d * y + mat.f };
  }

  function applyScale(sx, sy) {
    mat = { a: mat.a * sx, b: mat.b * sx, c: mat.c * sy, d: mat.d * sy, e: mat.e, f: mat.f };
  }

  function applyRotate(a) {
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const a2 = mat.a * cos + mat.c * sin;
    const c2 = mat.a * -sin + mat.c * cos;
    mat = { a: a2, b: mat.b * cos + mat.d * sin, c: c2, d: mat.b * -sin + mat.d * cos, e: mat.e, f: mat.f };
  }

  return {
    _reset() {
      pathCount = 0;
      saveCount = 0;
      restoreCount = 0;
      commands = [];
      mat = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    },
    get _pathCount() { return pathCount; },
    get _saveCount() { return saveCount; },
    get _restoreCount() { return restoreCount; },
    get _commands() { return commands; },
    get _matrix() { return mat; },

    save() { saveCount++; },
    restore() { restoreCount++; },
    translate(x, y) { commands.push(["translate", x, y]); applyTranslate(x, y); },
    rotate(a) { commands.push(["rotate", a]); applyRotate(a); },
    scale(x, y) { commands.push(["scale", x, y]); applyScale(x, y); },
    beginPath() { pathCount++; },
    moveTo(x, y) { commands.push(["moveTo", x, y]); },
    lineTo(x, y) { commands.push(["lineTo", x, y]); },
    stroke() { commands.push(["stroke"]); },
    fill() { commands.push(["fill"]); },
    arc(x, y, r, sa, ea) { commands.push(["arc", x, y, r, sa, ea]); },
    fillRect(x, y, w, h) { commands.push(["fillRect", x, y, w, h]); },
    drawImage(img, x, y, w, h) { commands.push(["drawImage", img, x, y, w, h]); },
    set fillStyle(v) { commands.push(["fillStyle", v]); },
    set strokeStyle(v) { commands.push(["strokeStyle", v]); },
    set lineWidth(v) { commands.push(["lineWidth", v]); },
    getTransform() { return mat; },
    setTransform(a, b, c, d, e, f) { mat = { a, b, c, d, e, f }; commands.push(["setTransform", a, b, c, d, e, f]); },
  };
}

export function createCamera() {
  return new Camera();
}

export function formatNs(ns) {
  if (ns < 1000) return `${ns.toFixed(0)} ns`;
  if (ns < 1_000_000) return `${(ns / 1000).toFixed(1)} µs`;
  return `${(ns / 1_000_000).toFixed(2)} ms`;
}

export function formatThroughput(ops) {
  if (ops < 1000) return `${ops.toFixed(0)} ops/sec`;
  if (ops < 1_000_000) return `${(ops / 1000).toFixed(1)} K ops/sec`;
  return `${(ops / 1_000_000).toFixed(2)} M ops/sec`;
}
