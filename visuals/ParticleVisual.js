export const VisualType = Object.freeze({
  DEFAULT: 0,
  CIRCLE: 1,
  TEXTURE: 2,
});

export class ParticleVisual {
  get type() {
    return "visual";
  }

  get visualType() {
    return VisualType.DEFAULT;
  }

  // Optional capability contract — renderer-independent
  get capabilities() {
    return {
      gpuCompatible: true,
    };
  }

  // For serialization / debugging
  toJSON() {
    return { type: this.type };
  }
}
