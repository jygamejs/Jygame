import { World } from "../ecs/core/World.js";
import { Transform } from "../ecs/components/Transform.js";
import { Velocity } from "../ecs/components/Velocity.js";
import { Collider } from "../ecs/components/Collider.js";
import { Renderable } from "../ecs/components/Renderable.js";
import { Animation } from "../ecs/components/Animation.js";
import { Visible } from "../ecs/components/Visible.js";
import { RenderBounds } from "../ecs/components/RenderBounds.js";
import { AnimationClipRegistry } from "../ecs/animation/AnimationClipRegistry.js";
import { AnimationClip } from "../ecs/animation/AnimationClip.js";
import { AssetRegistry } from "../ecs/render/AssetRegistry.js";

const _INTERNAL = Symbol("sprite.internal.wrap");
const _SPRITE_COMPONENTS = [Transform, Collider, Renderable, Visible, Velocity, Animation, RenderBounds];

export class Sprite {
  static _defaultWorld = null;

  static setDefaultWorld(world) {
    Sprite._defaultWorld = world;
  }

  static _ensureDefaultWorld() {
    if (!Sprite._defaultWorld) {
      const world = new World();
      for (let i = 0; i < _SPRITE_COMPONENTS.length; i++) {
        world.register(_SPRITE_COMPONENTS[i]);
      }
      Sprite._defaultWorld = world;
    }
    return Sprite._defaultWorld;
  }

  static _wrap(world, entity) {
    return new Sprite({ [_INTERNAL]: true, world, entity });
  }

  #world;
  #entity;
  #dead = false;

  constructor(x = 0, y = 0, w = 32, h = 32, world) {
    if (x && typeof x === "object" && _INTERNAL in x) {
      this.#world = x.world;
      this.#entity = x.entity;
      this.#dead = false;
      return;
    }
    this.#world = world || Sprite._ensureDefaultWorld();
    const wld = this.#world;

    const e = wld.createEntity();
    this.#entity = e;

    const defaultSmoothing = wld.hasResource("imageSmoothing.default") ? wld.getResource("imageSmoothing.default") : 1;

    wld.addMany(e, Transform, Collider, Renderable, Visible, RenderBounds);
    wld.set(e, Transform, { x: x + w / 2, y: y + h / 2, scaleX: 1, scaleY: 1, _prevX: x + w / 2, _prevY: y + h / 2 });
    wld.set(e, Collider, { width: w, height: h });
    wld.set(e, Renderable, { fillColor: 0xffffff, imageSmoothing: defaultSmoothing });
    wld.set(e, Visible, { value: 1 });
    wld.set(e, RenderBounds, { width: w, height: h });
  }

  get world() {
    return this.#world;
  }

  get entity() {
    return this.#entity;
  }

  _assertAlive() {
    if (this.#dead) {
      throw new Error("Sprite operation failed: sprite has been destroyed.");
    }
  }

  _getT() {
    return this.#world.get(this.#entity, Transform);
  }

  _getC() {
    return this.#world.get(this.#entity, Collider);
  }

  get transform() {
    this._assertAlive();
    return this._getT();
  }

  set transform(v) {
    this._assertAlive();
    const t = this._getT();
    if (v.x != null) t.x = v.x;
    if (v.y != null) t.y = v.y;
    if (v.rotation != null) t.rotation = v.rotation;
    if (v.scaleX != null) t.scaleX = v.scaleX;
    if (v.scaleY != null) t.scaleY = v.scaleY;
  }

  get collider() {
    this._assertAlive();
    return this._getC();
  }

  set collider(v) {
    this._assertAlive();
    const c = this._getC();
    if (v.width != null) c.width = v.width;
    if (v.height != null) c.height = v.height;
  }

  get velocity() {
    this._assertAlive();
    if (!this.#world.has(this.#entity, Velocity)) {
      this.#world.add(this.#entity, Velocity);
    }
    return this.#world.get(this.#entity, Velocity);
  }

  set velocity(v) {
    this._assertAlive();
    if (!this.#world.has(this.#entity, Velocity)) {
      this.#world.add(this.#entity, Velocity);
    }
    const vel = this.#world.get(this.#entity, Velocity);
    if (v && typeof v === "object") {
      if (v.x != null) vel.x = v.x;
      if (v.y != null) vel.y = v.y;
    }
  }

