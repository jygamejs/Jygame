export class AssetRegistry {
  constructor() {
    this._assets = new Map();
    this._nextId = 1;
  }

  register(asset) {
    if (!asset || !asset.sourceImage) {
      throw new TypeError(
        'AssetRegistry.register failed: asset must have a sourceImage property.'
      );
    }
    const id = this._nextId++;
    const img = asset.sourceImage;
    this._assets.set(id, {
      sourceImage: img,
      sx: asset.sx ?? 0,
      sy: asset.sy ?? 0,
      sw: asset.sw ?? (img.width ?? img.naturalWidth ?? 0),
      sh: asset.sh ?? (img.height ?? img.naturalHeight ?? 0),
    });
    return id;
  }

  get(id) {
    return this._assets.get(id) ?? null;
  }

  get size() {
    return this._assets.size;
  }

  clear() {
    this._assets.clear();
    this._nextId = 1;
  }
}
