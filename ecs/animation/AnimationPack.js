import { ImageLoader } from "../../loaders/ImageLoader.js";
import { AnimationClip } from "./AnimationClip.js";

const _RESERVED = new Set(["path", "defaults", "assetRegistry"]);

const _SHEET_RESERVED = new Set([
  "image", "defaults", "frameWidth", "frameHeight", "margin", "spacing", "columns", "assetRegistry",
]);

const _ATLAS_RESERVED = new Set(["image", "defaults", "assetRegistry"]);

export class AnimationPack {
  // ── Phase I: individual file convention ──

  static async load(config) {
    const basePath = config.path;
    if (!basePath || typeof basePath !== "string") {
      throw new TypeError(
        `AnimationPack.load failed: "path" must be a non-empty string, got ${JSON.stringify(basePath)}.`
      );
    }

    const defaults = config.defaults || {};

    const entries = [];
    for (const key of Object.keys(config)) {
      if (_RESERVED.has(key)) continue;
      entries.push(this._normalize(key, config[key], defaults));
    }

    if (entries.length === 0) {
      throw new Error(
        "AnimationPack.load failed: no animation entries provided."
      );
    }

    const loadMap = {};
    const frameKeysByAnim = {};

    for (const anim of entries) {
      const keys = [];
      for (let i = 0; i < anim.frames; i++) {
        const frameNum = anim.start + i;
        const padded = this._pad(frameNum, anim.padding);
        const filename = `${anim.prefix}${padded}${anim.suffix}.${anim.extension}`;
        const fullPath = `${basePath}/${anim.name}/${filename}`;
        const loadKey = `${anim.name}_${i}`;
        loadMap[loadKey] = fullPath;
        keys.push(loadKey);
      }
      frameKeysByAnim[anim.name] = keys;
    }

    const assetRegistry = config.assetRegistry;
    if (!assetRegistry) {
      throw new TypeError(
        'AnimationPack.load failed: "assetRegistry" is required. Provide an AssetRegistry instance.'
      );
    }

    const images = await ImageLoader.loadAll(loadMap);

    const result = {};
    for (const anim of entries) {
      const keys = frameKeysByAnim[anim.name];
      const frameAssetIds = keys.map(k => assetRegistry.register({ sourceImage: images[k] }));
      result[anim.name] = this._buildClip(anim, frameAssetIds);
    }

    return result;
  }

  // ── Phase II: sprite sheets ──

  static async fromSpriteSheet(config) {
    if (!config.image) {
      throw new TypeError(
        'AnimationPack.fromSpriteSheet failed: "image" is required.'
      );
    }
    const image = await this._resolveImage(config.image);

    const frameWidth = config.frameWidth;
    const frameHeight = config.frameHeight;
    if (!frameWidth || !frameHeight) {
      throw new TypeError(
        'AnimationPack.fromSpriteSheet failed: "frameWidth" and "frameHeight" are required.'
      );
    }

    const margin = config.margin ?? 0;
    const spacing = config.spacing ?? 0;
    const defaults = config.defaults || {};

    const entries = [];
    for (const key of Object.keys(config)) {
      if (_SHEET_RESERVED.has(key)) continue;
      entries.push(this._normalizeSpriteSheetEntry(
        key, config[key], defaults, frameWidth, frameHeight, margin, spacing
      ));
    }

    if (entries.length === 0) {
      throw new Error(
        "AnimationPack.fromSpriteSheet failed: no animation entries provided."
      );
    }

    const assetRegistry = config.assetRegistry;
    if (!assetRegistry) {
      throw new TypeError(
        'AnimationPack.fromSpriteSheet failed: "assetRegistry" is required. Provide an AssetRegistry instance.'
      );
    }

    const columns = config.columns;
    const result = {};
    for (const anim of entries) {
      const rects = this._generateGridRects(anim, frameWidth, frameHeight, margin, spacing, columns);
      let frames = this._extractFrames(image, rects, anim.crop, assetRegistry);
      result[anim.name] = this._buildClip(anim, frames);
    }

    return result;
  }

  // ── Phase II: texture atlases (grid regions + explicit frames) ──

