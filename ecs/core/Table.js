const TYPE_TO_CTOR = {
  f32: Float32Array,
  f64: Float64Array,
  u8: Uint8Array,
  u16: Uint16Array,
  u32: Uint32Array,
  i8: Int8Array,
  i16: Int16Array,
  i32: Int32Array,
};

const DEFAULT_CAPACITY = 64;

export class Table {
  constructor(registry, signature, initialCapacity = DEFAULT_CAPACITY) {
    if (typeof initialCapacity !== 'number' || !Number.isInteger(initialCapacity) || initialCapacity < 1) {
      throw new RangeError(
        `Table constructor failed: initialCapacity must be a positive integer, got ${initialCapacity}.`
      );
    }

    this._capacity = initialCapacity;
    this._count = 0;
    this._registry = registry;
    this._signature = signature;
    this._destroyed = false;

    this._entities = new Uint32Array(initialCapacity);
    this._columns = [];
    this._columnMap = new Map();
    this._componentFieldCounts = new Map();

    const components = signature.components;

    for (let ci = 0; ci < components.length; ci++) {
      const componentId = components[ci];
      const schema = registry.getSchemaById(componentId);

      if (!schema) {
        throw new Error(
          `Table construction failed: component ID ${componentId} is not registered.`
        );
      }

      const fieldNames = Object.keys(schema);
      let fieldCount = 0;

      for (let fi = 0; fi < fieldNames.length; fi++) {
        const fieldName = fieldNames[fi];
        const fieldType = schema[fieldName];
        const Ctor = TYPE_TO_CTOR[fieldType];

        if (!Ctor) {
          throw new Error(
            `Table construction failed: unknown field type "${fieldType}" ` +
            `for component ID ${componentId}, field "${fieldName}".`
          );
        }

        this._columns.push(new Ctor(initialCapacity));
        this._columnMap.set(`${componentId}:${fieldName}`, this._columns.length - 1);
        fieldCount++;
      }

      this._componentFieldCounts.set(componentId, fieldCount);
    }
  }

  get count() {
    return this._count;
  }

  get entityCount() {
    return this._count;
  }

  get capacity() {
    return this._capacity;
  }

  get entityIds() {
    return this._entities.subarray(0, this._count);
  }

  get signature() {
    return this._signature;
  }

  allocate() {
    if (this._destroyed) {
      throw new Error('Table.allocate failed: table has been destroyed.');
    }

    if (this._count >= this._capacity) {
      this._grow();
    }

    const row = this._count;
    this._count++;
    return row;
  }

  removeRow(row) {
    if (this._destroyed) {
      throw new Error('Table.removeRow failed: table has been destroyed.');
    }

    if (typeof row !== 'number' || !Number.isInteger(row) || row < 0) {
      throw new RangeError(
        `Table.removeRow failed: row must be a non-negative integer, got ${row}.`
      );
    }

    if (row >= this._count) {
      throw new RangeError(
        `Table.removeRow failed: row ${row} is out of range (count = ${this._count}).`
      );
    }

    this._count--;

    if (row === this._count) {
      return { moved: false, entity: 0 };
    }

    const movedEntity = this._entities[this._count];
    this._entities[row] = movedEntity;

    for (let ci = 0; ci < this._columns.length; ci++) {
      const col = this._columns[ci];
      col[row] = col[this._count];
    }

    return { moved: true, entity: movedEntity };
  }

  getEntity(row) {
    if (this._destroyed) {
      throw new Error('Table.getEntity failed: table has been destroyed.');
    }

    if (typeof row !== 'number' || !Number.isInteger(row) || row < 0) {
      throw new RangeError(
        `Table.getEntity failed: row must be a non-negative integer, got ${row}.`
      );
    }

    if (row >= this._count) {
      throw new RangeError(
        `Table.getEntity failed: row ${row} is out of range (count = ${this._count}).`
      );
    }

    return this._entities[row];
  }

  setEntity(row, entity) {
    if (this._destroyed) {
      throw new Error('Table.setEntity failed: table has been destroyed.');
    }

    if (typeof row !== 'number' || !Number.isInteger(row) || row < 0) {
      throw new RangeError(
        `Table.setEntity failed: row must be a non-negative integer, got ${row}.`
      );
    }

    if (row >= this._count) {
      throw new RangeError(
        `Table.setEntity failed: row ${row} is out of range (count = ${this._count}).`
      );
    }

    if (typeof entity !== 'number' || !Number.isInteger(entity) || entity < 0) {
      throw new TypeError(
        `Table.setEntity failed: entity ID must be a non-negative integer, got ${entity}.`
      );
    }

    this._entities[row] = entity;
  }

  getColumn(componentId, fieldName) {
    if (this._destroyed) {
      throw new Error('Table.getColumn failed: table has been destroyed.');
    }

    if (typeof componentId !== 'number' || !Number.isInteger(componentId) || componentId < 0) {
      throw new TypeError(
        `Table.getColumn failed: component ID must be a non-negative integer, got ${componentId}.`
      );
    }

    if (typeof fieldName !== 'string' || fieldName.length === 0) {
      throw new TypeError(
        `Table.getColumn failed: fieldName must be a non-empty string, got ${fieldName}.`
      );
    }

    const key = `${componentId}:${fieldName}`;
    const idx = this._columnMap.get(key);

    if (idx === undefined) {
      return null;
    }

    return this._columns[idx];
  }