  get visible() {
    this._assertAlive();
    if (!this.#world.has(this.#entity, Visible)) {
      return false;
    }
    return !!this.#world.get(this.#entity, Visible).value;
  }

  set visible(v) {
    this._assertAlive();
    if (!this.#world.has(this.#entity, Visible)) {
      this.#world.add(this.#entity, Visible);
    }
    this.#world.get(this.#entity, Visible).value = v ? 1 : 0;
  }

  get renderable() {
    this._assertAlive();
    return this.#world.get(this.#entity, Renderable);
  }

  set renderable(v) {
    this._assertAlive();
    const r = this.#world.get(this.#entity, Renderable);
    if (v.image != null) r.image = v.image;
    if (v.fillColor != null) r.fillColor = v.fillColor;
    if (v.shape != null) r.shape = v.shape;
    if (v.layer != null) r.layer = v.layer;
  }

  get imageSmoothing() {
    this._assertAlive();
    return !!this.#world.get(this.#entity, Renderable).imageSmoothing;
  }

  set imageSmoothing(v) {
    this._assertAlive();
    this.#world.get(this.#entity, Renderable).imageSmoothing = v ? 1 : 0;
  }

  get x() { this._assertAlive(); return this._getT().x - this._getC().width / 2; }
  set x(v) { this._assertAlive(); this._getT().x = v + this._getC().width / 2; }

  get y() { this._assertAlive(); return this._getT().y - this._getC().height / 2; }
  set y(v) { this._assertAlive(); this._getT().y = v + this._getC().height / 2; }

  get width() { this._assertAlive(); return this._getC().width; }
  set width(v) { this._assertAlive(); this._getC().width = v; }

  get height() { this._assertAlive(); return this._getC().height; }
  set height(v) { this._assertAlive(); this._getC().height = v; }

