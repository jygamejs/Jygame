import { renderSystem } from "../systems/RenderSystem.js";
import { collisionSystem } from "../systems/CollisionSystem.js";

export class Group {
  constructor() {
    this._sprites = [];
  }

  [Symbol.iterator]() {
    return this._sprites[Symbol.iterator]();
  }

  useSpatialHash(cellSize = 64) {
    collisionSystem.useSpatialHash(this, this._sprites, cellSize);
    return this;
  }

  add(sprite) {
    if (this._sprites.includes(sprite)) return;
    this._sprites.push(sprite);
    sprite.groups.push(this);
  }

  remove(sprite) {
    const idx = this._sprites.indexOf(sprite);
    if (idx === -1) return;
    this._sprites.splice(idx, 1);
    const gidx = sprite.groups.indexOf(this);
    if (gidx !== -1) sprite.groups.splice(gidx, 1);
  }

  has(sprite) {
    return this._sprites.includes(sprite);
  }

  clear() {
    for (const sprite of this._sprites) {
      const gidx = sprite.groups.indexOf(this);
      if (gidx !== -1) sprite.groups.splice(gidx, 1);
    }
    this._sprites.length = 0;
  }

  get length() {
    return this._sprites.length;
  }

  render(ctx, viewport) {
    renderSystem.render(ctx, this._sprites, viewport);
  }

  forEach(fn) {
    this._sprites.forEach(fn);
  }

  filter(fn) {
    return this._sprites.filter(fn);
  }

  map(fn) {
    return this._sprites.map(fn);
  }

  collideRect(rect, out) {
    return collisionSystem.collideRect(this, rect, out);
  }

  collidePoint(point, out) {
    return collisionSystem.collidePoint(this, point, out);
  }

  collideGroup(other, out) {
    return collisionSystem.collideGroup(this, other, out);
  }

  collideSprite(sprite, out) {
    return collisionSystem.collideSprite(this, sprite, out);
  }
}
