export function makeMockGL() {
  const calls = {
    createShader: [],
    shaderSource: [],
    compileShader: [],
    createProgram: [],
    attachShader: [],
    bindAttribLocation: [],
    linkProgram: [],
    createBuffer: [],
    bindBuffer: [],
    bufferData: [],
    bufferSubData: [],
    createVertexArray: [],
    bindVertexArray: [],
    enableVertexAttribArray: [],
    vertexAttribPointer: [],
    vertexAttribDivisor: [],
    getUniformLocation: [],
    uniformMatrix4fv: [],
    uniform1i: [],
    activeTexture: [],
    createTexture: [],
    bindTexture: [],
    texImage2D: [],
    texParameteri: [],
    pixelStorei: [],
    clearColor: [],
    clear: [],
    viewport: [],
    useProgram: [],
    enable: [],
    disable: [],
    blendFunc: [],
    drawArrays: [],
    drawArraysInstanced: [],
    deleteProgram: [],
    deleteShader: [],
    deleteBuffer: [],
    deleteVertexArray: [],
    deleteTexture: [],
  };

  const gl = {
    VERTEX_SHADER: 0x8B31,
    FRAGMENT_SHADER: 0x8B30,
    COMPILE_STATUS: 0x8B81,
    LINK_STATUS: 0x8B82,
    ARRAY_BUFFER: 0x8892,
    STATIC_DRAW: 0x88E4,
    DYNAMIC_DRAW: 0x88E8,
    TRIANGLE_STRIP: 0x0005,
    FLOAT: 0x1406,
    RGBA: 0x1908,
    UNSIGNED_BYTE: 0x1401,
    TEXTURE_2D: 0x0DE1,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    CLAMP_TO_EDGE: 0x812F,
    LINEAR: 0x2601,
    NEAREST: 0x2600,
    UNPACK_PREMULTIPLY_ALPHA_WEBGL: 0x9241,
    BLEND: 0x0BE2,
    DEPTH_TEST: 0x0B71,
    ONE: 1,
    ONE_MINUS_SRC_ALPHA: 0x0303,
    COLOR_BUFFER_BIT: 0x4000,
    TEXTURE0: 0x84C0,
  };

  let nextId = 1;
  const ids = { program: {}, shader: {}, buffer: {}, texture: {}, vao: {} };

  gl.createShader = (type) => {
    const shader = { id: nextId++, type, compiled: false };
    calls.createShader.push(shader);
    return shader;
  };
  gl.shaderSource = (shader, src) => {
    calls.shaderSource.push({ shader: shader.id, src });
    shader.source = src;
  };
  gl.compileShader = (shader) => {
    calls.compileShader.push(shader.id);
    shader.compiled = true;
  };
  gl.getShaderParameter = (shader, pname) => (shader.compiled ? true : false);
  gl.getShaderInfoLog = () => "";
  gl.deleteShader = (shader) => calls.deleteShader.push(shader.id);

  gl.createProgram = () => {
    const program = { id: nextId++, shaders: [], linked: false };
    calls.createProgram.push(program);
    ids.program[program.id] = program;
    return program;
  };
  gl.attachShader = (program, shader) => {
    calls.attachShader.push({ program: program.id, shader: shader.id });
    program.shaders.push(shader);
  };
  gl.bindAttribLocation = (program, index, name) => {
    calls.bindAttribLocation.push({ program: program.id, index, name });
  };
  gl.linkProgram = (program) => {
    calls.linkProgram.push(program.id);
    program.linked = true;
  };
  gl.getProgramParameter = (program, pname) => (program.linked ? true : false);
  gl.getProgramInfoLog = () => "";
  gl.deleteProgram = (program) => calls.deleteProgram.push(program.id);
  gl.useProgram = (program) => {
    calls.useProgram.push(program ? program.id : null);
    gl._program = program;
  };
  gl.getUniformLocation = (program, name) => {
    const loc = { program: program.id, name };
    calls.getUniformLocation.push(loc);
    return loc;
  };
  gl.uniformMatrix4fv = (loc, transpose, value) => {
    calls.uniformMatrix4fv.push({ loc, transpose, value: value ? Array.from(value) : null });
  };
  gl.uniform1i = (loc, value) => calls.uniform1i.push({ loc, value });

  gl.createBuffer = () => {
    const buffer = { id: nextId++, data: null };
    calls.createBuffer.push(buffer);
    ids.buffer[buffer.id] = buffer;
    return buffer;
  };
  gl.bindBuffer = (target, buffer) => {
    calls.bindBuffer.push({ target, buffer: buffer ? buffer.id : null });
    gl._boundBuffer = buffer;
  };
  gl.bufferData = (target, data, usage) => {
    calls.bufferData.push({ target, byteLength: data ? data.byteLength : null, usage });
    if (gl._boundBuffer) gl._boundBuffer.data = data;
  };
  gl.bufferSubData = (target, offset, data) => {
    calls.bufferSubData.push({ target, offset, byteLength: data ? data.byteLength : null });
  };
  gl.deleteBuffer = (buffer) => calls.deleteBuffer.push(buffer.id);

  gl.createVertexArray = () => {
    const vao = { id: nextId++ };
    calls.createVertexArray.push(vao);
    ids.vao[vao.id] = vao;
    return vao;
  };
  gl.bindVertexArray = (vao) => calls.bindVertexArray.push(vao ? vao.id : null);
  gl.deleteVertexArray = (vao) => calls.deleteVertexArray.push(vao.id);
  gl.enableVertexAttribArray = (index) => calls.enableVertexAttribArray.push(index);
  gl.vertexAttribPointer = (index, size, type, normalized, stride, offset) => {
    calls.vertexAttribPointer.push({ index, size, type, normalized, stride, offset });
  };
  gl.vertexAttribDivisor = (index, divisor) => {
    calls.vertexAttribDivisor.push({ index, divisor });
  };

  gl.activeTexture = (texture) => calls.activeTexture.push(texture);
  gl.createTexture = () => {
    const texture = { id: nextId++, image: null, params: [] };
    calls.createTexture.push(texture);
    ids.texture[texture.id] = texture;
    return texture;
  };
  gl.bindTexture = (target, texture) => {
    calls.bindTexture.push({ target, texture: texture ? texture.id : null });
    gl._boundTexture = texture;
  };
  gl.texImage2D = (target, level, internalFormat, format, type, source) => {
    calls.texImage2D.push({ target, level, internalFormat, format, type, source });
    if (gl._boundTexture) gl._boundTexture.image = source;
  };
  gl.texParameteri = (target, pname, value) => {
    calls.texParameteri.push({ target, pname, value });
    if (gl._boundTexture) gl._boundTexture.params.push([pname, value]);
  };
  gl.pixelStorei = (pname, value) => calls.pixelStorei.push({ pname, value });
  gl.deleteTexture = (texture) => calls.deleteTexture.push(texture.id);

  gl.enable = (cap) => calls.enable.push(cap);
  gl.disable = (cap) => calls.disable.push(cap);
  gl.blendFunc = (a, b) => calls.blendFunc.push([a, b]);
  gl.viewport = (x, y, w, h) => calls.viewport.push([x, y, w, h]);
  gl.clearColor = (r, g, b, a) => calls.clearColor.push([r, g, b, a]);
  gl.clear = (mask) => calls.clear.push(mask);
  gl.drawArrays = (mode, first, count) => calls.drawArrays.push({ mode, first, count });
  gl.drawArraysInstanced = (mode, first, count, instanceCount) => {
    calls.drawArraysInstanced.push({ mode, first, count, instanceCount });
  };
  gl.getError = () => 0;

  return { gl, calls, ids };
}
