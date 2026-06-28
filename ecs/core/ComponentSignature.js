const MAX_COMPONENT_ID = 65535;

function validateComponentId(id, context) {
  if (typeof id !== 'number' || !Number.isInteger(id)) {
    throw new TypeError(
      `ComponentSignature.${context} failed: component ID must be an integer, got ${id}.`
    );
  }

  if (id < 0) {
    throw new RangeError(
      `ComponentSignature.${context} failed: component ID must be non-negative, got ${id}.`
    );
  }

  if (id === 0) {
    throw new RangeError(
      `ComponentSignature.${context} failed: component ID 0 is reserved and cannot be used.`
    );
  }

  if (id > MAX_COMPONENT_ID) {
    throw new RangeError(
      `ComponentSignature.${context} failed: component ID ${id} exceeds maximum (${MAX_COMPONENT_ID}).`
    );
  }
}

export class ComponentSignature {
  constructor(componentIds = []) {
    if (!Array.isArray(componentIds)) {
      throw new TypeError(
        `ComponentSignature constructor failed: expected an array of component IDs, got ${typeof componentIds}.`
      );
    }

    const arr = new Uint16Array(componentIds.length);

    for (let i = 0; i < componentIds.length; i++) {
      const id = componentIds[i];
      validateComponentId(id, 'constructor');
      arr[i] = id;
    }

    arr.sort();

    let write = 0;
    for (let read = 0; read < arr.length; read++) {
      if (read === 0 || arr[read] !== arr[read - 1]) {
        arr[write++] = arr[read];
      }
    }

    this._components = write < arr.length ? arr.subarray(0, write) : arr;
    this._size = write;
    this._key = this._size === 0 ? '' : Array.from(this._components).join(',');

    Object.freeze(this);
  }

  get size() {
    return this._size;
  }

  get components() {
    return this._components;
  }

  get key() {
    return this._key;
  }

  equals(other) {
    if (this === other) return true;
    if (!(other instanceof ComponentSignature)) return false;
    if (this._size !== other._size) return false;

    const a = this._components;
    const b = other._components;

    for (let i = 0; i < this._size; i++) {
      if (a[i] !== b[i]) return false;
    }

    return true;
  }

  contains(componentId) {
    validateComponentId(componentId, 'contains');

    const arr = this._components;
    let lo = 0;
    let hi = arr.length - 1;

    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const val = arr[mid];
      if (val === componentId) return true;
      if (val < componentId) lo = mid + 1;
      else hi = mid - 1;
    }

    return false;
  }

  containsAll(other) {
    if (!(other instanceof ComponentSignature)) {
      throw new TypeError(
        'ComponentSignature.containsAll failed: argument must be a ComponentSignature.'
      );
    }

    if (other._size === 0) return true;
    if (this._size < other._size) return false;

    const a = this._components;
    const b = other._components;
    let i = 0;
    let j = 0;

    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) {
        i++;
        j++;
      } else if (a[i] < b[j]) {
        i++;
      } else {
        return false;
      }
    }

    return j === b.length;
  }

  containsAny(other) {
    if (!(other instanceof ComponentSignature)) {
      throw new TypeError(
        'ComponentSignature.containsAny failed: argument must be a ComponentSignature.'
      );
    }

    if (this._size === 0 || other._size === 0) return false;

    const a = this._components;
    const b = other._components;
    let i = 0;
    let j = 0;

    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) return true;
      if (a[i] < b[j]) i++;
      else j++;
    }

    return false;
  }

  add(componentId) {
    validateComponentId(componentId, 'add');

    const arr = this._components;
    let insertAt = 0;

    while (insertAt < arr.length && arr[insertAt] < componentId) {
      insertAt++;
    }

    if (insertAt < arr.length && arr[insertAt] === componentId) return this;

    const result = new Uint16Array(arr.length + 1);

    for (let i = 0; i < insertAt; i++) result[i] = arr[i];
    result[insertAt] = componentId;
    for (let i = insertAt; i < arr.length; i++) result[i + 1] = arr[i];

    return new ComponentSignature(Array.from(result));
  }

  remove(componentId) {
    validateComponentId(componentId, 'remove');

    const arr = this._components;
    let foundAt = -1;

    for (let i = 0; i < arr.length; i++) {
      if (arr[i] === componentId) {
        foundAt = i;
        break;
      }
    }

    if (foundAt === -1) return this;

    const result = new Uint16Array(arr.length - 1);

    for (let i = 0; i < foundAt; i++) result[i] = arr[i];
    for (let i = foundAt + 1; i < arr.length; i++) result[i - 1] = arr[i];

    return new ComponentSignature(Array.from(result));
  }

  toString() {
    return `ComponentSignature(${this._key})`;
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return this.toString();
  }
}
