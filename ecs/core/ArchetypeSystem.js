import { ComponentSignature } from "./ComponentSignature.js";
import { Table } from "./Table.js";
import {
  Diagnostics, MetricCategory, MetricUnit, MetricType,
} from "../../debug/index.js";

class Archetype {
  constructor(id, signature, table) {
    this.id = id;
    this.signature = signature;
    this.table = table;
    this.addEdge = new Map();
    this.removeEdge = new Map();
  }
}

export class ArchetypeSystem {
  constructor(registry, entityManager, options = {}) {
    if (!registry || typeof registry.getSchemaById !== 'function') {
      throw new TypeError(
        'ArchetypeSystem constructor failed: registry must be a valid ComponentRegistry instance.'
      );
    }

    if (!entityManager || typeof entityManager.create !== 'function' || typeof entityManager.isAlive !== 'function') {
      throw new TypeError(
        'ArchetypeSystem constructor failed: entityManager must be a valid EntityManager instance.'
      );
    }

    const initialTableCapacity = options.initialTableCapacity ?? 64;

    if (typeof initialTableCapacity !== 'number' || !Number.isInteger(initialTableCapacity) || initialTableCapacity < 1) {
      throw new RangeError(
        `ArchetypeSystem constructor failed: initialTableCapacity must be a positive integer, got ${initialTableCapacity}.`
      );
    }

    this._registry = registry;
    this._entityManager = entityManager;
    this._initialTableCapacity = initialTableCapacity;
    this._nextArchetypeId = 1;
    this._signatureToArchetype = new Map();
    this._idToArchetype = [];
    this._idToArchetype[0] = null;
    this.onArchetypeCreated = null;
    this._diag = null;
    this._diagMigrationsId = undefined;
    this._diagArchetypesCreatedId = undefined;

    const emptySignature = new ComponentSignature([]);
    const emptyTable = new Table(registry, emptySignature, initialTableCapacity);
    const emptyArchetype = new Archetype(1, emptySignature, emptyTable);
    this._signatureToArchetype.set(emptySignature.key, emptyArchetype);
    this._idToArchetype[1] = emptyArchetype;
    this._nextArchetypeId = 2;
  }

  get archetypeCount() {
    return this._nextArchetypeId - 1;
  }

  get version() {
    return this._nextArchetypeId - 1;
  }

  set diagnostics(diag) {
    this._diag = diag;
    if (diag) {
      this._initDiag(diag);
    }
  }

  _initDiag(diag) {
    if (this._diagInitDone) return;
    this._diagInitDone = true;
    this._diagMigrationsId = diag.registerDynamicMetric({
      name: "ecs.entitiesMigrated",
      displayName: "Entities Migrated",
      category: MetricCategory.ECS,
      group: "Changes",
      unit: MetricUnit.COUNT,
      type: MetricType.COUNTER,
      tags: Object.freeze(["ecs"]),
    });
    this._diagArchetypesCreatedId = diag.registerDynamicMetric({
      name: "ecs.archetypesCreated",
      displayName: "Archetypes Created",
      category: MetricCategory.ECS,
      group: "Changes",
      unit: MetricUnit.COUNT,
      type: MetricType.COUNTER,
      tags: Object.freeze(["ecs"]),
    });
  }

  getTable(signature) {
    if (!(signature instanceof ComponentSignature)) {
      throw new TypeError(
        'ArchetypeSystem.getTable failed: signature must be a ComponentSignature instance.'
      );
    }

    const archetype = this._signatureToArchetype.get(signature.key);
    return archetype ? archetype.table : null;
  }

  getTableById(id) {
    if (typeof id !== 'number' || !Number.isInteger(id) || id < 0) {
      throw new RangeError(
        `ArchetypeSystem.getTableById failed: ID must be a non-negative integer, got ${id}.`
      );
    }

    if (id === 0 || id >= this._nextArchetypeId) {
      return null;
    }

    return this._idToArchetype[id].table;
  }

  getArchetypeById(id) {
    if (typeof id !== 'number' || !Number.isInteger(id) || id < 0) {
      throw new RangeError(
        `ArchetypeSystem.getArchetypeById failed: ID must be a non-negative integer, got ${id}.`
      );
    }

    if (id === 0 || id >= this._nextArchetypeId) {
      return null;
    }

    return this._idToArchetype[id];
  }

  getArchetypeId(signature) {
    if (!(signature instanceof ComponentSignature)) {
      throw new TypeError(
        'ArchetypeSystem.getArchetypeId failed: signature must be a ComponentSignature instance.'
      );
    }

    const archetype = this._signatureToArchetype.get(signature.key);
    return archetype ? archetype.id : null;
  }

  getSignature(id) {
    if (typeof id !== 'number' || !Number.isInteger(id) || id < 0) {
      throw new RangeError(
        `ArchetypeSystem.getSignature failed: ID must be a non-negative integer, got ${id}.`
      );
    }

    if (id === 0 || id >= this._nextArchetypeId) {
      return null;
    }

    return this._idToArchetype[id].signature;
  }

  has(signature) {
    if (!(signature instanceof ComponentSignature)) {
      throw new TypeError(
        'ArchetypeSystem.has failed: signature must be a ComponentSignature instance.'
      );
    }

    return this._signatureToArchetype.has(signature.key);
  }

