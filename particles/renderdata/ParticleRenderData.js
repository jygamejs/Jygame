export class ParticleRenderData {
  constructor(storage, indices, count) {
    this._storage = storage;
    this._indices = indices;
    this._count = count;
  }

  get count() {
    return this._count;
  }

  getParticle(i) {
    if (this._indices) {
      return this._storage.resolveParticle(this._indices[i]);
    }
    return this._storage.resolveParticle(i);
  }

  fillCommandBuffer(buffer) {
    if (this._indices) {
      for (let i = 0; i < this._count; i++) {
        buffer.append(this._storage.resolveParticle(this._indices[i]));
      }
    } else {
      for (let i = 0; i < this._count; i++) {
        buffer.append(this._storage.resolveParticle(i));
      }
    }
  }

  destroy() {
    this._storage = null;
    this._indices = null;
  }
}
