# Architecture

## Entity-Component-System Model

Entities are composed from lightweight component objects. Systems operate on
entities that expose the required components — no type checking, no base class.

### Components

| Component | Fields | Read by |
|---|---|---|
| `Transform` | `x`, `y`, `rotation`, `scale` | MovementSystem, RenderSystem, CollisionSystem, SpatialHash |
| `Collider` | `width`, `height` | CollisionSystem, SpatialHash, RenderSystem (culling) |
| `Renderable` | `image`, `style`, `draw()` | RenderSystem, AnimationSystem |
| `Animation` | `animations`, `current`, `frame`, `elapsed`, `playing` | AnimationSystem |
| `Velocity` | `x`, `y` (Vec2) | MovementSystem |
| `Visible` | `visible` (boolean) | RenderSystem, CollisionSystem, SpatialHash |

### Systems

| System | Reads | Writes | Singleton |
|---|---|---|---|
| `AnimationSystem` | `animation`, `renderable` | `renderable.image`, `animation.frame`, `animation.elapsed`, `animation.playing` | `animationSystem` |
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
| Animation state | `Animation` — authoritative | `current`, `frame`, `elapsed`, `playing` |
| Frame advancement | `AnimationSystem` | Writes `renderable.image`, advances `Animation` state |
| Speed and direction | `Velocity` — authoritative | Consumed by MovementSystem |
| Entity membership | `Group._sprites` | Private array, iterable |
| World-to-screen transform | `Camera` — authoritative | Position, zoom, rotation applied by RenderSystem |
| Visible world region | `Camera` — derived from position + zoom + size | Used for culling |
| SpatialHash lifecycle | `CollisionSystem` | `beginFrame()` → all rebuilds |
| Broad-phase strategy | `CollisionSystem` + strategy instance | Pluggable via `useSpatialHash()` |

### What Is Derived

