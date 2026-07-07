# Debug System Overview

The debug system provides zero-allocation runtime performance diagnostics for JyGame. It lives under `debug/` and is exported via `jygame.js`.

## Architecture

Diagnostics is a **World resource** — retrieved via `ctx.resources.get(Diagnostics)`. Subsystems push data into it; it never polls.

### Core Principle

- **Passive sink**: subsystems call `recordTimer()` / `recordCounter()` / `recordGauge()` during their update.
- **Integer metric IDs**: all storage is typed-array and indexed by ID, never by string at runtime.
- **Frame lifecycle**: `beginFrame()` / `endFrame()` wraps the game loop; recordings outside this window are silently dropped.

## Component Overview

| Class | File | Role |
|-------|------|------|
| `Diagnostics` | `debug/Diagnostics.js` | World resource, public API. Coordinates frame lifecycle, metric recording, and snapshot creation. |
| `DiagnosticsConfig` | `debug/DiagnosticsConfig.js` | Mutable config: `enabled`, `historySize`, `autoReset`, `samplingRate`. |
| `MetricRegistry` | `debug/MetricRegistry.js` | Assigns integer IDs to metric descriptors. Idempotent, lockable after init. |
| `MetricDescriptor` | `debug/MetricDescriptor.js` | Read-only metric metadata (name, type, category, unit, tags, etc.) using private fields. |
| `MetricType` | `debug/MetricType.js` | Enum: `TIMER`, `COUNTER`, `GAUGE`, `CONSTANT`. |
| `MetricUnit` | `debug/MetricUnit.js` | Enum: `MILLISECONDS`, `COUNT`, `BYTES`, `MEGABYTES`, `PERCENT`, `FPS`. |
| `MetricCategory` | `debug/MetricCategory.js` | Enum: `FRAME`, `ECS`, `RENDER`, `AUDIO`, `PARTICLES`, `PHYSICS`, `STREAMING`, `ASSETS`, `USER`, `PLUGIN`. |
| `FrameStorage` | `debug/FrameStorage.js` | Single `ArrayBuffer` with typed-array views (timerTotals, timerMins, timerMaxs, gauges, timerCounts, counters). Geometric growth via `ensureCapacity()`. |
| `FrameSnapshot` | `debug/FrameSnapshot.js` | Frozen snapshot owning cloned typed arrays. Created each frame at `endFrame()`. |
| `FrameEvent` | `debug/FrameEvent.js` | Timeline event with category, name, and JSON-only metadata. |
| `FrameHistory` | `debug/FrameHistory.js` | Ring buffer of snapshots. `forEachReverse()` for overlay rendering. |
| `CPUTimer` | `debug/CPUTimer.js` | Lightweight reusable timer. `start()`/`stop()`/`discard()`. Double-start throws in debug. |

### Data Flow

```
World.update(dt)
  → diagnostics.beginFrame(frameNumber, realDtMs)
    → scheduler iterates systems
      → each system calls diagnostics.scope() / recordTimer() / recordCounter() / recordGauge()
  → diagnostics.endFrame()
    → clones FrameStorage buffer → FrameSnapshot → pushes to FrameHistory
    → resets accumulators (unless autoReset=false)
```

## Integration Points

### ECS Core (Commit 2)
- `World.update()`: calls `beginFrame()`/`endFrame()`, records `frame.delta`/`frame.fps` gauges.
- `SystemScheduler`: auto-registers per-system metrics on `add()`, wraps each `system.update()` with `scope()`.
- `World.createEntity()`/`destroyEntity()`: increment `ecs.entitiesCreated`/`ecs.entitiesDestroyed` counters (only during active frames).
- `DefaultWorldBuilder`: creates the Diagnostics resource, registers 8 standard metrics, calls `lockRegistry()`.

### Subsystems (Commit 3)
Each subsystem follows one of two patterns:

**ECS-aware** (has access to `ctx.resources.get(Diagnostics)`):
- `RenderSystem` — `render.draw` timer, `render.drawCalls` gauge
- `CollisionSystem` — `physics.broadphase` timer, `physics.bodies` gauge

