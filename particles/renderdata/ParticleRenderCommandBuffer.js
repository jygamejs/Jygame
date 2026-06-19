const STRIDE = 17;
const OFF = {
  x: 0, y: 1, rotation: 2, size: 3,
  width: 4, height: 5, alpha: 6,
  r: 7, g: 8, b: 9,
  originX: 10, originY: 11, depth: 12,
  frameX: 13, frameY: 14, frameWidth: 15, frameHeight: 16,
};

export class ParticleRenderCommandBuffer {
  static get STRIDE() { return STRIDE; }

  constructor(capacity = 4096) {
    this._data = new Float32Array(capacity * STRIDE);
    this._textures = new Array(capacity);
    this._particleRefs = new Array(capacity);
    this._count = 0;
    this._capacity = capacity;
  }

  clear() {
    this._count = 0;
  }

  get count() { return this._count; }
  get capacity() { return this._capacity; }
  get data() { return this._data; }
  get textures() { return this._textures; }
  get byteLength() { return this._count * STRIDE * 4; }

  append(p) {
    if (this._count >= this._capacity) this._grow();
    const off = this._count * STRIDE;
    this._data[off + OFF.x] = p.x;
    this._data[off + OFF.y] = p.y;
    this._data[off + OFF.rotation] = p.rotation;
    this._data[off + OFF.size] = p.size;
    this._data[off + OFF.width] = p.width;
    this._data[off + OFF.height] = p.height;
    this._data[off + OFF.alpha] = p.alpha;
    this._data[off + OFF.r] = p.r / 255;
    this._data[off + OFF.g] = p.g / 255;
    this._data[off + OFF.b] = p.b / 255;
    this._data[off + OFF.originX] = p.originX;
    this._data[off + OFF.originY] = p.originY;
    this._data[off + OFF.depth] = p.depth;
    this._data[off + OFF.frameX] = p.frameX;
    this._data[off + OFF.frameY] = p.frameY;
    this._data[off + OFF.frameWidth] = p.frameWidth;
    this._data[off + OFF.frameHeight] = p.frameHeight;
    this._textures[this._count] = p.texture;
    this._particleRefs[this._count] = p;
    this._count++;
  }

  /** Read command `i` into a target object (no allocation). Returns `target`. */
  read(i, target) {
    const off = i * STRIDE;
    target.x = this._data[off + OFF.x];
    target.y = this._data[off + OFF.y];
    target.rotation = this._data[off + OFF.rotation];
    target.size = this._data[off + OFF.size];
    target.width = this._data[off + OFF.width];
    target.height = this._data[off + OFF.height];
    target.alpha = this._data[off + OFF.alpha];
    target.r = this._data[off + OFF.r];
    target.g = this._data[off + OFF.g];
    target.b = this._data[off + OFF.b];
    target.originX = this._data[off + OFF.originX];
    target.originY = this._data[off + OFF.originY];
    target.depth = this._data[off + OFF.depth];
    target.frameX = this._data[off + OFF.frameX];
    target.frameY = this._data[off + OFF.frameY];
    target.frameWidth = this._data[off + OFF.frameWidth];
    target.frameHeight = this._data[off + OFF.frameHeight];
    target.texture = this._textures[i];
    target._p = this._particleRefs[i];
    return target;
  }

  _grow() {
    const newCap = this._capacity * 2;
    const newData = new Float32Array(newCap * STRIDE);
    newData.set(this._data.subarray(0, this._count * STRIDE));
    this._data = newData;
    this._textures.length = newCap;
    this._particleRefs.length = newCap;
    this._capacity = newCap;
  }
}
