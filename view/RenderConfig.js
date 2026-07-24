import { Layer } from "./Layer.js";

export class RenderConfig {
  constructor(options = {}) {
    this.clearColor     = options.clearColor ?? null;
    this.layers         = options.layers ?? Layer.ALL;
    this.screenSpace    = options.screenSpace ?? false;
    this.imageSmoothing = options.imageSmoothing ?? true;
    this.pixelPerfect   = options.pixelPerfect ?? false;
    this.culling        = options.culling ?? true;
  }
}