  hasComponent(componentId) {
    if (this._destroyed) {
      throw new Error('Table.hasComponent failed: table has been destroyed.');
    }

    if (typeof componentId !== 'number' || !Number.isInteger(componentId) || componentId < 0) {
      throw new TypeError(
        `Table.hasComponent failed: component ID must be a non-negative integer, got ${componentId}.`
      );
    }

    return this._componentFieldCounts.has(componentId);
  }

  moveRowTo(row, targetTable) {
    if (this._destroyed) {
      throw new Error('Table.moveRowTo failed: source table has been destroyed.');
    }

    if (!targetTable || !(targetTable instanceof Table)) {
      throw new TypeError(
        'Table.moveRowTo failed: destination must be a Table instance.'
      );
    }

    if (typeof row !== 'number' || !Number.isInteger(row) || row < 0) {
      throw new RangeError(
        `Table.moveRowTo failed: row must be a non-negative integer, got ${row}.`
      );
    }

    if (row >= this._count) {
      throw new RangeError(
        `Table.moveRowTo failed: row ${row} is out of range in source table (count = ${this._count}).`
      );
    }

    const entityId = this._entities[row];
    const targetRow = targetTable.allocate();

    const srcComponents = this._signature.components;
    const tgtComponents = targetTable._signature.components;
    let si = 0;
    let ti = 0;

    while (si < srcComponents.length && ti < tgtComponents.length) {
      const srcId = srcComponents[si];
      const tgtId = tgtComponents[ti];

      if (srcId === tgtId) {
        const srcFieldCount = this._componentFieldCounts.get(srcId);
        if (srcFieldCount > 0) {
          const srcSchema = this._registry.getSchemaById(srcId);
          const fieldNames = Object.keys(srcSchema);

          for (let fi = 0; fi < fieldNames.length; fi++) {
            const fieldName = fieldNames[fi];
            const srcCol = this._columns[this._columnMap.get(`${srcId}:${fieldName}`)];
            const tgtCol = targetTable._columns[targetTable._columnMap.get(`${tgtId}:${fieldName}`)];
            tgtCol[targetRow] = srcCol[row];
          }
        }

        si++;
        ti++;
      } else if (srcId < tgtId) {
        si++;
      } else {
        ti++;
      }
    }

    targetTable._entities[targetRow] = entityId;

    return targetRow;
  }

  reserve(count) {
    if (this._destroyed) {
      throw new Error('Table.reserve failed: table has been destroyed.');
    }

    if (typeof count !== 'number' || !Number.isInteger(count) || count < 1) {
      throw new RangeError(
        `Table.reserve failed: count must be a positive integer, got ${count}.`
      );
    }

    if (count > this._capacity) {
      let newCapacity = this._capacity;
      while (newCapacity < count) {
        newCapacity *= 2;
      }
      this._reallocate(newCapacity);
    }
  }

  allocateRange(count) {
    if (this._destroyed) {
      throw new Error('Table.allocateRange failed: table has been destroyed.');
    }

    if (typeof count !== 'number' || !Number.isInteger(count) || count < 1) {
      throw new RangeError(
        `Table.allocateRange failed: count must be a positive integer, got ${count}.`
      );
    }

    this.reserve(this._count + count);

    const start = this._count;
    this._count += count;

    return start;
  }

  columns(componentId) {
    if (this._destroyed) {
      throw new Error('Table.columns failed: table has been destroyed.');
    }
    if (typeof componentId !== 'number' || !Number.isInteger(componentId) || componentId < 0) {
      throw new TypeError(
        `Table.columns failed: component ID must be a non-negative integer, got ${componentId}.`
      );
    }
    if (!this._columnsCache) {
      this._columnsCache = new Map();
    }
    let result = this._columnsCache.get(componentId);
    if (!result) {
      const fieldCount = this._componentFieldCounts.get(componentId);
      if (!fieldCount) return null;
      const schema = this._registry.getSchemaById(componentId);
      if (!schema) return null;
      const fieldNames = Object.keys(schema);
      result = Object.create(null);
      for (let fi = 0; fi < fieldNames.length; fi++) {
        const fieldName = fieldNames[fi];
        const col = this.getColumn(componentId, fieldName);
        if (col) {
          result[fieldName] = col;
        }
      }
      this._columnsCache.set(componentId, result);
    }
    return result;
  }

  grow() {
    if (this._destroyed) {
      throw new Error('Table.grow failed: table has been destroyed.');
    }

    this._grow();
  }

  destroy() {
    this._entities = null;
    this._columns = null;
    this._columnMap = null;
    this._componentFieldCounts = null;
    this._signature = null;
    this._registry = null;
    this._capacity = 0;
    this._count = 0;
    this._destroyed = true;
  }

  _grow() {
    this._reallocate(this._capacity * 2);
  }

  _reallocate(newCapacity) {
    const newEntities = new Uint32Array(newCapacity);
    newEntities.set(this._entities.subarray(0, this._count));

    const newColumns = [];

    for (let ci = 0; ci < this._columns.length; ci++) {
      const oldCol = this._columns[ci];
      const Ctor = oldCol.constructor;
      const newCol = new Ctor(newCapacity);
      newCol.set(oldCol.subarray(0, this._count));
      newColumns.push(newCol);
    }

    this._entities = newEntities;
    this._columns = newColumns;
    this._capacity = newCapacity;
  }
}