  static async fromAtlas(config) {
    if (!config.image) {
      throw new TypeError(
        'AnimationPack.fromAtlas failed: "image" is required.'
      );
    }
    const image = await this._resolveImage(config.image);

    const assetRegistry = config.assetRegistry;
    if (!assetRegistry) {
      throw new TypeError(
        'AnimationPack.fromAtlas failed: "assetRegistry" is required. Provide an AssetRegistry instance.'
      );
    }

    const defaults = config.defaults || {};

    const entries = [];
    for (const key of Object.keys(config)) {
      if (_ATLAS_RESERVED.has(key)) continue;
      entries.push(this._normalizeAtlasEntry(key, config[key], defaults));
    }

    if (entries.length === 0) {
      throw new Error(
        "AnimationPack.fromAtlas failed: no animation entries provided."
      );
    }

    const result = {};
    for (const anim of entries) {
      const rects = anim._rects;
      let frames = this._extractFrames(image, rects, anim.crop, assetRegistry);
      result[anim.name] = this._buildClip(anim, frames);
    }

    return result;
  }

  // ── Phase II: JSON atlas loading ──

  static async fromJSONAtlas(config) {
    if (!config.image) {
      throw new TypeError(
        'AnimationPack.fromJSONAtlas failed: "image" is required.'
      );
    }
    if (!config.json) {
      throw new TypeError(
        'AnimationPack.fromJSONAtlas failed: "json" path is required.'
      );
    }

    const [image, atlasData] = await Promise.all([
      this._resolveImage(config.image),
      this._loadJSON(config.json),
    ]);

    const assetRegistry = config.assetRegistry;
    if (!assetRegistry) {
      throw new TypeError(
        'AnimationPack.fromJSONAtlas failed: "assetRegistry" is required. Provide an AssetRegistry instance.'
      );
    }

    const defaults = config.defaults || {};
    const frameMap = this._parseAtlasFrames(atlasData);

    const entries = [];
    for (const key of Object.keys(config)) {
      if (_ATLAS_RESERVED.has(key) || key === "json") continue;
      entries.push(this._normalizeJSONAtlasEntry(key, config[key], defaults, frameMap));
    }

    if (entries.length === 0) {
      throw new Error(
        "AnimationPack.fromJSONAtlas failed: no animation entries provided."
      );
    }

    const result = {};
    for (const anim of entries) {
      const rects = anim._rects;
      let frames = this._extractFrames(image, rects, anim.crop, assetRegistry);
      result[anim.name] = this._buildClip(anim, frames);
    }

    return result;
  }

  // ── internal helpers ──

  static async _resolveImage(image) {
    if (typeof image === "string") return ImageLoader.load(image);
    if (image instanceof HTMLImageElement || image instanceof HTMLCanvasElement) return image;
    throw new TypeError(
      `AnimationPack._resolveImage failed: expected a path string or HTMLImageElement, got ${typeof image}.`
    );
  }

  static async _loadJSON(path) {
    const res = await fetch(path);
    if (!res.ok) {
      throw new Error(`AnimationPack._loadJSON failed: HTTP ${res.status} loading "${path}".`);
    }
    return res.json();
  }

  static _parseAtlasFrames(data) {
    const map = {};

    // TexturePacker JSON (Hash) format: { frames: { name: { frame: { x, y, w, h }, ... } } }
    if (data.frames && typeof data.frames === "object" && !Array.isArray(data.frames)) {
      for (const [name, entry] of Object.entries(data.frames)) {
        const frame = entry.frame || entry;
        map[name] = {
          x: frame.x,
          y: frame.y,
          w: frame.w || frame.width,
          h: frame.h || frame.height,
          rotated: !!entry.rotated,
          trimmed: !!entry.trimmed,
          spriteSourceSize: entry.spriteSourceSize,
          sourceSize: entry.sourceSize,
        };
      }
      return map;
    }

    // Array-based format: [{ filename, frame: { x, y, w, h } }]
    if (Array.isArray(data.frames)) {
      for (const entry of data.frames) {
        const frame = entry.frame;
        map[entry.filename] = {
          x: frame.x,
          y: frame.y,
          w: frame.w || frame.width,
          h: frame.h || frame.height,
        };
      }
      return map;
    }

    throw new Error(
      "AnimationPack._parseAtlasFrames failed: unrecognized JSON atlas format."
    );
  }

