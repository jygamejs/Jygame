// Converts WgslGenerator output to valid WebGPU WGSL.
//
// Issues solved:
//   1. Multiple runtime-sized arrays in a single struct (invalid WGSL)
//      → array-of-structs with single runtime-sized array
//   2. Field accesses use "field[index]" without struct prefix
//      → particles.data[index].field
//   3. No base physics integration (CPU-side integrateParticle is not in WGSL)
//      → injected before integration pass operators
//
// Conversion:
//   Input WGSL:   struct ParticleData { x: array<f32>, ... }
//                 fn main() { ... alpha[index] = 1.0 - t; ... }
//
//   Output WGSL:  struct Particle { x: f32, ... }
//                 struct ParticleBuffer { data: array<Particle> }
//                 particles.data[index].alpha = 1.0 - t;
//                 + base integration code at start of main()

const FIELD_NAMES = [
  "x", "y", "vx", "vy", "ax", "ay",
  "life", "maxLife", "ageRatio",
  "rotation", "rotationSpeed",
  "size", "alpha", "depth",
  "r", "g", "b",
];

const FIELD_SET = new Set(FIELD_NAMES);

const BASE_INTEGRATION_WGSL = `
  // base physics integration
  vx[index] = vx[index] + ax[index] * uniforms.dt;
  vy[index] = vy[index] + ay[index] * uniforms.dt;
  x[index] = x[index] + vx[index] * uniforms.dt;
  y[index] = y[index] + vy[index] * uniforms.dt;
  rotation[index] = rotation[index] + rotationSpeed[index] * uniforms.dt;
  life[index] = life[index] - uniforms.dt;
  if (maxLife[index] > 0.0) {
    ageRatio[index] = clamp(1.0 - life[index] / maxLife[index], 0.0, 1.0);
  } else {
    ageRatio[index] = 0.0;
  }

`;

export function toWebGpuWgsl(wgsl) {
  // 1. Generate the valid struct definitions
  let result = "struct Particle {\n";
  for (const name of FIELD_NAMES) {
    const type = (name === "r" || name === "g" || name === "b") ? "u32" : "f32";
    result += `  ${name}: ${type},\n`;
  }
  result += "}\n\n";

  result += "struct ParticleBuffer {\n";
  result += "  data: array<Particle>,\n";
  result += "}\n\n";

  result += "struct SimUniforms {\n";
  result += "  dt: f32,\n";
  result += "  elapsedTime: f32,\n";
  result += "  particleCount: u32,\n";
  result += "}\n\n";

  result += "@group(0) @binding(0) var<storage, read_write> particles : ParticleBuffer;\n";
  result += "@group(0) @binding(1) var<uniform> uniforms : SimUniforms;\n\n";

  // 2. Extract helper functions (easing, etc.) and the main function body.
  //    The original WGSL layout is:
  //      struct declarations + bindings
  //      fn ease_* definitions          ← helpers to preserve
  //      @compute @workgroup_size(64)    ← main entry point
  //      fn main(...) { ... }
  const computePos = wgsl.indexOf("@compute");
  if (computePos === -1) return result;

  // Extract any fn ... { } definitions that appear between the binding
  // declarations and @compute. These are easing/utility functions.
  const beforeCompute = wgsl.slice(0, computePos);
  const lastBindingEnd = beforeCompute.lastIndexOf("SimUniforms;");
  if (lastBindingEnd !== -1) {
    const afterBindings = beforeCompute.slice(lastBindingEnd + "SimUniforms;".length);
    const trimmed = afterBindings.trim();
    if (trimmed) {
      result += trimmed + "\n\n";
    }
  }

  // The main function body from @compute onward
  const body = wgsl.slice(computePos);

  // 3. Inject base integration after the return guard, before the first pass
  let transformedBody = body.replace(
    /\/\/ === \w+ pass ===/,
    `${BASE_INTEGRATION_WGSL}  $&`,
  );

  // 4. Handle "particles.field[index]" pattern (AnimationShader style)
  transformedBody = transformedBody.replace(
    /particles\.(\w+)\[(\w+)\]/g,
    (_, field, idx) => {
      if (FIELD_SET.has(field)) {
        return `particles.data[${idx}].${field}`;
      }
      return `particles.${field}[${idx}]`;
    },
  );

  // 5. Handle "field[index]" pattern (all other shader operators)
  transformedBody = transformedBody.replace(
    /(\w+)\[(\w+)\]/g,
    (match, field, idx) => {
      if (FIELD_SET.has(field)) {
        return `particles.data[${idx}].${field}`;
      }
      return match;
    },
  );

  result += transformedBody;
  return result;
}
