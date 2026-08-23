import { WebGpuDeviceManager } from "../../gpu/webgpu/WebGpuDeviceManager.js";

const VERTEX_SHADER_WGSL = `
struct Particle {
  x: f32, y: f32, vx: f32, vy: f32,
  ax: f32, ay: f32, life: f32, maxLife: f32,
  ageRatio: f32, rotation: f32, rotationSpeed: f32,
  size: f32, alpha: f32, depth: f32,
  r: u32, g: u32, b: u32,
  alive: u32,
  seed: f32,
  segment: u32,
  visualType: u32,
};

@group(0) @binding(0) var<storage, read> particles : array<Particle>;
@group(0) @binding(1) var<uniform> camera : CameraUniform;

struct CameraUniform {
  m : mat4x4<f32>,
};

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) color: vec3<f32>,
  @location(2) alpha: f32,
  @location(3) visualType: f32,
};

const QUAD_POS = array<vec2<f32>, 4>(
  vec2(-0.5, -0.5), vec2(0.5, -0.5), vec2(0.5, 0.5), vec2(-0.5, 0.5),
);

const QUAD_UV = array<vec2<f32>, 4>(
  vec2(0.0, 1.0), vec2(1.0, 1.0), vec2(1.0, 0.0), vec2(0.0, 0.0),
);

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) instanceIndex: u32) -> VertexOutput {
  let p = particles[instanceIndex];

  var pos = vec4<f32>();
  if (p.alive > 0u) {
    let w = p.size;
    let h = p.size;
    // Quad is centered on the particle (origin 0.5) like the CPU and operator
    // GPU renderers, and transformed by the same camera matrix the sprite path
    // uses so particles live in world space under the camera.
    var local = QUAD_POS[vertexIndex] * vec2(w, h);
    let c = cos(p.rotation);
    let s = sin(p.rotation);
    local = vec2(local.x * c - local.y * s, local.x * s + local.y * c);
    let world = local + vec2(p.x, p.y);
    pos = camera.m * vec4(world, clamp(p.depth, -0.99, 0.99), 1.0);
  } else {
    pos = vec4(0.0, 0.0, 0.0, 0.0);
  }

  var output: VertexOutput;
  output.position = pos;
  output.uv = QUAD_UV[vertexIndex];
  output.color = vec3(f32(p.r) / 255.0, f32(p.g) / 255.0, f32(p.b) / 255.0);
  output.alpha = p.alpha;
  output.visualType = f32(p.visualType);
  return output;
}
`;

const FRAGMENT_SHADER_WGSL = `
@group(1) @binding(0) var textureSampler: sampler;
@group(1) @binding(1) var particleTexture: texture_2d<f32>;

struct FragmentInput {
  @location(0) uv: vec2<f32>,
  @location(1) color: vec3<f32>,
  @location(2) alpha: f32,
  @location(3) visualType: f32,
};

@fragment
fn fs_main(input: FragmentInput) -> @location(0) vec4<f32> {
  if (input.visualType > 0.5 && input.visualType < 1.5) {
    let c = input.uv - vec2(0.5);
    if (dot(c, c) > 0.25) {
      discard;
    }
  }
  let texColor = textureSample(particleTexture, textureSampler, input.uv);
  let resultColor = input.color * texColor.rgb;
  let resultAlpha = input.alpha * texColor.a;
  return vec4(resultColor, resultAlpha);
}
`;

const INDEX_DATA = new Uint16Array([0, 1, 2, 0, 2, 3]);

