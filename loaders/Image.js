import { ImageLoader } from "./ImageLoader.js";
import { LoadingTask } from "./LoadingTask.js";
import { AnimationPack } from "../ecs/animation/AnimationPack.js";

const _namedCache = new Map();
const _animationSets = new Map();

function _isObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function _isBatchMap(a) {
  if (!_isObject(a)) return false;
  for (const v of Object.values(a)) {
    if (typeof v !== "string") return false;
  }
  return true;
}

function _detectStrategy(config) {
  if (config.path) return "individual";
  if (config.json) return "jsonAtlas";
  if (config.sliceX != null || config.sliceY != null) return "spriteSheet";
  if (config.image) return "atlas";
  return null;
}

function _isAnimationEntry(key) {
  return key !== "name" && key !== "image" && key !== "path"
    && key !== "json" && key !== "defaults"
    && key !== "sliceX" && key !== "sliceY"
    && key !== "margin" && key !== "spacing" && key !== "columns"
    && key !== "frameWidth" && key !== "frameHeight";
}

function _normalizeEntry(value, defaults) {
  if (typeof value === "number") {
    if (value < 1 || !Number.isInteger(value)) {
      throw new Error(`Image.animate: frame count must be a positive integer, got ${value}.`);
    }
    return { frames: value };
  }
  if (_isObject(value)) return { ...value };
  throw new TypeError(`Image.animate: invalid animation entry. Expected number or object, got ${typeof value}.`);
}

export const Image = {

  // ── Image.load ──

  load(a, b, c) {
    if (typeof a === "string") {
      if (typeof b === "string") {
        return this._loadNamed(a, b, _isObject(c) ? c : {});
      }
      return this._loadSingle(a, _isObject(b) ? b : {});
    }
    if (_isBatchMap(a)) {
      return this._loadBatch(a, _isObject(b) ? b : {});
    }
    throw new TypeError(
      "Image.load: expected a path string, a (name, path) pair, or a batch object."
    );
  },

  async _loadSingle(path, options) {
    if (_namedCache.has(path)) return _namedCache.get(path);
    const img = await ImageLoader.load(path, options);
    _namedCache.set(path, img);
    return img;
  },

  async _loadNamed(name, path, options) {
    if (_namedCache.has(name)) return _namedCache.get(name);
    const img = await ImageLoader.load(path, options);
    _namedCache.set(name, img);
    _namedCache.set(path, img);
    return img;
  },

  _loadBatch(map, options) {
    const entries = Object.entries(map);
    const results = {};
    const task = new LoadingTask(() => results);
    task.expect(entries.length);

    for (const [name, path] of entries) {
      if (_namedCache.has(name)) {
        results[name] = _namedCache.get(name);
        task.done();
        continue;
      }
      ImageLoader.load(path, options).then((img) => {
        results[name] = img;
        _namedCache.set(name, img);
        _namedCache.set(path, img);
        task.done();
      }).catch((err) => task.fail(err));
    }

    return task;
  },

  // ── Image.animate ──

  async animate(config) {
    if (!_isObject(config)) {
      throw new TypeError("Image.animate: config must be an object.");
    }

    const name = config.name;
    const strategy = _detectStrategy(config);

    if (!strategy) {
      throw new TypeError(
        "Image.animate: unable to detect loading strategy. " +
        "Provide one of: path (individual files), image+json (texture atlas), " +
        "image+sliceX/sliceY (sprite sheet), or image+frame entries (atlas region)."
      );
    }

    let result;

    switch (strategy) {
      case "individual": {
        const { path, defaults, ...rest } = config;
        const packConfig = { path };
        if (defaults) packConfig.defaults = defaults;

        const entries = Object.keys(rest).filter(k => k !== "name");
        const autoFlat = entries.length === 1
          && typeof rest[entries[0]] === "number";

        for (const key of entries) {
          let entry = rest[key];
          if (autoFlat) {
            entry = { frames: entry, folder: "." };
          }
          packConfig[key] = entry;
        }
        result = await AnimationPack.load(packConfig);
        break;
      }

      case "jsonAtlas": {
        const { image, json, defaults, ...rest } = config;
        const packConfig = { image, json };
        if (defaults) packConfig.defaults = defaults;
        for (const key of Object.keys(rest)) {
          if (key === "name") continue;
          packConfig[key] = rest[key];
        }
        result = await AnimationPack.fromJSONAtlas(packConfig);
        break;
      }

      case "spriteSheet": {
        const resolvedImage = await AnimationPack._resolveImage(config.image);
        const imgW = resolvedImage.width ?? resolvedImage.naturalWidth ?? 0;
        const imgH = resolvedImage.height ?? resolvedImage.naturalHeight ?? 0;
        const sliceX = config.sliceX ?? 1;
        const sliceY = config.sliceY ?? 1;
        const frameWidth = config.frameWidth ?? (imgW / sliceX);
        const frameHeight = config.frameHeight ?? (imgH / sliceY);
        const cols = config.columns ?? sliceX;

        const { image, sliceX: sx, sliceY: sy, defaults, columns, margin, spacing, ...rest } = config;
        const packConfig = { image: resolvedImage, frameWidth, frameHeight };
        if (cols !== undefined) packConfig.columns = cols;
        if (margin != null) packConfig.margin = margin;
        if (spacing != null) packConfig.spacing = spacing;
        if (defaults) packConfig.defaults = defaults;

        for (const key of Object.keys(rest)) {
          if (key === "name") continue;
          const entry = _normalizeEntry(rest[key], defaults || {});
          let frameStart = 0;
          let frameCount;
          if (entry.from != null) {
            frameStart = entry.from;
            frameCount = entry.to != null ? entry.to - entry.from + 1 : entry.frames;
          } else {
            frameCount = entry.frames;
          }
          if (!frameCount || frameCount < 1) {
            throw new Error(`Image.animate: animation "${key}" must specify a positive frame count.`);
          }
          const row = Math.floor(frameStart / cols);
          const col = frameStart % cols;
          packConfig[key] = {
            frames: frameCount,
            row,
            column: col,
            fps: entry.fps,
            loop: entry.loop,
            pingPong: entry.pingPong,
            crop: entry.crop,
          };
        }

        result = await AnimationPack.fromSpriteSheet(packConfig);
        break;
      }

      case "atlas": {
        const { image, defaults, ...rest } = config;
        const packConfig = { image };
        if (defaults) packConfig.defaults = defaults;
        for (const key of Object.keys(rest)) {
          if (key === "name") continue;
          packConfig[key] = rest[key];
        }
        result = await AnimationPack.fromAtlas(packConfig);
        break;
      }
    }

    if (name) {
      _animationSets.set(name, result);
    }

    return result;
  },

  // ── Image retrieval ──

  get(key) {
    return _namedCache.get(key) || ImageLoader.get(key) || null;
  },

  has(key) {
    return _namedCache.has(key) || ImageLoader.has(key);
  },

  remove(key) {
    _animationSets.delete(key);
    _namedCache.delete(key);
    return ImageLoader.unload(key);
  },

  clear() {
    _animationSets.clear();
    _namedCache.clear();
    ImageLoader.clear();
  },

  // Internal (exported for Sprite integration)
  _animationSets,
};
