import { FontLoader } from "./FontLoader.js";
import { ImageLoader } from "./ImageLoader.js";
import { LoadingTask } from "./LoadingTask.js";

const _registry = new Map();
let _nextId = 1;
const _byId = new Map();

function _register(name, font) {
  _registry.set(name, font);
  _byId.set(font.id, font);
  return font;
}

function _isObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function _isBitmapConfig(a) {
  if (!_isObject(a)) return false;
  if (typeof a.image !== "string") return false;
  if (typeof a.characters !== "string") return false;
  return a.separator != null || a.gridX != null || a.gridY != null;
}

function _parseColor(str) {
  if (typeof str !== "string") {
    throw new TypeError("Font: separator must be a color string.");
  }
  const s = str.trim().toLowerCase();
  if (s.startsWith("#")) {
    const hex = s.slice(1);
    if (hex.length === 3) {
      return [
        parseInt(hex[0] + hex[0], 16),
        parseInt(hex[1] + hex[1], 16),
        parseInt(hex[2] + hex[2], 16),
      ];
    }
    if (hex.length === 6 || hex.length === 8) {
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
      ];
    }
  }
  const m = s.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const parts = m[1].split(",").map((v) => parseFloat(v.trim()));
    if (parts.length >= 3) {
      return [parts[0], parts[1], parts[2]];
    }
  }
  throw new Error(
    `Font: unsupported separator color "${str}". Use #RGB, #RRGGBB, or rgb()/rgba().`
  );
}

function _isPixel(data, i, color) {
  if (data[i + 3] < 128) return false;
  return data[i] === color[0] && data[i + 1] === color[1] && data[i + 2] === color[2];
}

function _hasContentColumn(data, width, top, bottom, x, color, bg) {
  for (let y = top; y <= bottom; y++) {
    const i = (y * width + x) * 4;
    if (data[i + 3] === 0) continue;
    if (_isPixel(data, i, color)) continue;
    if (bg && _isPixel(data, i, bg)) continue;
    return true;
  }
  return false;
}

function _sliceRegion(source, sx, sy, sw, sh) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(sw));
  c.height = Math.max(1, Math.round(sh));
  const ctx = c.getContext("2d");
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c;
}

export class NativeFont {
  constructor(name) {
    this.name = name;
    this.kind = "native";
    this.id = _nextId++;
  }

  get family() {
    return this.name;
  }
}

export class BitmapFont {
  constructor(name, config, image) {
    this.name = name;
    this.kind = "bitmap";
    this._config = config;
    this._image = image;
    this._glyphs = new Map();
    this._advances = new Map();
    this._tintCache = new Map();
    this._lineHeight = 0;
    this._sliced = false;
    this._background = config.background != null ? _parseColor(config.background) : null;
    this._caseInsensitive = config.caseInsensitive ?? false;
    this._colors = config.colors != null
      ? (Array.isArray(config.colors) ? config.colors : [config.colors]).map(_parseColor)
      : null;
    this.id = _nextId++;
  }

  _slice() {
    const { characters, image } = this._config;
    if (!image) throw new Error(`Font: bitmap font "${this.name}" requires an image path.`);
    if (!characters || characters.length === 0) {
      throw new Error(`Font: bitmap font "${this.name}" requires characters.`);
    }
    const strategy = this._config.separator != null ? "separator" : "grid";
    if (strategy === "separator") this._sliceSeparator();
    else this._sliceGrid();
    this._sliced = true;
    return this;
  }

  _sliceGrid() {
    const { characters, gridX, gridY } = this._config;
    const imgW = this._image.width ?? this._image.naturalWidth ?? 0;
    const imgH = this._image.height ?? this._image.naturalHeight ?? 0;
    if (!gridX || !gridY) {
      throw new Error(`Font: bitmap font "${this.name}" requires both gridX and gridY.`);
    }
    const cellW = imgW / gridX;
    const cellH = imgH / gridY;
    if (characters.length > gridX * gridY) {
      throw new Error(
        `Font: characters (${characters.length}) exceed grid capacity (${gridX}x${gridY}).`
      );
    }
    this._lineHeight = cellH;
    const spacing = this._config.spacing ?? 0;
    for (let i = 0; i < characters.length; i++) {
      const col = i % gridX;
      const row = Math.floor(i / gridX);
      const g = _sliceRegion(this._image, col * cellW, row * cellH, cellW, cellH);
      this._clearBackgroundPixels(g);
      this._glyphs.set(characters[i], g);
      this._advances.set(characters[i], cellW + spacing);
    }
  }