export class WebGpuParticleRenderer {
  constructor({ canvas, device } = {}) {
    this._canvas = canvas || null;
    this._device = device || WebGpuDeviceManager.device();
    this._context = null;
    this._pipeline = null;
    this._pipelineLayout = null;
    this._bindGroupLayout0 = null;
    this._bindGroupLayout1 = null;
    this._indexBuffer = null;
    this._renderUniformBuffer = null;
    this._renderBindGroup0 = null;
    this._particleBuffer = null;
    this._whiteTexture = null;
    this._whiteTextureView = null;
    this._sampler = null;
    this._vsModule = null;
    this._fsModule = null;
    this._pipelines = null;
    this._config = {
      format: typeof navigator !== "undefined" && navigator.gpu
        ? navigator.gpu.getPreferredCanvasFormat()
        : "bgra8unorm",
      alphaMode: "premultiplied",
    };
    this._initialized = false;
  }

  async initialize() {
    if (this._initialized) return;
    const device = this._device;

    if (this._canvas) {
      this._context = this._canvas.getContext("webgpu");
      this._context.configure({
        device,
        format: this._config.format,
        alphaMode: this._config.alphaMode,
      });
    }

    // Create bind group layouts
    this._bindGroupLayout0 = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: "read-only-storage" },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: "uniform" },
        },
      ],
    });

    this._bindGroupLayout1 = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: "filtering" },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: "float" },
        },
      ],
    });

    this._pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [this._bindGroupLayout0, this._bindGroupLayout1],
    });

    // Shader modules
    this._vsModule = device.createShaderModule({ code: VERTEX_SHADER_WGSL });
    this._fsModule = device.createShaderModule({ code: FRAGMENT_SHADER_WGSL });
    this._pipelines = new Map();

    // Index buffer (static)
    this._indexBuffer = device.createBuffer({
      size: INDEX_DATA.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this._indexBuffer, 0, INDEX_DATA.buffer);

    // Camera uniform buffer (mat4x4, 64 bytes) — same layout as the sprite
    // batch so particles transform under the same view-projection.
    this._renderUniformBuffer = device.createBuffer({
      size: 64,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // White fallback texture
    this._whiteTexture = device.createTexture({
      size: { width: 1, height: 1, depthOrArrayLayers: 1 },
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    this._whiteTextureView = this._whiteTexture.createView();
    device.queue.writeTexture(
      { texture: this._whiteTexture },
      new Uint8Array([255, 255, 255, 255]),
      { bytesPerRow: 4, rowsPerImage: 1 },
      { width: 1, height: 1, depthOrArrayLayers: 1 },
    );

    // Sampler
    this._sampler = device.createSampler({
      minFilter: "linear",
      magFilter: "linear",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
    });

    this._initialized = true;
  }

  setCanvas(canvas) {
    this._canvas = canvas;
    if (this._initialized) {
      this._context = canvas.getContext("webgpu");
      this._context.configure({
        device: this._device,
        format: this._config.format,
        alphaMode: this._config.alphaMode,
      });
    }
  }

  setParticleBuffer(buffer) {
    this._particleBuffer = buffer;
    this._renderBindGroup0 = null; // invalidate, will recreate on next render
  }

  _ensureBindGroup0() {
    if (this._renderBindGroup0) return;

    this._renderBindGroup0 = this._device.createBindGroup({
      layout: this._bindGroupLayout0,
      entries: [
        {
          binding: 0,
          resource: { buffer: this._particleBuffer },
        },
        {
          binding: 1,
          resource: { buffer: this._renderUniformBuffer },
        },
      ],
    });
  }

  // Creates (and caches) a render pipeline for the given color attachment
  // format. The pipeline target must match the format of whatever pass draws
  // the particles — the standalone swapchain path uses the preferred canvas
  // format, while the WebGpuRenderer frame pass may use a configured format.
  _ensurePipeline(format) {
    const key = format || this._config.format;
    let pipeline = this._pipelines.get(key);
    if (pipeline) return pipeline;

    pipeline = this._device.createRenderPipeline({
      layout: this._pipelineLayout,
      vertex: {
        module: this._vsModule,
        entryPoint: "vs_main",
      },
      fragment: {
        module: this._fsModule,
        entryPoint: "fs_main",
        targets: [
          {
            format: key,
            blend: {
              color: {
                srcFactor: "src-alpha",
                dstFactor: "one-minus-src-alpha",
                operation: "add",
              },
              alpha: {
                srcFactor: "one",
                dstFactor: "one-minus-src-alpha",
                operation: "add",
              },
            },
          },
        ],
      },
      primitive: {
        topology: "triangle-list",
      },
    });
    this._pipelines.set(key, pipeline);
    return pipeline;
  }

  // Draws `particleCount` particles. When `pass` is provided the particles are
  // drawn into that existing render pass (the WebGpuRenderer's frame pass), so
  // they render in pass order instead of via a separate submit that the
  // frame's loadOp "clear" pass would wipe afterwards. Without a pass the
  // renderer falls back to its own command buffer into the swapchain.
  // `matrix` is the camera view-projection used by the sprite path; when
  // absent a default screen-space matrix preserves the old NDC mapping.
  render(particleCount, textureView, pass, targetFormat, matrix) {
    if (!this._initialized) return;
    if (particleCount === 0) return;
    if (!this._canvas) return;

    this._ensureBindGroup0();

    const device = this._device;
    const canvas = this._canvas;

    // Write the camera matrix into the uniform buffer.
    if (matrix) {
      device.queue.writeBuffer(this._renderUniformBuffer, 0, matrix);
    } else {
      const m = this._screenSpaceMatrix(canvas.width, canvas.height);
      device.queue.writeBuffer(this._renderUniformBuffer, 0, m);
    }

    // Create bind group 1 (texture)
    const texView = textureView || this._whiteTextureView;
    const bindGroup1 = device.createBindGroup({
      layout: this._bindGroupLayout1,
      entries: [
        { binding: 0, resource: this._sampler },
        { binding: 1, resource: texView },
      ],
    });

    const pipeline = this._ensurePipeline(targetFormat);

    const draw = (rp) => {
      rp.setPipeline(pipeline);
      rp.setBindGroup(0, this._renderBindGroup0);
      rp.setBindGroup(1, bindGroup1);
      rp.setIndexBuffer(this._indexBuffer, "uint16");
      rp.drawIndexed(6, particleCount, 0, 0, 0);
    };

    if (pass) {
      draw(pass);
      return;
    }

    if (!this._context) return;
    const texture = this._context.getCurrentTexture();
    const view = texture.createView();

    const commandEncoder = device.createCommandEncoder();
    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view,
          loadOp: "load",
          storeOp: "store",
        },
      ],
    });
    draw(renderPass);
    renderPass.end();

    device.queue.submit([commandEncoder.finish()]);
  }

  // Screen-space identity view-projection: maps world coords directly to NDC
  // with the y-axis flipped (x/width*2-1, 1-y/height*2). Mirrors the matrix
  // `buildViewProjection` produces for a null camera, so the no-camera
  // fallback matches the engine's screen-space convention.
  _screenSpaceMatrix(width, height) {
    const m = new Float32Array(16);
    m[0] = width > 0 ? 2 / width : 0;
    m[5] = height > 0 ? -2 / height : 0;
    m[10] = 1;
    m[12] = -1;
    m[13] = 1;
    m[15] = 1;
    return m;
  }

  destroy() {
    this._initialized = false;
    const device = this._device;
    if (!device) return;
    if (this._indexBuffer) { this._indexBuffer.destroy(); this._indexBuffer = null; }
    if (this._renderUniformBuffer) { this._renderUniformBuffer.destroy(); this._renderUniformBuffer = null; }
    if (this._whiteTexture) { this._whiteTexture.destroy(); this._whiteTexture = null; }
    this._whiteTextureView = null;
    this._pipeline = null;
    this._pipelineLayout = null;
    this._bindGroupLayout0 = null;
    this._bindGroupLayout1 = null;
    this._renderBindGroup0 = null;
    this._particleBuffer = null;
    this._vsModule = null;
    this._fsModule = null;
    this._pipelines = null;
    this._context = null;
    this._canvas = null;
  }
}
