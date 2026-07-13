export class WorldSnapshot {
  constructor() {
    this.frameNumber = 0;
    this.timestamp = 0;
    this.diagnostics = null;
    this.metricDescriptors = null;
    this.worlds = [];
    this.__jygamePoolActive = false;
    this.__jygamePoolIndex = -1;
  }

  reset() {
    this.frameNumber = 0;
    this.timestamp = 0;
    this.diagnostics = null;
    this.metricDescriptors = null;
    this.worlds = [];
  }

  toJSON() {
    return {
      frameNumber: this.frameNumber,
      timestamp: this.timestamp,
      diagnostics: this.diagnostics,
      metricDescriptors: this.metricDescriptors,
      worlds: this.worlds.map(w => ({
        worldId: w.worldId,
        entityCount: w.entityCount,
        entities: w.entities.map(e => e.toJSON
          ? e.toJSON()
          : { entityId: e.entityId, archetypeId: e.archetypeId, components: e.components }),
      })),
    };
  }
}
