# ECS Migration Deprecation Plan

## Deprecation Policy

| Phase | Status | Semver |
|---|---|---|
| **Current** | All legacy APIs available | 1.x |
| **Soft deprecation** | Legacy APIs emit `console.warn()` once | 1.x |
| **Hard deprecation** | Legacy APIs emit `console.warn()` every call | 2.0 |
| **Removal** | Legacy APIs deleted | 3.0 |

All deprecated APIs have a suggested replacement. Replacement must be available for at least one minor version before the original is soft-deprecated.

---

## API Inventory

### Direct removal (no replacement needed)

| API | Replace with | Phase |
|---|---|---|
| `entity.__shId` | ECS typed-array storage | 5 |
| `entity.__shStamp` | ECS typed-array storage | 5 |
| `entity.velocity` (duck type) | `Velocity` component | 1 |
| `entity.visible` (duck type) | `Visible` component | 1 |
| `entity.isEnemy` (duck type) | `EnemyTag` component | 1 |

### Sprite (`display/Sprite.js`) — soft deprecation Phase 8, removal Phase 10

| Old API | Replacement | Notes |
|---|---|---|
| `new Sprite(opts)` | `world.createEntity()` + `addComponent(...)` | Factory function wrapper |
| `sprite.x` / `sprite.y` | `ctx.column(Transform, "x")[row]` | Proxy in compat layer |
| `sprite.rotation` | `ctx.column(Transform, "rotation")[row]` | |
| `sprite.scale` | `Transform.scaleX/Y` | Vec2 → scalars |
| `sprite.width` / `sprite.height` | `Collider.width/height` or `RenderBounds` | |
| `sprite.velocity` | `Velocity` component | |
| `sprite.visible` | `Visible` component | |
| `sprite.addChild(child)` | ECS hierarchy component (future) | Or manual entity parenting |
| `sprite.removeChild(child)` | ECS hierarchy component (future) | |

### Group (`display/Group.js`) — soft deprecation Phase 8, removal Phase 10

| Old API | Replacement | Notes |
|---|---|---|
| `new Group()` | ECS world queries | |
| `group.add(entity)` | `world.createEntity()` | Entities are in the world, not a group |
| `group.remove(entity)` | Remove components or destroy entity | |
| `group.forEach(fn)` | `ctx.forEach(fn)` | System context iteration |
| `group.collideRect(entity, group)` | `CollisionSystem.queryRect()` | Resource-based |
| `group.collideCircle(entity, group)` | `CollisionSystem.queryCircle()` | |
| `group.useSpatialHash(...)` | World-owned SpatialHash resource | |
| `group.children` | Query result array | |

### Renderable (`components/Renderable.js`) — soft deprecation Phase 6, removal Phase 10

| Old API | Replacement | Notes |
|---|---|---|
| `renderable.draw(ctx)` | RenderSystem internal logic | Components don't draw themselves |
| `renderable.style` (object) | Flattened fields: `fillColor`, `shape` | |
| `renderable.image` (bare) | `RenderableImage` wrapper (future) | For uniform texture handling |

### Animation (`components/Animation.js`) — soft deprecation Phase 4, removal Phase 10

| Old API | Replacement | Notes |
|---|---|---|
| `animation.play(name)` | `AnimationSystem.play(entityId, name)` | System action |
| `animation.pause()` | `AnimationSystem.pause(entityId)` | |
| `animation.stop()` | `AnimationSystem.stop(entityId)` | |
| `animation.animations` (Map) | `AnimationClipRegistry.get(name)` | Shared asset, not per-entity |
| `animation._callback` | ECS event system | |

### CollisionSystem (`systems/CollisionSystem.js`) — soft deprecation Phase 5, removal Phase 10

| Old API | Replacement | Notes |
|---|---|---|
| `CollisionSystem.collideRects(a, b)` | Same logic, system-internal | No public API change needed |
| `CollisionSystem._groups` | World resources | |
| `CollisionSystem.addGroup(name)` | World resource registration | |
| `CollisionSystem.useSpatialHash(name)` | `world.resources.set("SpatialHash:"+name, ...)` | |

### Legacy Systems — soft deprecation Phase 3-7, removal Phase 10

| System | Replaced by | Phase |
|---|---|---|
| `MovementSystem` | `EcsMovementSystem` | 3 |
| `AnimationSystem` | `EcsAnimationSystem` | 4 |
| `CollisionSystem` | `EcsCollisionSystem` | 5 |
| `RenderSystem` | `EcsRenderSystem` | 6 |
| `TrailSystem` | `EcsTrailSystem` | 7 |

### Global Singletons — soft deprecation Phase 2, removal Phase 10

| Singleton | Replace with | Notes |
|---|---|---|
| `Camera.main` | `ctx.resources.Camera` | Resource injection |
| `Input.*` (module-level) | `ctx.resources.InputContext` | Per-system context |

---

## Event Timeline

| Release | Changes |
|---|---|
| **1.x** | Legacy + ECS APIs coexist. ECS systems dual-run with legacy. Soft deprecation warnings on Sprite/Group access. |
| **2.0** | Hard deprecation on all legacy APIs. Breaking: `Renderable.draw()` removed, `Animation.play()` removed. |
| **3.0** | `Sprite` class and `Group` class removed. `LegacyMovementSystem` etc. removed. Only ECS APIs remain. |

---

## Compatibility Layer Design

### Sprite proxy (Phase 8)
```js
class SpriteProxy {
  #entityId;
  #world;
  constructor(entityId, world) {
    this.#entityId = entityId;
    this.#world = world;
  }
  get x() {
    warnOnce("sprite.x is deprecated, use Transform.x");
    const t = this.#world.getComponent(this.#entityId, Transform);
    return t ? t.x : 0;
  }
  set x(val) {
    warnOnce("sprite.x is deprecated, use Transform.x");
    const t = this.#world.getComponent(this.#entityId, Transform);
    if (t) t.x = val;
  }
  // ... same for y, rotation, scale, etc.
}
```

The proxy is not allocated per access; `SpriteProxy` is the returned object itself (intermediaries created once).

### Group compatibility (Phase 8)
```js
class GroupCompat {
  constructor(query) {
    this._query = query; // Query object
  }
  get children() {
    return this._query.results; // cached query result
  }
  forEach(fn) {
    this._query.forEach(fn);
  }
  on(event, handler) {
    // delegate to world events
  }
}
```

---

## Deprecation Warning Utility

```js
const warned = new Set();
function warnOnce(msg) {
  if (!warned.has(msg)) {
    warned.add(msg);
    console.warn(`[JyGame Deprecation] ${msg}`);
  }
}
```

Used for ALL soft-deprecation warnings. Hard deprecation uses `warnAlways()` (no set check).