| Value | Derived From | Used By |
|---|---|---|
| Sprite `x`, `y`, `width`, `height` | `Transform + Collider` (center → top-left) | Public convenience getters |
| `Rect` from entity | `Transform + Collider` | SpatialHash cell calculation |
| Entity center | `Transform.x`, `Transform.y` | Collision checks, rendering |
| World-space AABB | `Transform + Collider + scale` | Camera culling |
| Visible world bounds | `Camera (x, y, width, height, zoom)` | Culling, worldToScreen, screenToWorld |

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
├── Animation
├── visible: boolean
└── groups: Group[]
```

- No `update()`, no `render()`, no animation logic — systems handle behavior
- `kill()` removes from all groups
- Public getters (`x`, `y`, `width`, `height`, `image`, `style`, `angle`, `scale`) are convenience shorthands over components

### Camera

```
Camera (transform)
├── x, y              center of view in world space
├── width, height     viewport size in pixels
├── zoom              scale factor (higher = zoomed in)
├── rotation get/set  world rotation with cached cos/sin
├── static main       first created Camera becomes default
├── static setMain()  explicit main camera assignment
├── _cos, _sin        cached trig values (updated on rotation set)
├── apply(ctx)        one-shot canvas transform
├── worldToScreen()   world → pixel coords (uses cached cos/sin)
├── screenToWorld()  pixel → world coords (uses cached cos/sin)
└── follow(entity)    snap to entity.transform
```

- `Camera.main` is auto-set in constructor if no main exists
- `Camera.setMain(camera)` for explicit transitions (scene changes)
- `IDENTITY` (internal to RenderSystem, width=0) disables transform
  and culling when no camera exists — `render(ctx, entities)` works
  without any camera setup
- `_cos`/`_sin` cached on rotation set — no trig per query
- Not a System, not a Component — it is a standalone view abstraction
- Future features (shake, smoothing, parallax, dead zones) go in
  camera controllers, not in Camera itself

### Input

```
Input (facade) → InputContext (implementation)
├── _pressed, _justPressed, _justReleased    Map<name, bool>
├── _keyMap      Map<physicalKey, alias>      alias resolution
├── _actions     Map<action, Set<input>>     action resolution
├── _pointers    Map<pointerId, data>
├── _swipeListeners / _tapListeners          Set<callback>
├── isDown / justPressed / justReleased       key → alias → action
├── mapKey / unmapKey / setKeyMap / resetKeyMap
├── bind / unbind / getBindings / clearBindings
├── getPointers()                             returns iterator (no alloc)
├── forEachPointer(fn)
├── getPointer(id)
├── onSwipe / onTap                           return unsubscribe fn (no alloc)
├── removeSwipe / removeTap                   O(1) Set.delete
└── consumeBuffer / peekBuffer
```

Resolution chain: `Physical Key → Key Alias → Action`

All three query methods (`isDown`, `justPressed`, `justReleased`) follow the
same chain via `_resolve(name, map)` — no duplicated lookup logic.

Listeners use `Set` (O(1) add/delete). Unsubscribe functions capture the
callback and call `Set.delete()` — no array allocation on removal.

`getPointers()` returns `Map.values()` iterator directly — no array copy.

The `Input` facade delegates every method to the default `InputContext`
singleton, including the new `bind`/`unbind`/`getBindings`/`clearBindings`.

### AnimationSystem

```
AnimationSystem
├── update(entities, dt)    batch frame advancement
├── updateOne(entity, dt)   single entity
└── no per-frame allocations
```

- Operates on any entity with `animation` + `renderable`
- `while (elapsed >= frameTime)` loop — catches up frames after spikes
- Per-clip FPS (no global animation speed)
- Non-looping clips stop on last frame, fire callback once
- Writes `entity.renderable.image` directly — RenderSystem is unaware of AnimationSystem
- Future sprite sheet support: `clip.frames[n]` can be metadata without changing the system

### RenderSystem

```
RenderSystem
├── render(ctx, entities, camera?)       batch render (camera optional)
├── renderOne(ctx, entity, camera?)      single entity
├── _getViewBounds(camera) → bounds|null shared bounds computation
├── _isVisible(entity, bounds) → bool    shared culling (bounds=null → true)
├── _drawEntity(ctx, entity)             shared entity transform + draw
└── camera ??= Camera.main ?? IDENTITY
```

- Camera transform applied once per batch (not per entity)
- `_getViewBounds`: returns null when `camera.width === 0` (no culling) —
  avoids `Infinity` arithmetic
- `_isVisible`: single culling implementation used by both `render`
  and `renderOne`
- `_drawEntity`: single entity-drawing implementation used by both
- `IDENTITY` sentinel (width=0, plain object) disables both transform
  and culling — no camera setup required for simple games
- Accepts any iterable of entities

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
│   ├── animationSystem.update(group, dt)
│   ├── movementSystem.update(group, dt)
│   ├── collisionSystem.beginFrame()
│   ├── collisionSystem.collideXxx(...)
│   └── scene-specific logic
│
├── scene.interpolate(alpha)
│
└── scene.render(ctx)
    ├── renderSystem.render(ctx, group, camera?)
    └── scene-specific rendering
```

### Allocations Per Frame (hot path)

| Operation | Allocation |
|---|---|
| `AnimationSystem.update` | 0 |
| `MovementSystem.update` | 0 |
| `RenderSystem.render` (no camera) | 0 (IDENTITY sentinel, width=0 → no culling, no transform) |
| `RenderSystem.render` (with camera) | 0 (one `ctx.save/restore`, bounds computed once) |
| `Camera.apply` | 0 |
| `Camera.worldToScreen` | 0 (writes to user-provided `out`) |
| `Camera.screenToWorld` | 0 (writes to user-provided `out`) |
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

// Additional requirement for AnimationSystem
entity.animation   // { animations, current, frame, elapsed, playing }
entity.renderable  // { draw(ctx, w, h) }

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
