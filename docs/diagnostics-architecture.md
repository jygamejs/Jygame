# Phase 1: Built-in Performance Diagnostics — Architecture Proposal

---

## 1. Overall Architecture: Diagnostics as a World Resource

**Decision: Diagnostics is a World resource — no engine singleton.**

Jygame is built around Worlds. Everything — resources, schedulers, scenes — lives inside a World. There is no `Engine` object, and introducing one solely for Diagnostics would be a conceptual regression.

### Why a World resource?

- Follows the existing pattern: `SpatialHash`, `RenderQueue`, `Camera`, `HierarchyGraph`, `AudioManager` are all World resources. Diagnostics fits the same slot.
- Subsystems retrieve it the same way: `ctx.resources.get(Diagnostics)`.
- Scene transitions already handle World lifecycle. Diagnostics survives naturally within its World.
- If session-wide profiling across multiple Worlds is needed later, build a separate `DiagnosticsSession` that collects `FrameHistory` from multiple World instances. That's a future addition, not a current architectural requirement.

**Design principle**: Diagnostics is a *sink*, not a controller. Subsystems push data into it. It never queries, never pulls, never asks "are you being profiled?" — it simply records what it receives.

### Thread safety

Diagnostics is **single-threaded**. All `record*` calls happen from the main thread during the game loop. Future worker-based profilers should use separate storage. This is documented but not enforced.

---

## 2. Core Components

### 2.1 `Diagnostics` (World resource)

```js
class Diagnostics {
  // ——— Config ———
  get config()                     // → DiagnosticsConfig (mutable)

  // ——— Frame lifecycle ———
  beginFrame(frameNumber, realDtMs)
  endFrame()

  // ——— Metric recording (uses metric IDs, not strings) ———
  recordTimer(metricId, elapsedMs)
  recordCounter(metricId, incrementBy = 1)
  recordGauge(metricId, value)

  // ——— Static metadata (not per-frame — rarely changes) ———
  setMetadata(key, value)          // e.g. ("gpu.vendor", "NVIDIA"), ("canvas.width", 1920)
  getMetadata(key)                 // → value
  clearMetadata()

  // ——— Frame events ———
  event(category, name, metadata)  // metadata must be plain JSON values only

  // ——— Timer convenience ———
  timer(metricId)                  // → CPUTimer (lazily created, cached)
  scope(metricId, fn)              // RAII-style: start/stop around fn, safe with exceptions

  // ——— Metric registry ———
  get metrics()                    // → MetricRegistry
  registerMetric(descriptor)       // → metricId (idempotent — returns existing ID if duplicate)
  registerDynamicMetric(descriptor)// → metricId (may trigger storage growth)
  lockRegistry()                   // prevents further static registration

  // ——— Snapshot access ———
  get lastSnapshot()               // → FrameSnapshot (frozen object) | null
  get history()                    // → FrameHistory

  // ——— Session control ———
  reset()                          // clears history, accumulators, events, metadata, frame count
}
```

### 2.2 `MetricRegistry` — integer IDs, not strings

```js
class MetricRegistry {
  register(descriptor)              // → metricId (idempotent, throws if locked)
  get(id)                           // → MetricDescriptor (frozen) | undefined
  find(name)                        // → MetricDescriptor | undefined
  forEach(fn)                       // iterate all descriptors
  get count()
  get version()                     // incremented on structural change (for snapshot metadata)
  get locked()                      // true after lockRegistry() is called

  lock()                            // prevents further static registration
}
```

```js
class MetricDescriptor {
  #id             // number — assigned by registry
  #name           // string — e.g. "ecs.system.movement"
  #displayName    // string — e.g. "Movement System"
  #category       // MetricCategory — enum, e.g. MetricCategory.ECS
  #group          // string — e.g. "Update" (for UI collapse: ECS > Update > Movement)
  #unit           // MetricUnit — enum, e.g. MetricUnit.MILLISECONDS
  #type           // MetricType — enum, e.g. MetricType.TIMER
  #priority       // number — system priority
  #tags           // string[] — frozen array, e.g. ["gpu", "render", "hot"]
  #description    // string — optional

  get id()           { return this.#id }
  get name()         { return this.#name }
  get displayName()  { return this.#displayName }
  get category()     { return this.#category }
  get group()        { return this.#group }
  get unit()         { return this.#unit }
  get type()         { return this.#type }
  get priority()     { return this.#priority }
  get tags()         { return this.#tags }
  get description()  { return this.#description }
}
```

**Metric IDs are not a public contract.** The registry assigns sequential IDs internally, but external code must never depend on specific numeric values. This preserves freedom to change allocation strategies later.

**Reserved namespaces**:

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

### 2.3 Enumerations

```js
const MetricType = Object.freeze({
  TIMER:   0,   // duration in ms, accumulated as total/count/min/max per frame
  COUNTER: 1,   // integer incremented during frame, reset at endFrame
  GAUGE:   2,   // continuously varying value, overwritten each frame
  CONSTANT:3,   // static value (set once or rarely), stored as metadata, not per-frame
});

const MetricUnit = Object.freeze({
  MILLISECONDS: 0,
  COUNT:        1,
  BYTES:        2,
  MEGABYTES:    3,
  PERCENT:      4,
  FPS:          5,
});

const MetricCategory = Object.freeze({
  FRAME:     0,
  ECS:       1,
  RENDER:    2,
  AUDIO:     3,
  PARTICLES: 4,
  PHYSICS:   5,
  STREAMING: 6,
  ASSETS:    7,
  USER:      8,
  PLUGIN:    9,
});
```

