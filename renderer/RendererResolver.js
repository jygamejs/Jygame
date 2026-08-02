import { CanvasRenderer } from "./CanvasRenderer.js";
import { WebGLRenderer } from "./WebGLRenderer.js";

export class RendererResolver {
  static resolve({ renderer = "auto", canvas = null, width = 0, height = 0, options = {} } = {}) {
    if (renderer && typeof renderer === "object") {
      return renderer;
    }

    switch (renderer) {
      case "auto":
        if (WebGLRenderer.isAvailable()) {
          return new WebGLRenderer({ canvas, width, height, options });
        }
        return new CanvasRenderer({ canvas, width, height, options });
      case "canvas":
        return new CanvasRenderer({ canvas, width, height, options });
      case "webgl":
        return new WebGLRenderer({ canvas, width, height, options });
      case "webgpu":
        throw new Error(`Renderer 'webgpu' not implemented yet.`);
      default:
        throw new Error(
          `Unknown renderer '${renderer}'. Supported: "auto", "canvas", "webgl", "webgpu", or a Renderer instance.`
        );
    }
  }
}
