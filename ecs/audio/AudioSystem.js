import { System } from "../core/System.js";
import { AudioSource } from "./AudioSource.js";
import { WorldTransform } from "../components/WorldTransform.js";
import { AudioManager } from "../../audio/AudioManager.js";
import { Camera } from "../../camera/Camera.js";

export class AudioSystem extends System {
  static query = { all: [AudioSource, WorldTransform] };
  static priority = 1;

  constructor() {
    super();
    this._configs = new Map();
    this._instances = new Map();
    this._onEntityDestroyed = (entity) => this.stop(entity);
  }

  onAdded(world) {
    this._world = world;
    world.onEntityDestroyed(this._onEntityDestroyed);
  }

  onRemoved(world) {
    world.offEntityDestroyed(this._onEntityDestroyed);
    this._world = null;
    for (const entity of this._instances.keys()) {
      this.stop(entity);
    }
  }

  configure(entity, key, overrides = {}) {
    this._configs.set(entity, {
      key,
      volume: overrides.volume ?? null,
      loop: overrides.loop ?? null,
      group: overrides.group ?? null,
    });
  }

  play(entity, key, overrides = {}) {
    this.stop(entity);
    this.configure(entity, key, overrides);
    this._startPlayback(entity);
  }

  stop(entity) {
    const instance = this._instances.get(entity);
    if (instance) {
      instance.stop();
      this._instances.delete(entity);
    }
    this._configs.delete(entity);
  }

  update(ctx, dt) {
    const audio = ctx.resources.get(AudioManager);
    if (!audio) return;

    const tables = ctx.tables();
    const wtId = this._compiled.componentIds.get(WorldTransform);

    for (let ti = 0; ti < tables.length; ti++) {
      const table = tables[ti];
      const count = table.count;
      if (count === 0) continue;

      const entityIds = table.entityIds;
      const xCol = table.getColumn(wtId, "x");
      const yCol = table.getColumn(wtId, "y");
      if (!xCol || !yCol) continue;

      for (let r = 0; r < count; r++) {
        const entity = entityIds[r];
        let instance = this._instances.get(entity);

        if (!instance && this._configs.has(entity)) {
          this._startPlayback(entity, audio);
          instance = this._instances.get(entity);
        }

        if (instance) {
          instance.x = xCol[r];
          instance.y = yCol[r];
        }
      }
    }

    const camera = ctx.resources.get(Camera);
    if (camera) {
      audio.listener.x = camera.x;
      audio.listener.y = camera.y;
    }

    for (const entity of this._instances.keys()) {
      if (!ctx.world.has(entity, AudioSource)) {
        this.stop(entity);
      }
    }
  }

  _startPlayback(entity, audio) {
    if (!audio) {
      audio = this._world ? this._world.getResource(AudioManager) : null;
      if (!audio) return;
    }
    const config = this._configs.get(entity);
    if (!config) return;

    const opts = {};
    if (config.volume !== null) opts.volume = config.volume;
    if (config.loop !== null) opts.loop = config.loop;
    if (config.group !== null) opts.group = config.group;

    const instance = audio.play(config.key, opts);
    if (instance) {
      this._instances.set(entity, instance);
    }
  }
}
