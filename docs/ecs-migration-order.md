# ECS Migration Order

## Strategy: Incremental, One System at a Time

Each migration step keeps existing functionality intact while adding ECS-backed versions. Old and new APIs coexist until the deprecation phase.

**Principle:** Never break a green test file. After each step, existing non-ECS tests must still pass, and the game must still render identically.

---

## Phase 0 — Foundation (already complete)

- [x] ECS core (`ecs/core/`): World, EntityManager, ComponentRegistry, Table, Archetype, QueryEngine, QueryView, System, SystemScheduler, SystemContext
- [x] 803 passing tests
- [x] Zero-allocation iteration API
- [x] System scheduling with priority and reentrancy guard

---

## Phase 1 — Component Registration (est. 1-2 days)

### Tasks
1. Register `Transform`, `Collider`, `Renderable`, `Animation` as formal ECS components (assign numeric IDs, define typed schemas)
2. Create `Velocity` component (promote from `Sprite.velocity`)
3. Create `Visible` component (promote from `Sprite.visible`)
4. Create tag components: `EnemyTag`, `PlayerTag`, `ProjectileTag`, `StaticTag`
5. Update `ComponentRegistry` to expose component ID lookup by class
6. Write migration tests: verify component creation, field reads/writes, defaults

### Exit criteria
- All 6 existing components registered and testable via `ComponentRegistry.getComponentId()`
- Tag components work as zero-field archetype filters
- `Sprite` still works (backward compat layer reads `sprite.transform.x` from world component)

### Risk
- `Sprite` currently creates `new Transform()` objects per sprite. Reading `sprite.transform.x` must check whether sprite is ECS-ified or legacy. Introduce a flag `_ecsEntityId`.

---

## Phase 2 — Resource Registration (est. 1 day)

### Tasks
1. Register `Camera` as World resource
2. Register `InputContext` as World resource
3. Register `SpatialHash` per-group as World resource
4. Register `Clock` (or its delta) as World resource
5. Expose `ctx.resources` on `SystemContext` (already populated by scheduler)
6. Write migration tests: verify resource access from systems

### Exit criteria
- All 4+ resources accessible via `ctx.resources.Name`
- `SpatialHash` is managed by World, not by CollisionSystem singleton

---

## Phase 3 — MovementSystem Migration (est. 1 day)

### Tasks
1. Write new `EcsMovementSystem` on top of ECS (queries `[Velocity, Transform]`)
2. Schedule it at same priority as legacy `MovementSystem`
3. Both systems run in parallel; new system writes to component arrays, legacy system reads from Sprite instances
4. **Writes to both** during migration: the ECS system writes to component typed arrays; the Sprites reflect these values or vice versa
5. After verifying output parity, disable legacy MovementSystem

### Exit criteria
- Movement works from ECS systems
- Legacy `MovementSystem.update()` is a no-op
- No visual difference in rendered output

---

## Phase 4 — AnimationSystem Migration (est. 2-3 days)

### Tasks
1. Create `AnimationClipRegistry` (shared asset registry, separates clip data from per-entity state)
2. Write new `EcsAnimationSystem` (queries `[Animation, Renderable]`)
3. Handle cross-component writes: animation system writes `Renderable.image`
4. Replace completion callback → ECS event
5. Dual-run with legacy system, verify parity
6. Disable legacy AnimationSystem

### Exit criteria
- Animation playback works from ECS systems
- Clip definitions registered once per game, not per entity
- Events fire on animation completion

---

## Phase 5 — CollisionSystem Migration (est. 3-4 days — highest risk)

### Tasks
1. Write new `EcsCollisionSystem` that reads `[Transform, Collider, Visible]` from typed arrays
2. Integrate with World-owned `SpatialHash` resources
3. Replace `Group.collideXxx()` with query-based collision API:
   ```js
   // Old
   group.collideRect(player, enemies);
   // New
   world.queryAll([PlayerTag, Transform, Collider], colliders => {
     enemies = world.queryAll([EnemyTag, Transform, Collider], ...);
     // do AABB checks
   });
   ```
4. Eliminate `__shId` / `__shStamp` pollution
5. Dual-run with legacy collision, verify parity
6. Disable legacy CollisionSystem

### Exit criteria
- Collision detection works without stamp pollution
- `Group.collideXxx()` methods deprecated (warn + delegate to new API)
- No regressions in collision response

---

## Phase 6 — RenderSystem Migration (est. 2-3 days)

### Tasks
1. Write new `EcsRenderSystem` that reads `[Visible, Transform, Renderable]` from typed arrays
2. Inject Camera as resource, apply camera transform via canvas context
3. Extract `renderable.draw()` logic into system (no methods on component)
4. Create optional `RenderBounds` component (separates render size from Collider)
5. Dual-run with legacy RenderSystem, verify pixel-perfect output
6. Disable legacy RenderSystem

### Exit criteria
- Rendering works from ECS systems
- Components have no `draw()` methods
- Camera resource drives view transform
- Render output matches legacy system exactly

---

## Phase 7 — TrailSystem Migration (est. 1-2 days)

### Tasks
1. Create `TrailComponent` (config fields only: `maxPoints`, `spacing`, `mode`, `color`, `width`)
2. Write new `EcsTrailSystem` split into update + render phases
3. Internal ring buffer stays in system (not in component)
4. Remove duck-typed `.x/.y` follow mode — use Transform component
5. Dual-run, verify parity
6. Disable legacy TrailSystem

### Exit criteria
- Trail rendering works from ECS systems
- TrailComponent stores only configuration (no per-entity state bloat)

---

## Phase 8 — Sprite & Group Deprecation (est. 2-3 days)

### Tasks
1. `Sprite` becomes a factory function (not a class) that creates ECS entities and returns a compatibility proxy
2. `Group` becomes a convenience wrapper over ECS queries (or removed entirely)
3. All `Sprite.position`, `Sprite.x`, `Sprite.y`, `Sprite.width`, `Sprite.height` map to component typed arrays
4. `new Sprite()` → internal `world.createEntity()` + `world.addComponent(entityId, Transform, ...)` etc.
5. Emit deprecation warnings for all Sprite accessor usage
6. Update jygame.js barrel to expose ECS classes alongside Sprite

### Exit criteria
- `new Sprite()` still works but creates ECS entities
- `sprite.x = 5` writes to typed array via proxy
- No functional regression in existing demos or games

---

## Phase 9 — Testing Sweep (est. 2-3 days)

### Tasks
1. End-to-end migration test: create game using only ECS APIs, verify identical rendering
2. Performance benchmarks: compare legacy vs ECS (entity creation, query speed, iteration)
3. Memory benchmarks: verify typed-array storage reduces per-entity overhead
4. Stress test: 10,000 entities with Transform + Collider + Renderable, ensure 60fps
5. Documentation audit: update all docs to reference ECS concepts

### Exit criteria
- All benchmarks show ECS is faster or equal
- No memory leaks (verified via snapshot diff)
- All docs updated

---

## Phase 10 — Cleanup (est. 1 day)

### Tasks
1. Remove deprecated legacy systems (after 2-release deprecation window)
2. Remove `Sprite` class (keep as factory function)
3. Remove `Group` class entirely
4. Remove stamp fields from all entity-like objects
5. Remove `components/Transform.js` → replaced by `ecs/components/Transform.js`
6. Remove `systems/MovementSystem.js` etc. → replaced by `ecs/systems/`

### Exit criteria
- No dead code
- jygame.js exports only ECS-ified APIs
- All 10+ test files pass
