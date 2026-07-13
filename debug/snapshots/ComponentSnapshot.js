export class ComponentSnapshot {
  constructor() {
    this.componentId = 0;
    this.componentName = "";
    this.fields = {};
    this.__jygamePoolActive = false;
    this.__jygamePoolIndex = -1;
  }

  reset() {
    this.componentId = 0;
    this.componentName = "";
    this.fields = {};
  }
}