Enums are integers internally — less memory, faster comparisons, no spelling bugs. UI maps them back to display strings.

### 2.4 `FrameSnapshot` — frozen object, owns independent cloned typed arrays

```js
class FrameSnapshot {
  constructor(data) {
    this.frame       = data.frame       // number
    this.timestamp   = data.timestamp   // DOMHighResTimeStamp
    this.delta       = data.delta       // milliseconds
    this.fps         = data.fps         // number
    this.registryVer = data.registryVer // MetricRegistry version
    this.metricCount = data.metricCount // metric count at snapshot time

    // Typed arrays indexed by metric ID — cloned from frame storage
    // Consumers must treat these as read-only
    this.timerTotals = data.timerTotals // Float64Array
    this.timerCounts = data.timerCounts // Uint32Array
    this.timerMins   = data.timerMins   // Float64Array
    this.timerMaxs   = data.timerMaxs   // Float64Array
    this.counters    = data.counters    // Uint32Array
    this.gauges      = data.gauges      // Float64Array

    this.events      = data.events      // Array<FrameEvent>
    this.metadata    = data.metadata    // Object (shallow copy of static metadata at endFrame)

    Object.freeze(this);
    // Note: typed arrays themselves remain mutable.
    // Only the snapshot object properties are frozen.
    // The arrays are independent clones — no reference to live storage.
  }

  timerTotal(id)  { return this.timerTotals[id] }
  timerCount(id)  { return this.timerCounts[id] }
  timerMin(id)    { return this.timerMins[id] }
  timerMax(id)    { return this.timerMaxs[id] }
  counter(id)     { return this.counters[id] }
  gauge(id)       { return this.gauges[id] }
}
```

### 2.5 Metadata (static values, not per-frame)

Metadata replaces the old `SAMPLE` type. It stores values that change rarely or never:

```js
diagnostics.setMetadata("gpu.vendor",    "NVIDIA GeForce RTX 3080");
diagnostics.setMetadata("gpu.backend",   "WebGL2");
diagnostics.setMetadata("canvas.width",  1920);
diagnostics.setMetadata("canvas.height", 1080);
diagnostics.setMetadata("browser",       "Chrome 120");
diagnostics.setMetadata("engine.version","0.8.1");
```

Metadata is stored separately from per-frame metrics. Each snapshot gets a shallow copy at `endFrame()`. This avoids storing identical values in every snapshot.

### 2.6 `FrameEvent`

```js
class FrameEvent {
  constructor(frame, timestamp, category, name, metadata)
  // frame: number
  // timestamp: DOMHighResTimeStamp
  // category: string
  // name: string
  // metadata: object — plain JSON values only (no Map, Set, Date, RegExp, or engine objects)
}
```

Timeline events make frame graphs explainable:

```
Frame 384
  Asset Loaded       — "Texture: player.png (2.1MB)"
  Scene Changed      — "Menu → Game"
  GC Pause           — "12ms minor GC"
  Particle Burst     — "320 particles from ExplosionEmitter"
```

**Metadata constraint**: Must contain only plain JSON values (objects, arrays, strings, numbers, booleans, null). No `Map`, `Set`, `Date`, `RegExp`, `Entity` references, `AudioBuffer`s, or other engine objects. This ensures remote profiling, structured cloning, and export work without special handling.

Events are not on the hot path — metadata allocation per event is acceptable.

### 2.7 `FrameHistory`

```js
class FrameHistory {
  constructor(capacity = 300)
  push(snapshot)
  get length()
  at(index)                // index 0 = most recent
  latest()                 // most recent snapshot | null
  oldest()                 // earliest snapshot | null
  get frames()             // → Iterator<FrameSnapshot> (oldest first)
  forEachReverse(fn)       // newest → oldest iteration
}
```

Deliberately minimal. FrameHistory stores and retrieves — it does not compute. `forEachReverse` is a common overlay pattern (drawing newest frames first).

### 2.8 `DiagnosticsConfig`

```js
class DiagnosticsConfig {
  enabled         = true       // master switch
  historySize     = 300
  autoReset       = true       // reset counters each frame (false → cumulative)
  samplingRate    = 1          // 1 = every frame, 2 = every second frame, etc.
}
```

Always uses `performance.now()` — the browser provides monotonic, high-resolution timestamps.

**Sampling rate behavior**: When `samplingRate > 1`, skipped frames are entirely ignored — `beginFrame`/`endFrame` and all `record*` calls are no-ops. Counter and timer accumulators are never carried forward. A sampled frame's snapshot represents exactly that frame.

---

## 3. Data Flow

```
World.update(dt)
│
├── diagnostics.beginFrame(frameNumber, realDtMs)   // if !enabled || sampling skip → return
│
├── scheduler.update(dt)
│   │
│   ├── HierarchySystem
│   │   └── diagnostics.recordTimer(metricId_ecs_system_hierarchy, t)
│   │   └── diagnostics.recordGauge(metricId_ecs_system_hierarchy_entities, n)
│   │
│   ├── MovementSystem
│   │   └── diagnostics.recordTimer(metricId_ecs_system_movement, t)
│   │
│   ├── AnimationSystem
│   │   └── diagnostics.recordTimer(metricId_ecs_system_animation, t)
│   │
│   ├── AudioSystem
│   │   └── diagnostics.recordTimer(metricId_ecs_system_audio, t)
│   │
│   ├── CollisionSystem
│   │   └── diagnostics.recordTimer(metricId_ecs_system_collision, t)
│   │   └── diagnostics.recordCounter(metricId_collision_inserts, 1)
│   │
│   ├── RenderSystem
│   │   └── diagnostics.recordTimer(metricId_render_draw, t)
│   │   └── diagnostics.recordCounter(metricId_render_drawCalls, cmdCount)
│   │
│   └── TrailSystem
│       └── diagnostics.recordTimer(metricId_ecs_system_trail, t)
│
├── diagnostics.recordTimer(metricId_ecs_total, elapsed)
│
├── diagnostics.endFrame()
│   * clones FrameStorage ArrayBuffer (buffer.slice(0)) into owned snapshot arrays
│   * shallow-copies metadata object
│   * freezes snapshot object
│   * pushes into FrameHistory
│   * resets accumulators (unless autoReset=false)
│
└── (overlay/exporter/devtool reads diagnostics.lastSnapshot / diagnostics.history)
```

