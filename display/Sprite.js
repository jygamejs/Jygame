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
import { Layer } from "../view/Layer.js";

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

  constructor(a, b, c, d, e) {
    if (a && typeof a === "object" && _INTERNAL in a) {
      this.#world = a.world;
      this.#entity = a.entity;
      this.#dead = false;
      return;
    }

    let x = 0, y = 0, w = 32, h = 32, image = null, world = undefined;
    let explicitSize = false;

    if (a === undefined) {
      // new Sprite()
    } else if (typeof a === "string" || (a && (a.nodeType === 1 || a.sourceImage || typeof a.width === "number"))) {
      // new Sprite(image) — string URL, HTMLImageElement, canvas, or asset descriptor
      image = a;
    } else if (typeof a === "number") {
      x = a;
      if (typeof b === "number") {
        y = b;
        if (c === undefined) {
          // new Sprite(x, y)
        } else if (typeof c === "number") {
          w = c;
          if (typeof d === "number") {
            h = d;
            explicitSize = true;
            // new Sprite(x, y, w, h) or new Sprite(x, y, w, h, image/world)
            if (e !== undefined) {
              if (e instanceof World) {
                world = e;
              } else {
                image = e;
              }
            }
          } else if (d !== undefined) {
            // new Sprite(x, y, w, image) — 4th arg is image
            image = d;
          }
        } else {
          // new Sprite(x, y, image)
          image = c;
        }
      } else if (b !== undefined) {
        throw new TypeError(
          "Sprite constructor: use new Sprite(x, y), new Sprite(x, y, image), or new Sprite(x, y, w, h)."
        );
      }
    }

    this.#world = world || Sprite._ensureDefaultWorld();
    const wld = this.#world;

    const eid = wld.createEntity();
    this.#entity = eid;

    const defaultSmoothing = wld.hasResource("imageSmoothing.default") ? wld.getResource("imageSmoothing.default") : 1;

    wld.addMany(eid, Transform, Collider, Renderable, Visible, RenderBounds);
    wld.set(eid, Transform, { x: x + w / 2, y: y + h / 2, scaleX: 1, scaleY: 1, _prevX: x + w / 2, _prevY: y + h / 2 });
    wld.set(eid, Collider, { width: w, height: h });
    wld.set(eid, Renderable, { fillColor: 0xffffff, imageSmoothing: defaultSmoothing, layer: Layer.WORLD, nativeWidth: explicitSize ? w : 0, nativeHeight: explicitSize ? h : 0 });
    wld.set(eid, Visible, { value: 1 });
    wld.set(eid, RenderBounds, { width: w, height: h });

    if (image !== null) {
      this.image = image;
    }
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

  _getRB() {
    if (this.#world.has(this.#entity, RenderBounds)) {
      return this.#world.get(this.#entity, RenderBounds);
    }
    return this._getC();
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

  get layer() {
    this._assertAlive();
    return this.#world.get(this.#entity, Renderable).layer;
  }

  set layer(v) {
    this._assertAlive();
    this.#world.get(this.#entity, Renderable).layer = v;
  }

  get imageSmoothing() {
    this._assertAlive();
    return !!this.#world.get(this.#entity, Renderable).imageSmoothing;
  }

  set imageSmoothing(v) {
    this._assertAlive();
    this.#world.get(this.#entity, Renderable).imageSmoothing = v ? 1 : 0;
  }

  get x() { this._assertAlive(); return this._getT().x - this.width / 2; }
  set x(v) { this._assertAlive(); this._getT().x = v + this.width / 2; }

  get y() { this._assertAlive(); return this._getT().y - this.height / 2; }
  set y(v) { this._assertAlive(); this._getT().y = v + this.height / 2; }

  get width() {
    this._assertAlive();
    return this._getRB().width * Math.abs(this._getT().scaleX);
  }
  set width(v) {
    this._assertAlive();
    const scale = Math.abs(this._getT().scaleX) || 1;
    this._getRB().width = v / scale;
  }

  get height() {
    this._assertAlive();
    return this._getRB().height * Math.abs(this._getT().scaleY);
  }
  set height(v) {
    this._assertAlive();
    const scale = Math.abs(this._getT().scaleY) || 1;
    this._getRB().height = v / scale;
  }

  get nativeWidth() {
    this._assertAlive();
    return this.#world.get(this.#entity, Renderable).nativeWidth;
  }

  get nativeHeight() {
    this._assertAlive();
    return this.#world.get(this.#entity, Renderable).nativeHeight;
  }

  get scaledWidth() {
    this._assertAlive();
    return this.width;
  }

  get scaledHeight() {
    this._assertAlive();
    return this.height;
  }

  get left()   { this._assertAlive(); return this.x; }
  set left(v)  { this._assertAlive(); this.x = v; }

  get right()   { this._assertAlive(); return this.x + this.width; }
  set right(v)  { this._assertAlive(); this.x = v - this.width; }

  get top()    { this._assertAlive(); return this.y; }
  set top(v)   { this._assertAlive(); this.y = v; }

  get bottom()   { this._assertAlive(); return this.y + this.height; }
  set bottom(v)  { this._assertAlive(); this.y = v - this.height; }

  get centerx()  { this._assertAlive(); return this.x + this.width / 2; }
  set centerx(v) { this._assertAlive(); this.x = v - this.width / 2; }

  get centery()  { this._assertAlive(); return this.y + this.height / 2; }
  set centery(v) { this._assertAlive(); this.y = v - this.height / 2; }

  get center()  { this._assertAlive(); return { x: this.centerx, y: this.centery }; }
  set center(v) { this._assertAlive(); this.centerx = v.x; this.centery = v.y; }

  get midtop()    { this._assertAlive(); return { x: this.x, y: this.y }; }
  set midtop(v)   { this._assertAlive(); this.x = v.x; this.y = v.y; }

  get midleft()   { this._assertAlive(); return { x: this.x, y: this.centery }; }
  set midleft(v)  { this._assertAlive(); this.x = v.x; this.centery = v.y; }

  get midbottom()    { this._assertAlive(); return { x: this.x, y: this.bottom }; }
  set midbottom(v)   { this._assertAlive(); this.x = v.x; this.bottom = v.y; }

  get midright()     { this._assertAlive(); return { x: this.right, y: this.centery }; }
  set midright(v)    { this._assertAlive(); this.right = v.x; this.centery = v.y; }

  _resolveNativeSize(w, h) {
    const r = this.#world.get(this.#entity, Renderable);
    if (r.nativeWidth === 0 && r.nativeHeight === 0) {
      r.nativeWidth = w;
      r.nativeHeight = h;
      if (this.#world.has(this.#entity, RenderBounds)) {
        const rb = this.#world.get(this.#entity, RenderBounds);
        rb.width = w;
        rb.height = h;
      }
    }
  }

  _resolveFromClip(name, clip) {
    if (!clip || !clip.frames || clip.frames.length === 0) return;
    const frame = clip.frames[0];
    if (typeof frame !== "number") return;
    if (!this.#world.hasResource(AssetRegistry)) return;
    const reg = this.#world.getResource(AssetRegistry);
    const asset = reg.get(frame);
    if (asset) {
      this._resolveNativeSize(asset.sw, asset.sh);
    }
  }

  get image() { this._assertAlive(); return this.#world.get(this.#entity, Renderable).image; }
  set image(v) {
    this._assertAlive();
    const w = this.#world;
    if (v && typeof v === "object" && w.hasResource(AssetRegistry)) {
      const reg = w.getResource(AssetRegistry);
      let desc = null;
      if (v.sourceImage) {
        desc = v;
      } else if (typeof v.width === "number" || v.nodeType === 1) {
        desc = {
          sourceImage: v,
          sx: 0, sy: 0,
          sw: v.width ?? v.naturalWidth ?? 0,
          sh: v.height ?? v.naturalHeight ?? 0,
        };
      }
      if (desc) {
        const id = reg.register(desc);
        w.get(this.#entity, Renderable).image = id;
        this._resolveNativeSize(desc.sw, desc.sh);
        return;
      }
    }
    w.get(this.#entity, Renderable).image = v;
    if (w.hasResource(AssetRegistry)) {
      const reg = w.getResource(AssetRegistry);
      const asset = reg.get(v);
      if (asset) {
        this._resolveNativeSize(asset.sw, asset.sh);
      }
    }
  }

  get angle() { this._assertAlive(); return this._getT().rotation; }
  set angle(v) { this._assertAlive(); this._getT().rotation = v; }

  get scale() {
    this._assertAlive();
    return this._getT().scaleX;
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
        if (self._animCurrent === name) return this;
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
          self._resolveFromClip(name, map.get(name));
        }
        comp.frameIndex = 0;
        comp.elapsed = 0;
        comp.isPlaying = 1;
        comp.speed = 1;
      },

      restart(name) {
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
          self._resolveFromClip(name, map.get(name));
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