  _sliceSeparator() {
    const { characters, separator } = this._config;
    const color = _parseColor(separator);
    const imgW = this._image.width ?? this._image.naturalWidth ?? 0;
    const imgH = this._image.height ?? this._image.naturalHeight ?? 0;

    const canvas = document.createElement("canvas");
    canvas.width = imgW;
    canvas.height = imgH;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(this._image, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);

    let top = -1;
    let bottom = -1;
    for (let y = 0; y < height; y++) {
      let hasContent = false;
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if (data[i + 3] === 0) continue;
        if (_isPixel(data, i, color)) continue;
        if (this._background && _isPixel(data, i, this._background)) continue;
        hasContent = true;
        break;
      }
      if (hasContent) {
        if (top === -1) top = y;
        bottom = y;
      }
    }
    if (top === -1) {
      throw new Error(`Font: no glyph content found in bitmap image for "${this.name}".`);
    }

    const boxes = [];
    let start = -1;
    for (let x = 0; x <= width; x++) {
      let isSep = false;
      if (x < width) {
        for (let y = top; y <= bottom; y++) {
          const i = (y * width + x) * 4;
          if (_isPixel(data, i, color)) { isSep = true; break; }
        }
      } else {
        isSep = true;
      }
      if (isSep) {
        if (start !== -1) {
          boxes.push({ x: start, w: x - start });
          start = -1;
        }
      } else {
        if (start === -1) start = x;
      }
    }

    const trimmed = boxes
      .map((box) => {
        let left = box.x;
        let right = box.x + box.w - 1;
        while (left < right && !_hasContentColumn(data, width, top, bottom, left, color, this._background)) left++;
        while (right >= left && !_hasContentColumn(data, width, top, bottom, right, color, this._background)) right--;
        if (left > right) return null;
        return { x: left, w: right - left + 1 };
      })
      .filter(Boolean);

    if (trimmed.length !== characters.length) {
      throw new Error(
        `Font: found ${trimmed.length} glyphs but characters defines ${characters.length} for "${this.name}".`
      );
    }

    this._lineHeight = bottom - top + 1;
    const spacing = this._config.spacing ?? 0;
    for (let i = 0; i < characters.length; i++) {
      const box = trimmed[i];
      const g = _sliceRegion(canvas, box.x, top, box.w, bottom - top + 1);
      this._clearBackgroundPixels(g);
      this._glyphs.set(characters[i], g);
      this._advances.set(characters[i], box.w + spacing);
    }
  }

  _clearBackgroundPixels(canvas) {
    if (!this._background) return;
    const ctx = canvas.getContext("2d");
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = img.data;
    const bg = this._background;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] >= 128 && d[i] === bg[0] && d[i + 1] === bg[1] && d[i + 2] === bg[2]) {
        d[i + 3] = 0;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  _glyph(ch) {
    let g = this._glyphs.get(ch);
    if (g) return g;
    if (this._caseInsensitive) {
      const up = ch.toUpperCase();
      if (up !== ch) g = this._glyphs.get(up);
      if (!g) {
        const lo = ch.toLowerCase();
        if (lo !== ch) g = this._glyphs.get(lo);
      }
    }
    return g || null;
  }

  _advance(ch) {
    if (this._advances.has(ch)) return this._advances.get(ch);
    if (this._caseInsensitive) {
      const up = ch.toUpperCase();
      if (up !== ch && this._advances.has(up)) return this._advances.get(up);
      const lo = ch.toLowerCase();
      if (lo !== ch && this._advances.has(lo)) return this._advances.get(lo);
    }
    if (ch === " ") {
      if (this._config.spaceWidth != null) return this._config.spaceWidth;
      let max = 0;
      for (const a of this._advances.values()) max = Math.max(max, a);
      return max;
    }
    return 0;
  }

  _getTinted(ch, color) {
    const key = ch + "\u0000" + color;
    let tinted = this._tintCache.get(key);
    if (tinted) return tinted;
    const src = this._glyph(ch);
    if (!src) return null;
    const c = document.createElement("canvas");
    c.width = src.width;
    c.height = src.height;
    const ctx = c.getContext("2d");
    ctx.drawImage(src, 0, 0);
    if (this._colors) {
      const img = ctx.getImageData(0, 0, c.width, c.height);
      const d = img.data;
      const [tr, tg, tb] = _parseColor(color);
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] === 0) continue;
        for (const [sr, sg, sb] of this._colors) {
          if (d[i] === sr && d[i + 1] === sg && d[i + 2] === sb) {
            d[i] = tr;
            d[i + 1] = tg;
            d[i + 2] = tb;
            break;
          }
        }
      }
      ctx.putImageData(img, 0, 0);
    } else {
      ctx.globalCompositeOperation = "source-in";
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, c.width, c.height);
    }
    this._tintCache.set(key, c);
    return c;
  }

  glyph(ch) {
    return this._glyph(ch);
  }

  advance(ch) {
    return this._advance(ch);
  }

  get lineHeight() {
    return this._lineHeight;
  }

  measure(text, options = {}) {
    const scale = options.scale ?? 1;
    let width = 0;
    for (const ch of String(text)) width += this._advance(ch);
    return { width: width * scale, height: this._lineHeight * scale };
  }

  render(ctx, text, x, y, options = {}) {
    const scale = options.scale ?? 1;
    const color = options.color ?? null;
    const align = options.align ?? "left";
    const str = String(text);

    const total = this.measure(str, { scale }).width;
    let startX = x;
    if (align === "center") startX = x - total / 2;
    else if (align === "right") startX = x - total;

    let cx = startX;
    for (const ch of str) {
      const glyph = this._glyph(ch);
      const adv = this._advance(ch) * scale;
      if (glyph) {
        const source = color ? this._getTinted(ch, color) : glyph;
        if (source) {
          ctx.drawImage(source, cx, y, source.width * scale, source.height * scale);
        }
      }
      cx += adv;
    }
  }
}