**Key**: No subsystem calls `beginFrame`/`endFrame`. That's the World's responsibility. Subsystems only call `record*` inside their own update.

---

## 4. Collector System — Not Needed

**Decision: No collector API. Diagnostics is fully passive.**

Every subsystem already has natural push points:

- Assets already know when assets load.
- Particles already know when particles emit.
- Streaming already knows when cells unload.
- Systems already know when they update.

They call `record*` directly. No polling, no collector registration, no plugin system.

---

## 5. Timing Infrastructure

### 5.1 `CPUTimer` — lightweight, reusable, zero-allocation

```js
class CPUTimer {
  constructor(diagnostics, metricId)
  start()
  stop()              // calls diagnostics.recordTimer(metricId, elapsed)
  discard()           // skip recording (e.g. disabled system)
}
```

Internally uses `performance.now()`. Stores the start time as a `Number` (no object allocation).

Timers are **lazily allocated** — `diagnostics.timer(metricId)` creates the CPUTimer on first call and caches it. Metrics that are never timed don't waste a timer object.

**Double-start behavior**: Calling `start()` on an already-running timer throws in debug builds. In release builds it restarts (overwrites the start time).

### 5.2 RAII-style scoped timing

```js
// Guarantees stop() is called even on exceptions
diagnostics.scope(metricId, () => {
  // ... work ...
});
```

Implementation:
```js
scope(metricId, fn) {
  const timer = this.timer(metricId);
  timer.start();
  try {
    return fn();
  } finally {
    timer.stop();
  }
}
```

The scheduler uses this internally — impossible to forget `stop()`. Almost all engine code should use `scope()`; manual `timer.start()`/`stop()` pairs are reserved for special cases.

### 5.3 Flat metric names — no hierarchy in storage

Metrics are **flat** by name. Hierarchy is a presentation concern derived from `category` and `group`.

```
// Storage (flat, lowercase)
ecs.system.movement
ecs.system.render
ecs.system.animation
render.draw
particles.simulation

// UI grouping (derived from MetricDescriptor.group)
ECS > Update > Movement
ECS > Update > Render
ECS > Update > Animation
Rendering > Main > Draw
Particles > Simulation > Update
```

### 5.4 FrameStorage — a single buffer for all frame-local accumulators

```js
class FrameStorage {
  constructor(capacity) {
    const float64Size = capacity * 8;
    const uint32Size  = capacity * 4;

    const totalBytes = float64Size * 4 + uint32Size * 2;
    this._buffer = new ArrayBuffer(totalBytes);
    this._capacity = capacity;

    let offset = 0;
    this.timerTotals = new Float64Array(this._buffer, offset, capacity); offset += float64Size;
    this.timerMins   = new Float64Array(this._buffer, offset, capacity); offset += float64Size;
    this.timerMaxs   = new Float64Array(this._buffer, offset, capacity); offset += float64Size;
    this.gauges      = new Float64Array(this._buffer, offset, capacity); offset += float64Size;
    this.timerCounts = new Uint32Array(this._buffer, offset, capacity); offset += uint32Size;
    this.counters    = new Uint32Array(this._buffer, offset, capacity);
  }

  ensureCapacity(minCapacity) {
    if (minCapacity <= this._capacity) return;
    const newCapacity = this._nextPow2(minCapacity);
    // allocate new buffer, copy old views, replace
  }

  _nextPow2(n) {
    // Round up to next power of 2 (vector-like growth)
    // e.g. 65 → 128, 129 → 256
  }
}
```

Growth is geometric (doubling capacity) to avoid repeated reallocation.

### 5.5 Typed-array frame-local accumulation

During the frame, `recordTimer` writes directly into the storage:

```js
storage.timerTotals[metricId] += elapsedMs
storage.timerCounts[metricId] += 1
storage.timerMins[metricId]    = Math.min(storage.timerMins[metricId], elapsedMs)
storage.timerMaxs[metricId]    = Math.max(storage.timerMaxs[metricId], elapsedMs)
```

No object allocation, no property lookup — direct typed array index access.

---

## 6. Metrics — Categories and Types

### Metric Types

| Type | Enum | Behavior | Storage |
|------|------|----------|---------|
| `TIMER` | `MetricType.TIMER` | Duration in ms. Accumulated as total/count/min/max per frame. Reset at endFrame. | `Float64Array × 4` + `Uint32Array × 1` |
| `COUNTER` | `MetricType.COUNTER` | Integer incremented during frame. Reset at endFrame. | `Uint32Array` |
| `GAUGE` | `MetricType.GAUGE` | Continuously varying value. Overwritten each frame. Examples: FPS, alive particles, memory, alive entities, archetype count. | `Float64Array` |
| `CONSTANT` | `MetricType.CONSTANT` | Static value set once or rarely. Stored as metadata, not per-frame. Examples: GPU vendor, browser version, canvas dimensions. | Metadata store |

