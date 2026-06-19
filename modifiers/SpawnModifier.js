export class SpawnModifier {
  static get capabilities() {
    return {
      gpuCompatible: false,
      requiresState: true,
      spawnsParticles: true,
      requiresCollision: false,
      pass: "spawn",
    };
  }

  constructor({
    mode,
    every,
    count = 1,
    initializer,
    offsetX = 0,
    offsetY = 0,
    maxPerFrame = Infinity,
    priority
  } = {}) {
    if (mode !== "interval" && mode !== "death") {
      throw new Error('SpawnModifier mode must be "interval" or "death"');
    }
    this._mode = mode;

    if (mode === "interval") {
      if (!Number.isFinite(every) || every <= 0) {
        throw new Error("SpawnModifier every must be a finite number > 0 for interval mode");
      }
      this._every = every;
    }

    if (!Number.isFinite(count) || count < 1) {
      throw new Error("SpawnModifier count must be >= 1");
    }
    this._count = count;

    if (typeof initializer !== "function") {
      throw new Error("SpawnModifier requires an initializer function");
    }
    this._initializer = initializer;

    if (!Number.isFinite(offsetX)) throw new Error("SpawnModifier offsetX must be a finite number");
    if (!Number.isFinite(offsetY)) throw new Error("SpawnModifier offsetY must be a finite number");
    this._offsetX = offsetX;
    this._offsetY = offsetY;

    if (maxPerFrame !== Infinity && (!Number.isFinite(maxPerFrame) || maxPerFrame < 0)) {
      throw new Error("SpawnModifier maxPerFrame must be >= 0 or Infinity");
    }
    this._maxPerFrame = maxPerFrame;

    this._spawnedThisFrame = 0;
    this.spawnedCount = 0;
    this.enabled = true;
    this.priority = priority;
  }

  beginFrame() {
    this._spawnedThisFrame = 0;
  }

  onEmit(acc, ctx) {
    if (this._mode === "interval") {
      const state = ctx.stateStore.ensure(acc, this, () => ({ timer: 0 }));
      state.timer = 0;
    }
  }

  update(acc, dt, ctx) {
    if (this._mode !== "interval") return;

    const state = ctx.stateStore.ensure(acc, this, () => ({ timer: 0 }));
    state.timer += dt;

    if (state.timer < this._every) return;

    const system = ctx.system;
    let remaining = Math.floor(state.timer / this._every);
    state.timer -= remaining * this._every;

    const limit = this._maxPerFrame;
    while (remaining > 0 && this._spawnedThisFrame < limit) {
      this._spawn(acc, system);
      remaining--;
    }
  }

  onDeath(acc, ctx) {
    if (this._mode !== "death") return;

    const system = ctx.system;
    const limit = this._maxPerFrame;
    let spawned = 0;

    while (spawned < this._count && this._spawnedThisFrame < limit) {
      this._spawn(acc, system);
      spawned++;
    }
  }

  _spawn(source, system) {
    const child = system.emitOne(null);
    child.x = source.x + this._offsetX;
    child.y = source.y + this._offsetY;
    this._initializer(child, source);
    if (child.maxLife <= 0) {
      child.maxLife = 1;
      child.life = 1;
    }
    this._spawnedThisFrame++;
    this.spawnedCount++;
  }

  toDescriptor() {
    const d = { type: "spawn", mode: this._mode, count: this._count, offsetX: this._offsetX, offsetY: this._offsetY, maxPerFrame: this._maxPerFrame };
    if (this._mode === "interval") d.every = this._every;
    return d;
  }

  toJSON() {
    throw new Error("SpawnModifier cannot be serialized (closures in initializer)");
  }

  clone() {
    const opts = {
      mode: this._mode,
      count: this._count,
      initializer: this._initializer,
      offsetX: this._offsetX,
      offsetY: this._offsetY,
      maxPerFrame: this._maxPerFrame,
      priority: this.priority
    };
    if (this._mode === "interval") opts.every = this._every;
    return new SpawnModifier(opts);
  }
}
