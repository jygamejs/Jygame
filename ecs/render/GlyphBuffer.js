// Structure-of-arrays buffer for glyph instances.
//
// `GlyphBuffer` holds the resolved rendering data for a batch of glyphs:
// each glyph's source region, its destination size, and its position in
// entity-local space (centered on the text entity's anchor).
//
// The buffer is reusable: `clear()` resets the count without deallocating;
// `push()` refills it in place.  Growth is geometric (×2) so steady-state
// rendering never allocates.
//
// Field layout (SoA — each field is a contiguous array):
//
//   sourceImage[i]  — the backing image for glyph i
//   sx[i], sy[i]    — source rect origin
//   sw[i], sh[i]    — source rect size
//   x[i], y[i]      — glyph-center position in entity-local space
//
// `x[i], y[i]` are *local* positions: the glyph center relative to the
// text entity's anchor, after subtracting the surface center.  They do NOT
// include the entity's world position, rotation, or scale — those are
// applied at push time by `pushGlyphs`.  This separation lets future
// animation modify local positions between fill and push.
//
// The buffer intentionally stores no per-glyph rotation, scale, or color
// yet — those can be added as new typed arrays without changing the
// existing fields or the public API.
export class GlyphBuffer {
  constructor(initialCapacity = 16) {
    if (typeof initialCapacity !== "number" || !Number.isInteger(initialCapacity) || initialCapacity < 1) {
      throw new RangeError(
        `GlyphBuffer: initialCapacity must be a positive integer, got ${initialCapacity}.`
      );
    }
    this._capacity = initialCapacity;
    this._count = 0;
    this._sourceImage = new Array(initialCapacity);
    this._sx = new Float32Array(initialCapacity);
    this._sy = new Float32Array(initialCapacity);
    this._sw = new Float32Array(initialCapacity);
    this._sh = new Float32Array(initialCapacity);
    this._x = new Float32Array(initialCapacity);
    this._y = new Float32Array(initialCapacity);
  }

  get count() {
    return this._count;
  }

  get capacity() {
    return this._capacity;
  }

  clear() {
    this._count = 0;
  }

  // Append one glyph instance.  `sourceImage` is the backing image;
  // `sx/sy/sw/sh` are the source region; `x/y` are the glyph-center
  // position in entity-local space.
  push(sourceImage, sx, sy, sw, sh, x, y) {
    if (this._count >= this._capacity) this._grow();
    const i = this._count;
    this._sourceImage[i] = sourceImage;
    this._sx[i] = sx;
    this._sy[i] = sy;
    this._sw[i] = sw;
    this._sh[i] = sh;
    this._x[i] = x;
    this._y[i] = y;
    this._count++;
  }

  _grow() {
    const newCap = this._capacity * 2;

    const newSourceImage = new Array(newCap);
    for (let i = 0; i < this._count; i++) newSourceImage[i] = this._sourceImage[i];

    const newSx = new Float32Array(newCap);
    newSx.set(this._sx);

    const newSy = new Float32Array(newCap);
    newSy.set(this._sy);

    const newSw = new Float32Array(newCap);
    newSw.set(this._sw);

    const newSh = new Float32Array(newCap);
    newSh.set(this._sh);

    const newX = new Float32Array(newCap);
    newX.set(this._x);

    const newY = new Float32Array(newCap);
    newY.set(this._y);

    this._sourceImage = newSourceImage;
    this._sx = newSx;
    this._sy = newSy;
    this._sw = newSw;
    this._sh = newSh;
    this._x = newX;
    this._y = newY;
    this._capacity = newCap;
  }
}
