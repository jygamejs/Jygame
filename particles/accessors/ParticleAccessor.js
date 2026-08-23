export class ParticleAccessor {
  constructor() {
    if (new.target === ParticleAccessor) {
      throw new Error("ParticleAccessor is abstract — extend it");
    }
  }

  wrap(source) {
    throw new Error("ParticleAccessor#wrap must be implemented by subclass");
  }

  get __jygameId() { return 0; }
  get __jygameSortOrder() { return 0; }
  set __jygameSortOrder(v) {}

  get x() { return 0; } set x(v) {}
  get y() { return 0; } set y(v) {}
  get vx() { return 0; } set vx(v) {}
  get vy() { return 0; } set vy(v) {}
  get ax() { return 0; } set ax(v) {}
  get ay() { return 0; } set ay(v) {}
  get life() { return 0; } set life(v) {}
  get maxLife() { return 0; } set maxLife(v) {}
  get ageRatio() { return 0; } set ageRatio(v) {}
  get size() { return 0; } set size(v) {}
  get rotation() { return 0; } set rotation(v) {}
  get rotationSpeed() { return 0; } set rotationSpeed(v) {}
  get alpha() { return 0; } set alpha(v) {}
  get depth() { return 0; } set depth(v) {}
  get r() { return 0; } set r(v) {}
  get g() { return 0; } set g(v) {}
  get b() { return 0; } set b(v) {}
  get alive() { return 0; } set alive(v) {}
  get seed() { return 0; } set seed(v) {}
  get segment() { return 0; } set segment(v) {}
  get visualType() { return 0; } set visualType(v) {}
  get texture() { return null; } set texture(v) {}
  get originX() { return 0.5; } set originX(v) {}
  get originY() { return 0.5; } set originY(v) {}
  get width() { return 0; } set width(v) {}
  get height() { return 0; } set height(v) {}
  get frameX() { return 0; } set frameX(v) {}
  get frameY() { return 0; } set frameY(v) {}
  get frameWidth() { return 0; } set frameWidth(v) {}
  get frameHeight() { return 0; } set frameHeight(v) {}
  get color() { return "#ffffff"; } set color(v) {}
  get userData() { return null; } set userData(v) {}

  get collides() { return false; } set collides(v) {}
  get radius() { return 0; } set radius(v) {}
  get collisionResponse() { return ""; } set collisionResponse(v) {}
  get restitution() { return 0; } set restitution(v) {}
  get collisionLayer() { return ""; } set collisionLayer(v) {}
  get onCollision() { return null; } set onCollision(v) {}
}
