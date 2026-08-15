import { World } from "../ecs/core/World.js";
import { Transform } from "../ecs/components/Transform.js";
import { Renderable } from "../ecs/components/Renderable.js";
import { Visible } from "../ecs/components/Visible.js";
import { Text as TextComponent } from "../ecs/components/Text.js";
import { TextResourcePool } from "../ecs/render/TextResourcePool.js";
import { Font } from "../loaders/Font.js";
import { Layer } from "../view/Layer.js";

const _INTERNAL = Symbol("text.internal.wrap");
const _TEXT_COMPONENTS = [Transform, Renderable, Visible, TextComponent];

export class Text {
  static _defaultWorld = null;

  static setDefaultWorld(world) {
    Text._defaultWorld = world;
  }

  static _ensureDefaultWorld() {
    if (!Text._defaultWorld) {
      const world = new World();
      for (let i = 0; i < _TEXT_COMPONENTS.length; i++) {
        world.register(_TEXT_COMPONENTS[i]);
      }
      world.setResource(TextResourcePool, new TextResourcePool());
      Text._defaultWorld = world;
    }
    return Text._defaultWorld;
  }

  static _wrap(world, entity) {
    return new Text({ [_INTERNAL]: true, world, entity });
  }

  static _resolveFont(font) {
    if (typeof font === "string") {
      const resolved = Font.get(font);
      if (!resolved) {
        throw new Error(
          `Text: font "${font}" not found. Load it with Font.load() before creating Text.`
        );
      }
      font = resolved;
    } else if (font == null || typeof font !== "object" || typeof font.id !== "number") {
      throw new TypeError("Text: font must be a registered font name or a Font instance.");
    }
    if (font.kind !== "bitmap") {
      throw new Error(
        "Text: native fonts are not supported for world-space text yet. " +
        "Use Font.render(ctx, ...) in renderUI()/render() for native font drawing."
      );
    }
    return font;
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

    let x = 0, y = 0, font = null, content = "", options = null;
    if (typeof a === "number" && typeof b === "number") {
      x = a;
      y = b;
      font = c;
      content = d === undefined ? "" : String(d);
      if (e && typeof e === "object") options = e;
    }
    if (font === null) {
      throw new TypeError("Text constructor: use new Text(x, y, font, content).");
    }

    this.#world = Text._ensureDefaultWorld();
    const wld = this.#world;

    let pool = wld.getResource(TextResourcePool);
    if (!pool) {
      pool = new TextResourcePool();
      wld.setResource(TextResourcePool, pool);
    }

    const fontObj = Text._resolveFont(font);
    const eid = wld.createEntity();
    this.#entity = eid;

    const defaultSmoothing = wld.hasResource("imageSmoothing.default") ? wld.getResource("imageSmoothing.default") : 1;

    wld.addMany(eid, Transform, Renderable, Visible, TextComponent);
    wld.set(eid, Transform, { x, y, scaleX: 1, scaleY: 1 });
    wld.set(eid, Renderable, { fillColor: 0xffffff, layer: Layer.WORLD, depth: 0, imageSmoothing: defaultSmoothing });
    wld.set(eid, Visible, { value: 1 });

    const contentHandle = pool.allocate(content);
    wld.set(eid, TextComponent, { fontHandle: fontObj.id, contentHandle, align: 0, letterSpacing: 0, version: 1 });

    if (options) {
      if (options.color != null) this.color = options.color;
      if (options.align != null) this.align = options.align;
      if (options.letterSpacing != null) this.letterSpacing = options.letterSpacing;
      if (options.layer != null) this.layer = options.layer;
      if (options.depth != null) this.depth = options.depth;
      if (options.scale != null) this.scale = options.scale;
      if (options.visible != null) this.visible = options.visible;
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
      throw new Error("Text operation failed: text has been destroyed.");
    }
  }

  _getT() {
    return this.#world.get(this.#entity, Transform);
  }

  _getR() {
    return this.#world.get(this.#entity, Renderable);
  }

  _getText() {
    return this.#world.get(this.#entity, TextComponent);
  }

  _getPool() {
    return this.#world.getResource(TextResourcePool) || null;
  }

  _bumpVersion() {
    this._getText().version += 1;
  }

