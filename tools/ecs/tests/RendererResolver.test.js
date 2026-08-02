import { describe, it, after } from "node:test";
import * as assert from "node:assert";
import { RendererResolver } from "../../../renderer/RendererResolver.js";
import { CanvasRenderer } from "../../../renderer/CanvasRenderer.js";
import { WebGLRenderer } from "../../../renderer/WebGLRenderer.js";
import { makeMockGL } from "./lib/MockGL.js";

let webgl2Available = false;

globalThis.document = {
  createElement: () => ({
    width: 800,
    height: 600,
    getContext: (kind) => {
      if (kind === "2d") return {};
      if (kind === "webgl2") return webgl2Available ? makeMockGL().gl : null;
      return null;
    },
  }),
};

function canvasWith(getContext) {
  return { width: 800, height: 600, getContext };
}

function glCanvas() {
  return canvasWith((kind) => (kind === "webgl2" ? makeMockGL().gl : null));
}

after(() => {
  webgl2Available = false;
});

describe("RendererResolver", () => {
  it('resolves "canvas" to a CanvasRenderer', () => {
    const r = RendererResolver.resolve({ renderer: "canvas", canvas: canvasWith(() => ({})), width: 800, height: 600 });
    assert.ok(r instanceof CanvasRenderer);
  });

  it('resolves "auto" to a CanvasRenderer when WebGL2 is unavailable', () => {
    webgl2Available = false;
    const r = RendererResolver.resolve({ renderer: "auto", canvas: canvasWith((k) => (k === "2d" ? {} : null)), width: 800, height: 600 });
    assert.ok(r instanceof CanvasRenderer);
  });

  it('resolves "auto" to a WebGLRenderer when WebGL2 is available', () => {
    webgl2Available = true;
    const r = RendererResolver.resolve({ renderer: "auto", canvas: glCanvas(), width: 800, height: 600 });
    assert.ok(r instanceof WebGLRenderer);
    r.destroy();
  });

  it('resolves "webgl" to a WebGLRenderer when a GL context exists', () => {
    const r = RendererResolver.resolve({ renderer: "webgl", canvas: glCanvas(), width: 800, height: 600 });
    assert.ok(r instanceof WebGLRenderer);
    r.destroy();
  });

  it('throws for "webgl" without a WebGL2 context', () => {
    assert.throws(() => RendererResolver.resolve({ renderer: "webgl", canvas: canvasWith(() => null) }), /WebGL2/);
  });

  it('throws "not implemented yet" for "webgpu"', () => {
    assert.throws(() => RendererResolver.resolve({ renderer: "webgpu" }), /not implemented yet/);
  });

  it("defaults to auto when renderer is omitted", () => {
    webgl2Available = false;
    const r = RendererResolver.resolve({ canvas: canvasWith((k) => (k === "2d" ? {} : null)), width: 800, height: 600 });
    assert.ok(r instanceof CanvasRenderer);
  });

  it("passes through a renderer instance unchanged", () => {
    const inst = {};
    assert.strictEqual(RendererResolver.resolve({ renderer: inst }), inst);
  });

  it("throws for unknown renderer strings", () => {
    assert.throws(() => RendererResolver.resolve({ renderer: "vulkan" }), /Unknown renderer/);
  });
});
