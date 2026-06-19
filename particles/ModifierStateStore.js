const _id = p => p.__jygameId;

export class ModifierStateStore {
  constructor() {
    this._stores = new Map();
  }

  ensure(particle, modifier, create) {
    const id = _id(particle);
    let modStore = this._stores.get(modifier);
    if (!modStore) {
      modStore = new Map();
      this._stores.set(modifier, modStore);
    }
    let state = modStore.get(id);
    if (!state) {
      state = create();
      modStore.set(id, state);
    }
    return state;
  }

  get(particle, modifier) {
    const modStore = this._stores.get(modifier);
    return modStore ? modStore.get(_id(particle)) : undefined;
  }

  release(particle) {
    const id = _id(particle);
    for (const modStore of this._stores.values()) {
      modStore.delete(id);
    }
  }

  releaseAll() {
    this._stores.clear();
  }
}
