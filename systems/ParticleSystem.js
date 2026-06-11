import { ActivePool } from "../memory/ActivePool.js";
import { Particle } from "../display/Particle.js";

const _resetParticle = p => {
  p.x = 0;
  p.y = 0;
  p.vx = 0;
  p.vy = 0;
  p.ax = 0;
  p.ay = 0;
  p.life = 0;
  p.maxLife = 0;
  p.size = 1;
  p.rotation = 0;
  p.rotationSpeed = 0;
  p.alpha = 1;
  p.color = "#ffffff";
};

export class ParticleSystem {
  constructor({ renderParticle } = {}) {
    this._renderParticle = renderParticle;
    this._pool = new ActivePool({
      create: () => new Particle(),
      reset: _resetParticle,
    });
  }

  emit(count, initializer, emitter) {
    for (let i = 0; i < count; i++) {
      const p = this._pool.acquire();
      if (initializer) initializer(p, i, emitter);
    }
  }

  emitOne(initializer) {
    const p = this._pool.acquire();
    if (initializer) initializer(p, 0);
    return p;
  }

  update(dt) {
    const active = this._pool.activeObjects;
    const pool = this._pool;
    for (let i = active.length - 1; i >= 0; i--) {
      const p = active[i];

      p.vx += p.ax * dt;
      p.vy += p.ay * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += p.rotationSpeed * dt;
      p.life -= dt;

      if (p.life <= 0) {
        pool.release(p);
      }
    }
  }

  render(ctx) {
    const active = this._pool.activeObjects;
    ctx.save();
    for (let i = 0; i < active.length; i++) {
      const p = active[i];
      ctx.globalAlpha = p.alpha;
      if (this._renderParticle) {
        this._renderParticle(ctx, p);
      } else {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size * 0.5, p.y - p.size * 0.5, p.size, p.size);
      }
    }
    ctx.restore();
  }

  clear() {
    this._pool.clearActive();
  }

  /**
   * Direct read-only reference to the active particles array.
   * Do NOT push, pop, splice, or mutate this array directly.
   * Use emit() / clear() / the pool API instead.
   */
  get particles() {
    return this._pool.activeObjects;
  }

  /** Pre-allocate particle objects so runtime bursts never allocate. */
  warmup(count) {
    this._pool.warmup(count);
  }

  /** Currently active particles. */
  get activeCount() {
    return this._pool.activeCount;
  }

  /** Particles sitting in the pool ready for reuse. */
  get freeCount() {
    return this._pool.freeCount;
  }

  /** Total managed particles (active + free). */
  get capacity() {
    return this._pool.capacity;
  }

  /** Highest activeCount ever reached. */
  get peakActive() {
    return this._pool.peakActive;
  }

  /** Highest capacity (active + free) ever reached. */
  get peakCapacity() {
    return this._pool.peakCapacity;
  }

  /** Highest freeCount ever reached. Useful for tuning warmup sizes. */
  get peakFree() {
    return this._pool.peakFree;
  }

  /** Total particle objects ever allocated over the system's lifetime. */
  get totalCreated() {
    return this._pool.totalCreated;
  }

  /** True when no particles are active. */
  get isEmpty() {
    return this.activeCount === 0;
  }

  /** True when one or more particles are active. */
  get hasParticles() {
    return this.activeCount > 0;
  }
}
