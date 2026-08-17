// Shared WGSL sources and WebGPU helpers for the WebGPU renderer.

// Camera matrix uniform (16 floats, 64 bytes). Mirrors the GL renderer's
// view-projection so WebGPU and WebGL produce identical output.
export const CAMERA_UNIFORM_STRUCT = /* wgsl */ `
struct CameraUniform {
  m : mat4x4<f32>,
};
@group(0) @binding(0) var<uniform> camera : CameraUniform;
`;

export const SPRITE_VERTEX_WGSL = /* wgsl */ `
${CAMERA_UNIFORM_STRUCT}

struct InstanceData {
  x: f32, y: f32, rotation: f32, scaleX: f32,
  scaleY: f32, width: f32, height: f32, u0: f32,
  v0: f32, u1: f32, v1: f32, r: f32,
  g: f32, b: f32, a: f32, depth: f32,
  shape: f32,
  pad0: f32, pad1: f32, pad2: f32,
};

@group(0) @binding(1) var<storage, read> instances : array<InstanceData>;

const CORNERS = array<vec2<f32>, 4>(
  vec2(0.0, 0.0), vec2(1.0, 0.0), vec2(0.0, 1.0), vec2(1.0, 1.0),
);

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) color: vec4<f32>,
  @location(2) local: vec2<f32>,
  @location(3) scale: vec2<f32>,
  @location(4) radius: f32,
  @location(5) shape: f32,
};

@vertex
fn vs_main(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VertexOutput {
  let inst = instances[ii];
  let corner = CORNERS[vi];
  var local = (corner - vec2(0.5)) * vec2(inst.width, inst.height) * vec2(inst.scaleX, inst.scaleY);
  let c = cos(inst.rotation);
  let s = sin(inst.rotation);
  let rotated = vec2(local.x * c - local.y * s, local.x * s + local.y * c);
  let world = rotated + vec2(inst.x, inst.y);

  var output: VertexOutput;
  output.position = camera.m * vec4(world, inst.depth, 1.0);
  output.uv = mix(vec2(inst.u0, inst.v0), vec2(inst.u1, inst.v1), corner);
  output.color = vec4(inst.r, inst.g, inst.b, inst.a);
  output.local = local;
  output.scale = vec2(inst.scaleX, inst.scaleY);
  output.radius = min(abs(inst.width), abs(inst.height)) * 0.5;
  output.shape = inst.shape;
  return output;
}
`;

export const SPRITE_FRAGMENT_WGSL = /* wgsl */ `
@group(1) @binding(0) var texSampler: sampler;
@group(1) @binding(1) var tex: texture_2d<f32>;

struct FragmentInput {
  @location(0) uv: vec2<f32>,
  @location(1) color: vec4<f32>,
  @location(2) local: vec2<f32>,
  @location(3) scale: vec2<f32>,
  @location(4) radius: f32,
  @location(5) shape: f32,
};

@fragment
fn fs_main(input: FragmentInput) -> @location(0) vec4<f32> {
  if (input.shape > 0.5) {
    // WGSL has no ternary ?: operator; use select().
    let p = select(vec2(0.0, 0.0), input.local / input.scale, input.scale.x != 0.0 && input.scale.y != 0.0);
    if (length(p) > input.radius) { discard; }
  }
  var color = textureSample(tex, texSampler, input.uv) * input.color;
  if (color.a <= 0.001) { discard; }
  return color;
}
`;

export const TRAIL_VERTEX_WGSL = /* wgsl */ `
${CAMERA_UNIFORM_STRUCT}

struct VertexInput {
  @location(0) aPos: vec2<f32>,
  @location(1) aColor: vec3<f32>,
};

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) color: vec3<f32>,
};

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  output.position = camera.m * vec4(input.aPos, 0.0, 1.0);
  output.color = input.aColor;
  return output;
}
`;

export const TRAIL_FRAGMENT_WGSL = /* wgsl */ `
struct FragmentInput {
  @location(0) color: vec3<f32>,
};

@fragment
fn fs_main(input: FragmentInput) -> @location(0) vec4<f32> {
  return vec4(input.color, 1.0);
}
`;

export const COMPOSITE_VERTEX_WGSL = /* wgsl */ `
const POS = array<vec2<f32>, 4>(
  vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(-1.0, 1.0), vec2(1.0, 1.0),
);
const UV = array<vec2<f32>, 4>(
  vec2(0.0, 1.0), vec2(1.0, 1.0), vec2(0.0, 0.0), vec2(1.0, 0.0),
);

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vi: u32) -> VertexOutput {
  var output: VertexOutput;
  output.position = vec4(POS[vi], 0.0, 1.0);
  output.uv = UV[vi];
  return output;
}
`;

export const COMPOSITE_FRAGMENT_WGSL = /* wgsl */ `
@group(0) @binding(0) var texSampler: sampler;
@group(0) @binding(1) var tex: texture_2d<f32>;

struct FragmentInput {
  @location(0) uv: vec2<f32>,
};

@fragment
fn fs_main(input: FragmentInput) -> @location(0) vec4<f32> {
  return textureSample(tex, texSampler, input.uv);
}
`;
