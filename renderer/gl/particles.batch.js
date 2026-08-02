import { ParticleRenderCommandBuffer } from "../../particles/renderdata/ParticleRenderCommandBuffer.js";

const STRIDE = ParticleRenderCommandBuffer.STRIDE;

// Reads command `i` from a `ParticleRenderCommandBuffer` into a reusable plain
// object (no allocation). The texture is copied from the buffer's parallel
// texture array; colors are already normalized to 0..1.
export function readParticleInstance(buffer, i, out) {
  const d = buffer.data;
  const off = i * STRIDE;
  out.x = d[off];
  out.y = d[off + 1];
  out.rotation = d[off + 2];
  out.size = d[off + 3];
  out.width = d[off + 4];
  out.height = d[off + 5];
  out.alpha = d[off + 6];
  out.r = d[off + 7];
  out.g = d[off + 8];
  out.b = d[off + 9];
  out.originX = d[off + 10];
  out.originY = d[off + 11];
  out.frameX = d[off + 13];
  out.frameY = d[off + 14];
  out.frameWidth = d[off + 15];
  out.frameHeight = d[off + 16];
  out.texture = buffer.textures[i];
  return out;
}

// Rebuilds the backend's per-frame particle render command buffer without
// drawing (mirrors the sort + fill step the backends do inside `render`).
// Works for both the CPU backend and the GPU operator backend, which share the
// `_sortManager` / `_buildRenderData` / `_commandBuffer` shape.
export function buildBackendCommandBuffer(backend) {
  const count = backend.activeCount;
  if (!count) return null;

  let renderData;
  const sort = backend._sortManager;
  if (!sort || sort.sortMode === "none") {
    renderData = backend._buildRenderData(null, count);
  } else {
    sort.sort();
    renderData = backend._buildRenderData(sort.sortedIndices, count);
  }

  const buf = backend._commandBuffer;
  buf.clear();
  renderData.fillCommandBuffer(buf);
  return buf;
}
