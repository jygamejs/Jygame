import { StreamingCell } from "./StreamingCell.js";
import { Diagnostics, MetricCategory, MetricUnit, MetricType, resolveMetricIds }
  from "../../debug/index.js";

export class StreamingManager {
  constructor(world) {
    this._world = world;
    this._cells = new Map();
    this._entityToCell = new Map();
    this._diagnostics = null;

    this._onDestroyed = (entity) => this._onEntityDestroyed(entity);
    world.onEntityDestroyed(this._onDestroyed);
  }

  _initDiag(diag) {
    if (this._diagIds) return;
    this._diagIds = resolveMetricIds(diag, {
      loadedCells:  "streaming.loadedCells",
      pending:      "streaming.pending",
      entities:     "streaming.entities",
      cellsLoaded:  "streaming.cellsLoaded",
      cellsUnloaded:"streaming.cellsUnloaded",
      cells:        "streaming.cells",
      loadTime:     "streaming.loadTime",
    });
  }

  _recordGauges() {
    if (!this._diagnostics) return;
    const ids = this._diagIds;
    if (!ids) return;
    let loaded = 0;
    let entityCount = 0;
    for (const cell of this._cells.values()) {
      if (cell._loaded) {
        loaded++;
        entityCount += cell._entityIds.size;
      }
    }
    if (ids.loadedCells >= 0) this._diagnostics.recordGauge(ids.loadedCells, loaded);
    if (ids.pending >= 0) this._diagnostics.recordGauge(ids.pending, 0);
    if (ids.entities >= 0) this._diagnostics.recordGauge(ids.entities, entityCount);
    if (ids.cells >= 0) this._diagnostics.recordGauge(ids.cells, this._cells.size);
  }

  createCell(name) {
    if (typeof name !== 'string' || name.length === 0) {
      throw new Error(
        `StreamingManager.createCell failed: cell name must be a non-empty string, got ${typeof name}.`
      );
    }

    if (this._cells.has(name)) {
      throw new Error(
        `StreamingManager.createCell failed: cell "${name}" already exists.`
      );
    }

    const cell = new StreamingCell(name, this);
    this._cells.set(name, cell);
    return cell;
  }

  getCell(name) {
    return this._cells.get(name) || null;
  }

  hasCell(name) {
    return this._cells.has(name);
  }

  destroyCell(name) {
    const cell = this._cells.get(name);
    if (!cell) {
      throw new Error(
        `StreamingManager.destroyCell failed: cell "${name}" not found.`
      );
    }

    if (cell._loaded) {
      this.unload(name);
    }

    this._cells.delete(name);
  }

  load(name) {
    const cell = this._cells.get(name);
    if (!cell) {
      throw new Error(
        `StreamingManager.load failed: cell "${name}" not found.`
      );
    }

    const doLoad = () => { cell._loaded = true; };

    if (this._diagnostics) {
      this._initDiag(this._diagnostics);
      const ids = this._diagIds;
      if (ids && ids.loadTime >= 0) {
        this._diagnostics.scope(ids.loadTime, doLoad);
      } else {
        doLoad();
      }
      if (ids && ids.cellsLoaded >= 0) this._diagnostics.recordCounter(ids.cellsLoaded, 1);
      this._recordGauges();
    } else {
      doLoad();
    }
  }

  unload(name) {
    const cell = this._cells.get(name);
    if (!cell) {
      throw new Error(
        `StreamingManager.unload failed: cell "${name}" not found.`
      );
    }

    if (!cell._loaded) return;

    const entities = [...cell._entityIds];
    cell._entityIds.clear();
    for (let i = 0; i < entities.length; i++) {
      this._entityToCell.delete(entities[i]);
      this._world.destroyEntity(entities[i]);
    }

    cell._loaded = false;

    if (this._diagnostics) {
      this._initDiag(this._diagnostics);
      const ids = this._diagIds;
      if (ids && ids.cellsUnloaded >= 0) this._diagnostics.recordCounter(ids.cellsUnloaded, 1);
      this._recordGauges();
    }
  }

  loadAll() {
    for (const cell of this._cells.values()) {
      cell._loaded = true;
    }
  }

  unloadAll() {
    const names = [...this._cells.keys()];
    for (let i = 0; i < names.length; i++) {
      this.unload(names[i]);
    }
  }

  loadedCells() {
    const result = [];
    for (const cell of this._cells.values()) {
      if (cell._loaded) {
        result.push(cell);
      }
    }
    return result;
  }

  get cellCount() {
    return this._cells.size;
  }

  get diagnostics() {
    return this._diagnostics;
  }

  set diagnostics(diag) {
    this._diagnostics = diag;
  }

  _onEntityDestroyed(entity) {
    const cell = this._entityToCell.get(entity);
    if (cell !== undefined) {
      cell._entityIds.delete(entity);
      this._entityToCell.delete(entity);
    }
  }
}
