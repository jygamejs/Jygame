export class EntitySnapshot {
  constructor() {
    this.entityId = 0;
    this.archetypeId = 0;
    this.components = [];
    this.__jygamePoolActive = false;
    this.__jygamePoolIndex = -1;
  }

  reset() {
    this.entityId = 0;
    this.archetypeId = 0;
    this.components = [];
  }

  toJSON() {
    return {
      entityId: this.entityId,
      archetypeId: this.archetypeId,
      components: this.components.map(c => c.toJSON
        ? c.toJSON()
        : { componentId: c.componentId, componentName: c.componentName, fields: c.fields }),
    };
  }
}