  entityTable(entity) {
    const archetypeId = this._entityManager.getArchetype(entity);
    if (archetypeId === null) {
      throw new Error(
        `ArchetypeSystem.entityTable failed: entity ${entity} is not alive or has no location.`
      );
    }

    if (archetypeId === 0 || archetypeId >= this._nextArchetypeId) {
      throw new Error(
        `ArchetypeSystem.entityTable failed: entity ${entity} has invalid archetype ID ${archetypeId}.`
      );
    }

    return this._idToArchetype[archetypeId].table;
  }

  entitySignature(entity) {
    const archetypeId = this._entityManager.getArchetype(entity);
    if (archetypeId === null) {
      return null;
    }

    if (archetypeId === 0 || archetypeId >= this._nextArchetypeId) {
      return null;
    }

    return this._idToArchetype[archetypeId].signature;
  }

  createArchetype(signature) {
    if (!(signature instanceof ComponentSignature)) {
      throw new TypeError(
        'ArchetypeSystem.createArchetype failed: signature must be a ComponentSignature instance.'
      );
    }

    const existing = this._signatureToArchetype.get(signature.key);
    if (existing) {
      return existing;
    }

    const components = signature.components;
    for (let ci = 0; ci < components.length; ci++) {
      const componentId = components[ci];
      const schema = this._registry.getSchemaById(componentId);
      if (!schema) {
        throw new Error(
          `ArchetypeSystem.createArchetype failed: component ID ${componentId} is not registered in the component registry.`
        );
      }
    }

    const id = this._nextArchetypeId;
    this._nextArchetypeId++;

    const table = new Table(this._registry, signature, this._initialTableCapacity);
    const archetype = new Archetype(id, signature, table);

    this._signatureToArchetype.set(signature.key, archetype);
    this._idToArchetype[id] = archetype;

    if (typeof this.onArchetypeCreated === 'function') {
      this.onArchetypeCreated(archetype);
    }

    if (this._diag && this._diagArchetypesCreatedId !== undefined) {
      this._diag.recordCounter(this._diagArchetypesCreatedId, 1);
    }

    return archetype;
  }

  moveEntity(entity, destinationSignature) {
    if (!(destinationSignature instanceof ComponentSignature)) {
      throw new TypeError(
        'ArchetypeSystem.moveEntity failed: destinationSignature must be a ComponentSignature instance.'
      );
    }

    if (!this._entityManager.isAlive(entity)) {
      throw new Error(
        `ArchetypeSystem.moveEntity failed: entity ${entity} is not alive.`
      );
    }

    const sourceLocation = this._entityManager.getLocation(entity);
    if (!sourceLocation) {
      throw new Error(
        `ArchetypeSystem.moveEntity failed: entity ${entity} has no location.`
      );
    }

    const sourceArchetypeId = sourceLocation.archetype;
    const sourceRow = sourceLocation.row;

    if (sourceArchetypeId === 0 || sourceArchetypeId >= this._nextArchetypeId) {
      throw new Error(
        `ArchetypeSystem.moveEntity failed: entity ${entity} has invalid archetype ID ${sourceArchetypeId}.`
      );
    }

    const sourceArchetype = this._idToArchetype[sourceArchetypeId];
    const sourceTable = sourceArchetype.table;

    const targetArchetype = this.createArchetype(destinationSignature);

    if (sourceArchetype === targetArchetype) {
      return sourceRow;
    }

    if (this._diag && this._diagMigrationsId !== undefined) {
      this._diag.recordCounter(this._diagMigrationsId, 1);
    }

    const targetTable = targetArchetype.table;

    const targetRow = targetTable.allocate();

    const srcComponents = sourceArchetype.signature.components;
    const tgtComponents = destinationSignature.components;
    let si = 0;
    let ti = 0;

    while (si < srcComponents.length && ti < tgtComponents.length) {
      const srcId = srcComponents[si];
      const tgtId = tgtComponents[ti];

      if (srcId === tgtId) {
        this._copyComponent(srcId, sourceTable, sourceRow, targetTable, targetRow);
        si++;
        ti++;
      } else if (srcId < tgtId) {
        si++;
      } else {
        this._initComponentDefaults(tgtId, targetTable, targetRow);
        ti++;
      }
    }

    while (ti < tgtComponents.length) {
      this._initComponentDefaults(tgtComponents[ti], targetTable, targetRow);
      ti++;
    }

    targetTable.setEntity(targetRow, entity);

    this._entityManager.setLocation(entity, targetArchetype.id, targetRow);

    const result = sourceTable.removeRow(sourceRow);
    if (result.moved) {
      this._entityManager.setLocation(result.entity, sourceArchetypeId, sourceRow);
    }

    return targetRow;
  }

  _copyComponent(componentId, sourceTable, sourceRow, targetTable, targetRow) {
    const schema = this._registry.getSchemaById(componentId);
    if (!schema) return;

    const fieldNames = Object.keys(schema);
    for (let fi = 0; fi < fieldNames.length; fi++) {
      const fieldName = fieldNames[fi];
      const srcCol = sourceTable.getColumn(componentId, fieldName);
      const tgtCol = targetTable.getColumn(componentId, fieldName);
      if (srcCol && tgtCol) {
        tgtCol[targetRow] = srcCol[sourceRow];
      }
    }
  }

  _initComponentDefaults(componentId, targetTable, targetRow) {
    const schema = this._registry.getSchemaById(componentId);
    if (!schema) return;

    const fieldNames = Object.keys(schema);
    for (let fi = 0; fi < fieldNames.length; fi++) {
      const fieldName = fieldNames[fi];
      const col = targetTable.getColumn(componentId, fieldName);
      if (col) {
        col[targetRow] = 0;
      }
    }
  }
}