**Standalone** (uses optional `.diagnostics` property):
- `AudioManager` — `audio.update` timer, `audio.active`/`audio.pooled` gauges
- `ParticleSystem` — `particles.simulation`/`draw` timers, `alive`/`emitted`/`emitters` gauges
- `SpatialHash` — `physics.narrowphase` timer, `physics.contacts` gauge; wraps all query methods (`queryRect`, `queryPoint`, etc.) via `_timeQuery()`
- `StreamingManager` — `streaming.*` gauges and counters
- `SceneManager` — frame events on scene transitions (`scene.Transition`, `scene.Push`, `scene.Pop`)

**Module-level** (singleton loader objects):
- `ImageLoader` — `assets.textures` gauge, `assets.loaded` counter
- `AudioLoader` — `assets.audioClips` gauge, `assets.loaded` counter
- `FontLoader` — `assets.fonts` gauge

## Usage

### In ECS systems
```js
const diag = ctx.resources.get(Diagnostics);
const metricId = diag.registerMetric({
  name: "user.mySystem.update",
  displayName: "My System",
  category: MetricCategory.USER,
  group: "Custom",
  unit: MetricUnit.MILLISECONDS,
  type: MetricType.TIMER,
  tags: ["user"],
});
diag.scope(metricId, () => {
  // … work …
});
```

### In standalone classes
```js
const diag = new Diagnostics(/* config */);
audioManager.diagnostics = diag;
particleSystem.diagnostics = diag;
spatialHash.diagnostics = diag;
```

### Reading snapshots
```js
const snap = diag.lastSnapshot;
if (snap) {
  console.log(`Frame ${snap.frame}: ${snap.fps.toFixed(1)} FPS`);
  console.log(`  update: ${snap.timerTotal(updateId).toFixed(2)}ms`);
  console.log(`  entities: ${snap.gauge(entitiesId)}`);
  console.log(`  draw calls: ${snap.counter(drawCallsId)}`);
}
```

## Standard Metrics

| Name | Type | Owner |
|------|------|-------|
| `frame.delta`, `frame.fps` | GAUGE | World |
| `frame.update` | TIMER | World |
| `ecs.world.entities`/`archetypes`/`systems` | GAUGE | World |
| `ecs.entitiesCreated`/`entitiesDestroyed` | COUNTER | World |
| `ecs.system.<name>` | TIMER | SystemScheduler |
| `ecs.system.<name>.entities`/`.tables` | GAUGE | SystemScheduler |
| `render.draw` | TIMER | RenderSystem |
| `render.drawCalls` | COUNTER | RenderSystem |
| `physics.broadphase` | TIMER | CollisionSystem |
| `physics.bodies` | GAUGE | CollisionSystem |
| `physics.narrowphase` | TIMER | SpatialHash |
| `physics.contacts` | GAUGE | SpatialHash |
| `audio.update` | TIMER | AudioManager |
| `audio.active`/`pooled` | GAUGE | AudioManager |
| `particles.simulation`/`draw` | TIMER | ParticleSystem |
| `particles.alive`/`emitters` | GAUGE | ParticleSystem |
| `particles.emitted` | COUNTER | ParticleSystem |
| `streaming.loadedCells`/`pending`/`entities` | GAUGE | StreamingManager |
| `streaming.cellsLoaded`/`cellsUnloaded` | COUNTER | StreamingManager |
| `assets.textures` | GAUGE | ImageLoader |
| `assets.audioClips` | GAUGE | AudioLoader |
| `assets.fonts` | GAUGE | FontLoader |
| `assets.loaded` | COUNTER | ImageLoader, AudioLoader |

## Frame Lifecycle Scope

Currently `beginFrame()`/`endFrame()` is called inside `World.update()`, so diagnostics only spans the ECS update. The `frame.delta`, `frame.fps`, and `frame.update` metrics are accurate, but `frame.input`, `frame.render`, `frame.audio`, and `frame.particles` are **not yet recorded**. They require moving the frame lifecycle to `Game._loop()` so it wraps the full pipeline (input → fixed updates → audio → world update → particles → rendering). Until then, flame graphs show ECS-only detail. This is deferred to a future phase.

## Reserved Namespaces

| Namespace | Owner |
|-----------|-------|
| `frame.*` | Engine frame phases |
| `ecs.*` | ECS core |
| `render.*` | Renderer |
| `audio.*` | Audio |
| `particles.*` | Particles |
| `physics.*` | Physics/collision |
| `streaming.*` | Streaming |
| `assets.*` | Asset loaders |
| `user.*` | Game code |
| `plugin.*` | Third-party plugins |