`CONSTANT` metrics replace the old `SAMPLE` type. They are not recorded per-frame — use `diagnostics.setMetadata(key, value)` instead.

All time values are in milliseconds — no unit mixing.

### Frame Phase Metrics

These represent the high-level breakdown users see first — the top of the profiler tree.

| Metric | Type | Name | Group | Unit |
|--------|------|------|-------|------|
| Total frame time | GAUGE | `frame.delta` | Frame | ms |
| FPS | GAUGE | `frame.fps` | Frame | fps |
| Fixed timestep ticks | COUNTER | `frame.ticks` | Frame | count |
| Input processing | TIMER | `frame.input` | Frame | ms |
| ECS update total | TIMER | `frame.update` | Frame | ms |
| Render total | TIMER | `frame.render` | Frame | ms |
| Audio total | TIMER | `frame.audio` | Frame | ms |
| Particle simulation total | TIMER | `frame.particles` | Frame | ms |

### ECS Metrics

| Metric | Type | Name | Group | Unit |
|--------|------|------|-------|------|
| Per-system execution time | TIMER | `ecs.system.<name>` | Update | ms |
| Entities per system | GAUGE | `ecs.system.<name>.entities` | Update | count |
| Matched tables per system | GAUGE | `ecs.system.<name>.tables` | Update | count |
| Total alive entities | GAUGE | `ecs.world.entities` | World | count |
| Total archetypes | GAUGE | `ecs.world.archetypes` | World | count |
| Total systems | GAUGE | `ecs.world.systems` | World | count |
| Entities created/frame | COUNTER | `ecs.entitiesCreated` | World | count |
| Entities destroyed/frame | COUNTER | `ecs.entitiesDestroyed` | World | count |

### Render Metrics

| Metric | Type | Name | Group | Unit |
|--------|------|------|-------|------|
| Render pass time | TIMER | `render.draw` | Main | ms |
| Draw calls | COUNTER | `render.drawCalls` | Main | count |

### Audio Metrics

| Metric | Type | Name | Group | Unit |
|--------|------|------|-------|------|
| Audio update time | TIMER | `audio.update` | Mixing | ms |
| Active sounds | GAUGE | `audio.active` | Mixing | count |
| Pooled instances | GAUGE | `audio.pooled` | Mixing | count |
| Virtualized sounds | GAUGE | `audio.virtual` | Mixing | count |

### Particle Metrics

| Metric | Type | Name | Group | Unit |
|--------|------|------|-------|------|
| Particle sim time | TIMER | `particles.simulation` | Update | ms |
| Particle draw time | TIMER | `particles.draw` | Render | ms |
| Alive particles | GAUGE | `particles.alive` | Update | count |
| Emitted/frame | COUNTER | `particles.emitted` | Update | count |
| Emitter count | GAUGE | `particles.emitters` | Update | count |
| GPU upload time | TIMER | `particles.gpuUpload` | Upload | ms |

### Physics / Collision Metrics

| Metric | Type | Name | Group | Unit |
|--------|------|------|-------|------|
| Broadphase time | TIMER | `physics.broadphase` | Detection | ms |
| Narrowphase time | TIMER | `physics.narrowphase` | Resolution | ms |
| Active bodies | GAUGE | `physics.bodies` | Detection | count |
| Contacts | GAUGE | `physics.contacts` | Resolution | count |

### Asset Metrics

| Metric | Type | Name | Group | Unit |
|--------|------|------|-------|------|
| Total textures | GAUGE | `assets.textures` | Cache | count |
| Total audio clips | GAUGE | `assets.audioClips` | Cache | count |
| Total fonts | GAUGE | `assets.fonts` | Cache | count |
| Loaded this frame | COUNTER | `assets.loaded` | IO | count |
| Memory estimate | GAUGE | `assets.memory` | Memory | MB |

### Streaming Metrics

| Metric | Type | Name | Group | Unit |
|--------|------|------|-------|------|
| Loaded cells | GAUGE | `streaming.loadedCells` | State | count |
| Pending loads | GAUGE | `streaming.pending` | State | count |
| Streaming entities | GAUGE | `streaming.entities` | State | count |
| Cells loaded/frame | COUNTER | `streaming.cellsLoaded` | IO | count |
| Cells unloaded/frame | COUNTER | `streaming.cellsUnloaded` | IO | count |

### Static Metadata (CONSTANT)

| Key | Example Value |
|-----|---------------|
| `gpu.vendor` | `"NVIDIA GeForce RTX 3080"` |
| `gpu.backend` | `"WebGL2"` |
| `canvas.width` | `1920` |
| `canvas.height` | `1080` |
| `browser` | `"Chrome 120"` |
| `engine.version` | `"0.8.1"` |

---

## 7. History

```js
class FrameHistory {
  constructor(capacity = 300)
  push(snapshot)
  get length()
  at(index)                // index 0 = most recent
  latest()                 // most recent snapshot | null
  oldest()                 // earliest snapshot | null
  get frames()             // → Iterator<FrameSnapshot> (oldest first)
  forEachReverse(fn)       // newest → oldest for overlays drawing latest first
}
```

Deliberately minimal:

- **Storage only**: ring buffer of `FrameSnapshot` objects.
- **No statistical aggregation**: `mean()`, `max()`, `percentile()` — all belong in consumers.

