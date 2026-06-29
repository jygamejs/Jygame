# ECS System Map

## Existing Legacy Systems

### MovementSystem (`systems/MovementSystem.js`)
| Property | Value |
|---|---|
| **Lines** | ~15 |
| **Stateless** | Yes |
| **Query** | Entities with `velocity` + `transform` |
| **Reads** | `velocity.x`, `velocity.y`, `dt` |
| **Writes** | `transform.x`, `transform.y` |
| **Order** | First (after input) |
| **ECS Signature** | `{ all: [Velocity, Transform] }` |
| **Migration complexity** | Trivial |

**Writes to ECS:**
```js
static query = { all: [Velocity, Transform] };
update(ctx, dt) {
  const vx = ctx.column(Velocity, "x");
  const vy = ctx.column(Velocity, "y");
  const tx = ctx.column(Transform, "x");
  const ty = ctx.column(Transform, "y");
  ctx.forEach(({ row }) => {
    tx[row] += vx[row] * dt;
    ty[row] += vy[row] * dt;
  });
}
```

---

### AnimationSystem (`systems/AnimationSystem.js`)
| Property | Value |
|---|---|
| **Lines** | ~50 |
| **Stateless** | Yes |
| **Query** | Entities with `animation` + `renderable` |
| **Reads** | `animation.playing`, `animation.current`, `animation.elapsed`, `animation.animations` (clips) |
| **Writes** | `animation.elapsed`, `animation.frame`, `animation.playing`, `renderable.image` |
| **Order** | Before RenderSystem |
| **ECS Signature** | `{ all: [Animation, Renderable] }` |
| **Migration complexity** | Medium |

**Challenges:**
- `animation.animations` is a `Map<string, clip>` — clip definitions should become an asset registry, not per-entity data
- `_callback` (completion callback) is a closure on the entity — use ECS events instead
- Writes `renderable.image` which is a cross-component side effect

**Solution:** Extract clip definitions into `AnimationClipRegistry` (shared asset). Animation component stores only current state. Completion fires an event.

---

### CollisionSystem (`systems/CollisionSystem.js`)
| Property | Value |
|---|---|
| **Lines** | ~180 |
| **Stateless** | Group registry is stateful |
| **Query** | Entities with `transform` + `collider` + `visible` |
| **Reads** | `transform`, `collider`, `visible` |
| **Writes** | `__shId`, `__shStamp` (stamp pollution) |
| **Order** | After MovementSystem, before RenderSystem |
| **ECS Signature** | `{ all: [Transform, Collider, Visible] }` |
| **Migration complexity** | Hard |

**Challenges:**
- Stamp-field pollution (`__shId`, `__shStamp`) on entities — eliminated by ECS (data lives in typed arrays)
- `Group`-centric API (`useSpatialHash`, `collideRect`, etc.) — replaced by query-based collision queries
- `_groups` map is ad-hoc entity grouping — replaced by archetype queries

**Solution:** Keep `SpatialHash` as a resource. The `CollisionSystem` queries entities with `{ all: [Transform, Collider] }`, feeds their AABBs into the spatial hash, and exposes query methods.

---

### RenderSystem (`systems/RenderSystem.js`)
| Property | Value |
|---|---|
| **Lines** | ~120 |
| **Stateless** | Yes (canvas is parameter) |
| **Query** | Entities with `visible` + `transform` + `collider` + `renderable` |
| **Reads** | `visible`, `transform.x/y/rotation/scale`, `collider.width/height`, `renderable.image/style` |
| **Writes** | Canvas context (side effect) |
| **Order** | Last (after all updates) |
| **ECS Signature** | `{ all: [Visible, Transform, Renderable] }` |
| **Migration complexity** | Medium |

**Challenges:**
- Uses `collider.width/height` as render dimensions — breaks separation of concerns. ECS version should use explicit render bounds or the image's intrinsic size.
- `Camera.main` global singleton — inject as resource
- `renderable.draw()` couples rendering logic to component. Extract draw logic into system.

**Solution:** Create `RenderBounds` component separate from `Collider`. Camera injected as resource. Draw logic in system.

---

### TrailSystem (`systems/TrailSystem.js`)
| Property | Value |
|---|---|
| **Lines** | ~60 |
| **Stateful** | Yes (owns `_trails` array) |
| **Query** | N/A (manages Trail instances directly) |
| **Reads** | Trail position (duck-typed: `.x/.y` or `.transform`) |
| **Writes** | Canvas context |
| **Order** | Update: after MovementSystem; Render: after RenderSystem |
| **ECS Signature** | `{ all: [TrailComponent] }` |
| **Migration complexity** | Medium |

**Challenges:**
- `Trail` is a standalone class with its own ring buffer — wrapping it as a component requires deciding which fields go in the component vs stay in the class
- `follow()` duck-types between `.transform` and raw coords — normalize to Transform component

**Solution:** Create `TrailComponent` holding config (`maxPoints`, `spacing`, `mode`, etc.). `TrailSystem` queries for entities with `TrailComponent` and reads their `Transform` each frame. Internal ring buffer stays in system-side storage.

---

## New Systems (ECS-aware)

### Scheduler (ecs/core/SystemScheduler.js)
Already implemented. Manages system lifecycle, priority ordering, reentrancy guard, context creation.

### Resource Systems
Systems that read/write resources (not entity components):
- `InputSystem` — reads `InputContext`, writes nothing
- `AudioUpdateSystem` — calls `AudioManager.update(dt)`
- `CameraSystem` — applies camera transform before render

---

## Execution Order (ECS)

```
0.  InputSystem             (resource read)
1.  MovementSystem          (Transform + Velocity)
2.  AnimationSystem         (Animation + Renderable)
3.  TrailSystem.update      (TrailComponent + Transform)
4.  CollisionSystem.beginFrame  (rebuild spatial hash)
5.  [User collision queries]
6.  CameraSystem.apply      (resource write → canvas transform)
7.  RenderSystem.render     (Visible + Transform + Renderable)
8.  TrailSystem.render      (TrailComponent)
9.  ParticleSystem.render   (standalone, per-effect)
```

---

## Dependency Graph

```
MovementSystem ────┐
                   ▼
AnimationSystem ───┤
                   ▼
CollisionSystem ───┤
                   ▼
CameraSystem ──────┤
                   ▼
RenderSystem       │
                   │
TrailSystem.update ◄┘
TrailSystem.render
```

No cycles. Every dependency is a "must run before" edge.
