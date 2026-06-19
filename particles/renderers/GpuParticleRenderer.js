import { ParticleRenderer } from "./ParticleRenderer.js";
import { ParticleRenderCommandBuffer } from "../renderdata/ParticleRenderCommandBuffer.js";

/*
 * Instance buffer layout (stride = 17 floats = 68 bytes):
 *
 *  float  0: x
 *  float  1: y
 *  float  2: rotation
 *  float  3: size
 *  float  4: width
 *  float  5: height
 *  float  6: alpha
 *  float  7: r (0-1)
 *  float  8: g (0-1)
 *  float  9: b (0-1)
 *  float 10: originX
 *  float 11: originY
 *  float 12: depth
 *  float 13: frameX
 *  float 14: frameY
 *  float 15: frameWidth
 *  float 16: frameHeight
 */

const INSTANCE_STRIDE = 68; // bytes

const INSTANCE_ATTRIBS = [
  { name: 'a_iPos',     size: 2, type: 'FLOAT', offset: 0 },
  { name: 'a_iRotation',size: 1, type: 'FLOAT', offset: 8 },
  { name: 'a_iSize',    size: 1, type: 'FLOAT', offset: 12 },
  { name: 'a_iWidth',   size: 1, type: 'FLOAT', offset: 16 },
  { name: 'a_iHeight',  size: 1, type: 'FLOAT', offset: 20 },
  { name: 'a_iAlpha',   size: 1, type: 'FLOAT', offset: 24 },
  { name: 'a_iColor',   size: 3, type: 'FLOAT', offset: 28 },
  { name: 'a_iOrigin',  size: 2, type: 'FLOAT', offset: 40 },
  { name: 'a_iDepth',   size: 1, type: 'FLOAT', offset: 48 },
  { name: 'a_iFrame',   size: 4, type: 'FLOAT', offset: 52 },
];

const VS_SRC = `#version 300 es
in vec2 a_pos;
in vec2 a_uv;

in vec2  a_iPos;
in float a_iRotation;
in float a_iSize;
in float a_iWidth;
in float a_iHeight;
in float a_iAlpha;
in vec3  a_iColor;
in vec2  a_iOrigin;
in float a_iDepth;
in vec4  a_iFrame;

out vec2  v_uv;
out vec3  v_color;
out float v_alpha;
flat out float v_hasFrame;

uniform vec2 u_resolution;

void main() {
  float w = a_iWidth  > 0.0 ? a_iWidth  : a_iSize;
  float h = a_iHeight > 0.0 ? a_iHeight : a_iSize;

  vec2 local = a_pos * vec2(w, h);
  local -= vec2(w * a_iOrigin.x, h * a_iOrigin.y);

  float c = cos(a_iRotation);
  float s = sin(a_iRotation);
  local = vec2(local.x * c - local.y * s, local.x * s + local.y * c);

  vec2 world = local + a_iPos;

  vec2 ndc = world / u_resolution * 2.0 - 1.0;
  ndc.y = -ndc.y;
  gl_Position = vec4(ndc, a_iDepth / 100000.0, 1.0);

  v_hasFrame = (a_iFrame.z > 0.0 && a_iFrame.w > 0.0) ? 1.0 : 0.0;
  v_uv = a_uv;
  v_color  = a_iColor;
  v_alpha  = a_iAlpha;
}
`;

const FS_SRC = `#version 300 es
precision highp float;

in vec2  v_uv;
in vec3  v_color;
in float v_alpha;
flat in float v_hasFrame;

uniform sampler2D u_texture;
uniform vec2 u_texSize;
uniform float u_hasTexture;
uniform vec4 u_frame;

out vec4 fragColor;

void main() {
  vec2 uv = v_uv;
  if (u_hasFrame > 0.5) {
    vec2 frameSize = u_frame.zw;
    vec2 texel = vec2(1.0) / u_texSize;
    uv = v_uv * (frameSize * texel) + (u_frame.xy * texel);
  }

  vec4 texelColor = texture(u_texture, uv);

  vec3 color;
  float alpha;

  if (u_hasTexture > 0.5) {
    color = texelColor.rgb;
    alpha = v_alpha * texelColor.a;
  } else {
    color = v_color;
    alpha = v_alpha;
  }

  fragColor = vec4(color, alpha);
}
`;

export class GpuParticleRenderer extends ParticleRenderer {
  constructor(opts = {}) {
    super(opts);
    const gl = opts.gl;
    if (!gl) throw new Error("GpuParticleRenderer requires a WebGL2 context via { gl }");

    this._gl = gl;
    this._program = null;
    this._vao = null;
    this._instanceVBO = null;
    this._maxInstances = 0;
    this._cmdBuffer = new ParticleRenderCommandBuffer();
    this._texCache = new Map();
    this._whiteTexture = null;

    this._initGL();
  }