**Memory**: 300 snapshots. Each snapshot holds typed arrays sized to `metricRegistry.count`. History memory is `historySize × storageSize`. At ~100 metrics: ~8–12 KB per snapshot, ~2.4–3.6 MB total. Scales linearly with custom metric count.

---

## 8. Public API

```js
// Frame lifecycle (called by World)
diagnostics.beginFrame(frameNumber, realDtMs)
diagnostics.endFrame()

// Record metrics (called by subsystems)
diagnostics.recordTimer(metricId, elapsedMs)
diagnostics.recordCounter(metricId, incrementBy = 1)
diagnostics.recordGauge(metricId, value)

// Static metadata (called once or rarely)
diagnostics.setMetadata(key, value)
diagnostics.getMetadata(key)
diagnostics.clearMetadata()

// Frame events (called by subsystems)
diagnostics.event(category, name, metadata)   // metadata must be plain JSON values

// Metric registry
diagnostics.registerMetric(descriptor)         // → metricId (idempotent, static capacity)
diagnostics.registerDynamicMetric(descriptor)  // → metricId (may trigger storage growth)
diagnostics.lockRegistry()                     // prevents further static registration
diagnostics.metrics                            // → MetricRegistry

// Timer convenience (lazily allocated, cached)
diagnostics.timer(metricId)                    // → CPUTimer
diagnostics.scope(metricId, fn)                // → return value of fn

// Read access (called by overlays, exporters, devtools)
diagnostics.lastSnapshot                       // → FrameSnapshot (frozen object) | null
diagnostics.history                            // → FrameHistory
diagnostics.config                             // → DiagnosticsConfig (mutable)

// Session control
diagnostics.reset()                            // clears history, accumulators, events, metadata, frame count
```

### Metric registration pattern

```js
const metricId = diagnostics.registerMetric({
  name:        "ecs.system.movement",
  displayName: "Movement System",
  category:    MetricCategory.ECS,
  group:       "Update",
  unit:        MetricUnit.MILLISECONDS,
  type:        MetricType.TIMER,
  priority:    0,
  tags:        ["ecs", "hot"],
  description: "Time spent integrating velocity into transform each frame",
});
```

`registerMetric()` is **idempotent** — calling it twice with the same `name` returns the same metric ID. It throws after `lockRegistry()` is called.

`registerDynamicMetric()` is identical but signals that the metric may trigger storage growth. It does not throw after lock. Dynamic metrics should be used sparingly — prefer aggregate values (e.g. `particles.alive`) over per-instance metrics (e.g. `particles.emitter.42.update`).

### Frame event pattern

```js
diagnostics.event("asset", "Texture Loaded", { key: "player.png", size: 2.1 });
diagnostics.event("scene", "Transition",      { from: "Menu", to: "Game" });
diagnostics.event("particle", "Burst",         { emitter: "Explosion", count: 320 });
```

### Metadata pattern

```js
diagnostics.setMetadata("gpu.vendor", "NVIDIA GeForce RTX 3080");
diagnostics.setMetadata("gpu.backend", "WebGL2");
diagnostics.setMetadata("canvas.width", 1920);
```

---

## 9. Integration Points

### 9.1 Frame Phases — Game.js / World.js

**Where**: The top-level game loop and World.update().

**Metrics**:
- `frame.delta` — real dt in ms
- `frame.fps` — smoothed FPS
- `frame.ticks` — fixed timestep ticks consumed
- `frame.input` — input update time
- `frame.update` — total ECS update time
- `frame.render` — total render time

**Changes**: `Game._loop()` wraps its phases with diagnostics timers. World.update() wraps the scheduler call.

### 9.2 ECS — SystemScheduler.js

**Where**: Inside the system iteration loop.

**Metrics**:
- `ecs.system.<lowercaseName>` — per-system execution time
- `ecs.system.<lowercaseName>.entities` — entity count per system
- `ecs.system.<lowercaseName>.tables` — matched table count

**Changes**: Wrap `system.update()` with `diagnostics.scope(metricId, fn)`. Metrics are registered via `registerMetric()` (static) when a system is added to the scheduler. The system's `constructor.name` (lowercased) and `priority` are baked into the descriptor. Tags include `["ecs"]`.

**Invasiveness**: Low. No changes to any system implementation. All timing is in the scheduler.

### 9.3 ECS — World.js / EntityManager.js

**Where**: Entity creation and destruction.

**Metrics**:
- `ecs.entitiesCreated` — counter
- `ecs.entitiesDestroyed` — counter
- `ecs.world.entities` — gauge of aliveCount each frame
- `ecs.world.archetypes` — gauge of archetype count
- `ecs.world.systems` — gauge of system count

**Changes**: Minimal — a single `recordCounter` call in `createEntity` and `destroyEntity`. Gauges recorded in `endFrame()`.

### 9.4 Render — RenderSystem.js

**Where**: RenderSystem.update().

**Metrics**:
- `render.draw` — time to execute RenderQueue
- `render.drawCalls` — RenderQueue.count

**Changes**: 3–5 lines wrapping queue execution.

### 9.5 Audio — AudioManager.js

**Where**: `update()` method.

**Metrics**:
- `audio.update` — total audio update time
- `audio.active` — active sound count
- `audio.pooled` — pooled instance count
- `audio.virtual` — virtualized sound count

**Changes**: AudioManager is not ECS-aware. Pattern: optional Diagnostics parameter (`audioManager.diagnostics = diag`). Guard with `if (this._diagnostics)`.

### 9.6 Particles — ParticleSystem.js

**Where**: Backend update methods.

