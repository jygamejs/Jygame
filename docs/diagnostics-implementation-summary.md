# Diagnostics Phase 1 — Implementation Summary

Four commits implementing a zero-allocation runtime performance diagnostics system.

## Files Created

| File | Lines | Purpose |
|------|-------|---------|
| `debug/Diagnostics.js` | 191 | World resource, public API, frame lifecycle |
| `debug/DiagnosticsConfig.js` | 27 | Mutable config (enabled, historySize, autoReset, samplingRate) |
| `debug/MetricRegistry.js` | 111 | Integer metric ID registry, idempotent, lockable |
| `debug/MetricDescriptor.js` | 54 | Read-only metric metadata (private fields) |
| `debug/MetricType.js` | 8 | Enum: TIMER, COUNTER, GAUGE, CONSTANT |
| `debug/MetricUnit.js` | 9 | Enum: MILLISECONDS, COUNT, BYTES, MEGABYTES, PERCENT, FPS |
| `debug/MetricCategory.js` | 12 | Enum: FRAME, ECS, RENDER, AUDIO, PARTICLES, PHYSICS, STREAMING, ASSETS, USER, PLUGIN |
| `debug/CPUTimer.js` | 64 | Lightweight reusable timer (start/stop/discard) |
| `debug/FrameStorage.js` | 62 | Single ArrayBuffer with typed-array views, geometric growth |
| `debug/FrameSnapshot.js` | 54 | Frozen snapshot owning cloned typed arrays |
| `debug/FrameEvent.js` | 18 | Timeline event (category, name, JSON metadata) |
| `debug/FrameHistory.js` | 88 | Ring buffer, forEachReverse, frames iterator |
| `debug/index.js` | 12 | Barrel export |
| `tools/ecs/tests/Diagnostics.test.js` | 1100+ | 81 tests across all components + integration |

## Files Modified

| File | Change |
|------|--------|
| `jygame.js` | Added 10 exports for all debug classes |
| `ecs/core/World.js` | Frame lifecycle (beginFrame/endFrame), entity counters, ecs.world.* gauges |
| `ecs/core/SystemScheduler.js` | Auto-registers per-system metrics, wraps system.update() with scope() |
| `ecs/bootstrap/DefaultWorldBuilder.js` | Creates Diagnostics, registers 8 standard metrics, calls lockRegistry() |
| `ecs/systems/RenderSystem.js` | render.draw timer, render.drawCalls counter |
| `ecs/systems/CollisionSystem.js` | physics.broadphase timer, physics.bodies gauge |
| `audio/AudioManager.js` | audio.update timer, audio.active/pooled gauges |
| `particles/ParticleSystem.js` | particles.simulation/draw timers, alive/emitted/emitters gauges |
| `collision/SpatialHash.js` | physics.narrowphase timer, physics.contacts gauge; _timeQuery() wrapper |
| `ecs/streaming/StreamingManager.js` | streaming.* gauges and counters |
| `ecs/scene/SceneManager.js` | Frame events on scene transitions |
| `loaders/ImageLoader.js` | assets.textures gauge, assets.loaded counter |
| `loaders/AudioLoader.js` | assets.audioClips gauge, assets.loaded counter |
| `loaders/FontLoader.js` | assets.fonts gauge |

## Test Results

- **2270 total tests** (2183 existing + 81 diagnostics + 6 existing incremental)
- **0 failures** after each commit
- 24 commit-1 core tests (MetricRegistry, MetricType, enums, CPUTimer, FrameStorage, FrameSnapshot, FrameEvent, FrameHistory)
- 28 commit-1 integration tests (Diagnostics: frame lifecycle, recording, events, metadata, reset, config, dynamic metrics)
- 10 commit-2 ECS integration tests (World frame lifecycle, entity counters, per-system timing, lock enforcement)
- 19 commit-3 subsystem tests (RenderSystem, CollisionSystem, AudioManager, ParticleSystem, SpatialHash, StreamingManager, SceneManager)

## Key Design Decisions

| Decision | Choice |
|----------|--------|
| How is Diagnostics accessed? | World resource (`ctx.resources.get(Diagnostics)`) |
| Metric addressing | Integer IDs via MetricRegistry → O(1) typed-array storage |
| Storage growth | Geometric (doubling) via ensureCapacity() |
| Static vs dynamic registration | Two methods; lock after init prevents accidental runtime growth |
| Registration idempotency | Same name returns same ID |
| Frame events | Plain JSON metadata only — no Map, Set, Date, or engine objects |
| Snapshot immutability | Object.freeze on snapshot; typed arrays are independent clones |
| History | Storage-only ring buffer + forEachReverse; consumers compute statistics |
| Timer allocation | Lazy — CPUTimer created on first timer(id) call |
| Sampling | Entire frame skipped (no partial accumulation) |
| Standalone class pattern | Optional .diagnostics property (getter/setter) |
| Module-level loader pattern | Module-scoped _diagnostics + set diagnostics(diag) setter |

## Metric Registration Strategy

`DefaultWorldBuilder._registerStandardMetrics()` registers a bootstrap subset of **8 metrics** (frame.delta, frame.fps, frame.update, ecs.world.*, ecs.entitiesCreated/Destroyed). Subsystems register their own metrics dynamically when first accessed:

| Registration point | Metrics |
|---|---|
| `DefaultWorldBuilder` (static, pre-lock) | 8 frame + ECS world-state metrics |
| `SystemScheduler.add()` (dynamic, pre-lock) | `ecs.system.<name>` per system |
| `RenderSystem._initDiag()` (dynamic, post-lock) | `render.draw`, `render.drawCalls` |
| `CollisionSystem._initDiag()` (dynamic, post-lock) | `physics.broadphase`, `physics.bodies` |
| `AudioManager._initDiag()` (dynamic, post-lock) | `audio.update`, `audio.active`, `audio.pooled` |
| `ParticleSystem._initDiag()` (dynamic, post-lock) | `particles.*` (5 metrics) |
| `SpatialHash._initDiag()` (dynamic, post-lock) | `physics.narrowphase`, `physics.contacts` |
| `StreamingManager._initDiag()` (dynamic, post-lock) | `streaming.*` (5 metrics) |
| `ImageLoader`, `AudioLoader`, `FontLoader` (dynamic, post-lock) | `assets.*` (4 metrics across 3 loaders) |

The proposal's full standard metrics table (frame.ticks, frame.input, frame.render, frame.audio, frame.particles, audio.virtual, particles.gpuUpload, assets.memory) is aspirational — these are deferred to future phases.

## Frame Lifecycle Scope

Currently `beginFrame()`/`endFrame()` is called inside `World.update()`, so diagnostics only spans the ECS update.

`frame.delta`, `frame.fps`, `frame.update` are accurate. The remaining `frame.*` timers (frame.input, frame.render, frame.audio, frame.particles) are **not yet recorded** — they require moving the frame lifecycle to `Game._loop()` so it wraps the full pipeline:

```
Game._loop() ← beginFrame/endFrame belongs here eventually
  Input
  Fixed updates
  Audio
  World.update() ← currently has beginFrame/endFrame
    Systems (ECS)
  Particles
  Rendering
  Overlay
```

Until then, flame graphs will show ECS-only detail. This is deferred to a future phase.
