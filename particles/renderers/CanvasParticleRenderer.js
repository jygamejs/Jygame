import { ParticleRenderer } from "./ParticleRenderer.js";
import { ParticleRenderCommandBuffer } from "../renderdata/ParticleRenderCommandBuffer.js";

const _tmpCmd = {};

export class CanvasParticleRenderer extends ParticleRenderer {
  constructor(opts = {}) {
    super(opts);
    this._cmdBuffer = new ParticleRenderCommandBuffer();
  }

  render(data, ctx) {
    if (data.count === 0) return;

    let buffer = data;

    if (!(data instanceof ParticleRenderCommandBuffer)) {
      this._cmdBuffer.clear();
      data.fillCommandBuffer(this._cmdBuffer);
      buffer = this._cmdBuffer;
    }

    const d = buffer._data;
    const t = buffer._textures;
    const stride = ParticleRenderCommandBuffer.STRIDE;

    ctx.save();

    if (this._renderParticle) {
      for (let i = 0; i < buffer.count; i++) {
        buffer.read(i, _tmpCmd);
        this._renderParticle(ctx, _tmpCmd._p);
      }
      ctx.restore();
      return;
    }

    for (let i = 0; i < buffer.count; i++) {
      const off = i * stride;
      const x = d[off];
      const y = d[off + 1];
      const rotation = d[off + 2];
      const size = d[off + 3];
      const width = d[off + 4];
      const height = d[off + 5];
      const alpha = d[off + 6];
      const r = d[off + 7] * 255 | 0;
      const g = d[off + 8] * 255 | 0;
      const b = d[off + 9] * 255 | 0;
      const originX = d[off + 10];
      const originY = d[off + 11];
      const frameX = d[off + 13];
      const frameY = d[off + 14];
      const frameWidth = d[off + 15];
      const frameHeight = d[off + 16];
      const texture = t[i];

      ctx.globalAlpha = alpha;

      if (texture) {
        const w = width > 0 ? width : size;
        const h = height > 0 ? height : size;
        ctx.save();
        ctx.translate(x, y);
        if (rotation) ctx.rotate(rotation);
        if (frameWidth > 0 && frameHeight > 0) {
          ctx.drawImage(texture, frameX, frameY, frameWidth, frameHeight, -w * originX, -h * originY, w, h);
        } else {
          ctx.drawImage(texture, -w * originX, -h * originY, w, h);
        }
        ctx.restore();
      } else {
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x - size * 0.5, y - size * 0.5, size, size);
      }
    }

    ctx.restore();
  }
}
