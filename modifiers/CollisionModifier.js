export class CollisionModifier {
  static get capabilities() {
    return {
      gpuCompatible: false,
      requiresState: false,
      spawnsParticles: false,
      requiresCollision: true,
      pass: "collision",
    };
  }

  constructor({ provider, frequency = 1, priority, onParticleCollision } = {}) {
    if (frequency !== undefined && (!Number.isInteger(frequency) || frequency < 1)) {
      throw new Error("CollisionModifier: frequency must be a positive integer");
    }

    this._provider = provider || null;
    this._frequency = frequency;
    this._frameCounter = 0;
    this._onParticleCollision = onParticleCollision || null;
    this._frameCollisions = 0;

    this.enabled = true;
    this.priority = priority;
    this.collisionCount = 0;
    this.lastFrameCollisions = 0;
  }

  beginFrame() {
    this._frameCounter++;
  }

  update(acc, dt, ctx) {
    if (!acc.collides) return;
    if (this._frameCounter % this._frequency !== 0) return;

    const provider = this._provider || (ctx.system && ctx.system._collisionProvider);
    if (!provider) return;

    const hit = provider.queryCircle(acc.x, acc.y, acc.radius, acc.collisionLayer);
    if (!hit) return;

    this.collisionCount++;
    this._frameCollisions++;
    this._resolve(acc, hit);
    if (acc.onCollision) acc.onCollision(acc, hit);
    if (this._onParticleCollision) this._onParticleCollision(acc, hit);
  }

  endFrame() {
    this.lastFrameCollisions = this._frameCollisions;
    this._frameCollisions = 0;
  }

  _resolve(acc, hit) {
    switch (acc.collisionResponse) {
      case "bounce": this._bounce(acc, hit); break;
      case "slide": this._slide(acc, hit); break;
      case "stop": this._stop(acc, hit); break;
      case "kill": this._kill(acc, hit); break;
      default: break;
    }
  }

  _bounce(acc, hit) {
    const dot = acc.vx * hit.normalX + acc.vy * hit.normalY;
    if (dot >= 0) return;
    acc.vx -= 2 * dot * hit.normalX;
    acc.vy -= 2 * dot * hit.normalY;
    acc.vx *= acc.restitution;
    acc.vy *= acc.restitution;
    acc.x += hit.normalX * hit.penetration;
    acc.y += hit.normalY * hit.penetration;
  }

  _slide(acc, hit) {
    const dot = acc.vx * hit.normalX + acc.vy * hit.normalY;
    if (dot >= 0) return;
    acc.vx -= dot * hit.normalX;
    acc.vy -= dot * hit.normalY;
    acc.x += hit.normalX * hit.penetration;
    acc.y += hit.normalY * hit.penetration;
  }

  _stop(acc, hit) {
    acc.vx = 0;
    acc.vy = 0;
    acc.x += hit.normalX * hit.penetration;
    acc.y += hit.normalY * hit.penetration;
  }

  _kill(acc, hit) {
    acc.life = 0;
  }

  clone() {
    return new CollisionModifier({
      provider: this._provider,
      frequency: this._frequency,
      priority: this.priority,
      onParticleCollision: this._onParticleCollision,
    });
  }

  toDescriptor() {
    return { type: "collision", frequency: this._frequency };
  }

  toJSON() {
    throw new Error("CollisionModifier.toJSON is not supported (provider is external)");
  }
}
