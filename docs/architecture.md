# Architecture

## Entity-Component-System Model

Entities are composed from lightweight component objects. Systems operate on
entities that expose the required components — no type checking, no base class.

### Components

| Component | Fields | Read by |
|---|---|---|
| `Transform` | `x`, `y`, `rotation`, `scale` | MovementSystem, RenderSystem, CollisionSystem, SpatialHash |
| `Collider` | `width`, `height` | CollisionSystem, SpatialHash, RenderSystem (culling) |
| `Renderable` | `image`, `style`, `draw()` | RenderSystem |
| `Velocity` | `x`, `y` (Vec2) | MovementSystem |
| `Visible` | `visible` (boolean) | RenderSystem, CollisionSystem, SpatialHash |

### Systems

| System | Reads | Writes | Singleton |
|---|---|---|---|
| `MovementSystem` | `velocity`, `transform` | `transform.x`, `transform.y` | `movementSystem` |
| `RenderSystem` | `transform`, `collider`, `renderable`, `visible` | canvas (side effect) | `renderSystem` |
| `CollisionSystem` | `transform`, `collider`, `visible` | none | `collisionSystem` |
| `SpatialHash` | `transform`, `collider`, `visible` | `__shId`, `__shStamp` (internal) | instance per Group |

### Who Owns What

| Concern | Owner | Why |
|---|---|---|
| Position, rotation, scale | `Transform` — authoritative | Single source of truth |
| Entity size (AABB) | `Collider` — authoritative | Separate from visual bounds |
| Visual appearance | `Renderable` — authoritative | Image or shape style |
| Speed and direction | `Velocity` — authoritative | Consumed by MovementSystem |
| Entity membership | `Group._sprites` | Private array, iterable |
| SpatialHash lifecycle | `CollisionSystem` | `beginFrame()` → all rebuilds |
| Broad-phase strategy | `CollisionSystem` + strategy instance | Pluggable via `useSpatialHash()` |

### What Is Derived

| Value | Derived From | Used By |
|---|---|---|
| Sprite `x`, `y`, `width`, `height` | `Transform + Collider` (center → top-left) | Public convenience getters |
| `Rect` from entity | `Transform + Collider` | SpatialHash cell calculation |
| Entity center | `Transform.x`, `Transform.y` | Collision checks, rendering |
| World-space AABB | `Transform + Collider + scale` | Viewport culling |

## Ownership Boundaries

### Group

```
Group (container only)
├── _sprites: Entity[]       (private, iterable)
├── add/remove/clear/has     (membership)
├── dispose()                (unregister + clear)
├── useSpatialHash()         (registers with CollisionSystem)
├── collideXxx()             (delegates to CollisionSystem)
├── forEach/filter/map       (delegates to Array methods)
└── [Symbol.iterator]        (iterable)
```

- Does NOT own update, render, or collision logic
- Does NOT expose internal array
- `dispose()` is the single cleanup call

### Sprite

```
Sprite (data entity)
├── Transform
├── Collider
├── Velocity (Vec2)
├── Renderable
├── visible: boolean
└── groups: Group[]
```

- No `update()`, no `render()` — systems handle behavior
- `kill()` removes from all groups
- Public getters (`x`, `y`, `width`, `height`, `image`, `style`, `angle`, `scale`) are convenience shorthands over components

### CollisionSystem

```
CollisionSystem
├── _groups: Map<Group, { strategy, entities }>
├── beginFrame()            rebuilds all strategy instances
├── useSpatialHash()        registers a Group with SpatialHash
├── removeGroup()           unregisters a Group
├── collideRect/Point/Group/Sprite()
└── _query/_queryPairs      internal helpers
```

- `beginFrame()` takes no arguments — iterates all registered groups
- Strategy is pluggable (currently `SpatialHash`)
- `_queryPairs` supports callback mode (zero-allocation)

### SpatialHash

```
SpatialHash (strategy)
├── rebuild(entities)           clears + rebuilds cell grid
├── collideRect/Point/Sprite()  stamp-based single-entity dedup
├── collideGroup()              scratch Set pair dedup (reused)
├── _queryStamp                 stamp counter (no Set allocation)
├── _seen                       reusable Set for pair dedup
└── __shId, __shStamp           entity markers (internal)
```

- Single-entity queries (`collideRect`, `collideSprite`) use `_queryStamp++`
  and stamp each entity — zero allocation per query.
- `collideGroup` uses a scratch `_seen` Set per instance (one constructor
  allocation), cleared each call.
- `collideGroup` supports callback mode (zero pair allocation).

## Per-Frame Lifecycle

```
Game._loop(time)
│
├── scene.update(fixedDt)
│   ├── user input handling
│   ├── movementSystem.update(group, dt)
│   ├── collisionSystem.beginFrame()
│   ├── collisionSystem.collideXxx(...)
│   └── scene-specific logic
│
├── scene.interpolate(alpha)
│
└── scene.render(ctx)
    ├── renderSystem.render(ctx, group, viewport)
    └── scene-specific rendering
```

### Allocations Per Frame (hot path)

| Operation | Allocation |
|---|---|
| `RenderSystem.render` | 0 |
| `MovementSystem.update` | 0 |
| `CollisionSystem.beginFrame()` | 0 (cells cleared + reused) |
| `SpatialHash.collideRect` / `collideSprite` | 0 (stamp++) |
| `SpatialHash.collideGroup` (with callback) | 0 (reused scratch Set) |
| `SpatialHash.collideGroup` (with out array) | 0 (scratch Set + reuses out array) |
| `SpatialHash._insert` | cell key string (unavoidable) |
| `Renderable.draw` with circle/ellipse | 0 (Path2D cached) |

Goal: **0 allocations per frame** during normal gameplay on the hot path.
Pull-based APIs (`out`, callback) shift allocation control to the caller.

## Entity Component Contract

Any object with the following properties works with the engine:

```js
// Required by MovementSystem
entity.transform   // { x, y }
entity.velocity    // { x, y }

// Additional requirement for RenderSystem
entity.visible     // boolean
entity.collider    // { width, height }
entity.renderable  // { draw(ctx, w, h) }

// Additional requirement for CollisionSystem / SpatialHash
entity.visible     // boolean
entity.collider    // { width, height }
entity.transform   // { x, y }
```

No entity needs to extend `Sprite`. Any plain object with the right
properties can be used with any system. `Sprite` is the built-in
implementation that provides these components on construction and
exposes convenience getters.

## Strategy Interface

Pluggable broad-phase strategies must implement:

```js
interface BroadPhaseStrategy {
  rebuild(entities): void
  collideRect(rect, out?): Entity[]
  collidePoint(point, out?): Entity[]
  collideSprite(entity, out?): Entity[]
  collideGroup(other, cbOrOut?): Pair[] | void
}
```

`SpatialHash` is the default strategy. Future strategies (`SweepAndPrune`,
`Quadtree`, `BVH`) implement the same interface and are swapped in via
`CollisionSystem.useSpatialHash()`.
