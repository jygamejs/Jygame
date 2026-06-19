const PASS_ORDER = ["integration", "force", "visual"];

export class GpuProgramDescriptor {
  constructor({ integrationPass, forcePass, visualPass, stateLayout, uniforms } = {}) {
    this.integrationPass = integrationPass || [];
    this.forcePass = forcePass || [];
    this.visualPass = visualPass || [];
    this.stateLayout = stateLayout || null;
    this.uniforms = uniforms || {};
    Object.freeze(this);
  }

  get passes() {
    return [this.integrationPass, this.forcePass, this.visualPass];
  }

  get passCount() {
    let count = 0;
    for (const pass of this.passes) {
      if (pass.length > 0) count++;
    }
    return count;
  }

  get totalModifiers() {
    return this.integrationPass.length + this.forcePass.length + this.visualPass.length;
  }

  hasPass(name) {
    const idx = PASS_ORDER.indexOf(name);
    return idx >= 0 && this.passes[idx].length > 0;
  }

  toJSON() {
    return {
      integrationPass: this.integrationPass,
      forcePass: this.forcePass,
      visualPass: this.visualPass,
      stateLayout: this.stateLayout,
      uniforms: this.uniforms,
    };
  }
}