  static _extractFrames(image, rects, crop, registry) {
    return rects.map((rect) => {
      let { x, y, w, h } = rect;

      if (crop) {
        x += crop.left ?? 0;
        y += crop.top ?? 0;
        w -= (crop.left ?? 0) + (crop.right ?? 0);
        h -= (crop.top ?? 0) + (crop.bottom ?? 0);
      }

      if (w <= 0 || h <= 0) {
        throw new Error(
          `AnimationPack._extractFrames failed: invalid frame dimensions ${w}x${h} at (${x},${y}).`
        );
      }

      return registry.register({ sourceImage: image, sx: x, sy: y, sw: w, sh: h });
    });
  }

  static _buildClip(anim, frames) {
    let result = frames;

    if (anim.pingPong && result.length > 2) {
      result = [...result, ...result.slice(1, -1).reverse()];
    }

    return new AnimationClip({
      frames: result,
      fps: anim.fps,
      loop: anim.loop,
    });
  }

  static _generateGridRects(anim, fw, fh, margin, spacing, columns) {
    const rects = [];
    const cols = columns;
    for (let i = 0; i < anim.frames; i++) {
      let col, row;
      if (cols !== undefined) {
        col = i % cols;
        row = Math.floor(i / cols);
      } else {
        col = (anim.column !== undefined) ? anim.column + i : i;
        row = anim.row ?? 0;
      }
      rects.push({
        x: margin + col * (fw + spacing),
        y: margin + row * (fh + spacing),
        w: fw,
        h: fh,
      });
    }
    return rects;
  }

  // ── config normalizers ──

  static _normalize(name, value, defaults) {
    let anim;
    if (typeof value === "number") {
      if (value < 1 || !Number.isInteger(value)) {
        throw new Error(
          `AnimationPack.load failed: frame count for "${name}" must be a positive integer, got ${value}.`
        );
      }
      anim = { frames: value };
    } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      anim = { ...value };
    } else {
      throw new TypeError(
        `AnimationPack.load failed: invalid config for animation "${name}". ` +
        `Expected a number (frame count) or an object, got ${typeof value}.`
      );
    }

    anim.name = name;
    anim.fps = anim.fps ?? defaults.fps ?? 8;
    anim.loop = anim.loop ?? defaults.loop ?? true;
    anim.extension = anim.extension ?? defaults.extension ?? "png";
    anim.padding = anim.padding ?? defaults.padding ?? 0;
    anim.prefix = anim.prefix ?? "";
    anim.suffix = anim.suffix ?? "";
    anim.pingPong = anim.pingPong ?? false;
    anim.start = 1;

    if (anim.from !== undefined || anim.to !== undefined) {
      const from = anim.from ?? anim.start;
      const to = anim.to;
      if (from < 1 || to < from) {
        throw new Error(
          `AnimationPack.load failed: invalid frame range for "${name}" (from=${from}, to=${to}).`
        );
      }
      anim.start = from;
      anim.frames = to - from + 1;
      delete anim.from;
      delete anim.to;
    }

    if (!anim.frames || anim.frames < 1 || !Number.isInteger(anim.frames)) {
      throw new Error(
        `AnimationPack.load failed: animation "${name}" must have a positive integer frame count.`
      );
    }