**Metrics**:
- `particles.simulation` — CPU simulation time
- `particles.draw` — particle draw time
- `particles.gpuUpload` — GPU upload time
- `particles.alive` — alive particle count
- `particles.emitted` — particles emitted this frame
- `particles.emitters` — active emitter count

**Changes**: Each backend wraps hot loops with timer start/stop. Diagnostics reference via constructor option or setter.

### 9.7 Physics / Collision — SpatialHash.js

**Where**: Query methods (rect, point, circle, AABB, raycast).

**Metrics**:
- `physics.broadphase` — broadphase time
- `physics.narrowphase` — narrowphase time
- `physics.bodies` — active collision bodies
- `physics.contacts` — contact pairs found

**Changes**: Minimal. Push from CollisionSystem.

### 9.8 Assets — Loaders

**Where**: Load/unload operations.

**Metrics**:
- `assets.textures` — ImageLoader cache size
- `assets.audioClips` — AudioLoader cache size
- `assets.fonts` — FontLoader loaded count
- `assets.loaded` — counter for loads this frame
- `assets.memory` — estimated memory (Phase 1b)

**Changes**: Each loader gets a diagnostics reference, pushes events on load/unload. A lightweight hook in `endFrame()` can sample cache sizes.

### 9.9 Streaming — StreamingManager.js

**Where**: `load()`, `unload()` methods.

**Metrics**:
- `streaming.loadedCells` — loaded cell count
- `streaming.pending` — pending load count
- `streaming.entities` — total entities across streaming cells
- `streaming.cellsLoaded` — cells loaded this frame
- `streaming.cellsUnloaded` — cells unloaded this frame

**Changes**: Minimal. `recordCounter` in load/unload, `recordGauge` for state snapshots.

### 9.10 Scene Manager — SceneManager.js

**Where**: Scene transition lifecycle.

**Metrics**:
- Frame events for `scene.Transition`, `scene.Push`, `scene.Pop`

**Changes**: Event emission in transition methods.

### 9.11 Input — InputContext.js

**Where**: `updateFrame()`.

**Metrics**:
- `frame.input` — wrapped by Game._loop()

**Changes**: Game._loop() already calls `input.updateFrame()`. Wrap with timer.

### 9.12 Animation — AnimationSystem.js

Covered by ECS system timing (9.2). No additional changes needed.

---

## 10. Zero-Allocation Strategy

| Allocation source | Mitigation |
|---|---|
| `recordTimer` / `recordCounter` | Direct typed array writes by metric ID index. Zero object allocation. |
| `recordGauge` | Direct typed array write by metric ID index. Zero object allocation. |
| `CPUTimer` objects | Lazily created on first `timer(metricId)` call. Cached for reuse. |
| `setMetadata` | Rarely called. Allocates the metadata entry. |
| Frame snapshot | One per sampled frame. ArrayBuffer is cloned (`buffer.slice(0)`) from FrameStorage. Snapshot object + metadata shallow copy are allocated each frame. |
| Metric registry | Populated at startup (static) or rarely (dynamic). `registerMetric()` is idempotent. `lockRegistry()` catches accidental runtime usage. |
| String paths | Never used at runtime. Metric IDs are integers. |
| `event()` calls | Metadata objects allocated per event. **Events are not on the hot path** — this is acceptable. |
| History ring buffer | Pre-allocated array of `capacity` slots. Index overwrite, not push/shift. |

---

## 11. Extensibility

The architecture supports future features without changes:

- **Editor integration**: Reads `diagnostics.lastSnapshot`, `diagnostics.history`, `diagnostics.metrics`, `diagnostics.metadata`.
- **Remote debugging**: Serialize `FrameSnapshot` to JSON. Metric IDs resolve via shared registry. `registryVersion` in snapshot enables format migration.
- **Performance warnings**: Subscribe to `history.onPush`. Compute aggregates externally.
- **Exporters**: Iterate `history.frames()`, format as JSON/CSV/Chrome trace.
- **Timeline view**: `FrameEvent` timestamps + `FrameSnapshot.frame` correlation.
- **ECS optimization suggestions**: Aggregate history across `ecs.system.*` metrics. Filter by `tags: ["hot"]`.
- **Custom user metrics**: Namespace `user.*`. Users call `registerMetric(...)` and `record*(...)`.
- **Third-party plugins**: Namespace `plugin.*`. Register metrics idempotently.
- **GPU/Worker/Async timers**: `Timers/GPUTimer.js`, `Timers/WorkerTimer.js` implement the same start/stop interface.
- **Session profiler**: A future `DiagnosticsSession` can import `FrameHistory` from multiple Worlds.
- **Metric tags**: Overlay can instantly filter to `tags: ["gpu"]`, `tags: ["hot"]`.
- **`diagnostics.reset()`**: Clears state for benchmarks, editor restart, or unit tests.

---

## 12. Build Configuration

**Decision: Runtime-toggled, dev-mode default, production-strippable via build tool.**

| Mode | Behavior |
|---|---|
| **Development** | `enabled: true` by default. Full instrumentation active. |
| **Production** | User sets `enabled: false` in config. Diagnostics instance still exists but record* methods return after a single `if (!this._enabled) return` check. |
| **Compile-time strip** | Not enforced by this phase. A future bundler plugin can tree-shake `diagnostics.*` calls. |

**Overhead when disabled**: A single integer check and conditional branch. At 60fps with ~30 recorded metrics, this is ~1,800 branches/second — immeasurable.

---

## 13. Folder Structure

