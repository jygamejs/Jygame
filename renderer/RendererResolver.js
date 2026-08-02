import { CanvasRenderer } from "./CanvasRenderer.js";

export class RendererResolver {
  static resolve({ renderer = "auto", canvas = null, width = 0, height = 0, options = {} } = {}) {
    if (renderer && typeof renderer === "object") {
      return renderer;
    }

    switch (renderer) {
      case "auto":
      case "canvas":
        return new CanvasRenderer({ canvas, width, height, options });
      case "webgl":
      case "webgpu":
        throw new Error(`Renderer '${renderer}' not implemented yet.`);
      default:
        throw new Error(
          `Unknown renderer '${renderer}'. Supported: "auto", "canvas", "webgl", "webgpu", or a Renderer instance.`
        );
    }
  }
}
