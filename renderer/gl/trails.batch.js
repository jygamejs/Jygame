import { createProgram } from "./index.js";

const FLOATS_PER_VERTEX = 5;

const VERTEX_SOURCE = `#version 300 es
precision highp float;
in vec2 aPos;
in vec3 aColor;
out vec3 vColor;
uniform mat4 uMatrix;
void main() {
  gl_Position = uMatrix * vec4(aPos, 0.0, 1.0);
  vColor = aColor;
}
`;

const FRAGMENT_SOURCE = `#version 300 es
precision mediump float;
in vec3 vColor;
out vec4 outColor;
void main() {
  outColor = vec4(vColor, 1.0);
}
`;

// Batches trail geometry as a single contiguous triangle strip. Each trail is
// a ribbon: for every point it emits the left and right edge (offset along the
// segment normal by half the trail width), producing one quad per segment.
// Consecutive trails are bridged with two degenerate vertices so the whole set
// can be issued in one draw call. Trails arrive pre-sorted by depth from
// `World.collectTrailRenderables()`, so painter order is preserved.
export class TrailBatch {
  constructor(gl, { maxVertices = 16384 } = {}) {
    this._gl = gl;
    this._maxVertices = maxVertices;
    this._data = new Float32Array(maxVertices * FLOATS_PER_VERTEX);
    this._vertexCount = 0;
    this._pointScratch = new Float32Array(4096 * 2);
    this._lastNx = 0;
    this._lastNy = 0;

    this._program = createProgram(gl, VERTEX_SOURCE, FRAGMENT_SOURCE, { aPos: 0, aColor: 1 });
    this._uMatrixLocation = gl.getUniformLocation(this._program, "uMatrix");

    this._buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this._buffer);
    gl.bufferData(gl.ARRAY_BUFFER, this._data.byteLength, gl.DYNAMIC_DRAW);

    this._vao = gl.createVertexArray();
    gl.bindVertexArray(this._vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this._buffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, FLOATS_PER_VERTEX * 4, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, FLOATS_PER_VERTEX * 4, 8);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  get vertexCount() {
    return this._vertexCount;
  }

  reset() {
    this._vertexCount = 0;
    this._lastNx = 0;
    this._lastNy = 0;
  }

  addTrail(buffer, color, width) {
    const n = buffer.count;
    if (n < 2) return;
    const halfWidth = width * 0.5;
    const r = ((color >> 16) & 255) / 255;
    const g = ((color >> 8) & 255) / 255;
    const b = (color & 255) / 255;

    if (n * 2 > this._pointScratch.length) {
      this._pointScratch = new Float32Array(n * 2);
    }
    const pts = this._pointScratch;
    let pi = 0;
    buffer.forEachPoint((x, y) => {
      pts[pi++] = x;
      pts[pi++] = y;
    });

    if (this._vertexCount > 0) {
      const off = (this._vertexCount - 1) * FLOATS_PER_VERTEX;
      const d = this._data;
      const lx = d[off];
      const ly = d[off + 1];
      const lr = d[off + 2];
      const lg = d[off + 3];
      const lb = d[off + 4];
      this._emit(lx, ly, lr, lg, lb);
      this._emit(lx, ly, lr, lg, lb);
    }

    for (let k = 0; k < n; k++) {
      const x = pts[k * 2];
      const y = pts[k * 2 + 1];
      let nx, ny;
      if (k < n - 1) {
        const dx = pts[k * 2 + 2] - x;
        const dy = pts[k * 2 + 3] - y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 1e-10) {
          nx = 0;
          ny = 0;
        } else {
          nx = -dy / len;
          ny = dx / len;
        }
        this._lastNx = nx;
        this._lastNy = ny;
      } else {
        nx = this._lastNx;
        ny = this._lastNy;
      }
      this._emit(x - nx * halfWidth, y - ny * halfWidth, r, g, b);
      this._emit(x + nx * halfWidth, y + ny * halfWidth, r, g, b);
    }
  }

  _emit(x, y, r, g, b) {
    if (this._vertexCount >= this._maxVertices) this._grow();
    const off = this._vertexCount * FLOATS_PER_VERTEX;
    const d = this._data;
    d[off] = x;
    d[off + 1] = y;
    d[off + 2] = r;
    d[off + 3] = g;
    d[off + 4] = b;
    this._vertexCount++;
  }

  flush(matrix) {
    const gl = this._gl;
    if (this._vertexCount === 0) return;
    gl.useProgram(this._program);
    gl.uniformMatrix4fv(this._uMatrixLocation, false, matrix);
    gl.bindBuffer(gl.ARRAY_BUFFER, this._buffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this._data.subarray(0, this._vertexCount * FLOATS_PER_VERTEX));
    gl.bindVertexArray(this._vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, this._vertexCount);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    this._vertexCount = 0;
  }

  _grow() {
    const gl = this._gl;
    this._maxVertices *= 2;
    const data = new Float32Array(this._maxVertices * FLOATS_PER_VERTEX);
    data.set(this._data);
    this._data = data;
    gl.bindBuffer(gl.ARRAY_BUFFER, this._buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);
  }

  destroy() {
    const gl = this._gl;
    if (!gl) return;
    gl.deleteProgram(this._program);
    gl.deleteBuffer(this._buffer);
    gl.deleteVertexArray(this._vao);
    this._program = null;
    this._buffer = null;
    this._vao = null;
  }
}