  _initGL() {
    const gl = this._gl;

    this._program = this._compileProgram(VS_SRC, FS_SRC);

    this._locRes = gl.getUniformLocation(this._program, 'u_resolution');
    this._locTex = gl.getUniformLocation(this._program, 'u_texture');
    this._locTexSize = gl.getUniformLocation(this._program, 'u_texSize');
    this._locHasTex = gl.getUniformLocation(this._program, 'u_hasTexture');
    this._locHasFrame = gl.getUniformLocation(this._program, 'u_hasFrame');
    this._locFrame = gl.getUniformLocation(this._program, 'u_frame');

    this._vao = this._createQuadVAO();
    this._instanceVBO = gl.createBuffer();

    this._whiteTexture = this._createWhiteTexture();

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);
  }

  _compileShader(src, type) {
    const gl = this._gl;
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error("Shader compile error: " + info);
    }
    return s;
  }

  _compileProgram(vsSrc, fsSrc) {
    const gl = this._gl;
    const vs = this._compileShader(vsSrc, gl.VERTEX_SHADER);
    const fs = this._compileShader(fsSrc, gl.FRAGMENT_SHADER);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(prog);
      gl.deleteProgram(prog);
      throw new Error("Program link error: " + info);
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return prog;
  }

  _createQuadVAO() {
    const gl = this._gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const verts = new Float32Array([
      -0.5, -0.5,  0, 1,
       0.5, -0.5,  1, 1,
       0.5,  0.5,  1, 0,
      -0.5,  0.5,  0, 0,
    ]);
    const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);

    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);

    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    const prog = this._program;
    const locPos = gl.getAttribLocation(prog, 'a_pos');
    const locUV = gl.getAttribLocation(prog, 'a_uv');

    gl.enableVertexAttribArray(locPos);
    gl.vertexAttribPointer(locPos, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(locUV);
    gl.vertexAttribPointer(locUV, 2, gl.FLOAT, false, 16, 8);

    gl.bindVertexArray(null);
    return vao;
  }

  _createWhiteTexture() {
    const gl = this._gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  _getGLTexture(tex) {
    if (!tex) return null;
    const gl = this._gl;
    let glTex = this._texCache.get(tex);
    if (!glTex) {
      glTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, glTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this._texCache.set(tex, glTex);
    }
    return glTex;
  }

  _setupInstanceAttributes() {
    const gl = this._gl;
    const prog = this._program;

    gl.bindBuffer(gl.ARRAY_BUFFER, this._instanceVBO);

    for (const attr of INSTANCE_ATTRIBS) {
      const loc = gl.getAttribLocation(prog, attr.name);
      if (loc < 0) continue;
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, attr.size, gl.FLOAT, false, INSTANCE_STRIDE, attr.offset);
      gl.vertexAttribDivisor(loc, 1);
    }
  }

  render(data, ctx) {
    const gl = this._gl;

    let buffer = data;
    if (!(data instanceof ParticleRenderCommandBuffer)) {
      this._cmdBuffer.clear();
      data.fillCommandBuffer(this._cmdBuffer);
      buffer = this._cmdBuffer;
    }

    const count = buffer.count;
    if (count === 0) return;

    this._uploadInstanceData(buffer);

    gl.useProgram(this._program);
    gl.bindVertexArray(this._vao);
    this._setupInstanceAttributes();

    const canvas = gl.canvas;
    gl.uniform2f(this._locRes, canvas.width, canvas.height);
    gl.uniform1i(this._locTex, 0);

    const d = buffer.data;
    const t = buffer.textures;
    const stride = ParticleRenderCommandBuffer.STRIDE;
    const FRAME_OFF = 13;

    let batchStart = 0;
    let currentTex = null;
    let currentTexGL = this._whiteTexture;

    const flush = (end) => {
      const instCount = end - batchStart;
      if (instCount <= 0) return;

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, currentTexGL);

      if (currentTexGL === this._whiteTexture) {
        gl.uniform1f(this._locHasTex, 0);
        gl.uniform1f(this._locHasFrame, 0);
      } else {
        gl.uniform1f(this._locHasTex, 1);
        const w = currentTex.naturalWidth || currentTex.width || 1;
        const h = currentTex.naturalHeight || currentTex.height || 1;
        gl.uniform2f(this._locTexSize, w, h);

        const off = batchStart * stride + FRAME_OFF;
        const fx = d[off], fy = d[off + 1], fw = d[off + 2], fh = d[off + 3];
        if (fw > 0 && fh > 0) {
          gl.uniform1f(this._locHasFrame, 1);
          gl.uniform4f(this._locFrame, fx, fy, fw, fh);
        } else {
          gl.uniform1f(this._locHasFrame, 0);
        }
      }

      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, instCount);

      batchStart = end;
    };

    for (let i = 0; i <= count; i++) {
      const tex = i < count ? t[i] : undefined;
      if (tex !== currentTex) {
        flush(i);
        if (i < count) {
          currentTex = tex;
          currentTexGL = tex ? this._getGLTexture(tex) : this._whiteTexture;
        }
      }
    }
  }

  _uploadInstanceData(buffer) {
    const gl = this._gl;
    const neededBytes = buffer.count * INSTANCE_STRIDE;
    gl.bindBuffer(gl.ARRAY_BUFFER, this._instanceVBO);

    if (buffer.count > this._maxInstances) {
      gl.bufferData(gl.ARRAY_BUFFER, buffer.data.subarray(0, buffer.count * ParticleRenderCommandBuffer.STRIDE), gl.DYNAMIC_DRAW);
      this._maxInstances = buffer.count;
    } else {
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, buffer.data.subarray(0, buffer.count * ParticleRenderCommandBuffer.STRIDE));
    }
  }

  destroy() {
    const gl = this._gl;
    if (!gl) return;
    if (this._program) gl.deleteProgram(this._program);
    if (this._vao) gl.deleteVertexArray(this._vao);
    if (this._instanceVBO) gl.deleteBuffer(this._instanceVBO);
    if (this._whiteTexture) gl.deleteTexture(this._whiteTexture);
    for (const glTex of this._texCache.values()) {
      gl.deleteTexture(glTex);
    }
    this._texCache.clear();
    this._program = null;
    this._vao = null;
    this._instanceVBO = null;
    this._whiteTexture = null;
    super.destroy();
  }
}
