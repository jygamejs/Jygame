export class TextureCache {
  constructor(gl) {
    this._gl = gl;
    this._cache = new Map();
    this._white = null;
  }

  get(sourceImage, smoothing = true) {
    let entry = this._cache.get(sourceImage);
    if (entry) return entry;

    const gl = this._gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceImage);
    const filter = smoothing ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const width = (sourceImage.width ?? sourceImage.naturalWidth) || 1;
    const height = (sourceImage.height ?? sourceImage.naturalHeight) || 1;
    entry = { texture, width, height, smoothing };
    this._cache.set(sourceImage, entry);
    return entry;
  }

  white() {
    if (this._white) return this._white;

    const gl = this._gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this._white = { texture, width: 1, height: 1, smoothing: true };
    return this._white;
  }

  destroy() {
    const gl = this._gl;
    for (const entry of this._cache.values()) {
      gl.deleteTexture(entry.texture);
    }
    this._cache.clear();
    if (this._white) {
      gl.deleteTexture(this._white.texture);
      this._white = null;
    }
  }
}
