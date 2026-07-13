import { ActivePool } from "../../memory/ActivePool.js";
import { EntitySnapshot } from "./EntitySnapshot.js";
import { ComponentSnapshot } from "./ComponentSnapshot.js";
import { WorldSnapshot } from "./WorldSnapshot.js";

export class SnapshotBuilder {
  constructor() {
    this._worlds = new Map();
    this._entityPool = new ActivePool({
      create: () => new EntitySnapshot(),
      reset: (e) => e.reset(),
    });
    this._componentPool = new ActivePool({
      create: () => new ComponentSnapshot(),
      reset: (c) => c.reset(),
    });
    this._worldSnapshotPool = new ActivePool({
      create: () => new WorldSnapshot(),
      reset: (w) => w.reset(),
    });
  }

  registerWorld(id, world) {
    this._worlds.set(id, world);
  }

  unregisterWorld(id) {
    this._worlds.delete(id);
  }

  setupMetricDescriptors(registry) {
    if (this._metricDescriptors) return;
    this._metricDescriptors = [];
    registry.forEach((desc) => {
      this._metricDescriptors.push({
        id: desc.id,
        name: desc.name,
        type: desc.type,
        category: desc.category,
        unit: desc.unit,
        budget: desc.budget,
      });
    });
  }

  build(frameNumber, timestamp, diagnosticsSnapshot) {
    const worldSnap = this._worldSnapshotPool.acquire();
    worldSnap.frameNumber = frameNumber;
    worldSnap.timestamp = timestamp;
    worldSnap.diagnostics = diagnosticsSnapshot;
    worldSnap.metricDescriptors = this._metricDescriptors || null;

    for (const [worldId, world] of this._worlds) {
      const worldData = { worldId, entityCount: 0, entities: [] };
      const archSystem = world.archetypeSystem;
      const count = archSystem.archetypeCount;

      for (let archId = 1; archId <= count; archId++) {
        const archetype = archSystem.getArchetypeById(archId);
        if (!archetype) continue;

        const table = archetype.table;
        const componentIds = archetype.signature.components;

        for (let row = 0; row < table.count; row++) {
          const entityId = table.getEntity(row);

          const entitySnap = this._entityPool.acquire();
          entitySnap.entityId = entityId;
          entitySnap.archetypeId = archId;

          for (let ci = 0; ci < componentIds.length; ci++) {
            const cid = componentIds[ci];
            this._snapshotComponent(entitySnap, world, table, row, cid);
          }

          worldData.entities.push(entitySnap);
          worldData.entityCount++;
        }
      }

      worldSnap.worlds.push(worldData);
    }

    return worldSnap;
  }

  _snapshotComponent(entitySnap, world, table, row, componentId) {
    const meta = world.registry.getMetadataById(componentId);
    const schema = meta ? meta.schema : null;
    if (!schema) return;

    const compSnap = this._componentPool.acquire();
    compSnap.componentId = componentId;
    compSnap.componentName = meta.name;

    const fieldNames = Object.keys(schema);
    for (let fi = 0; fi < fieldNames.length; fi++) {
      const fieldName = fieldNames[fi];
      const col = table.getColumn(componentId, fieldName);
      if (col) {
        compSnap.fields[fieldName] = col[row];
      }
    }

    entitySnap.components.push(compSnap);
  }

  release(snapshot) {
    for (let wi = 0; wi < snapshot.worlds.length; wi++) {
      const worldData = snapshot.worlds[wi];
      const entities = worldData.entities;
      for (let ei = 0; ei < entities.length; ei++) {
        const entitySnap = entities[ei];
        const components = entitySnap.components;
        for (let ci = 0; ci < components.length; ci++) {
          this._componentPool.release(components[ci]);
        }
        entitySnap.components = [];
        this._entityPool.release(entitySnap);
      }
      worldData.entities = [];
    }
    snapshot.worlds = [];
    this._worldSnapshotPool.release(snapshot);
  }

  get stats() {
    return {
      entityPool: {
        active: this._entityPool.activeCount,
        free: this._entityPool.freeCount,
      },
      componentPool: {
        active: this._componentPool.activeCount,
        free: this._componentPool.freeCount,
      },
      worldSnapshotPool: {
        active: this._worldSnapshotPool.activeCount,
        free: this._worldSnapshotPool.freeCount,
      },
    };
  }
}
