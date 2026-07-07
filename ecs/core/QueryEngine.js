import { ComponentSignature } from "./ComponentSignature.js";

const MAX_COMPONENT_ID = 65535;
const QUERY_BRAND = Symbol("Query");

function validateComponentIds(ids, context) {
  if (!Array.isArray(ids)) {
    throw new TypeError(
      `QueryEngine.${context} failed: expected an array of component IDs, got ${typeof ids}.`
    );
  }

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (typeof id !== 'number' || !Number.isInteger(id) || id < 1 || id > MAX_COMPONENT_ID) {
      throw new RangeError(
        `QueryEngine.${context} failed: invalid component ID ${id} at index ${i}.`
      );
    }
  }
}

function isQuery(value) {
  return value !== null && value !== undefined && value[QUERY_BRAND] === true;
}

class Query {
  constructor(id, all, any, none, key) {
    this.id = id;
    this.all = all;
    this.any = any;
    this.none = none;
    this.key = key;
    this.hasAll = all.size > 0;
    this.hasAny = any.size > 0;
    this.hasNone = none.size > 0;
    Object.defineProperty(this, QUERY_BRAND, { value: true });
    Object.freeze(this);
  }
}

export class QueryEngine {
  constructor(archetypeSystem) {
    if (!archetypeSystem || typeof archetypeSystem.version !== 'number') {
      throw new TypeError(
        'QueryEngine constructor failed: archetypeSystem must be a valid ArchetypeSystem instance with a version property.'
      );
    }

    if (typeof archetypeSystem.getSignature !== 'function') {
      throw new TypeError(
        'QueryEngine constructor failed: archetypeSystem must implement getSignature().'
      );
    }

    if (typeof archetypeSystem.getArchetypeById !== 'function') {
      throw new TypeError(
        'QueryEngine constructor failed: archetypeSystem must implement getArchetypeById().'
      );
    }

    this._archetypeSystem = archetypeSystem;
    this._queryCache = new Map();
    this._nextQueryId = 1;
    this._matchData = new Map();
    this._diag = null;
    this._diagScanCountId = undefined;
    this._diagScanTimeId = undefined;
  }

  set diagnostics(diag) {
    this._diag = diag;
    if (diag) {
      const scans = diag.metrics.find("ecs.query.scans");
      const scanTime = diag.metrics.find("ecs.query.scanTime");
      if (scans) this._diagScanCountId = scans.id;
      if (scanTime) this._diagScanTimeId = scanTime.id;
    }
  }

  createQuery({ all = [], any = [], none = [] } = {}) {
    validateComponentIds(all, 'createQuery');
    validateComponentIds(any, 'createQuery');
    validateComponentIds(none, 'createQuery');

    const allSet = new Set(all);
    for (const id of none) {
      if (allSet.has(id)) {
        throw new Error(
          `QueryEngine.createQuery failed: impossible query — component ID ${id} appears in both 'all' and 'none'.`
        );
      }
    }

    const anySet = new Set(any);
    for (const id of none) {
      if (anySet.has(id)) {
        throw new Error(
          `QueryEngine.createQuery failed: impossible query — component ID ${id} appears in both 'any' and 'none'.`
        );
      }
    }

    const allSig = new ComponentSignature(all);
    const anySig = new ComponentSignature(any);
    const noneSig = new ComponentSignature(none);

    const parts = [];
    if (allSig.size > 0) parts.push(`A:${allSig.key}`);
    if (anySig.size > 0) parts.push(`O:${anySig.key}`);
    if (noneSig.size > 0) parts.push(`N:${noneSig.key}`);
    const key = parts.join('|');

    const cached = this._queryCache.get(key);
    if (cached) return cached;

    const query = new Query(this._nextQueryId++, allSig, anySig, noneSig, key);
    this._queryCache.set(key, query);

    const archetypes = this._scanAllArchetypes(query);
    const tables = new Array(archetypes.length);
    for (let i = 0; i < archetypes.length; i++) {
      tables[i] = archetypes[i].table;
    }
    this._matchData.set(query, {
      archetypeVersion: this._archetypeSystem.version,
      archetypes,
      tables,
    });

    return query;
  }

  _scanAllArchetypes(query) {
    const doScan = () => {
      const archetypes = [];
      const count = this._archetypeSystem.archetypeCount;

      for (let id = 1; id <= count; id++) {
        const archetype = this._archetypeSystem.getArchetypeById(id);
        if (!archetype) continue;

        if (this._matchesSignature(archetype.signature, query)) {
          archetypes.push(archetype);
        }
      }

      return archetypes;
    };

    if (this._diag && this._diagScanCountId !== undefined) {
      this._diag.recordCounter(this._diagScanCountId, 1);
      return this._diag.scope(this._diagScanTimeId, doScan);
    }
    return doScan();
  }

  _matchesSignature(signature, query) {
    if (query.hasAll && !signature.containsAll(query.all)) return false;

    if (query.hasAny && !signature.containsAny(query.any)) return false;

    if (query.hasNone && signature.containsAny(query.none)) return false;

    return true;
  }

  _ensureFresh(query) {
    const data = this._matchData.get(query);
    const currentVersion = this._archetypeSystem.version;
    if (data.archetypeVersion < currentVersion) {
      data.archetypes = this._scanAllArchetypes(query);
      data.tables = new Array(data.archetypes.length);
      for (let i = 0; i < data.archetypes.length; i++) {
        data.tables[i] = data.archetypes[i].table;
      }
      data.archetypeVersion = currentVersion;
    }
  }

  getTables(query) {
    if (!isQuery(query)) {
      throw new TypeError(
        'QueryEngine.getTables failed: query must be a Query object returned by createQuery().'
      );
    }

    this._ensureFresh(query);
    return this._matchData.get(query).tables;
  }

  getArchetypes(query) {
    if (!isQuery(query)) {
      throw new TypeError(
        'QueryEngine.getArchetypes failed: query must be a Query object returned by createQuery().'
      );
    }

    this._ensureFresh(query);
    const data = this._matchData.get(query);
    return data.archetypes.slice();
  }

  onArchetypeCreated(archetype) {
    // Version-based lazy invalidation handles cache freshness.
    // This method is called by World when ArchetypeSystem creates
    // a new archetype, but no explicit action is needed here.
  }

  matches(signature, query) {
    if (!(signature instanceof ComponentSignature)) {
      throw new TypeError(
        'QueryEngine.matches failed: signature must be a ComponentSignature.'
      );
    }

    if (!isQuery(query)) {
      throw new TypeError(
        'QueryEngine.matches failed: query must be a Query object returned by createQuery().'
      );
    }

    return this._matchesSignature(signature, query);
  }
}
