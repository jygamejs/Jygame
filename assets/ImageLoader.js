const _cache = new Map();

async function _decode(img, path) {
  if (typeof img.decode !== "function") return;
  try {
    await img.decode();
  } catch (err) {
    console.warn(`Image decode failed for ${path}, rendering may be deferred:`, err);
  }
}

export const ImageLoader = {
  load(path, options = {}) {
    const decode = options.decode !== false;

    if (_cache.has(path)) return Promise.resolve(_cache.get(path));

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = async () => {
        if (decode) await _decode(img, path);
        _cache.set(path, img);
        resolve(img);
      };
      img.onerror = () => reject(new Error(`Failed to load image: ${path}`));
      img.src = path;
    });
  },

  loadAll(map, options) {
    const entries = Object.entries(map);
    return Promise.all(
      entries.map(([key, path]) =>
        this.load(path, options).then((img) => {
          _cache.set(key, img);
          return [key, img];
        })
      )
    ).then((results) => Object.fromEntries(results));
  },

  get(key) {
    return _cache.get(key) || null;
  },

  has(key) {
    return _cache.has(key);
  },

  unload(key) {
    return _cache.delete(key);
  },

  clear() {
    _cache.clear();
  },
};