```
debug/
  index.js                            — Barrel export
  Diagnostics.js                      — World resource, public API
  DiagnosticsConfig.js                — Configuration class
  MetricRegistry.js                   — Integer metric ID registry (idempotent, lockable)
  MetricDescriptor.js                 — Readonly metric metadata (private fields)
  MetricType.js                       — MetricType enum
  MetricUnit.js                       — MetricUnit enum
  MetricCategory.js                   — MetricCategory enum
  CPUTimer.js                         — Reusable high-res timer (lazy allocation)
  FrameStorage.js                     — Single ArrayBuffer with typed array views (geometric growth)
  FrameSnapshot.js                    — Frozen snapshot owning cloned typed arrays
  FrameEvent.js                       — Timeline event class
  FrameHistory.js                     — Ring buffer (storage only)
  Timers/
    (reserved: GPUTimer.js, WorkerTimer.js, AsyncTimer.js)
  Exporters/
    (reserved: JsonExporter.js)
  Overlay/
    (reserved: Phase 2 debug overlay)
  Warnings/
    (reserved: Phase 3 performance warnings)
```

---

## 14. Metric Registration: Standard Metrics

Registered automatically when Diagnostics initializes:

```js
// Frame phases
registerMetric({ name:"frame.delta",         displayName:"Frame Delta",     category:MetricCategory.FRAME, group:"Frame", unit:MetricUnit.MILLISECONDS, type:MetricType.GAUGE,   tags:["frame"] })
registerMetric({ name:"frame.fps",           displayName:"FPS",             category:MetricCategory.FRAME, group:"Frame", unit:MetricUnit.FPS,          type:MetricType.GAUGE,   tags:["frame"] })
registerMetric({ name:"frame.ticks",         displayName:"Fixed Ticks",     category:MetricCategory.FRAME, group:"Frame", unit:MetricUnit.COUNT,         type:MetricType.COUNTER, tags:["frame"] })
registerMetric({ name:"frame.input",         displayName:"Input",           category:MetricCategory.FRAME, group:"Frame", unit:MetricUnit.MILLISECONDS, type:MetricType.TIMER,   tags:["frame","input"] })
registerMetric({ name:"frame.update",        displayName:"ECS Update",      category:MetricCategory.FRAME, group:"Frame", unit:MetricUnit.MILLISECONDS, type:MetricType.TIMER,   tags:["frame","ecs"] })
registerMetric({ name:"frame.render",        displayName:"Render",          category:MetricCategory.FRAME, group:"Frame", unit:MetricUnit.MILLISECONDS, type:MetricType.TIMER,   tags:["frame","render"] })
registerMetric({ name:"frame.audio",         displayName:"Audio",           category:MetricCategory.FRAME, group:"Frame", unit:MetricUnit.MILLISECONDS, type:MetricType.TIMER,   tags:["frame","audio"] })
registerMetric({ name:"frame.particles",     displayName:"Particles",       category:MetricCategory.FRAME, group:"Frame", unit:MetricUnit.MILLISECONDS, type:MetricType.TIMER,   tags:["frame","particles"] })

// ECS world state
registerMetric({ name:"ecs.world.entities",  displayName:"Alive Entities",  category:MetricCategory.ECS, group:"World", unit:MetricUnit.COUNT, type:MetricType.GAUGE,   tags:["ecs","world"] })
registerMetric({ name:"ecs.world.archetypes",displayName:"Archetypes",      category:MetricCategory.ECS, group:"World", unit:MetricUnit.COUNT, type:MetricType.GAUGE,   tags:["ecs","world"] })
registerMetric({ name:"ecs.world.systems",   displayName:"Systems",         category:MetricCategory.ECS, group:"World", unit:MetricUnit.COUNT, type:MetricType.GAUGE,   tags:["ecs","world"] })
registerMetric({ name:"ecs.entitiesCreated", displayName:"Created/frame",   category:MetricCategory.ECS, group:"World", unit:MetricUnit.COUNT, type:MetricType.COUNTER, tags:["ecs","world"] })
registerMetric({ name:"ecs.entitiesDestroyed",displayName:"Destroyed/frame",category:MetricCategory.ECS, group:"World", unit:MetricUnit.COUNT, type:MetricType.COUNTER, tags:["ecs","world"] })

// Per-system metrics registered dynamically when SystemScheduler.add(system) is called:
// ecs.system.<lowercaseName>          — MetricType.TIMER,   unit: ms,  group: "Update", tags: ["ecs", "system"]
// ecs.system.<lowercaseName>.entities — MetricType.GAUGE,   unit: cnt, group: "Update", tags: ["ecs", "system"]
// ecs.system.<lowercaseName>.tables   — MetricType.GAUGE,   unit: cnt, group: "Update", tags: ["ecs", "system"]
// descriptor includes: priority = system.priority
```

---

## 15. Incremental Implementation Plan

### Commit 1: Core infrastructure

**Files**:
- `debug/MetricType.js`
- `debug/MetricUnit.js`
- `debug/MetricCategory.js`
- `debug/MetricRegistry.js`
- `debug/MetricDescriptor.js`
- `debug/DiagnosticsConfig.js`
- `debug/CPUTimer.js`
- `debug/FrameStorage.js`
- `debug/FrameSnapshot.js`
- `debug/FrameEvent.js`
- `debug/FrameHistory.js`
- `debug/Diagnostics.js`
- `debug/index.js`

