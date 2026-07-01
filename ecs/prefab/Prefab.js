import { ComponentSignature } from "../core/ComponentSignature.js";

export class Prefab {
  constructor(name) {
    this.name = name;
    this._entries = [];
  }

  add(componentCls, values) {
    this._entries.push({ cls: componentCls, values: values || null });
    return this;
  }

  tag(tagCls) {
    this._entries.push({ cls: tagCls, values: null });
    return this;
  }

  instantiate(world, overrides = null) {
    const entity = world.createEntity();
    if (this._entries.length === 0) return entity;

    const ids = this._entries.map(e => world._resolveComponentId(e.cls, "prefab.instantiate"));
    ids.sort((a, b) => a - b);
    const sig = new ComponentSignature(ids);

    world._clearEntityCache(entity);
    world._archetypeSystem.moveEntity(entity, sig);

    for (const entry of this._entries) {
      let values = entry.values;
      if (overrides && overrides[entry.cls.name]) {
        const overrideValues = overrides[entry.cls.name];
        values = values ? { ...values, ...overrideValues } : overrideValues;
      }
      if (values) {
        world.set(entity, entry.cls, values);
      }
    }

    return entity;
  }
}