  get value() {
    this._assertAlive();
    const t = this._getText();
    if (t.contentHandle === 0) return "";
    const pool = this._getPool();
    if (!pool) return "";
    const content = pool.get(t.contentHandle);
    return content == null ? "" : content;
  }

  set value(v) {
    this._assertAlive();
    const t = this._getText();
    const pool = this._getPool();
    if (t.contentHandle !== 0 && pool) {
      pool.setContent(t.contentHandle, String(v));
    }
    this._bumpVersion();
  }

  get text() { return this.value; }
  set text(v) { this.value = v; }

  get string() { return this.value; }
  set string(v) { this.value = v; }

  get font() {
    this._assertAlive();
    const t = this._getText();
    return t.fontHandle ? Font.byId(t.fontHandle) : null;
  }

  set font(v) {
    this._assertAlive();
    const resolved = Text._resolveFont(v);
    this._getText().fontHandle = resolved.id;
    this._bumpVersion();
  }

  get color() {
    this._assertAlive();
    return "#" + this._getR().fillColor.toString(16).padStart(6, "0");
  }

  set color(v) {
    this._assertAlive();
    const r = this._getR();
    if (typeof v === "number") {
      r.fillColor = v;
    } else if (typeof v === "string" && v[0] === "#") {
      r.fillColor = parseInt(v.slice(1), 16);
    } else {
      throw new TypeError("Text.color: expected a hex string or a number.");
    }
    this._bumpVersion();
  }

  get align() {
    this._assertAlive();
    const a = this._getText().align;
    return a === 1 ? "center" : a === 2 ? "right" : "left";
  }

  set align(v) {
    this._assertAlive();
    const t = this._getText();
    if (typeof v === "string") {
      if (v === "left") t.align = 0;
      else if (v === "center") t.align = 1;
      else if (v === "right") t.align = 2;
      else throw new TypeError("Text.align: expected 'left', 'center', 'right', or 0/1/2.");
    } else {
      t.align = v;
    }
    this._bumpVersion();
  }

  get letterSpacing() {
    this._assertAlive();
    return this._getText().letterSpacing;
  }

  set letterSpacing(v) {
    this._assertAlive();
    this._getText().letterSpacing = v;
    this._bumpVersion();
  }

  get layer() {
    this._assertAlive();
    return this._getR().layer;
  }

  set layer(v) {
    this._assertAlive();
    this._getR().layer = v;
  }

  get depth() {
    this._assertAlive();
    return this._getR().depth;
  }

  set depth(v) {
    this._assertAlive();
    this._getR().depth = v;
  }

  get x() { this._assertAlive(); return this._getT().x; }
  set x(v) { this._assertAlive(); this._getT().x = v; }

  get y() { this._assertAlive(); return this._getT().y; }
  set y(v) { this._assertAlive(); this._getT().y = v; }

  get angle() { this._assertAlive(); return this._getT().rotation; }
  set angle(v) { this._assertAlive(); this._getT().rotation = v; }

  get scale() { this._assertAlive(); return this._getT().scaleX; }
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

  get visible() {
    this._assertAlive();
    if (!this.#world.has(this.#entity, Visible)) return false;
    return !!this.#world.get(this.#entity, Visible).value;
  }

  set visible(v) {
    this._assertAlive();
    if (!this.#world.has(this.#entity, Visible)) {
      this.#world.add(this.#entity, Visible);
    }
    this.#world.get(this.#entity, Visible).value = v ? 1 : 0;
  }

  get width() {
    this._assertAlive();
    const t = this._getText();
    if (t.contentHandle === 0) return 0;
    const pool = this._getPool();
    if (!pool) return 0;
    const w = pool.width(t.contentHandle);
    return w == null ? 0 : w;
  }

  get height() {
    this._assertAlive();
    const t = this._getText();
    if (t.contentHandle === 0) return 0;
    const pool = this._getPool();
    if (!pool) return 0;
    const h = pool.height(t.contentHandle);
    return h == null ? 0 : h;
  }

  destroy() {
    if (this.#dead) return;
    if (this.#world.isAlive(this.#entity)) {
      const t = this.#world.get(this.#entity, TextComponent);
      const handle = t.contentHandle;
      const pool = this._getPool();
      if (pool && handle !== 0) pool.release(handle);
      this.#world.destroyEntity(this.#entity);
    }
    this.#entity = 0;
    this.#dead = true;
  }
}