**Scope**:
- Enums (`MetricType`, `MetricUnit`, `MetricCategory`) — frozen objects with integer values
- `MetricRegistry` — register (idempotent, lockable), lookup by ID/name, frozen private-field descriptors, `forEach`, `version`
- `MetricDescriptor` — private fields, readonly accessors, `tags: string[]` frozen array
- `FrameStorage` — single ArrayBuffer with typed array views, geometric growth (`_nextPow2`), `ensureCapacity()`
- `Diagnostics` — beginFrame/endFrame, record* methods (no recordSample), setMetadata/getMetadata/clearMetadata, timer/scope, event, registerMetric (idempotent, throws if locked), registerDynamicMetric (may grow, no lock), lockRegistry, reset
- `FrameSnapshot` — cloned from FrameStorage buffer, `Object.freeze`, typed array accessors, `metricCount`, `registryVer`, `metadata` shallow copy
- `FrameHistory` — ring buffer, push, at, latest, oldest, frames iterator, forEachReverse
- `CPUTimer` — start/stop/discard, lazy allocation, double-start throws in debug
- `DiagnosticsConfig` — enabled, historySize, autoReset, samplingRate
- Tests: metric registration + idempotency + lock + frozen descriptors + tag immutability, record lifecycle, disabled mode, sampling (frame skip), snapshot cloning + object freeze + typed array read-only convention, history push/query/iterator/latest/oldest/forEachReverse, metadata get/set/clear + snapshot copy, events (JSON-serializable constraint), reset, geometric growth, lazy timer allocation, double-start detection, no string paths at runtime

### Commit 2: ECS instrumentation

**Files**: `ecs/core/World.js`, `ecs/core/SystemScheduler.js`, `ecs/core/EntityManager.js`, `ecs/bootstrap/DefaultWorldBuilder.js`

**Scope**:
- Diagnostics auto-created as World resource in DefaultWorldBuilder
- World.update() wraps scheduler with diagnostics frame lifecycle
- SystemScheduler registers metrics (static) for each system on `addSystem()`, wraps `system.update()` with `scope()`, derives `name` from `constructor.name` (lowercase), stores `priority`
- Entity create/destroy counters
- Tags: `["ecs", "system"]` on per-system metrics
- `lockRegistry()` called after DefaultWorldBuilder finishes system registration
- Tests: per-system timing, entity counts, frame lifecycle, system metric auto-registration, idempotent re-registration, lock enforcement

### Commit 3: Subsystem instrumentation

**Files**: `ecs/systems/RenderSystem.js`, `audio/AudioManager.js`, `particles/ParticleSystem.js`, `particles/backends/*`, `ecs/streaming/StreamingManager.js`, `ecs/scene/SceneManager.js`, `loaders/*`, `collision/SpatialHash.js`

**Scope**:
- Each subsystem registers its namespace metrics and pushes per frame
- Frame events for asset loads, scene transitions, cell load/unload
- Tags per subsystem
- Tests: metrics appear in snapshot per subsystem

### Commit 4: Exports + public API

**Files**: `jygame.js`

**Scope**:
- Export `Diagnostics`, `DiagnosticsConfig`, `MetricRegistry`, `MetricDescriptor`, `MetricType`, `MetricUnit`, `MetricCategory`, `CPUTimer`, `FrameSnapshot`, `FrameHistory`
- Verify no regressions in existing tests

---

## Summary of Design Decisions

| Decision | Choice | Why |
|---|---|---|
| How is Diagnostics accessed? | World resource | Follows existing pattern, no Engine singleton |
| Cross-world profiling? | Future `DiagnosticsSession` | Keeps Diagnostics simple now, extensible later |
| Metric addressing | Integer IDs via `MetricRegistry` | O(1) lookup, typed array storage, no string hashing |
| Metric IDs as public contract? | No | Never depend on specific numeric values |
| Storage growth | Geometric (doubling) via `ensureCapacity()` | Avoids repeated reallocation |
| Static vs dynamic registration | Two methods, lock after init | Static never grows; lock catches accidental runtime registration |
| Registration idempotency | Yes — same name returns same ID | Simplifies plugins, system init |
| Metric descriptors | Private fields, readonly | Immutable by declaration |
| Tags | Frozen `string[]` | JSON-serializable, structured clone-friendly, freezable |
| Metric type/unit/category | Enum integers | Less memory, faster, no spelling bugs |
| Reserved namespaces | `frame.*`, `ecs.*`, `user.*`, `plugin.*`, etc. | Prevents collisions |
| Snapshot data | Typed arrays (cloned from single buffer) | Cache-friendly, single memcpy |
| Snapshot immutability | `Object.freeze` (object only) | Prevents property reassignment; typed arrays are independent clones |
| CONSTANT type | `setMetadata()` | Replaces confusing SAMPLE type; avoids storing identical values per-frame |
| History | Storage only + `forEachReverse` | Consumers compute their own statistics |
| `timerResolution` | Not included | Always `performance.now()` |
| All time values | Milliseconds | No unit mixing |
| Double-start timer | Throws in debug, restarts in release | Catches bugs early without crashing production |
| `scope()` | RAII pattern | Guarantees `stop()` on exceptions; preferred over manual timers |
| Lazy timer allocation | On first `timer(id)` call | No waste for unused metrics |
| Timeline events | `event(category, name, metadata)` | Makes frame graphs explainable |
| Event metadata constraint | Plain JSON values only | No Map, Set, Date, RegExp, or engine objects |
| Sampling rate | Skip entire frame | No partial accumulation |
| `diagnostics.reset()` | Clears all state | Benchmarks, editor, tests |
| Thread safety | Single-threaded (documented) | Worker profilers use separate storage |
| Build mode | Runtime toggle, dev-on | Single branch, no build step needed |
| Third-party support | Namespace `plugin.*`, call `registerMetric` + `record*` | No special privileges |
