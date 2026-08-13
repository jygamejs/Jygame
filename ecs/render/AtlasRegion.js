export class AtlasRegion {
  constructor({ sourceImage, x, y, width, height, sx, sy, sw, sh } = {}) {
    if (!sourceImage) {
      throw new TypeError(
        "AtlasRegion constructor failed: sourceImage is required."
      );
    }
    this.sourceImage = sourceImage;
    this.sx = sx ?? x ?? 0;
    this.sy = sy ?? y ?? 0;
    this.sw = sw ?? width ?? 0;
    this.sh = sh ?? height ?? 0;
  }

  get x() {
    return this.sx;
  }

  get y() {
    return this.sy;
  }

  get width() {
    return this.sw;
  }

  get height() {
    return this.sh;
  }
}
