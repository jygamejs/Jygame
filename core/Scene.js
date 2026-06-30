import { Input } from "../input/Input.js";

import { World } from "../ecs/core/World.js";
import { Transform } from "../ecs/components/Transform.js";
import { Velocity } from "../ecs/components/Velocity.js";
import { Collider } from "../ecs/components/Collider.js";
import { Renderable } from "../ecs/components/Renderable.js";
import { RenderBounds } from "../ecs/components/RenderBounds.js";
import { Animation } from "../ecs/components/Animation.js";
import { Visible } from "../ecs/components/Visible.js";
import { Trail } from "../ecs/components/Trail.js";
import { EnemyTag } from "../ecs/components/tags/EnemyTag.js";
import { PlayerTag } from "../ecs/components/tags/PlayerTag.js";
import { ProjectileTag } from "../ecs/components/tags/ProjectileTag.js";
import { StaticTag } from "../ecs/components/tags/StaticTag.js";

import { MovementSystem } from "../ecs/systems/MovementSystem.js";
import { AnimationSystem } from "../ecs/systems/AnimationSystem.js";
import { CollisionSystem } from "../ecs/systems/CollisionSystem.js";
import { RenderSystem } from "../ecs/systems/RenderSystem.js";
import { TrailSystem } from "../ecs/systems/TrailSystem.js";

import { RenderQueue } from "../ecs/render/RenderQueue.js";
import { CanvasContext } from "../ecs/render/CanvasContext.js";
import { AnimationClipRegistry } from "../ecs/animation/AnimationClipRegistry.js";
import { TrailManager } from "../ecs/trails/TrailManager.js";
import { SpatialHash } from "../collision/SpatialHash.js";
import { Camera } from "../camera/Camera.js";
import { Sprite } from "../display/Sprite.js";

const _ECS_COMPONENTS = [
  Transform, Velocity, Collider,
  Renderable, RenderBounds,
  Animation, Visible, Trail,
  EnemyTag, PlayerTag, ProjectileTag, StaticTag,
];

const _ECS_SYSTEMS = [
  MovementSystem,
  AnimationSystem,
  CollisionSystem,
  RenderSystem,
  TrailSystem,
];

export class Scene {
  constructor() {
    this.dom = null;
    this.root = document.createElement("div");
    this.root.style.position = "absolute";
    this.root.style.inset = "0";
    this._cleanups = [];
    this._entered = false;
    this._exited = false;
    this._game = null;
    this.blocksUpdateBelow = true;
    this.blocksRenderBelow = false;

    this._world = null;
    this._prevDefaultWorld = null;
    this._ecsResources = {};
  }

  get world() {
    if (!this._world) {
      this._initECS();
    }
    return this._world;
  }

  _initECS() {
    const world = new World();

    for (let i = 0; i < _ECS_COMPONENTS.length; i++) {
      world.register(_ECS_COMPONENTS[i]);
    }

    world.setResource(SpatialHash, new SpatialHash());
    world.setResource(TrailManager, new TrailManager());
    world.setResource(RenderQueue, new RenderQueue());
    world.setResource(AnimationClipRegistry, new AnimationClipRegistry());

    this._world = world;
  }

  _installSystems() {
    const world = this._world;
    if (!world) return;

    for (let i = 0; i < _ECS_SYSTEMS.length; i++) {
      world.addSystem(new _ECS_SYSTEMS[i]());
    }

    if (this._game) {
      world.setResource(CanvasContext, this._game.ctx);

      const cam = new Camera(0, 0, this._game.width, this._game.height);
      world.setResource(Camera, cam);
    }
  }

  on(target, event, handler) {
    target.addEventListener(event, handler);
    this._cleanups.push(() => target.removeEventListener(event, handler));
  }

  onSwipe(cb) {
    this._cleanups.push(Input.onSwipe(cb));
  }

  onTap(cb) {
    this._cleanups.push(Input.onTap(cb));
  }

  cleanup(fn) {
    this._cleanups.push(fn);
  }

  enter() {
    if (this._entered) {
      throw new Error("Scene.enter() called more than once");
    }
    this._entered = true;

    this.world;
    this._installSystems();

    this._prevDefaultWorld = Sprite._defaultWorld;
    Sprite._defaultWorld = this._world;
  }

  exit() {
    if (this._exited) {
      throw new Error("Scene.exit() called more than once");
    }
    this._exited = true;

    for (const fn of this._cleanups) {
      try { fn(); } catch (err) { console.error(err); }
    }
    this._cleanups = [];

    if (Sprite._defaultWorld === this._world) {
      Sprite._defaultWorld = this._prevDefaultWorld;
    }

    if (this._world) {
      this._world.clearSystems();
      this._world.clearResources();
      this._world = null;
    }
  }

  pause() {}
  resume() {}
  update(dt) {}
  interpolate(alpha) {}
  render(ctx) {}
  renderUI() {}

  pushScene(scene) {
    if (this.game) this.game.pushScene(scene);
  }

  popScene() {
    if (this.game) this.game.popScene();
  }

  replaceScene(scene) {
    if (this.game) this.game.replaceScene(scene);
  }

  switchScene(scene) {
    if (this.game) this.game.switchScene(scene);
  }

  transitionTo(scene) {
    this.switchScene(scene);
  }
}
