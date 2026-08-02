const FLOATS_PER_INSTANCE = 17;

// Offsets (in floats) of each per-instance attribute within the interleaved buffer.
const INSTANCE_LAYOUT = [
  [1, 2, 0],   // aPos
  [2, 1, 2],   // aRot
  [3, 2, 3],   // aScale
  [4, 2, 5],   // aSize
  [5, 4, 7],   // aUv
  [6, 4, 11],  // aColor
  [7, 1, 15],  // aDepth
  [8, 1, 16],  // aShape
];

const CORNER_VERTICES = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);

export class QuadBatch {
  constructor(gl, { maxInstances = 4096 } = {}) {
    this._gl = gl;
    this._maxInstances = maxInstances;
    this._data = new Float32Array(maxInstances * FLOATS_PER_INSTANCE);
    this._count = 0;

    this._vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this._vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, CORNER_VERTICES, gl.STATIC_DRAW);

    this._instanceBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this._instanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this._data.byteLength, gl.DYNAMIC_DRAW);

    const stride = FLOATS_PER_INSTANCE * 4;
    this._vao = gl.createVertexArray();
    gl.bindVertexArray(this._vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this._vertexBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this._instanceBuffer);
    for (const [loc, size, offset] of INSTANCE_LAYOUT) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset * 4);
      gl.vertexAttribDivisor(loc, 1);
    }
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  get count() {
    return this._count;
  }

  get data() {
    return this._data;
  }

  reset() {
    this._count = 0;
  }

  add(inst) {
    if (this._count >= this._maxInstances) this._grow();
    const off = this._count * FLOATS_PER_INSTANCE;
    const d = this._data;
    d[off + 0] = inst.x;
    d[off + 1] = inst.y;
    d[off + 2] = inst.rotation;
    d[off + 3] = inst.scaleX;
    d[off + 4] = inst.scaleY;
    d[off + 5] = inst.width;
    d[off + 6] = inst.height;
    d[off + 7] = inst.u0;
    d[off + 8] = inst.v0;
    d[off + 9] = inst.u1;
    d[off + 10] = inst.v1;
    d[off + 11] = inst.r;
    d[off + 12] = inst.g;
    d[off + 13] = inst.b;
    d[off + 14] = inst.a;
    d[off + 15] = Math.max(-0.99, Math.min(0.99, inst.depth || 0));
    d[off + 16] = inst.shape;
    this._count++;
  }

  flush() {
    const gl = this._gl;
    if (this._count === 0) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, this._instanceBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this._data.subarray(0, this._count * FLOATS_PER_INSTANCE));
    gl.bindVertexArray(this._vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this._count);
    gl.bindVertexArray(null);
    this._count = 0;
  }

  _grow() {
    const gl = this._gl;
    this._maxInstances *= 2;
    const data = new Float32Array(this._maxInstances * FLOATS_PER_INSTANCE);
    data.set(this._data);
    this._data = data;
    gl.bindBuffer(gl.ARRAY_BUFFER, this._instanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);
  }

  destroy() {
    const gl = this._gl;
    gl.deleteBuffer(this._vertexBuffer);
    gl.deleteBuffer(this._instanceBuffer);
    gl.deleteVertexArray(this._vao);
  }
}
