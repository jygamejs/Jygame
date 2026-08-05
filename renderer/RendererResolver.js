import { CanvasRenderer } from "./CanvasRenderer.js";
import { WebGLRenderer } from "./WebGLRenderer.js";
import { WebGpuRenderer } from "./WebGpuRenderer.js";

export class RendererResolver {
  static resolve({ renderer = "auto", canvas = null, width = 0, height = 0, options = {} } = {}) {
    if (renderer && typeof renderer === "object") {
      return renderer;
    }

    switch (renderer) {
      case "auto":
        if (WebGpuRenderer.isAvailable()) {
          try {
            return new WebGpuRenderer({ canvas, width, height, options });
          } catch (err) {
            // webgpu context unobtainable — fall through to WebGL2
          }
        }
        if (WebGLRenderer.isAvailable()) {
          return new WebGLRenderer({ canvas, width, height, options });
        }
        return new CanvasRenderer({ canvas, width, height, options });
      case "canvas":
        return new CanvasRenderer({ canvas, width, height, options });
      case "webgl":
        return new WebGLRenderer({ canvas, width, height, options });
      case "webgpu":
        return new WebGpuRenderer({ canvas, width, height, options });
      default:
        throw new Error(
          `Unknown renderer '${renderer}'. Supported: "auto", "canvas", "webgl", "webgpu", or a Renderer instance.`
        );
    }
  }

  // Ordered fallback chain used when a renderer fails to initialize or
  // construct. `renderer` is the option the user passed in.
  static chain(renderer) {
    if (renderer && typeof renderer === "object") return [];
    switch (renderer) {
      case "webgpu":
        return ["webgpu", "webgl", "canvas"];
      case "webgl":
        return ["webgl", "canvas"];
      case "canvas":
        return ["canvas"];
      case "auto":
      case undefined:
      case null:
        return ["webgpu", "webgl", "canvas"];
      default:
        throw new Error(`Unknown renderer '${renderer}'.`);
    }
  }

  // The kind ("webgpu" | "webgl" | "canvas") of a resolved renderer instance.
  static kindOf(instance) {
    if (!instance) return null;
    const name = instance.constructor ? instance.constructor.name : "";
    if (name === "WebGpuRenderer") return "webgpu";
    if (name === "WebGLRenderer") return "webgl";
    if (name === "CanvasRenderer") return "canvas";
    return null;
  }

  // Constructs a renderer for a specific kind. Throws when the backing
  // context cannot be obtained.
  static resolveKind(kind, { canvas = null, width = 0, height = 0, options = {} } = {}) {
    switch (kind) {
      case "webgpu":
        return new WebGpuRenderer({ canvas, width, height, options });
      case "webgl":
        return new WebGLRenderer({ canvas, width, height, options });
      case "canvas":
        return new CanvasRenderer({ canvas, width, height, options });
      default:
        throw new Error(`Unknown renderer kind '${kind}'.`);
    }
  }
}
