import { ParticleVisual, VisualType } from "./ParticleVisual.js";

export class TextureParticleVisual extends ParticleVisual {
  constructor({ texture, width, height, originX = 0.5, originY = 0.5, frameX, frameY, frameWidth, frameHeight } = {}) {
    super();
    if (!texture) {
      throw new Error("TextureParticleVisual requires a texture");
    }
    if (width !== undefined && (!Number.isFinite(width) || width <= 0)) {
      throw new Error("TextureParticleVisual width must be a finite number > 0");
    }
    if (height !== undefined && (!Number.isFinite(height) || height <= 0)) {
      throw new Error("TextureParticleVisual height must be a finite number > 0");
    }
    if (!Number.isFinite(originX) || !Number.isFinite(originY)) {
      throw new Error("TextureParticleVisual originX/originY must be finite numbers");
    }
    this._texture = texture;
    this._width = width ?? 0;
    this._height = height ?? 0;
    this._originX = originX;
    this._originY = originY;
    this._frameX = frameX ?? 0;
    this._frameY = frameY ?? 0;
    this._frameWidth = frameWidth ?? 0;
    this._frameHeight = frameHeight ?? 0;
    Object.freeze(this);
  }

  get type() {
    return "texture";
  }

  get visualType() {
    return VisualType.TEXTURE;
  }

  get texture() { return this._texture; }
  get width() { return this._width; }
  get height() { return this._height; }
  get originX() { return this._originX; }
  get originY() { return this._originY; }
  get frameX() { return this._frameX; }
  get frameY() { return this._frameY; }
  get frameWidth() { return this._frameWidth; }
  get frameHeight() { return this._frameHeight; }

  toJSON() {
    return {
      type: "texture",
      width: this._width,
      height: this._height,
      originX: this._originX,
      originY: this._originY,
    };
  }
}
