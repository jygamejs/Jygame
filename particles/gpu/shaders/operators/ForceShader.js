import { uid } from "../wgslUtils.js";

export const ForceShader = {
  type: "force",

  emit(descriptor) {
    const tx = descriptor.x != null ? descriptor.x : 0;
    const ty = descriptor.y != null ? descriptor.y : 0;
    const strength = descriptor.strength || 0;
    const falloff = descriptor.falloff || "none";
    const minDist = descriptor.minDistance != null ? descriptor.minDistance : 10;
    const n = uid();
    return `
  let dx${n} = ${tx} - x[index];
  let dy${n} = ${ty} - y[index];
  let distSq${n} = dx${n} * dx${n} + dy${n} * dy${n};
  let dist${n} = sqrt(distSq${n});
  if (dist${n} > 0.0) {
    let clamped${n} = max(dist${n}, ${minDist});
    let nx${n} = dx${n} / dist${n};
    let ny${n} = dy${n} / dist${n};
    var f${n} = f32(${strength});
    ${falloff === "inverse" ? `f${n} = f${n} / clamped${n};` : ""}
    ${falloff === "inverseSquared" ? `f${n} = f${n} / (clamped${n} * clamped${n});` : ""}
    vx[index] = vx[index] + nx${n} * f${n} * uniforms.dt;
    vy[index] = vy[index] + ny${n} * f${n} * uniforms.dt;
  }
`;
  },
};
