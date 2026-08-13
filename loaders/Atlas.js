import { AnimationPack } from "../ecs/animation/AnimationPack.js";
import { AtlasRegion } from "../ecs/render/AtlasRegion.js";

const _GRID_KEYS = ["columns", "rows", "width", "height", "origin", "spacing", "margin"];

const _RESERVED_ATLAS_KEYS = new Set(["image", "grid", "name", "defaults", ..._GRID_KEYS]);

const _RESERVED_REGION_NAMES = new Set([
  "length",
  ...Object.getOwnPropertyNames(Array.prototype),
  ...Object.getOwnPropertyNames(Object.prototype),
]);

function _isObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// A grid may be described as config.grid or as top-level keys (columns, rows,
// width, height, origin, spacing, margin). Merge both, preferring the grid
// object on conflict.
function _normalizeGrid(config) {
  const grid = config.grid ? { ...config.grid } : {};
  for (const key of _GRID_KEYS) {
    if (config[key] !== undefined && grid[key] === undefined) {
      grid[key] = config[key];
    }
  }
  return grid;
}

function _imageSize(image) {
  return {
    w: image.width ?? image.naturalWidth ?? 0,
    h: image.height ?? image.naturalHeight ?? 0,
  };
}

function _cellSize(image, grid, columns, rows) {
  const size = _imageSize(image);
  const width = grid.width ?? (columns > 0 ? size.w / columns : undefined);
  const height = grid.height ?? (rows > 0 ? size.h / rows : undefined);
  return { width, height };
}

function _buildGrid(image, grid) {
  const columns = grid.columns;
  const rows = grid.rows;
  if (!Number.isInteger(columns) || columns < 1) {
    throw new Error(
      `Image.atlas: grid.columns must be a positive integer, got ${columns}.`
    );
  }
  if (!Number.isInteger(rows) || rows < 1) {
    throw new Error(
      `Image.atlas: grid.rows must be a positive integer, got ${rows}.`
    );
  }

  const { width, height } = _cellSize(image, grid, columns, rows);
  if (typeof width !== "number" || !Number.isFinite(width) || width <= 0) {
    throw new Error(
      `Image.atlas: grid.width must be a positive number (or derive one by giving the image known dimensions), got ${width}.`
    );
  }
  if (typeof height !== "number" || !Number.isFinite(height) || height <= 0) {
    throw new Error(
      `Image.atlas: grid.height must be a positive number (or derive one by giving the image known dimensions), got ${height}.`
    );
  }

  const origin = grid.origin ?? grid.margin ?? 0;
  const spacing = grid.spacing ?? 0;

  const rects = AnimationPack._generateGridRects(
    { frames: columns * rows, row: 0, column: 0 },
    width, height, origin, spacing, columns
  );

  const collection = [];
  for (const r of rects) {
    collection.push(new AtlasRegion({
      sourceImage: image,
      x: r.x, y: r.y, width: r.w, height: r.h,
    }));
  }
  return collection;
}

function _buildRegions(image, config, names) {
  const collection = [];
  for (const name of names) {
    if (_RESERVED_REGION_NAMES.has(name)) {
      throw new Error(
        `Image.atlas: region name "${name}" is reserved and cannot be used.`
      );
    }
    const entry = config[name];
    if (!_isObject(entry)) {
      throw new TypeError(
        `Image.atlas: region "${name}" must be an object with x, y, width, height.`
      );
    }
    const x = entry.x;
    const y = entry.y;
    const width = entry.width ?? entry.w;
    const height = entry.height ?? entry.h;
    if (typeof x !== "number" || typeof y !== "number") {
      throw new Error(
        `Image.atlas: region "${name}" must have numeric x and y coordinates.`
      );
    }
    if (typeof width !== "number" || !Number.isFinite(width) || width <= 0) {
      throw new Error(
        `Image.atlas: region "${name}" must have a positive width.`
      );
    }
    if (typeof height !== "number" || !Number.isFinite(height) || height <= 0) {
      throw new Error(
        `Image.atlas: region "${name}" must have a positive height.`
      );
    }

    const region = new AtlasRegion({ sourceImage: image, x, y, width, height });
    collection.push(region);
    Object.defineProperty(collection, name, {
      value: region,
      enumerable: false,
      writable: false,
      configurable: false,
    });
  }
  return collection;
}

export async function buildAtlas(config) {
  if (!_isObject(config)) {
    throw new TypeError("Image.atlas: config must be an object.");
  }
  if (!config.image) {
    throw new TypeError('Image.atlas: "image" is required.');
  }

  const hasGridKey = config.grid !== undefined || _GRID_KEYS.some((k) => config[k] !== undefined);
  const regionNames = Object.keys(config).filter((k) => !_RESERVED_ATLAS_KEYS.has(k));

  if (hasGridKey && regionNames.length > 0) {
    throw new Error(
      'Image.atlas: ambiguous configuration — provide either a "grid" or named regions, not both.'
    );
  }
  if (!hasGridKey && regionNames.length === 0) {
    throw new Error(
      'Image.atlas: nothing to slice — provide a "grid" or named regions.'
    );
  }

  const image = await AnimationPack._resolveImage(config.image);

  if (hasGridKey) {
    return _buildGrid(image, _normalizeGrid(config));
  }
  return _buildRegions(image, config, regionNames);
}
