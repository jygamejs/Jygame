import { uid } from "../wgslUtils.js";

export const OrbitShader = {
  type: "orbit",

  emit(descriptor) {
    const tx = descriptor.x != null ? descriptor.x : 0;
    const ty = descriptor.y != null ? descriptor.y : 0;
    const strength = descriptor.strength || 0;
    const falloff = descriptor.falloff || "none";
    const minDist = descriptor.minDistance != null ? descriptor.minDistance : 10;
    const radius = descriptor.radius;
    const stiffness = descriptor.stiffness != null ? descriptor.stiffness : 2;
    const clockwise = descriptor.direction === "clockwise";

    const n = uid();
    let code = `
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
    let tnx${n} = ${clockwise ? `ny${n}` : `-ny${n}`};
    let tny${n} = ${clockwise ? `-nx${n}` : `nx${n}`};
    vx[index] = vx[index] + tnx${n} * f${n} * uniforms.dt;
    vy[index] = vy[index] + tny${n} * f${n} * uniforms.dt;
`;
    if (radius != null) {
      code += `    let error${n} = ${radius} - dist${n};
    let correction${n} = error${n} * ${stiffness};
    vx[index] = vx[index] + nx${n} * correction${n} * uniforms.dt;
    vy[index] = vy[index] + ny${n} * correction${n} * uniforms.dt;
`;
    }
    code += "  } else {\n";
    if (radius != null) {
      code += `    vy[index] = vy[index] - ${radius} * ${stiffness} * uniforms.dt;\n`;
    }
    code += "  }\n";

    return code;
  },
};