  get image() { this._assertAlive(); return this.#world.get(this.#entity, Renderable).image; }
  set image(v) { this._assertAlive(); this.#world.get(this.#entity, Renderable).image = v; }

  get angle() { this._assertAlive(); return this._getT().rotation; }
  set angle(v) { this._assertAlive(); this._getT().rotation = v; }

  get scale() {
    this._assertAlive();
    const t = this._getT();
    return { x: t.scaleX, y: t.scaleY };
  }

  set scale(v) {
    this._assertAlive();
    const t = this._getT();
    if (typeof v === "number") {
      t.scaleX = v;
      t.scaleY = v;
    } else if (v && typeof v === "object") {
      if (v.x != null) t.scaleX = v.x;
      if (v.y != null) t.scaleY = v.y;
    }
  }

  get style() {
    this._assertAlive();
    if (!this._styleApi) {
      const self = this;
      this._styleApi = {
        get fill() {
          const r = self.#world.get(self.#entity, Renderable);
          return "#" + r.fillColor.toString(16).padStart(6, "0");
        },
        set fill(v) {
          const r = self.#world.get(self.#entity, Renderable);
          r.fillColor = parseInt(v.slice(1), 16);
        },
        get shape() {
          const r = self.#world.get(self.#entity, Renderable);
          return r.shape === 1 ? "circle" : "rect";
        },
        set shape(v) {
          const r = self.#world.get(self.#entity, Renderable);
          r.shape = v === "circle" ? 1 : 0;
        },
      };
    }
    return this._styleApi;
  }

  set style(v) {
    this._assertAlive();
    const r = this.#world.get(this.#entity, Renderable);
    if (v.fill) r.fillColor = parseInt(v.fill.slice(1), 16);
    if (v.shape) r.shape = v.shape === "circle" ? 1 : 0;
  }

  get animation() {
    this._assertAlive();
    const w = this.#world;
    const e = this.#entity;
    if (!w.has(e, Animation)) {
      w.add(e, Animation);
    }
    if (!this._animApi) {
      this._animApi = this._createAnimationApi();
    }
    return this._animApi;
  }

  set animation(v) {
    this._assertAlive();
    const w = this.#world;
    const e = this.#entity;
    if (!w.has(e, Animation)) {
      w.add(e, Animation);
    }
    const comp = w.get(e, Animation);
    if (v.playing != null) comp.isPlaying = v.playing ? 1 : 0;
    if (v.clipId != null) comp.clipId = v.clipId;
    if (v.frameIndex != null) comp.frameIndex = v.frameIndex;
    if (v.elapsed != null) comp.elapsed = v.elapsed;
    if (v.speed != null) comp.speed = v.speed;
  }

  _createAnimationApi() {
    const self = this;
    return {
      get animations() { return self._animMap; },
      set animations(v) { self._animMap = v; },

      get current() { return self._animCurrent; },
      set current(v) { self._animCurrent = v; },

      get playing() {
        const comp = self.#world.get(self.#entity, Animation);
        return !!comp.isPlaying;
      },
      set playing(v) {
        const comp = self.#world.get(self.#entity, Animation);
        comp.isPlaying = v ? 1 : 0;
      },

      _registerFrame(f) {
        const w = self.#world;
        if (!w || !w.hasResource(AssetRegistry) || !f || !f.sourceImage) return f;
        const reg = w.getResource(AssetRegistry);
        const id = reg.register(f);
        return id;
      },

      _toAssetClip(clip) {
        if (!clip || clip.frames.length === 0) return clip;
        if (typeof clip.frames[0] === "number") return clip;
        const ids = clip.frames.map((f) => this._registerFrame(f));
        return new AnimationClip({ frames: ids, fps: clip.fps, loop: clip.loop });
      },

      add(name, clip) {
        if (!self._animMap) self._animMap = new Map();
        const w = self.#world;
        const assetClip = this._toAssetClip(clip);
        self._animMap.set(name, assetClip);
        if (w && w.hasResource(AnimationClipRegistry)) {
          const reg = w.getResource(AnimationClipRegistry);
          if (!reg.has(name)) reg.register(name, assetClip);
        }
        return this;
      },

      addAll(animations) {
        if (!self._animMap) self._animMap = new Map();
        const w = self.#world;
        let reg = null;
        if (w && w.hasResource(AnimationClipRegistry)) {
          reg = w.getResource(AnimationClipRegistry);
        }
        for (const [name, clip] of Object.entries(animations)) {
          const assetClip = this._toAssetClip(clip);
          self._animMap.set(name, assetClip);
          if (reg && !reg.has(name)) reg.register(name, assetClip);
        }
        return this;
      },

      play(name) {
        self._animCurrent = name;
        const comp = self.#world.get(self.#entity, Animation);
        const map = self._animMap;
        if (map && map.has(name)) {
          const w = self.#world;
          if (w && w.hasResource(AnimationClipRegistry)) {
            const reg = w.getResource(AnimationClipRegistry);
            const id = reg.getId(name);
            if (id !== null) comp.clipId = id;
          }
        }
        comp.frameIndex = 0;
        comp.elapsed = 0;
        comp.isPlaying = 1;
        comp.speed = 1;
      },

      pause() {
        const comp = self.#world.get(self.#entity, Animation);
        comp.isPlaying = 0;
      },

      resume() {
        if (self._animCurrent) {
          const comp = self.#world.get(self.#entity, Animation);
          comp.isPlaying = 1;
        }
      },

      stop() {
        const comp = self.#world.get(self.#entity, Animation);
        comp.isPlaying = 0;
        comp.frameIndex = 0;
        comp.elapsed = 0;
      },

      onComplete(cb) {
        self._animCallback = cb;
        return this;
      },
    };
  }

  get groups() {
    return this._groups || (this._groups = []);
  }

  set groups(v) {
    this._groups = v;
  }

  kill() {
    const g = this._groups;
    if (g) {
      for (let i = g.length - 1; i >= 0; i--) {
        const group = g[i];
        if (group && typeof group.remove === "function") {
          group.remove(this);
        }
      }
      this._groups.length = 0;
    }
  }

  destroy() {
    if (this.#dead) return;
    this.kill();
    if (this.#world.isAlive(this.#entity)) {
      this.#world.destroyEntity(this.#entity);
    }
    this.#entity = 0;
    this.#dead = true;
  }
}
