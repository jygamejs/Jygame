const _processorRegistry = new Map();

export function registerProcessor(type, cls) {
  _processorRegistry.set(type, cls);
}

export function deserializeProcessor(data) {
  const cls = _processorRegistry.get(data.type);
  if (!cls) throw new Error(`Unknown processor type: ${data.type}`);
  return cls.deserialize(data);
}

export class Processor {
  get type() { return "processor"; }

  process(value, deviceRegistry) {
    return value;
  }

  serialize() {
    return { type: this.type };
  }

  static deserialize(data) {
    return new Processor();
  }
}

registerProcessor("processor", Processor);
