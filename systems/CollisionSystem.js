import { Collider } from "../components/Collider.js";
import { SpatialHash } from "../collision/SpatialHash.js";

export class CollisionSystem {
  constructor() {
    this._groups = new Map();
  }

  useSpatialHash(group, entities, cellSize = 64) {
    this._groups.set(group, {
      strategy: new SpatialHash(cellSize),
      entities,
    });
  }

  removeGroup(group) {
    this._groups.delete(group);
  }

  beginFrame() {
    for (const [, entry] of this._groups) {
      if (entry.strategy) {
        entry.strategy.rebuild(entry.entities);
      }
    }
  }

  _query(entities, predicate, out) {
    const hits = out || [];
    for (const entity of entities) {
      if (!entity.visible) continue;
      if (predicate(entity)) {
        hits.push(entity);
      }
    }
    return hits;
  }

  _queryPairs(entitiesA, entitiesB, predicate, cbOrOut) {
    const isCallback = typeof cbOrOut === "function";
    const pairs = isCallback ? null : (cbOrOut || []);

    for (const a of entitiesA) {
      if (!a.visible) continue;
      for (const b of entitiesB) {
        if (!b.visible) continue;
        if (predicate(a, b)) {
          if (isCallback) {
            cbOrOut(a, b);
          } else {
            pairs.push([a, b]);
          }
        }
      }
    }
    return pairs;
  }

  collideRect(entities, rect, out) {
    const e = this._groups.get(entities);
    if (e && e.strategy) {
      return e.strategy.collideRect(rect, out || []);
    }
    return this._query(entities, s =>
      Collider.checkRect(s.transform, s.collider, rect), out);
  }

  collidePoint(entities, point, out) {
    const e = this._groups.get(entities);
    if (e && e.strategy) {
      return e.strategy.collidePoint(point, out || []);
    }
    return this._query(entities, s =>
      Collider.containsPoint(s.transform, s.collider, point), out);
  }

  collideGroup(entitiesA, entitiesB, cbOrOut) {
    const eA = this._groups.get(entitiesA);
    const eB = this._groups.get(entitiesB);
    if (eA && eA.strategy && eB && eB.strategy) {
      return eA.strategy.collideGroup(eB.strategy, cbOrOut);
    }
    return this._queryPairs(entitiesA, entitiesB, (a, b) =>
      Collider.checkAABB(a.transform, a.collider, b.transform, b.collider), cbOrOut);
  }

  collideSprite(entities, sprite, out) {
    if (!sprite.visible) return out || [];
    const e = this._groups.get(entities);
    if (e && e.strategy) {
      return e.strategy.collideSprite(sprite, out || []);
    }
    return this._query(entities, s =>
      Collider.checkAABB(s.transform, s.collider, sprite.transform, sprite.collider), out);
  }
}

export const collisionSystem = new CollisionSystem();
