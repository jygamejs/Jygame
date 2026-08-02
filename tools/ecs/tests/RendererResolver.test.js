import { describe, it } from "node:test";
import * as assert from "node:assert";
import { RendererResolver } from "../../../renderer/RendererResolver.js";
import { CanvasRenderer } from "../../../renderer/CanvasRenderer.js";

const mockCanvas = { width: 800, height: 600, getContext: () => ({}) };

describe("RendererResolver", () => {
  it('resolves "auto" to a CanvasRenderer (only backend available today)', () => {
    const r = RendererResolver.resolve({ renderer: "auto", canvas: mockCanvas, width: 800, height: 600 });
    assert.ok(r instanceof CanvasRenderer);
  });

  it('resolves "canvas" to a CanvasRenderer', () => {
    const r = RendererResolver.resolve({ renderer: "canvas", canvas: mockCanvas, width: 800, height: 600 });
    assert.ok(r instanceof CanvasRenderer);
  });

  it("defaults to auto when renderer is omitted", () => {
    const r = RendererResolver.resolve({ canvas: mockCanvas, width: 800, height: 600 });
    assert.ok(r instanceof CanvasRenderer);
  });

  it("passes through a renderer instance unchanged", () => {
    const inst = {};
    assert.strictEqual(RendererResolver.resolve({ renderer: inst }), inst);
  });

  it('throws "not implemented yet" for "webgl"', () => {
    assert.throws(() => RendererResolver.resolve({ renderer: "webgl" }), /not implemented yet/);
  });

  it('throws "not implemented yet" for "webgpu"', () => {
    assert.throws(() => RendererResolver.resolve({ renderer: "webgpu" }), /not implemented yet/);
  });

  it("throws for unknown renderer strings", () => {
    assert.throws(() => RendererResolver.resolve({ renderer: "vulkan" }), /Unknown renderer/);
  });
});