    return anim;
  }

  static _normalizeSpriteSheetEntry(name, value, defaults, fw, fh, margin, spacing) {
    let anim;
    if (typeof value === "number") {
      if (value < 1 || !Number.isInteger(value)) {
        throw new Error(
          `AnimationPack.fromSpriteSheet failed: frame count for "${name}" must be a positive integer, got ${value}.`
        );
      }
      anim = { frames: value };
    } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      anim = { ...value };
    } else {
      throw new TypeError(
        `AnimationPack.fromSpriteSheet failed: invalid config for animation "${name}".`
      );
    }

    anim.name = name;
    anim.fps = anim.fps ?? defaults.fps ?? 8;
    anim.loop = anim.loop ?? defaults.loop ?? true;
    anim.pingPong = anim.pingPong ?? false;
    anim.crop = anim.crop ?? defaults.crop ?? null;
    anim.row = anim.row ?? 0;
    anim.column = anim.column ?? undefined;

    if (!anim.frames || anim.frames < 1 || !Number.isInteger(anim.frames)) {
      throw new Error(
        `AnimationPack.fromSpriteSheet failed: animation "${name}" must have a positive integer frame count.`
      );
    }

    return anim;
  }

  static _normalizeAtlasEntry(name, value, defaults) {
    let anim;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      anim = { ...value };
    } else {
      throw new TypeError(
        `AnimationPack.fromAtlas failed: invalid config for animation "${name}". ` +
        "Atlas entries must be objects."
      );
    }

    anim.name = name;
    anim.fps = anim.fps ?? defaults.fps ?? 8;
    anim.loop = anim.loop ?? defaults.loop ?? true;
    anim.pingPong = anim.pingPong ?? false;
    anim.crop = anim.crop ?? defaults.crop ?? null;

    this._resolveFramesRects(anim);

    return anim;
  }

  static _resolveFramesRects(anim) {
    // Explicit frame array (irregular atlas)
    if (Array.isArray(anim.frames)) {
      anim._rects = anim.frames.map((f) => {
        if (Array.isArray(f)) {
          return { x: f[0], y: f[1], w: f[2], h: f[3] };
        }
        return { x: f.x || f.x === 0 ? f.x : 0, y: f.y || f.y === 0 ? f.y : 0, w: f.width || f.w, h: f.height || f.h };
      });
      delete anim.frames;
      return;
    }

    // Grid region: { x, y, width, height, frameWidth?, frameHeight?, frames: N }
    const regionX = anim.x;
    const regionY = anim.y;
    const regionW = anim.width || anim.w;
    const regionH = anim.height || anim.h;
    const frameCount = anim.frames;

    if (regionX === undefined || regionY === undefined || !regionW || !regionH || !frameCount) {
      throw new Error(
        `AnimationPack.fromAtlas failed: animation "${anim.name}" must specify ` +
        "x, y, width, height, and frames (or an explicit frame array)."
      );
    }

    const fw = anim.frameWidth || anim.frameW;
    const fh = anim.frameHeight || anim.frameH;

    let rects;
    if (fw && fh) {
      // Grid within region
      const cols = Math.floor(regionW / fw);
      rects = [];
      for (let i = 0; i < frameCount; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        rects.push({
          x: regionX + col * fw,
          y: regionY + row * fh,
          w: fw,
          h: fh,
        });
      }
    } else {
      // Evenly divide the region horizontally
      const fw2 = regionW / frameCount;
      rects = [];
      for (let i = 0; i < frameCount; i++) {
        rects.push({
          x: regionX + i * fw2,
          y: regionY,
          w: fw2,
          h: regionH,
        });
      }
    }

    anim._rects = rects;
    delete anim.frames;
    delete anim.x;
    delete anim.y;
    delete anim.width;
    delete anim.w;
    delete anim.height;
    delete anim.h;
    delete anim.frameWidth;
    delete anim.frameW;
    delete anim.frameHeight;
    delete anim.frameH;
  }

  static _normalizeJSONAtlasEntry(name, value, defaults, frameMap) {
    if (typeof value !== "object" || value === null) {
      throw new TypeError(
        `AnimationPack.fromJSONAtlas failed: invalid config for animation "${name}".`
      );
    }

    const prefix = value.prefix ?? name;
    const fps = value.fps ?? defaults.fps ?? 8;
    const loop = value.loop ?? defaults.loop ?? true;
    const pingPong = value.pingPong ?? false;
    const crop = value.crop ?? defaults.crop ?? null;

    const matched = [];
    for (const [frameName, rect] of Object.entries(frameMap)) {
      if (frameName.startsWith(prefix)) {
        matched.push({ name: frameName, rect });
      }
    }

    matched.sort((a, b) => {
      // Extract trailing numbers for natural sort
      const na = a.name.match(/(\d+)$/);
      const nb = b.name.match(/(\d+)$/);
      if (na && nb) return parseInt(na[1], 10) - parseInt(nb[1], 10);
      return a.name < b.name ? -1 : 1;
    });

    if (matched.length === 0) {
      throw new Error(
        `AnimationPack.fromJSONAtlas failed: no frames matched prefix "${prefix}" for animation "${name}".`
      );
    }

    return {
      name,
      fps,
      loop,
      pingPong,
      crop,
      _rects: matched.map((m) => ({
        x: m.rect.x,
        y: m.rect.y,
        w: m.rect.w,
        h: m.rect.h,
      })),
    };
  }

  static _pad(num, width) {
    if (width === 0 || width === undefined) return String(num);
    return String(num).padStart(width, "0");
  }
}
