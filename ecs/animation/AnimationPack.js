import { ImageLoader } from "../../loaders/ImageLoader.js";
import { AnimationClip } from "./AnimationClip.js";

const _RESERVED = new Set(["path", "defaults"]);

export class AnimationPack {
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
    const frameKeys = {};

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
      frameKeys[anim.name] = keys;
    }

    const images = await ImageLoader.loadAll(loadMap);

    const result = {};
    for (const anim of entries) {
      const keys = frameKeys[anim.name];
      let frameImages = keys.map(k => images[k]);

      if (anim.pingPong && frameImages.length > 2) {
        frameImages = [...frameImages, ...frameImages.slice(1, -1).reverse()];
      }

      result[anim.name] = new AnimationClip({
        frames: frameImages,
        fps: anim.fps,
        loop: anim.loop,
      });
    }

    return result;
  }

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

  static _pad(num, width) {
    if (width === 0 || width === undefined) return String(num);
    return String(num).padStart(width, "0");
  }
}
