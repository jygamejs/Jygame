# ECS Migration Audit — Master Document

## Architecture Overview

JyGame is a **hybrid architecture** running three paradigms simultaneously:

| Paradigm | Scope | Examples |
|---|---|---|
| **Classic OOP** | Game loop, display, scenes | `Game`, `Scene`, `Sprite`, `Group`, `Trail` |
| **ECS-style composition** | Entity data & systems | `Transform`, `Collider`, `Renderable`, `Animation` + `MovementSystem`, `RenderSystem` |
| **Formal ECS** (new, internal) | Core ECS infra | `ecs/core/` — `World`, `EntityManager`, `QueryEngine`, `ArchetypeSystem`, `Table`, `SystemScheduler` |

The public `jygame.js` barrel exports the OOP and composition layers but **not** the formal ECS core. This suggests the ECS infra was added for internal use (e.g., particle engine, audio future) while keeping the public API compatible.

## Inventory

### Total modules: 131 source files across 19 directories

| Directory | Count | Role |
|---|---|---|
| `ecs/core/` | 11 | Formal ECS infrastructure |
| `components/` | 4 | Component classes |
| `systems/` | 5 | System singletons |
| `display/` | 4 | Visual game objects |
| `core/` | 3 | Engine orchestration |
| `audio/` | 16 | Full audio subsystem |
| `audio/backends/` | 3 | Audio backend strategies |
| `audio/effects/` | 9 | Audio DSP effects |
| `particles/` | 23 | Particle engine |
| `particles/gpu/` | 17 | GPU particle compute |
| `modifiers/` | 16 | Particle modifier plugins |
| `shapes/` | 9 | Emitter shape geometry |
| `loaders/` | 3 | Asset loaders |
| `input/` | 2 | Input handling |
| `time/` | 2 | Clock & Timer |
| `memory/` | 2 | Object pools |
| `math/` | 1 | Vec2 |
| `geometry/` | 1 | Rect |
| `collision/` | 1 | SpatialHash |
| `color/` | 1 | Color palette |
| `state/` | 1 | Observable state store |
| `storage/` | 1 | localStorage wrapper |
| `camera/` | 1 | Camera |
| root | 2 | `jygame.js`, `package.json` |

## Dual ECS Problem

The codebase has two ECS systems:

### Legacy ECS (Sprite-based, in use)
- Entities are `Sprite` instances aggregating `Transform`, `Collider`, `Renderable`, `Animation`
- Systems (`MovementSystem`, etc.) operate on arrays of these entities
- No component registry, no archetype queries, no scheduler
- `Group` acts as a manual entity collection

### New ECS (ecs/core/, built but not integrated)
- Formal archetype-based ECS with World, EntityManager, QueryEngine, SystemScheduler
- 544+ tests passing
- Supports: typed-array columns, archetype queries, system scheduling, system contexts, zero-allocation iteration
- **Not wired to any game module** — no Sprite, no display, no audio, no particles use it

This is the fundamental architectural debt to resolve.

## Module Classification

### ECS Components (already data-only)
- `Transform` — position, rotation, scale
- `Collider` — width, height (AABB)
- `Renderable` — image, style (has `draw()` method — borderline)
- `Animation` — clip playback state (has `play`/`pause`/`stop` — borderline)

### Needs Split into Component + System
- `Timer` — currently a standalone class, should be `TimerComponent` + `TimerSystem`
- `Trail` — currently standalone, could be `TrailComponent` + updated `TrailSystem`

### Requires Redesign
- `Sprite` — aggregates all components; becomes a factory that creates an ECS entity with components
- `Group` — becomes replaced by ECS queries
- `Particle` — flat struct; particle systems use SoA storage internally (already ECS-like)

### Resources (singleton engine data)
- `Camera` (with `Camera.main` static singleton)
- `AudioManager` (app-owned singleton)
- `InputContext` / `Input` (facade)
- `Clock`
- `State` (reactive store)
- `Storage` (localStorage wrapper)
- `SpatialHash` (per-collision-group)

### Services (utilities, no entity data)
- `Vec2`, `Rect`
- `Pool`, `ActivePool`
- `Colors`
- `attenuation.js`
- `ShapeRegistry`, `ModifierRegistry`
- `ImageLoader`, `FontLoader`, `AudioLoader`
- `LoadingTask`

### Backend (platform abstraction)
- `AudioBackend` / `HtmlAudioBackend` / `WebAudioBackend`
- `ParticleRenderer` / `CanvasParticleRenderer` / `GpuParticleRenderer`
- Particle GPU compute pipeline (`GpuComputeProgram`, `GpuPassExecutor`, etc.)

### Engine Core (stays as-is)
- `Game` — application shell, owns canvas and loop
- `Scene` — lifecycle container, user overrides hooks

### Remove (obsolete after migration)
- `Sprite` (becomes entity factory)
- `Group` (becomes queries)
- `Sprite.x`/`y`/`width`/`height` convenience accessors (moved to component reads)
- `entity.velocity` (becomes `Velocity` component)
- `entity.visible` (becomes `Visible` component)

## Key Architectural Observations

1. **Particle engine already uses ECS patterns internally**: SoA storage, typed arrays, archetype-like field accessors, pooling. This is the most ECS-ready subsystem.

2. **Audio has its own object pooling**: `Sound` manages `AudioInstance` via `ObjectPool`. This could be generalized to the ECS pool utility.

3. **Camera is the only singleton that needs per-scene instances**: split-screen requires multiple cameras, but `Camera.main` assumes one.

4. **No circular dependencies** detected between modules. The dependency graph is a DAG rooted at `jygame.js`.

5. **The new ECS has 0 coupling to game logic** — it implements no game systems. The migration consists of re-implementing the 5 existing game systems (`MovementSystem`, `CollisionSystem`, `AnimationSystem`, `RenderSystem`, `TrailSystem`) on top of the new ECS.

## Risk Summary

| Risk | Severity | Mitigation |
|---|---|---|
| Dual ECS state during migration | High | Migrate one system at a time; run both ECS in parallel |
| `Sprite` aggregates all components; refactoring breaks all user code | High | Provide compatibility layer or emit deprecation warnings |
| `RenderSystem` uses `collider.width/height` for render size (design smell) | Medium | Separate `RenderBounds` from `Collider` |
| Particle engine is standalone; integrating with ECS adds complexity | Medium | Wrap as ECS component + system; keep internal SoA storage |
| Audio manager is deeply coupled to object pooling and manual lifecycle | Low | Keep as resource; no need to ECS-ify |
| `Group.collideXxx()` methods coupled to global `collisionSystem` singleton | Medium | Refactor collision queries to ECS system |
| No test suite for game modules (only ECS core has tests) | High | Add migration tests before touching production code |
