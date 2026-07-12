import { deserializeProcessor } from "./processors/Processor.js";

const _bindingRegistry = new Map();

export function registerBinding(type, cls) {
  _bindingRegistry.set(type, cls);
}

export function deserializeBinding(data) {
  const cls = _bindingRegistry.get(data.type);
  if (!cls) throw new Error(`Unknown binding type: ${data.type}`);
  const binding = cls.deserialize(data);
  if (data.processors) {
    binding.processors = data.processors.map(p => deserializeProcessor(p));
  }
  return binding;
}

export class Binding {
  constructor() {
    this._processors = [];
  }

  get type() { return "binding"; }
  get processors() { return this._processors; }

  set processors(list) { this._processors = list; }

  evaluate(deviceRegistry) {
    return 0;
  }

  serialize() {
    return {
      type: this.type,
      processors: this._processors.map(p => p.serialize()),
    };
  }

  static deserialize(data) {
    return new Binding();
  }
}
