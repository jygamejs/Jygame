const SORT_MODES = new Set([
  "none", "age", "reverseAge", "size", "reverseSize",
  "depth", "reverseDepth", "custom",
]);

export class ParticleSortManager {
  constructor(storage) {
    this._storage = storage;
    this._sortMode = "none";
    this._sortFunction = null;
    this.sortEveryFrame = false;
    this._sortDirty = false;
    this._sortedIndices = null;
    this._sortCounter = 0;
  }

  get sortMode() { return this._sortMode; }

  set sortMode(value) {
    if (!SORT_MODES.has(value)) {
      throw new Error(
        `ParticleSortManager.sortMode: unknown mode "${value}". ` +
        `Valid modes: ${Array.from(SORT_MODES).join(", ")}`
      );
    }
    if (value === this._sortMode) return;
    this._sortMode = value;
    this._sortDirty = true;
    if (value !== "custom") {
      this._sortFunction = null;
    }
  }

  get sortFunction() { return this._sortFunction; }

  set sortFunction(value) {
    if (this._sortMode === "custom" && typeof value !== "function") {
      throw new Error(
        "ParticleSortManager.sortFunction: must be a function when sortMode is \"custom\""
      );
    }
    this._sortFunction = value;
    this._sortDirty = true;
  }

  get sortedParticleCount() {
    return this._sortMode !== "none" ? this._storage.activeCount : 0;
  }

  get sortedIndices() {
    return this._sortedIndices;
  }

  nextSortOrder() {
    return this._sortCounter++;
  }

  markDirty() {
    this._sortDirty = true;
  }

  _ensureSortIndices(minSize) {
    if (!this._sortedIndices || this._sortedIndices.length < minSize) {
      this._sortedIndices = new Array(minSize);
    }
  }

  _getComparator() {
    const storage = this._storage;

    switch (this._sortMode) {
      case "age":
        return (a, b) => {
          const d = storage.getFieldValue(b, "ageRatio") - storage.getFieldValue(a, "ageRatio");
          return d !== 0 ? d : storage.getSortOrder(a) - storage.getSortOrder(b);
        };
      case "reverseAge":
        return (a, b) => {
          const d = storage.getFieldValue(a, "ageRatio") - storage.getFieldValue(b, "ageRatio");
          return d !== 0 ? d : storage.getSortOrder(a) - storage.getSortOrder(b);
        };
      case "size":
        return (a, b) => {
          const va = storage.getFieldValue(a, "size");
          const vb = storage.getFieldValue(b, "size");
          if (!Number.isFinite(va) || !Number.isFinite(vb)) {
            throw new Error(
              `ParticleSystem: particle.size must be finite, got ${va} and ${vb}`
            );
          }
          const d = va - vb;
          return d !== 0 ? d : storage.getSortOrder(a) - storage.getSortOrder(b);
        };
      case "reverseSize":
        return (a, b) => {
          const va = storage.getFieldValue(a, "size");
          const vb = storage.getFieldValue(b, "size");
          if (!Number.isFinite(va) || !Number.isFinite(vb)) {
            throw new Error(
              `ParticleSystem: particle.size must be finite, got ${va} and ${vb}`
            );
          }
          const d = vb - va;
          return d !== 0 ? d : storage.getSortOrder(a) - storage.getSortOrder(b);
        };
      case "depth":
        return (a, b) => {
          const va = storage.getFieldValue(a, "depth");
          const vb = storage.getFieldValue(b, "depth");
          if (!Number.isFinite(va) || !Number.isFinite(vb)) {
            throw new Error(
              `ParticleSystem: particle.depth must be finite, got ${va} and ${vb}`
            );
          }
          const d = va - vb;
          return d !== 0 ? d : storage.getSortOrder(a) - storage.getSortOrder(b);
        };
      case "reverseDepth":
        return (a, b) => {
          const va = storage.getFieldValue(a, "depth");
          const vb = storage.getFieldValue(b, "depth");
          if (!Number.isFinite(va) || !Number.isFinite(vb)) {
            throw new Error(
              `ParticleSystem: particle.depth must be finite, got ${va} and ${vb}`
            );
          }
          const d = vb - va;
          return d !== 0 ? d : storage.getSortOrder(a) - storage.getSortOrder(b);
        };
      case "custom":
        return (a, b) => {
          const pa = storage.resolveParticle(a);
          const pb = storage.resolveParticle(b);
          const sortFn = this._sortFunction;
          const d = sortFn(pa, pb);
          if (typeof d !== "number" || !Number.isFinite(d)) {
            throw new Error(
              `ParticleSystem custom sortFunction returned invalid value ${d}. Must return a finite number.`
            );
          }
          return d !== 0 ? d : storage.getSortOrder(a) - storage.getSortOrder(b);
        };
      default:
        return null;
    }
  }

  sort() {
    if (this.sortEveryFrame) {
      this._sortDirty = true;
    }
    if (!this._sortDirty) return;

    const count = this._storage.activeCount;
    this._ensureSortIndices(count);
    const buf = this._sortedIndices;

    for (let i = 0; i < count; i++) {
      buf[i] = i;
    }

    if (count > 1) {
      const cmp = this._getComparator();
      if (cmp) {
        const savedLen = buf.length;
        buf.length = count;
        buf.sort(cmp);
        buf.length = savedLen;
      }
    }

    this._sortDirty = false;
  }

  destroy() {
    this._sortedIndices = null;
    this._sortFunction = null;
    this._storage = null;
  }
}
