import { Collider } from "../components/Collider.js";

export class SpatialHash {
  constructor(cellSize = 64) {
    this.cellSize = cellSize;
    this.cells = new Map();
    this._seen = new Set();
  }

  rebuild(entities) {
    this.cells.clear();
    this._queryStamp = 0;
    for (let i = 0; i < entities.length; i++) {
      const e = entities[i];
      if (!e.visible) continue;
      e.__shId = i;
      e.__shStamp = 0;
      this._insert(e);
    }
  }

  _insert(entity) {
    const cx = entity.transform.x;
    const cy = entity.transform.y;
    const hw = entity.collider.width / 2;
    const hh = entity.collider.height / 2;
    const left = Math.floor((cx - hw) / this.cellSize);
    const right = Math.floor((cx + hw) / this.cellSize);
    const top = Math.floor((cy - hh) / this.cellSize);
    const bottom = Math.floor((cy + hh) / this.cellSize);

    for (let x = left; x <= right; x++) {
      for (let y = top; y <= bottom; y++) {
        const key = `${x}:${y}`;
        let cell = this.cells.get(key);
        if (!cell) {
          cell = [];
          this.cells.set(key, cell);
        }
        cell.push(entity);
      }
    }
  }

  collideGroup(other, cbOrOut) {
    const isCallback = typeof cbOrOut === 'function';
    const pairs = isCallback ? null : (cbOrOut || []);
    this._seen.clear();

    for (const [key, aList] of this.cells) {
      const bList = other.cells.get(key);
      if (!bList) continue;

      for (const sa of aList) {
        for (const sb of bList) {
          const ka = sa.__shId;
          const kb = sb.__shId;
          const seenKey = ka < kb ? (ka << 16) | kb : (kb << 16) | ka;
          if (this._seen.has(seenKey)) continue;
          this._seen.add(seenKey);
          if (!Collider.checkAABB(sa.transform, sa.collider, sb.transform, sb.collider)) continue;
          if (isCallback) {
            cbOrOut(sa, sb);
          } else {
            pairs.push([sa, sb]);
          }
        }
      }
    }
    return pairs;
  }

  collideRect(rect, out) {
    this._queryStamp++;
    const hits = out || [];

    const left = Math.floor(rect.left / this.cellSize);
    const right = Math.floor(rect.right / this.cellSize);
    const top = Math.floor(rect.top / this.cellSize);
    const bottom = Math.floor(rect.bottom / this.cellSize);

    for (let x = left; x <= right; x++) {
      for (let y = top; y <= bottom; y++) {
        const cell = this.cells.get(`${x}:${y}`);
        if (!cell) continue;
        for (const entity of cell) {
          if (entity.__shStamp === this._queryStamp) continue;
          entity.__shStamp = this._queryStamp;
          if (Collider.checkRect(entity.transform, entity.collider, rect)) {
            hits.push(entity);
          }
        }
      }
    }
    return hits;
  }

  collidePoint(point, out) {
    const hits = out || [];
    const key = `${Math.floor(point.x / this.cellSize)}:${Math.floor(point.y / this.cellSize)}`;
    const cell = this.cells.get(key);
    if (!cell) return hits;
    for (const entity of cell) {
      if (Collider.containsPoint(entity.transform, entity.collider, point)) {
        hits.push(entity);
      }
    }
    return hits;
  }

  collideSprite(entity, out) {
    this._queryStamp++;
    const hits = out || [];
    const sx = entity.transform.x;
    const sy = entity.transform.y;
    const shw = entity.collider.width / 2;
    const shh = entity.collider.height / 2;

    const left = Math.floor((sx - shw) / this.cellSize);
    const right = Math.floor((sx + shw) / this.cellSize);
    const top = Math.floor((sy - shh) / this.cellSize);
    const bottom = Math.floor((sy + shh) / this.cellSize);

    for (let x = left; x <= right; x++) {
      for (let y = top; y <= bottom; y++) {
        const cell = this.cells.get(`${x}:${y}`);
        if (!cell) continue;
        for (const s of cell) {
          if (s.__shId === entity.__shId) continue;
          if (s.__shStamp === this._queryStamp) continue;
          s.__shStamp = this._queryStamp;
          if (Collider.checkAABB(s.transform, s.collider, entity.transform, entity.collider)) {
            hits.push(s);
          }
        }
      }
    }
    return hits;
  }
}
