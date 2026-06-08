import { Collider } from "../components/Collider.js";
import { SpatialHash } from "../collision/SpatialHash.js";

export class CollisionSystem {
  constructor() {
    this._groups = new Map();
  }

  useSpatialHash(group, sprites, cellSize = 64) {
    this._groups.set(group, {
      spatial: new SpatialHash(cellSize),
      sprites,
    });
  }

  removeGroup(group) {
    this._groups.delete(group);
  }

  beginFrame() {
    for (const [, entry] of this._groups) {
      if (entry.spatial) {
        entry.spatial.rebuild(entry.sprites);
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

  _queryPairs(entitiesA, entitiesB, predicate, out) {
    const pairs = out || [];
    for (const a of entitiesA) {
      if (!a.visible) continue;
      for (const b of entitiesB) {
        if (!b.visible) continue;
        if (predicate(a, b)) {
          pairs.push([a, b]);
        }
      }
    }
    return pairs;
  }

  collideRect(entities, rect, out) {
    const e = this._groups.get(entities);
    if (e && e.spatial) {
      return e.spatial.collideRect(rect, out || []);
    }
    return this._query(entities, s =>
      Collider.checkRect(s.transform, s.collider, rect), out);
  }

  collidePoint(entities, point, out) {
    const e = this._groups.get(entities);
    if (e && e.spatial) {
      return e.spatial.collidePoint(point, out || []);
    }
    return this._query(entities, s =>
      Collider.containsPoint(s.transform, s.collider, point), out);
  }

  collideGroup(entitiesA, entitiesB, out) {
    const eA = this._groups.get(entitiesA);
    const eB = this._groups.get(entitiesB);
    if (eA && eA.spatial && eB && eB.spatial) {
      return eA.spatial.collideGroup(eB.spatial, out || []);
    }
    return this._queryPairs(entitiesA, entitiesB, (a, b) =>
      Collider.checkAABB(a.transform, a.collider, b.transform, b.collider), out);
  }

  collideSprite(entities, sprite, out) {
    if (!sprite.visible) return out || [];
    const e = this._groups.get(entities);
    if (e && e.spatial) {
      return e.spatial.collideSprite(sprite, out || []);
    }
    return this._query(entities, s =>
      Collider.checkAABB(s.transform, s.collider, sprite.transform, sprite.collider), out);
  }
}

export const collisionSystem = new CollisionSystem();
