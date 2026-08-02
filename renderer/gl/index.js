export function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`WebGL shader compile failed: ${log || "unknown error"}`);
  }
  return shader;
}

export function createProgram(gl, vertexSource, fragmentSource, attribs = null) {
  const vs = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fs = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  if (attribs) {
    for (const [name, index] of Object.entries(attribs)) {
      gl.bindAttribLocation(program, index, name);
    }
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    gl.deleteProgram(program);
    throw new Error(`WebGL program link failed: ${log || "unknown error"}`);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return program;
}

// Builds the camera view-projection matrix that mirrors the CanvasRenderer
// 2D transform (viewport-center translate, zoom scale, -rotation, -camera),
// followed by the NDC mapping (y-flipped).
export function buildViewProjection(camera, vp, viewportWidth, viewportHeight, screenSpace = false) {
  const m = new Float32Array(16);
  const invW = viewportWidth > 0 ? 2 / viewportWidth : 0;
  const invH = viewportHeight > 0 ? 2 / viewportHeight : 0;

  if (!camera || screenSpace) {
    m[0] = invW;
    m[5] = -invH;
    m[10] = 1;
    m[12] = -1;
    m[13] = 1;
    m[15] = 1;
    return m;
  }

  const camX = camera.x;
  const camY = camera.y;
  const zoom = camera.zoom;
  const cosR = Math.cos(-camera.rotation);
  const sinR = Math.sin(-camera.rotation);
  const cx = vp ? vp.x + vp.width * 0.5 : 0;
  const cy = vp ? vp.y + vp.height * 0.5 : 0;

  m[0] = invW * zoom * cosR;
  m[1] = -invH * zoom * sinR;
  m[4] = -invW * zoom * sinR;
  m[5] = -invH * zoom * cosR;
  m[10] = 1;
  m[12] = invW * (cx - zoom * (cosR * camX - sinR * camY)) - 1;
  m[13] = invH * (zoom * (sinR * camX + cosR * camY) - cy) + 1;
  m[15] = 1;
  return m;
}
