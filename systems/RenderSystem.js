import { Camera } from "../camera/Camera.js";

const IDENTITY = { x: 0, y: 0, width: 0, height: 0, zoom: 1, rotation: 0 };

export class RenderSystem {
  _getViewBounds(camera) {
    if (camera.width === 0) return null;
    const halfW = (camera.width * 0.5) / camera.zoom;
    const halfH = (camera.height * 0.5) / camera.zoom;
    return {
      left: camera.x - halfW,
      right: camera.x + halfW,
      top: camera.y - halfH,
      bottom: camera.y + halfH,
    };
  }

  _isVisible(entity, bounds) {
    if (!bounds) return true;

    const tx = entity.transform.x;
    const ty = entity.transform.y;
    const cw = entity.collider.width;
    const ch = entity.collider.height;

    if (entity.transform.rotation !== 0 ||
        entity.transform.scale.x !== 1 ||
        entity.transform.scale.y !== 1) {
      const hw = cw / 2 * entity.transform.scale.x;
      const hh = ch / 2 * entity.transform.scale.y;
      const r = Math.sqrt(hw * hw + hh * hh);
      return (tx + r) > bounds.left && (tx - r) < bounds.right &&
             (ty + r) > bounds.top && (ty - r) < bounds.bottom;
    }

    const l = tx - cw / 2;
    const r = tx + cw / 2;
    const t = ty - ch / 2;
    const b = ty + ch / 2;
    return r > bounds.left && l < bounds.right &&
           b > bounds.top && t < bounds.bottom;
  }

  _drawEntity(ctx, entity) {
    const cw = entity.collider.width;
    const ch = entity.collider.height;
    ctx.save();
    ctx.translate(entity.transform.x, entity.transform.y);
    ctx.rotate(entity.transform.rotation);
    ctx.scale(entity.transform.scale.x, entity.transform.scale.y);
    entity.renderable.draw(ctx, cw, ch);
    ctx.restore();
  }

  render(ctx, entities, camera) {
    camera ??= Camera.main ?? IDENTITY;
    const bounds = this._getViewBounds(camera);

    ctx.save();

    if (camera !== IDENTITY) {
      camera.apply(ctx);
    }

    for (const entity of entities) {
      if (!entity.visible) continue;
      if (!this._isVisible(entity, bounds)) continue;
      this._drawEntity(ctx, entity);
    }

    ctx.restore();
  }

  renderOne(ctx, entity, camera) {
    camera ??= Camera.main ?? IDENTITY;

    if (!entity.visible) return;
    if (!this._isVisible(entity, this._getViewBounds(camera))) return;

    ctx.save();

    if (camera !== IDENTITY) {
      camera.apply(ctx);
    }

    this._drawEntity(ctx, entity);
    ctx.restore();
  }
}

export const renderSystem = new RenderSystem();
