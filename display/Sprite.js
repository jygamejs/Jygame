import { World } from "../ecs/core/World.js";
import { Transform } from "../ecs/components/Transform.js";
import { Velocity } from "../ecs/components/Velocity.js";
import { Collider } from "../ecs/components/Collider.js";
import { Renderable } from "../ecs/components/Renderable.js";
import { Animation } from "../ecs/components/Animation.js";
import { Visible } from "../ecs/components/Visible.js";
import { RenderBounds } from "../ecs/components/RenderBounds.js";
import { AnimationClipRegistry } from "../ecs/animation/AnimationClipRegistry.js";
import { AnimationCallbacks } from "../ecs/animation/AnimationCallbacks.js";
import { AnimationClip } from "../ecs/animation/AnimationClip.js";
import { AnimationPlayback, AnimationPlaybackState, LoopOverride, PlaybackMode, startPlayback } from "../ecs/animation/AnimationPlayback.js";
import { AssetRegistry } from "../ecs/render/AssetRegistry.js";
import { SpatialHash } from "../collision/SpatialHash.js";
import { Layer } from "../view/Layer.js";
import { Image } from "../loaders/Image.js";

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
  #_hasExplicitCollider = false;

  constructor(a, b, c, d, e) {
    if (a && typeof a === "object" && _INTERNAL in a) {
      this.#world = a.world;
      this.#entity = a.entity;
      this.#dead = false;
      return;
    }

    let x = 0, y = 0, w = 0, h = 0, image = null, world = undefined;
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
    this.#_hasExplicitCollider = explicitSize;

    const defaultSmoothing = wld.hasResource("imageSmoothing.default") ? wld.getResource("imageSmoothing.default") : 1;

    wld.addMany(eid, Transform, Collider, Renderable, Visible, RenderBounds);
    // _prevX/_prevY are seeded to the spawn position and marked valid so the
    // sprite interpolates from where it appeared rather than being skipped
    // (or, previously, dragged in from the origin) on its first tick.
    wld.set(eid, Transform, { x: x + w / 2, y: y + h / 2, scaleX: 1, scaleY: 1, _prevX: x + w / 2, _prevY: y + h / 2, _interpValid: 1 });
    wld.set(eid, Collider, { width: w, height: h });
    wld.set(eid, Renderable, { fillColor: 0xffffff, imageSmoothing: defaultSmoothing, layer: Layer.WORLD, nativeWidth: explicitSize ? w : 0, nativeHeight: explicitSize ? h : 0 });
    wld.set(eid, Visible, { value: 1 });
    wld.set(eid, RenderBounds, { width: w, height: h });

    if (image !== null) {
      this.image = image;
      if (typeof image === "string") {
        const animSet = Image._animationSets.get(image);
        if (animSet) {
          this.animation.addAll(animSet);
        }
      }
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
    if (v.scaleX != null || v.scaleY != null) this._syncCollider();
  }

  get collider() {
    this._assertAlive();
    return this._getC();
  }

  set collider(v) {
    this._assertAlive();
    this.#_hasExplicitCollider = true;
    const c = this._getC();
    if (v.width != null) c.width = v.width;
    if (v.height != null) c.height = v.height;
    if (v.offsetX != null) c.offsetX = v.offsetX;
    if (v.offsetY != null) c.offsetY = v.offsetY;
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

  get depth() {
    this._assertAlive();
    return this.#world.get(this.#entity, Renderable).depth;
  }

  set depth(v) {
    this._assertAlive();
    this.#world.get(this.#entity, Renderable).depth = v;
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
    this._syncCollider();
  }

  get height() {
    this._assertAlive();
    return this._getRB().height * Math.abs(this._getT().scaleY);
  }
  set height(v) {
    this._assertAlive();
    const scale = Math.abs(this._getT().scaleY) || 1;
    this._getRB().height = v / scale;
    this._syncCollider();
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

  get midtop()    { this._assertAlive(); return { x: this.centerx, y: this.y }; }
  set midtop(v)   { this._assertAlive(); this.centerx = v.x; this.y = v.y; }

  get midleft()   { this._assertAlive(); return { x: this.x, y: this.centery }; }
  set midleft(v)  { this._assertAlive(); this.x = v.x; this.centery = v.y; }

  get midbottom()    { this._assertAlive(); return { x: this.centerx, y: this.bottom }; }
  set midbottom(v)   { this._assertAlive(); this.centerx = v.x; this.bottom = v.y; }

  get midright()     { this._assertAlive(); return { x: this.right, y: this.centery }; }
  set midright(v)    { this._assertAlive(); this.right = v.x; this.centery = v.y; }

  get bounds() {
    this._assertAlive();
    if (!this._boundsApi) {
      const self = this;
      this._boundsApi = {
        get x()       { return self.x; },
        get y()       { return self.y; },
        get width()   { return self.width; },
        get height()  { return self.height; },
        get left()    { return self.left; },
        get right()   { return self.right; },
        get top()     { return self.top; },
        get bottom()  { return self.bottom; },
        get centerx() { return self.centerx; },
        get centery() { return self.centery; },
        get center()  { return { x: self.centerx, y: self.centery }; },

        _r(other) {
          const l = other.left ?? other.x;
          const t = other.top ?? other.y;
          return {
            left: l,
            right: other.right ?? (l + (other.width ?? other.w ?? 0)),
            top: t,
            bottom: other.bottom ?? (t + (other.height ?? other.h ?? 0)),
          };
        },

        collides(other) {
          const r = this._r(other);
          return this.left < r.right && this.right > r.left
            && this.top < r.bottom && this.bottom > r.top;
        },

        overlap(other) {
          const r = this._r(other);
          const ix = Math.max(this.left, r.left);
          const iy = Math.max(this.top, r.top);
          const iw = Math.min(this.right, r.right) - ix;
          const ih = Math.min(this.bottom, r.bottom) - iy;
          if (iw <= 0 || ih <= 0) return null;
          return { x: ix, y: iy, width: iw, height: ih };
        },

        contains(point) {
          const l = this.left, r = this.right;
          const t = this.top, b = this.bottom;
          return point.x >= l && point.x <= r && point.y >= t && point.y <= b;
        },
      };
    }
    return this._boundsApi;
  }

  get hitbox() {
    this._assertAlive();
    if (!this._hitboxApi) {
      const self = this;
      this._hitboxApi = {
        get _t() { return self._getT(); },
        get _c() { return self._getC(); },

        get x() {
          const t = this._t, c = this._c;
          return t.x + (c.offsetX ?? 0) - c.width / 2;
        },
        get y() {
          const t = this._t, c = this._c;
          return t.y + (c.offsetY ?? 0) - c.height / 2;
        },
        get width()   { return this._c.width; },
        get height()  { return this._c.height; },
        get left()    { return this.x; },
        get right()   { return this.x + this.width; },
        get top()     { return this.y; },
        get bottom()  { return this.y + this.height; },
        get centerx() {
          const t = this._t, c = this._c;
          return t.x + (c.offsetX ?? 0);
        },
        get centery() {
          const t = this._t, c = this._c;
          return t.y + (c.offsetY ?? 0);
        },
        get center()  { return { x: this.centerx, y: this.centery }; },

        _r(other) {
          const l = other.left ?? other.x;
          const t = other.top ?? other.y;
          return {
            left: l,
            right: other.right ?? (l + (other.width ?? other.w ?? 0)),
            top: t,
            bottom: other.bottom ?? (t + (other.height ?? other.h ?? 0)),
          };
        },

        collides(other) {
          const r = this._r(other);
          return this.left < r.right && this.right > r.left
            && this.top < r.bottom && this.bottom > r.top;
        },

        overlap(other) {
          const r = this._r(other);
          const ix = Math.max(this.left, r.left);
          const iy = Math.max(this.top, r.top);
          const iw = Math.min(this.right, r.right) - ix;
          const ih = Math.min(this.bottom, r.bottom) - iy;
          if (iw <= 0 || ih <= 0) return null;
          return { x: ix, y: iy, width: iw, height: ih };
        },

        contains(point) {
          return point.x >= this.left && point.x <= this.right
            && point.y >= this.top && point.y <= this.bottom;
        },
      };
    }
    return this._hitboxApi;
  }

  collidesAny(group) {
    this._assertAlive();
    if (!this.visible) return null;

    const ta = this._getT(), ca = this._getC();
    const ax = ta.x + (ca.offsetX ?? 0), ay = ta.y + (ca.offsetY ?? 0);

    // Group with SpatialHash
    if (group && group._spatialHash) {
      group._buildHash();
      const ids = group._spatialHash.queryAABB(ax, ay, ca.width, ca.height, []);
      for (let i = 0; i < ids.length; i++) {
        const other = group._getOrWrap(ids[i]);
        if (other && other !== this && other.visible) return other;
      }
      return null;
    }

    // Array or iterable (forEach, or has .length)
    const items = Array.isArray(group) ? group : group;
    if (items.forEach) {
      let result = null;
      items.forEach(other => {
        if (result) return;
        if (other === this || !other.visible || !other._getC) return;
        const tb = other._getT(), cb = other._getC();
        const bx = tb.x + (cb.offsetX ?? 0), by = tb.y + (cb.offsetY ?? 0);
        if (ax - ca.width / 2 < bx + cb.width / 2
         && ax + ca.width / 2 > bx - cb.width / 2
         && ay - ca.height / 2 < by + cb.height / 2
         && ay + ca.height / 2 > by - cb.height / 2) {
          result = other;
        }
      });
      return result;
    }

    return null;
  }

  distanceTo(other) {
    this._assertAlive();
    if (!other) return Infinity;
    const ta = this._getT();
    let ox, oy;
    if (other._getT) {
      ox = other._getT().x;
      oy = other._getT().y;
    } else {
      ox = other.x ?? 0;
      oy = other.y ?? 0;
    }
    const dx = ta.x - ox;
    const dy = ta.y - oy;
    return Math.sqrt(dx * dx + dy * dy);
  }

  queryNearby(radius) {
    this._assertAlive();
    const w = this.#world;
    if (!w.hasResource(SpatialHash)) return [];
    const hash = w.getResource(SpatialHash);
    const ta = this._getT(), ca = this._getC();
    const cx = ta.x + (ca.offsetX ?? 0);
    const cy = ta.y + (ca.offsetY ?? 0);
    const ids = radius != null
      ? hash.queryCircle(cx, cy, radius, [])
      : hash.queryAABB(cx, cy, ca.width, ca.height, []);
    const result = [];
    for (let i = 0; i < ids.length; i++) {
      if (ids[i] === this.#entity) continue;
      result.push(Sprite._wrap(w, ids[i]));
    }
    return result;
  }

  collides(other) {
    this._assertAlive();
    if (!other) return false;

    // Sprite-vs-Sprite
    if (other._getC && other._assertAlive) {
      try { other._assertAlive(); } catch { return false; }
      if (!other.visible) return false;
      const ta = this._getT(), ca = this._getC();
      const tb = other._getT(), cb = other._getC();
      const ax = ta.x + (ca.offsetX ?? 0), ay = ta.y + (ca.offsetY ?? 0);
      const bx = tb.x + (cb.offsetX ?? 0), by = tb.y + (cb.offsetY ?? 0);
      return ax - ca.width / 2 < bx + cb.width / 2
          && ax + ca.width / 2 > bx - cb.width / 2
          && ay - ca.height / 2 < by + cb.height / 2
          && ay + ca.height / 2 > by - cb.height / 2;
    }

    // Rect-like object
    const l = other.left ?? other.x;
    const t = other.top ?? other.y;
    const r = other.right ?? (l + (other.width ?? other.w ?? 0));
    const b = other.bottom ?? (t + (other.height ?? other.h ?? 0));

    const ta2 = this._getT(), ca2 = this._getC();
    const cx = ta2.x + (ca2.offsetX ?? 0), cy = ta2.y + (ca2.offsetY ?? 0);
    const hl = cx - ca2.width / 2, hr = cx + ca2.width / 2;
    const ht = cy - ca2.height / 2, hb = cy + ca2.height / 2;
    return hl < r && hr > l && ht < b && hb > t;
  }

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
      this._syncCollider();
    }
  }

  _syncCollider() {
    if (this.#_hasExplicitCollider) return;
    const rb = this._getRB();
    const t = this._getT();
    const w = rb.width * Math.abs(t.scaleX);
    const h = rb.height * Math.abs(t.scaleY);
    if (w > 0 && h > 0) {
      const c = this._getC();
      c.width = w;
      c.height = h;
    }
  }

  resetCollider() {
    this._assertAlive();
    this.#_hasExplicitCollider = false;
    const c = this._getC();
    c.width = 0;
    c.height = 0;
    c.offsetX = 0;
    c.offsetY = 0;
    this._syncCollider();
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

  _showInitialFrame() {
    if (this._getPlaybackState().current) return;
    if (!this._animMap || this._animMap.size === 0) return;
    const first = this._animMap.values().next().value;
    if (!first || !first.frames || first.frames.length === 0) return;
    const frame = first.frames[0];
    if (typeof frame !== "number") return;
    const w = this.#world;
    if (w.hasResource(AssetRegistry)) {
      const reg = w.getResource(AssetRegistry);
      const current = w.get(this.#entity, Renderable).image;
      if (current && reg.get(current)) return;
    }
    const r = w.get(this.#entity, Renderable);
    r.image = frame;
    this._resolveFromClip(null, first);
  }

  // The authoritative playback intent for this sprite. Lives in the world's
  // AnimationPlayback resource when available (so the AnimationSystem shares
  // it); falls back to a sprite-local object for resource-less worlds.
  _getPlaybackState() {
    const w = this.#world;
    if (w && w.hasResource(AnimationPlayback)) {
      return w.getResource(AnimationPlayback).get(this.#entity);
    }
    if (!this._animPlayback) this._animPlayback = new AnimationPlaybackState();
    return this._animPlayback;
  }

  _startPlayback(name, mode, opts = {}) {
    const w = this.#world;
    const state = this._getPlaybackState();
    const registry = w.hasResource(AnimationClipRegistry) ? w.getResource(AnimationClipRegistry) : null;
    const ok = startPlayback(w, this.#entity, registry, state, name, mode, opts);
    if (ok) {
      const map = this._animMap;
      if (map && map.has(name)) this._resolveFromClip(name, map.get(name));
    }
    return ok;
  }

  // Resolve a marker against one named animation. Markers are animation-relative
  // and the public API names both the animation and the marker, so there is no
  // implicit search and no ambiguity. Throws descriptive errors for either.
  _resolveClipMarker(name, marker) {
    if (typeof name !== "string" || name.length === 0) {
      throw new TypeError(
        `Animation name must be a non-empty string, got ${JSON.stringify(name)}.`
      );
    }
    if (typeof marker !== "string" || marker.length === 0) {
      throw new TypeError(
        `Animation marker must be a non-empty string, got ${JSON.stringify(marker)}.`
      );
    }
    const map = this._animMap;
    const clip = map && map.get(name);
    if (!clip) {
      throw new Error(`Unknown animation "${name}".`);
    }
    const markers = clip.markers;
    if (!markers || !Object.prototype.hasOwnProperty.call(markers, marker)) {
      throw new Error(`Animation "${name}" has no marker "${marker}".`);
    }
    return { clip, position: markers[marker] };
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
    this._syncCollider();
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

      get current() { return self._getPlaybackState().current; },
      set current(v) { self._getPlaybackState().current = v; },

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
        return new AnimationClip({
          frames: ids,
          fps: clip.fps,
          loop: clip.loop,
          // timing/markers survive the asset-id remap. sequence/pingPong are
          // already baked into the normalized `clip.frames` and must not be
          // re-applied to the reconstructed playback list.
          timing: clip.timing ?? undefined,
          markers: clip.markers ?? undefined,
        });
      },

      _clipKey(name) {
        return `${self.#entity}:${name}`;
      },

      add(name, clip) {
        if (!self._animMap) self._animMap = new Map();
        const w = self.#world;
        const assetClip = this._toAssetClip(clip);
        self._animMap.set(name, assetClip);
        if (w && w.hasResource(AnimationClipRegistry)) {
          const reg = w.getResource(AnimationClipRegistry);
          const key = this._clipKey(name);
          if (!reg.has(key)) reg.register(key, assetClip);
        }
        self._showInitialFrame();
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
          if (reg) {
            const key = this._clipKey(name);
            if (!reg.has(key)) reg.register(key, assetClip);
          }
        }
        self._showInitialFrame();
        return this;
      },

      play(name, options = {}) {
        const anim = self.#world.get(self.#entity, Animation);
        const state = self._getPlaybackState();

        if (options && options.force) {
          // Forced playback owns the sprite until it completes. It clears any
          // pending temporary sequence and is immune to ordinary play() calls.
          state.queue.length = 0;
          self._startPlayback(name, PlaybackMode.FORCED, {
            loop: options.loop === false
              ? LoopOverride.NON_LOOP
              : options.loop === true
                ? LoopOverride.LOOP
                : LoopOverride.RESPECT_CLIP,
            hold: options.resume === false,
          });
          return this;
        }

        // A persistent request: always remember the latest normal intent.
        state.requested = name;

        // Temporary or forced playback owns the screen — just record the
        // request and let the controller resume it later.
        if (anim.mode === PlaybackMode.ONCE ||
            anim.mode === PlaybackMode.QUEUED ||
            anim.mode === PlaybackMode.FORCED) {
          return this;
        }

        // Already the active persistent animation → do not restart it.
        if (state.current === name) return this;

        self._startPlayback(name, PlaybackMode.NORMAL, { loop: LoopOverride.RESPECT_CLIP });
        return this;
      },

      playOnce(name) {
        const anim = self.#world.get(self.#entity, Animation);
        // A forced animation has authority over playback; one-shots cannot
        // interrupt it (queue explicitly if that is the intent).
        if (anim.mode === PlaybackMode.FORCED) return this;
        // A new one-shot replaces the current temporary sequence.
        self._getPlaybackState().queue.length = 0;
        self._startPlayback(name, PlaybackMode.ONCE, { loop: LoopOverride.NON_LOOP });
        return this;
      },

      queue(name) {
        const anim = self.#world.get(self.#entity, Animation);
        const state = self._getPlaybackState();
        if (anim.mode === PlaybackMode.FORCED) return this;
        if (anim.mode === PlaybackMode.ONCE ||
            anim.mode === PlaybackMode.QUEUED ||
            state.queue.length > 0) {
          state.queue.push(name);
          return this;
        }
        // No active temporary playback and an empty queue → start immediately.
        self._startPlayback(name, PlaybackMode.QUEUED, { loop: LoopOverride.NON_LOOP });
        return this;
      },

      clearQueue() {
        self._getPlaybackState().queue.length = 0;
        return this;
      },

      restart(name) {
        const state = self._getPlaybackState();
        state.requested = name;
        self._startPlayback(name, PlaybackMode.NORMAL, { loop: LoopOverride.RESPECT_CLIP });
        return this;
      },

      playUntil(name, marker) {
        const anim = self.#world.get(self.#entity, Animation);
        const state = self._getPlaybackState();
        const { position } = self._resolveClipMarker(name, marker);

        // A forced animation owns the sprite; only a marker inside that clip
        // may arm it (same ownership rule playOnce() uses).
        if (anim.mode === PlaybackMode.FORCED && state.current !== name) return this;

        if (state.current === name) {
          // Arm the marker on the clip already owning playback. Force finite
          // playback so a later resume() runs to completion instead of looping.
          if (anim.frameIndex >= position) {
            anim.isPlaying = 0;
          } else {
            anim.loop = LoopOverride.NON_LOOP;
            anim.stopAt = position + 1;
            anim.isPlaying = 1;
          }
          return this;
        }

        // Start the targeted clip as a temporary one-shot that pauses at the
        // marker; the persistent request is left untouched for later resume.
        state.queue.length = 0;
        self._startPlayback(name, PlaybackMode.ONCE, { loop: LoopOverride.NON_LOOP });
        anim.stopAt = position + 1;
        return this;
      },

      pauseAt(name, marker) {
        const anim = self.#world.get(self.#entity, Animation);
        const state = self._getPlaybackState();
        const { position } = self._resolveClipMarker(name, marker);
        if (state.current !== name) {
          throw new Error(
            `Animation.pauseAt("${name}", "${marker}") failed: animation "${name}" is not ` +
            (state.current ? `the currently playing animation ("${state.current}").` : "currently playing.")
          );
        }
        if (anim.frameIndex >= position) {
          anim.isPlaying = 0;
          return this;
        }
        // Arming a marker makes the playback finite so a later resume() runs
        // to completion instead of looping forever.
        anim.loop = LoopOverride.NON_LOOP;
        anim.stopAt = position + 1;
        return this;
      },

      pause() {
        const comp = self.#world.get(self.#entity, Animation);
        comp.stopAt = 0;
        comp.isPlaying = 0;
      },

      resume() {
        if (self._getPlaybackState().current) {
          const comp = self.#world.get(self.#entity, Animation);
          comp.stopAt = 0;
          comp.isPlaying = 1;
        }
      },

      stop() {
        const comp = self.#world.get(self.#entity, Animation);
        comp.isPlaying = 0;
        comp.frameIndex = 0;
        comp.elapsed = 0;
        comp.mode = PlaybackMode.NORMAL;
        comp.loop = LoopOverride.RESPECT_CLIP;
        comp.stopAt = 0;
        const state = self._getPlaybackState();
        state.queue.length = 0;
        state.current = null;
      },

      onComplete(cb) {
        self._animCallback = cb;
        const w = self.#world;
        if (w && w.hasResource(AnimationCallbacks)) {
          w.getResource(AnimationCallbacks).set(self.#entity, cb);
        }
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
