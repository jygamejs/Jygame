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
}
