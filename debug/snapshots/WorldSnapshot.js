export class WorldSnapshot {
  constructor() {
    this.frameNumber = 0;
    this.timestamp = 0;
    this.diagnostics = null;
    this.worlds = [];
    this.__jygamePoolActive = false;
    this.__jygamePoolIndex = -1;
  }

  reset() {
    this.frameNumber = 0;
    this.timestamp = 0;
    this.diagnostics = null;
    this.worlds = [];
  }
}