function _validateBitmapStrategy(name, config) {
  const hasSep = config.separator != null;
  const hasGrid = config.gridX != null || config.gridY != null;
  if (hasSep && hasGrid) {
    throw new Error(
      `Font: bitmap font "${name}" cannot specify both separator and gridX/gridY.`
    );
  }
  if (!hasSep && !hasGrid) {
    throw new Error(
      `Font: bitmap font "${name}" requires a slicing strategy — provide separator or gridX/gridY.`
    );
  }
  if (hasGrid && (config.gridX == null || config.gridY == null)) {
    throw new Error(`Font: bitmap font "${name}" requires both gridX and gridY.`);
  }
}

export const Font = {

  // ── Font.load ──

  load(a, b) {
    if (typeof a === "string") {
      if (typeof b === "string") {
        return this._loadNative(a, b);
      }
      if (_isObject(b)) {
        _validateBitmapStrategy(a, b);
        return this._loadBitmap(a, b);
      }
      throw new TypeError(
        "Font.load: expected a path string or a bitmap config object as the second argument."
      );
    }
    if (Array.isArray(a)) {
      return this._loadBitmapBatch(a);
    }
    if (_isObject(a)) {
      if (_isBitmapConfig(a)) {
        if (!a.name) {
          throw new Error("Font.load: bitmap config requires a name.");
        }
        _validateBitmapStrategy(a.name, a);
        return this._loadBitmap(a.name, a);
      }
      const values = Object.values(a);
      if (values.every((v) => typeof v === "string")) {
        return this._loadNativeBatch(a);
      }
      if (values.every((v) => _isObject(v))) {
        return this._loadBitmapBatchMap(a);
      }
      throw new TypeError(
        "Font.load: batch map values must be all paths (strings) or all bitmap configs."
      );
    }
    throw new TypeError(
      "Font.load: expected (name, path), (name, config), a batch map, or an array of configs."
    );
  },

  async _loadNative(name, path) {
    if (_registry.has(name)) return _registry.get(name);
    await FontLoader.load(name, path);
    const font = new NativeFont(name);
    return _register(name, font);
  },

  _loadNativeBatch(map) {
    const entries = Object.entries(map);
    const results = {};
    const task = new LoadingTask(() => results);
    task.expect(entries.length);

    for (const [name, path] of entries) {
      if (_registry.has(name)) {
        results[name] = _registry.get(name);
        task.done();
        continue;
      }
      FontLoader.load(name, path).then(() => {
        const font = new NativeFont(name);
        _register(name, font);
        results[name] = font;
        task.done();
      }).catch((err) => task.fail(err));
    }

    return task;
  },

  async _loadBitmap(name, config) {
    if (_registry.has(name)) return _registry.get(name);
    const image = await ImageLoader.load(config.image);
    const font = new BitmapFont(name, config, image);
    font._slice();
    return _register(name, font);
  },

  _loadBitmapBatch(arr) {
    const results = {};
    const task = new LoadingTask(() => results);
    task.expect(arr.length);

    for (const config of arr) {
      const name = config && config.name;
      if (!name) {
        task.fail(new Error("Font.load: each bitmap config in a batch requires a name."));
        return task;
      }
      _validateBitmapStrategy(name, config);
      this._loadBitmap(name, config).then((font) => {
        results[name] = font;
        task.done();
      }).catch((err) => task.fail(err));
    }

    return task;
  },

  _loadBitmapBatchMap(map) {
    const arr = Object.entries(map).map(([name, config]) => ({ name, ...config }));
    return this._loadBitmapBatch(arr);
  },

  // ── Font registry ──

  get(name) {
    return _registry.get(name) || null;
  },

  has(name) {
    return _registry.has(name);
  },

  byId(id) {
    return _byId.get(id) || null;
  },

  remove(name) {
    const font = _registry.get(name);
    if (!font) return false;
    _registry.delete(name);
    _byId.delete(font.id);
    if (font.kind === "native") {
      FontLoader.unload(name);
    }
    return true;
  },

  clear() {
    _registry.clear();
    _byId.clear();
    FontLoader.clear();
  },
};
