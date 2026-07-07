# Phase 2: ECS Instrumentation — Architecture Proposal

Building on the Phase 1 diagnostics baseline. This phase instruments the ECS core itself — not individual subsystems.

---

## 1. Overall Architecture

### Responsibilities

The instrumentation layer is split across three owners:

| Owner | Responsibility | Class |
|-------|---------------|-------|
| **Scheduler** | System iteration timing, per-system metric registration, system lifecycle events, aggregate timing | `SystemScheduler` |
| **World** | Frame lifecycle, world-state gauges, entity lifecycle counters, structural change hooks | `World` |
| **ArchetypeSystem / QueryEngine** | Structure change counters, query cache instrumentation | `ArchetypeSystem`, `QueryEngine` |

### Ownership Rules

1. **The scheduler owns all per-system timing.** Individual systems never call `diagnostics.scope()` or `diagnostics.recordTimer()` for their own execution time. The scheduler wraps `system.update()` automatically. A system cannot opt out of being timed.

2. **The World owns entity lifecycle counters.** `createEntity()` and `destroyEntity()` record directly (Phase 1 already does this).

3. **Structural change counters belong to the code that performs the change.** `addComponent`/`removeComponent` in World record component add/remove counts. `ArchetypeSystem.moveEntity` records migration counts. `ArchetypeSystem.createArchetype` records archetype creation counts.

4. **Query instrumentation belongs to QueryEngine.** Cache operations, archetype scans, and table lookups are recorded in QueryEngine methods.

5. **Everything outside these classes remains outside ECS instrumentation.** RenderSystem, AudioManager, ParticleSystem, loaders, scene management retain their Phase 1 instrumentation. The game loop (`Game._loop`) is deferred. User code uses `registerMetric()` + `record*()` directly.

### What Remains Outside

- `frame.input`, `frame.render`, `frame.audio`, `frame.particles` — deferred until frame lifecycle moves to `Game._loop()`
- Per-entity component field access — not instrumented; too granular and would dominate overhead
- Individual query iteration inside systems — system-level timing captures this implicitly

---

## 2. Scheduler Instrumentation

### Current State

Phase 1 already adds per-system timing. The scheduler:

1. In `add(system)`: registers three per-system metrics via `registerDynamicMetric()`:
   - `ecs.system.<lowercaseName>` (TIMER)
   - `ecs.system.<lowercaseName>.entities` (GAUGE)
   - `ecs.system.<lowercaseName>.tables` (GAUGE)
2. In `update()`: wraps each enabled system's `update()` call with `diag.scope()` and records entity/table count gauges.

### Phase 2 Additions

**Aggregate system timing.** Add `ecs.systems.total` as a TIMER wrapping the entire `scheduler.update()` body — sort, refresh, and system execution:

```
Current:                           Phase 2:
frame.update                       frame.update
  └── scheduler.update               └── scheduler.update
      ├── sort?                          ├── ecs.systems.total
      ├── [per-system scope*]            │   ├── sort?
      └── ...                            │   ├── [per-system scope*]
                                          │   └── ...
                                          └── World overhead (implicit)
```

`ecs.systems.total` encompasses everything the scheduler does — system sorting, context refresh, and all individual system update calls. The gap `frame.update - ecs.systems.total` represents **World overhead**: retrieving the Diagnostics resource, recording world-state gauges, event dispatch, and the try/finally frame capture. This gap is computed by consumers from the snapshot — never recorded explicitly.

Implementation in `SystemScheduler.update()`:

```js
update(dt) {
  if (this._insideUpdate) throw new Error('recursive update() not allowed');
  if (!this._world) throw new Error('world reference not set');
  this._insideUpdate = true;
  try {
    if (this._needsSort) this._sortSystems();

    const diag = typeof this._world.getResource === 'function'
      ? this._world.getResource(Diagnostics) : null;

    if (diag && this._ecsSystemsTotalId !== undefined) {
      diag.scope(this._ecsSystemsTotalId, () => {
        this._executeSystems(diag, dt);
      });
    } else {
      this._executeSystems(diag, dt);
    }
  } finally {
    this._insideUpdate = false;
  }
}

_executeSystems(diag, dt) {
  const systems = this._sortedSystems;
  for (let i = 0; i < systems.length; i++) {
    const system = systems[i];
    if (!system.enabled) continue;
    system._ctx._refresh(dt);
    if (diag && system._diagMetricId !== undefined) {
      diag.scope(system._diagMetricId, () => { system.update(system._ctx, dt); });
      diag.recordGauge(system._diagEntityMetricId, system._ctx.entityCount);
      diag.recordGauge(system._diagTableMetricId, system._ctx.tables().length);
    } else {
      system.update(system._ctx, dt);
    }
  }
}
```

This creates a three-level hierarchy:
- `frame.update` — total World.update time (includes all scheduler work + world overhead)
- `ecs.systems.total` — everything the scheduler did (sort, refresh, all systems)
- `ecs.system.<name>` — individual system execution

### Disabled Systems

Disabled systems (`system.enabled === false`) are skipped entirely — no scope is created, no gauges recorded. Their timer value remains 0 in the snapshot. This is the correct behavior: a disabled system consumes no update time.

### Skipped Systems

A system with no matching tables (`ctx.entityCount === 0`) still has its scope recorded. Zero-entity execution time is meaningful — it reveals systems whose queries match nothing but still pay iteration cost. This is `frame.update` time that contributes nothing.

### Exceptions

If a system throws during `scope()`, the CPUTimer's `finally` block calls `stop()` and records the elapsed time up to the exception. The exception propagates out of `scheduler.update()` and out of `frame.update`'s scope. The frame snapshot is still created (World's try/finally around the scheduler call would be needed — but scope itself already provides finally semantics). The frame recorder in World.update will still call endFrame() after the exception propagates if it's not caught. However, currently World.update doesn't catch exceptions from the scheduler:

```js
if (diag && mids && mids.frameUpdate) {
  diag.scope(mids.frameUpdate.id, () => { this._scheduler.update(dt); });
}
```

`scope()` catches exceptions internally (stops the timer) and re-throws. So if a system throws, the exception propagates out of `scope()` for `frame.update`, then out of `World.update()`. The `endFrame()` call after the scope block never runs.

**Change for Phase 2:** Wrap the entire scheduler call + endFrame in a try/finally:

```js
update(dt) {
  const diag = this._resources.get(Diagnostics);
  const mids = this._diagMetricIds || this._initDiagMetricIds();
  const dtMs = dt * 1000;

  if (diag) diag.beginFrame(this._frameCount++, dtMs);

  try {
    if (diag && mids && mids.frameUpdate) {
      diag.scope(mids.frameUpdate.id, () => { this._scheduler.update(dt); });
    } else {
      this._scheduler.update(dt);
    }
  } finally {
    if (diag && mids) {
      // Record world-state gauges even if a system threw
      if (mids.frameDelta) diag.recordGauge(mids.frameDelta.id, dtMs);
      if (mids.frameFps) diag.recordGauge(mids.frameFps.id, dtMs > 0 ? 1000 / dtMs : 0);
      if (mids.worldEntities) diag.recordGauge(mids.worldEntities.id, this._entityManager.aliveCount);
      if (mids.worldArchetypes) diag.recordGauge(mids.worldArchetypes.id, this._archetypeSystem.archetypeCount);
      if (mids.worldSystems) diag.recordGauge(mids.worldSystems.id, this._scheduler.systemCount);
      diag.endFrame();
    }
    this._events.clear();
  }
}
```

This ensures that even if a system throws, the frame snapshot contains timing data up to the crash point, world-state gauges, and the frame is closed properly. Events are also cleared in the finally block to prevent stale events accumulating.

### Nested Timings

The three-level hierarchy is always maintained. No system should ever nest its own timer inside `update()` — this would create invalid parent-child relationships. The scheduler owns all timing.

### Future Scheduler Implementations

The instrumentation design is compatible with future schedulers:

- **Parallel scheduler**: The aggregate timer `ecs.systems.total` would be wall-clock time for the system loop. Individual system timers would be wall-clock per-system. The gap between `ecs.systems.total` and the sum of individual timers would reveal contention/wait overhead. No metric changes needed — only the recording points move.
- **Job system**: Each job gets a dynamic metric. The parent timer would span the job dispatch + wait phase. Metric registration would move to job creation instead of system add.
- **Worker threads**: Timers remain valid (performance.now() is monotonic per-thread). Aggregate timers would measure wall-clock, individual timers would be thread-local.

No Phase 2 changes anticipate these — the metric structure generalizes naturally.

---

## 3. Per-System Metrics

### Metric Set

Every system registered with the scheduler automatically gets three metrics:

| Metric | Type | Unit | Purpose |
|--------|------|------|---------|
| `ecs.system.<name>` | TIMER | ms | Execution time including query iteration |
| `ecs.system.<name>.entities` | GAUGE | count | Entities matched by the system's query this frame |
| `ecs.system.<name>.tables` | GAUGE | count | Tables/archetypes visited this frame |

### MetricDescriptor Example

```js
{
  name:        "ecs.system.movement",
  displayName: "Movement System",
  category:    MetricCategory.ECS,
  group:       "Systems",
  unit:        MetricUnit.MILLISECONDS,
  type:        MetricType.TIMER,
  tags:        ["ecs", "system"],
  priority:    system.priority,
}
```

### Naming Convention

- Name: `ecs.system.<constructorName>` lowercased
- DisplayName: `"<constructorName>"` unchanged (e.g. `"MovementSystem"`)
- Tags: `Object.freeze(["ecs", "system"])`
- Group: `"Systems"`
- Priority: copied from system (for UI sorting)

### Entity Count Source

`SystemContext.entityCount` already returns the count of entities across all matching tables. This is recorded as a gauge by the scheduler after each system's update.

### Table Count Source

`SystemContext.tables().length` returns the number of tables matched. This is a gauge.

### Registration Timing

Metrics are registered in `SystemScheduler.add()` using `registerDynamicMetric()`:
- Before `lockRegistry()` (DefaultWorldBuilder path): could use `registerMetric()`, but `registerDynamicMetric()` works in both cases and is idempotent
- After `lockRegistry()` (hot-reload, late-add systems): `registerDynamicMetric()` succeeds silently

### Duplicate Systems

If the same system instance is added twice, `add()` throws `'system is already registered'` — no duplicate registration occurs. Multiple instances of the same system class are unsupported for diagnostics naming; both receive the metric name `ecs.system.<lowercaseClass>`, producing identical names. Systems that differ only by configuration should expose a custom `displayName` if per-instance distinction is needed.

### Renamed Systems

If a system class is renamed, the metric name changes on next registration. Old metric IDs remain in the registry permanently (never removed). The old metric simply records nothing after the rename. This is acceptable — metric registrations are append-only. A future registry compaction feature could reclaim unused IDs, but that's beyond Phase 2.

### Hot-Reloading

On hot-reload:
1. Old systems are removed via `scheduler.clear()` or `removeSystem()`.
2. New systems are added, triggering fresh `registerDynamicMetric()` calls.
3. Old metric IDs remain in the registry but record nothing (no scope calls).
4. New metrics are registered for the replacement systems.
5. Frame snapshots contain both old (zero-value) and new metrics until history rolls over.

This is acceptable. History is a ring buffer — old zeros age out naturally.

---

## 4. World Metrics

### Current State (Phase 1)

| Metric | Type | Recorded At |
|--------|------|-------------|
| `ecs.world.entities` | GAUGE | end of World.update() |
| `ecs.world.archetypes` | GAUGE | end of World.update() |
| `ecs.world.systems` | GAUGE | end of World.update() |

### Additions (Phase 2)

| Metric | Type | Purpose | Recorded At |
|--------|------|---------|-------------|
| `ecs.world.components` | GAUGE | Registered component types | end of World.update() |
| `ecs.world.tables` | GAUGE | Total allocated tables (includes empty) | end of World.update() |
| `ecs.world.capacity` | GAUGE | Entity capacity (pre-allocated slots) | end of World.update() |

### Rationale

- `ecs.world.components` — useful for understanding how many component types are in play. Static after registration but still worth sampling each frame for snapshot consistency.
- `ecs.world.tables` — reveals archetype fragmentation. A high table count with few entities suggests many narrow signatures.
- `ecs.world.capacity` — capacity vs alive ratio reveals if the EntityManager is over-allocated.

### What NOT to add

- `ecs.world.generations` — implementation detail of entity recycling; not meaningful for profiling.
- `ecs.world.deadEntities` — entity slots waiting to be reused. The `aliveCount` vs `capacity` already captures this implicitly.

---

## 5. Structural Change Metrics

Structural changes are events that modify the ECS graph — adding/removing components, moving entities between archetypes, creating new archetypes.

### Metric Set

| Metric | Type | Unit | Where Recorded |
|--------|------|------|----------------|
| `ecs.componentsAdded` | COUNTER | count | World.addComponent(), World.addMany() |
| `ecs.componentsRemoved` | COUNTER | count | World.removeComponent(), World.removeMany() |
| `ecs.entitiesMigrated` | COUNTER | count | ArchetypeSystem.moveEntity() |
| `ecs.archetypesCreated` | COUNTER | count | ArchetypeSystem.createArchetype() |

### Recording Points

**World.addComponent(entity, component)** — currently:
```js
addComponent(entity, component) {
  // ... resolve ID, check alive, check signature ...
  const newSig = currentSig.add(componentId);
  this._archetypeSystem.moveEntity(entity, newSig);
  // ... zero-init fields ...
}
```

Add before moveEntity:
```js
const diag = this._resources.get(Diagnostics);
if (diag) diag.recordCounter(ecsComponentsAddedId, 1);
```

**World.removeComponent(entity, component)** — same pattern, `ecs.componentsRemoved`.

**ArchetypeSystem.moveEntity()** — currently:
```js
moveEntity(entity, destinationSignature) {
  // ... get/create archetype, copy data, update location, swap-remove ...
}
```

The `moveEntity` method is called from addComponent, removeComponent, clear, and addMany/removeMany. Tracking migrations at this level captures all structural moves in one place. Add:
```js
if (this._diagnostics) this._diagnostics.recordCounter(ecsEntitiesMigratedId, 1);
```

But how does ArchetypeSystem access Diagnostics? Options:

1. **Pass diagnostics reference through constructor**. ArchetypeSystem is created inside World constructor. World could pass the Diagnostics reference after creating it. But this creates a chicken-and-egg problem since Diagnostics is created in DefaultWorldBuilder, not in World constructor.

2. **World as intermediary**. World calls ArchetypeSystem methods, World has access to Diagnostics. But `moveEntity` is called directly by World's addComponent, not through a World method. Actually, looking at the code:

In World.addComponent:
```js
this._archetypeSystem.moveEntity(entity, newSig);
```

We could record the counter in World before/after the call, but `moveEntity` is called from multiple places (addComponent, removeComponent, clear, addMany, removeMany). Better to record once inside `moveEntity` itself.

3. **ArchetypeSystem gets an optional diagnostics callback**. Add a `_diagnostics` property to ArchetypeSystem, set by World after Diagnostics is available.

4. **World records the count directly** at each call site. More invasive (5+ call sites) but avoids ArchetypeSystem knowing about Diagnostics.

I recommend option 3: add an optional `diagnostics` setter to ArchetypeSystem, set by World when the Diagnostics resource is available. This is consistent with the standalone class pattern used in Phase 1 (AudioManager, ParticleSystem, etc.).

```js
// In ArchetypeSystem:
set diagnostics(diag) {
  this._diag = diag;
  this._diagMigrationsId = diag ? diag.registerDynamicMetric({
    name: "ecs.entitiesMigrated",
    ...
  }) : undefined;
}
```

World.setResource would check if the resource is Diagnostics and wire it:

```js
setResource(key, value) {
  if (key === Diagnostics) {
    this._archetypeSystem.diagnostics = value;
    this._queryEngine.diagnostics = value;
  }
  this._resources.set(key, value);
}
```

This is clean: World doesn't need to know about internal metric IDs. ArchetypeSystem and QueryEngine handle their own instrumentation.

**ArchetypeSystem.createArchetype()**:
```js
createArchetype(signature) {
  // ... check exists, create table, store ...
  if (this._diag) this._diag.recordCounter(ecsArchetypesCreatedId, 1);
  return archetype;
}
```

### Counters vs Gauges

All four are COUNTERs. They represent events that occur during a frame and reset at endFrame. Cumulative totals across frames would be computed by consumers.

### Which operations count as migrations?

Every call to `moveEntity()` represents one entity moving from one archetype to another:
- Adding a component (component added to existing entity → new archetype)
- Removing a component
- Clearing all components (moves to empty archetype)
- Batched add/remove

This is one migration per entity per operation. A single `addComponent` call = 1 migration if the entity doesn't already have the component.

---

## 6. Scheduler Totals

### Metric Set

| Metric | Type | Unit | Purpose |
|--------|------|------|---------|
| `frame.update` | TIMER | ms | Total World.update time (Phase 1, unchanged) |
| `ecs.systems.total` | TIMER | ms | Aggregate of all system update calls (new) |

### Hierarchy

```
frame.update
  └── ecs.systems.total
  │     └── ecs.system.movementsystem (per-system)
  │     └── ecs.system.animationsystem
  │     └── ecs.system.collisionsystem
  │     └── ecs.system.rendersystem
  │     └── ecs.system.trailsystem
  └── World overhead (implicit)
```

The gap `frame.update - ecs.systems.total` represents World overhead:
- Retrieving the Diagnostics resource
- Recording world-state gauges
- The try/finally frame capture
- Event dispatch and clearing

Consumers compute this gap from the snapshot. It is never recorded directly.

### What ecs.systems.total includes

`ecs.systems.total` encompasses the entire `scheduler.update()` body:
- System sort (when `_needsSort` is true)
- Per-system `_refresh(dt)` calls
- `system.update()` execution for each enabled system
- Gauge recording for entities and tables
- Per-system scope start/stop overhead
- The diagnostics resource lookup

### What ecs.systems.total does NOT include

- World.update() overhead (diag retrieval at World level, gauge recording, endFrame)
- The `_insideUpdate` guard in scheduler

### Edge cases

- **Zero systems**: `ecs.systems.total` stops without recording (scope wraps an empty loop — CPUTimer records zero elapsed time).
- **All systems disabled**: Same as zero — loop body never enters. `ecs.systems.total` records near-zero time.
- **Single system**: `ecs.systems.total` ≈ sort + refresh + `ecs.system.<name>`. The gap between `ecs.systems.total` and the individual system timer reveals scheduler overhead for that system.

---

## 7. Query Instrumentation

### Decision: Instrument Queries Lightly

Queries are not on the hot path for most frames. Query compilation happens once at system add time. Archetype re-scans happen only on structural changes (new archetype creation). The hot path is `getTables()` which returns a cached array.

**What to instrument:**

| Metric | Type | Unit | Where | Why |
|--------|------|------|-------|-----|
| `ecs.query.scans` | COUNTER | count | QueryEngine._scanAllArchetypes | Every archetype re-scan is observable work |
| `ecs.query.scanTime` | TIMER | ms | QueryEngine._scanAllArchetypes | Time spent matching archetypes against queries |

**What NOT to instrument:**

| Candidate | Decision | Reason |
|-----------|----------|--------|
| cache hits | Skip | Happens once per system add, not per frame |
| cache misses | Skip | Same as above |
| iterator creation | Skip | QueryView creation is rare (one per world.query() call) |
| table scans | Skip | Included in per-system timing implicitly |
| entity iteration | Skip | The system's update() is where this time shows up |

### Recording Point

In `QueryEngine._scanAllArchetypes()`:

```js
_scanAllArchetypes(query) {
  const start = this._diag ? performance.now() : 0;
  const archetypes = [];
  for (let id = 1; id <= count; id++) {
    const arch = this._archetypeSystem.getArchetypeById(id);
    if (arch && this._matchesSignature(arch.signature, query)) {
      archetypes.push(arch);
    }
  }
  if (this._diag) {
    this._diag.recordCounter(ecsQueryScansId, 1);
    this._diag.recordTimer(ecsQueryScanTimeId, performance.now() - start);
  }
  return archetypes;
}
```

Note: This uses manual `performance.now()` rather than `diag.scope()` because scope returns the function's return value, which is needed here. Alternatively, restructure to:

```js
_scanAllArchetypes(query) {
  let result;
  if (this._diag) {
    this._diag.recordCounter(ecsQueryScansId, 1);
    result = this._diag.scope(ecsQueryScanTimeId, () => {
      // ... scan logic ...
    });
  } else {
    // ... scan logic without timing ...
  }
  return result;
}
```

This is cleaner and uses the established scope pattern. The counter is recorded outside the scope (before the work starts — the count is meaningful regardless of timing overhead).

### Diagnostics wiring

QueryEngine gets a `diagnostics` setter, same pattern as ArchetypeSystem (section 5). Set by World when `Diagnostics` resource is set.

### Cache-hit frames

Most frames have zero query scans — archetypes rarely change. `ecs.query.scans` will be 0 on most frames and spike on structural changes. This is correct: it highlights frames with query re-compilation.

---

## 8. Automatic Registration

### Registration Timeline

```
World construction
  │
  ├── DefaultWorldBuilder.createDefault()
  │     ├── register standard ECS metrics (8 → 20 metrics)
  │     │     (frame.*, ecs.world.*, ecs.entities*, ecs.components*,
  │     │      ecs.entitiesMigrated, ecs.archetypesCreated,
  │     │      ecs.systems.total, ecs.query.*)
  │     ├── setResource(Diagnostics)
  │     │     └── World.setResource detects Diagnostics
  │     │           └── wires ArchetypeSystem.diagnostics
  │     │           └── wires QueryEngine.diagnostics
  │     ├── addSystem (× N)
  │     │     └── SystemScheduler.add → registerDynamicMetric per system
  │     │           (ecs.system.<name>, entities, tables)
  │     └── lockRegistry()
  │
  ├── Late addSystem (after lock)
  │     └── registerDynamicMetric (succeeds after lock)
  │
  ├── World.update (every frame)
  │     ├── beginFrame / system loop / endFrame
  │     └── ArchetypeSystem.createArchetype → recordCounter (if new archetype appears)
  │
  └── QueryEngine._scanAllArchetypes (on archetype creation)
        └── recordCounter / recordTimer
```

### Duplicate Systems

`SystemScheduler.add()` already throws if the same system instance is added twice. Multiple instances of the same system class are unsupported for diagnostics naming — both receive the metric name `ecs.system.<lowercaseClass>`, producing identical names. This is acceptable in practice because ECS engines rarely duplicate system types. Systems that differ only by configuration should expose a custom `displayName` if per-instance distinction is needed.

### Registry Locking

All ECS metrics that are known at bootstrap time are registered before `lockRegistry()`. These include:
- All `ecs.world.*` gauges
- `ecs.entitiesCreated`, `ecs.entitiesDestroyed`
- `ecs.componentsAdded`, `ecs.componentsRemoved`
- `ecs.entitiesMigrated`, `ecs.archetypesCreated`
- `ecs.systems.total`
- `ecs.query.scans`, `ecs.query.scanTime`

Per-system metrics use `registerDynamicMetric()` because they may be added after lock (late-registered systems, hot-reload). This is fine — `registerDynamicMetric` is idempotent and works in all states.

### What Happens Per-Frame

No metric registration happens during `update()`. All counters/timers/gauges use pre-registered metric IDs. The only exception is if `createArchetype()` is called during update (e.g. an entity gets a component that creates a previously unseen archetype). In that case, the archetype-created counter fires, and the QueryEngine may trigger a scan — but no new metric registration occurs.

---

## 9. Performance Strategy

### Zero-Allocation Paths

All recording points use direct typed-array writes via integer metric IDs:

- `diag.recordCounter(id, 1)` → `storage.counters[id] += 1` — one array index, one integer addition
- `diag.recordGauge(id, value)` → `storage.gauges[id] = value` — one array index, one float write
- `diag.scope(id, fn)` → `timer.start()`, `fn()`, `timer.stop()` — two `performance.now()` calls, two array writes (total, count)

No allocations occur on the hot path.

### Avoiding String Lookups

All metric references use pre-resolved integer IDs stored on the object:

- `system._diagMetricId` — set at `add()` time
- `World._diagMetricIds` — set lazily on first `update()` call
- `ArchetypeSystem._diagMigrationsId` — set when diagnostics is wired
- `QueryEngine._diagScanId` — set when diagnostics is wired

No `metrics.find("name")` calls happen during `update()`.

### Avoiding Virtual Dispatch

The Diagnostics instance is retrieved once per frame via `this._resources.get(Diagnostics)`. The reference is stored locally in each method. No virtual methods are called — `recordCounter`, `recordGauge`, `scope` are concrete methods on the Diagnostics class.

### Avoiding Allocations Inside Scheduler

The scheduler's `update()` loop allocates nothing:
- System arrays are pre-allocated
- `_refresh()` reuses internal arrays (already zero-allocation in current code)
- `diag.scope()` allocates no objects on the hot path (CPUTimer is lazy-allocated once)
- Gauge recording writes directly to typed arrays

### Overhead Characteristics

Overhead is constant-time and proportional to the number of recorded metrics:
- Each `scope()` call: two `performance.now()` calls + two typed-array writes on stop
- Each `recordCounter()` / `recordGauge()`: one typed-array write
- Each `beginFrame()` / `endFrame()`: one snapshot allocation per sampled frame

No allocations occur during normal frame execution. All counter, gauge, and timer paths are allocation-free. The snapshot allocation at `endFrame()` is one object per sampled frame — not on the system execution hot path.

### What Should NOT Be Measured

- **Per-field component access** — instrumenting every `table.getColumn()` or column read would dominate actual work. System-level timing captures this.
- **EntityManager slot operations** — `create()`/`destroy()` are fast paths; counter at World level is sufficient.
- **Table removeRow/swap-remove** — part of entity migration; counted at the ArchetypeSystem level.

---

## 10. Integration Points

### 10.1 `ecs/core/World.js`

| Change | Purpose | Invasiveness |
|--------|---------|-------------|
| Move endFrame + gauges into try/finally | Exception-safe frame snapshots | Low — wrap existing code |
| Register `ecs.world.components`, `.tables`, `.capacity` metric IDs in `_initDiagMetricIds()` | New world-state gauges | Low — add to existing method |
| Record `.components`, `.tables`, `.capacity` gauges in update() | New world-state gauges | Low — 3 lines in update() |
| Record `ecs.componentsAdded` counter in addComponent() | Structural change tracking | Low — 2 lines |
| Record `ecs.componentsRemoved` counter in removeComponent() | Structural change tracking | Low — 2 lines |
| Wire Diagnostics to ArchetypeSystem and QueryEngine in setResource() | Enable their instrumentation | Low — add check in setResource |

Lines added: ~25. No structural changes.

### 10.2 `ecs/core/SystemScheduler.js`

| Change | Purpose | Invasiveness |
|--------|---------|-------------|
| Add `ecs.systems.total` scope around scheduler body | Aggregate system timing | Low — wrap update() body |
| Extract system iteration into `_executeSystems()` | Nest timing correctly | Low — extract method |

Lines added: ~10.

### 10.3 `ecs/core/ArchetypeSystem.js`

| Change | Purpose | Invasiveness |
|--------|---------|-------------|
| Add `diagnostics` setter | Receive Diagnostics reference from World | Low — optional property |
| Lazy-init migration + archetype metric IDs | Register metrics when first wired | Low — standard _initDiag pattern |
| Record `ecs.entitiesMigrated` in moveEntity() | Migration counter | Low — 2 lines inside method |
| Record `ecs.archetypesCreated` in createArchetype() | Archetype creation counter | Low — 2 lines inside method |

Lines added: ~30.

### 10.4 `ecs/core/QueryEngine.js`

| Change | Purpose | Invasiveness |
|--------|---------|-------------|
| Add `diagnostics` setter | Receive Diagnostics reference from World | Low — optional property |
| Lazy-init scan metric IDs | Register metrics when first wired | Low — standard _initDiag pattern |
| Record `ecs.query.scans` + `ecs.query.scanTime` in _scanAllArchetypes() | Query re-scan tracking | Low — wrap scan body in scope if diag is set |

Lines added: ~25.

### 10.5 `ecs/bootstrap/DefaultWorldBuilder.js`

| Change | Purpose | Invasiveness |
|--------|---------|-------------|
| Register 12 additional standard metrics | ecs.systems.total, ecs.query.*, ecs.components*, ecs.world.* additions | Low — add to _registerStandardMetrics |

Lines added: ~15.

### Total Estimated Changes

~110 lines across 5 files, all low invasiveness. No architectural changes needed.

---

## 11. Public API

### What Users See

ECS instrumentation is entirely automatic. Users:
1. Create a World (via DefaultWorldBuilder or manually).
2. Add systems.
3. Systems are instrumented without any user code.
4. Custom systems (user-authored) automatically appear with `ecs.system.<name>` metrics.

### User Helpers

No user-facing helpers are needed for ECS instrumentation. Users who want custom metrics use the existing Phase 1 API:

```js
const diag = ctx.resources.get(Diagnostics);
const myMetric = diag.registerMetric({ ... });
diag.scope(myMetric, () => { /* ... */ });
```

### Should Diagnostics Be Optional?

Yes — it already is. If no Diagnostics resource is set, all recording methods check for its existence and skip. This means:
- ECS functions correctly without Diagnostics
- No performance cost when Diagnostics isn't installed (every call site checks `if (diag)` before recording)
- Users who never call `world.setResource(Diagnostics, ...)` get zero instrumentation overhead

### Should Custom Systems Need to Opt Out?

No. Systems cannot opt out of being timed. If a system is registered with the scheduler, it gets timed. This is intentional — having selected systems untimed creates blind spots. If a system's time is always zero, it should be disabled or removed.

---

## 12. Standard Metrics

### Frame Metrics

| Name | Display | Category | Group | Type | Unit | Tags |
|------|---------|----------|-------|------|------|------|
| `frame.delta` | Frame Delta | FRAME | Frame | GAUGE | ms | `["frame"]` |
| `frame.fps` | FPS | FRAME | Frame | GAUGE | fps | `["frame"]` |
| `frame.update` | ECS Update | FRAME | Frame | TIMER | ms | `["frame","ecs"]` |

### Scheduler Metrics

| Name | Display | Category | Group | Type | Unit | Tags |
|------|---------|----------|-------|------|------|------|
| `ecs.systems.total` | Systems Total | ECS | Scheduler | TIMER | ms | `["ecs","scheduler"]` |

### World Metrics

| Name | Display | Category | Group | Type | Unit | Tags |
|------|---------|----------|-------|------|------|------|
| `ecs.world.entities` | Alive Entities | ECS | World | GAUGE | count | `["ecs","world"]` |
| `ecs.world.archetypes` | Archetypes | ECS | World | GAUGE | count | `["ecs","world"]` |
| `ecs.world.tables` | Tables | ECS | World | GAUGE | count | `["ecs","world"]` |
| `ecs.world.systems` | Systems | ECS | World | GAUGE | count | `["ecs","world"]` |
| `ecs.world.components` | Components | ECS | World | GAUGE | count | `["ecs","world"]` |
| `ecs.world.capacity` | Entity Capacity | ECS | World | GAUGE | count | `["ecs","world"]` |

### Per-System Metrics

| Name | Display | Category | Group | Type | Unit | Tags |
|------|---------|----------|-------|------|------|------|
| `ecs.system.<name>` | `<Name>` | ECS | Systems | TIMER | ms | `["ecs","system"]` |
| `ecs.system.<name>.entities` | `<Name> Entities` | ECS | Systems | GAUGE | count | `["ecs","system"]` |
| `ecs.system.<name>.tables` | `<Name> Tables` | ECS | Systems | GAUGE | count | `["ecs","system"]` |

### Structural Change Metrics

| Name | Display | Category | Group | Type | Unit | Tags |
|------|---------|----------|-------|------|------|------|
| `ecs.entitiesCreated` | Created | ECS | Changes | COUNTER | count | `["ecs"]` |
| `ecs.entitiesDestroyed` | Destroyed | ECS | Changes | COUNTER | count | `["ecs"]` |
| `ecs.componentsAdded` | Components Added | ECS | Changes | COUNTER | count | `["ecs"]` |
| `ecs.componentsRemoved` | Components Removed | ECS | Changes | COUNTER | count | `["ecs"]` |
| `ecs.entitiesMigrated` | Entities Migrated | ECS | Changes | COUNTER | count | `["ecs"]` |
| `ecs.archetypesCreated` | Archetypes Created | ECS | Changes | COUNTER | count | `["ecs"]` |

### Query Metrics

| Name | Display | Category | Group | Type | Unit | Tags |
|------|---------|----------|-------|------|------|------|
| `ecs.query.scans` | Query Rescans | ECS | Queries | COUNTER | count | `["ecs","query"]` |
| `ecs.query.scanTime` | Query Rescan Time | ECS | Queries | TIMER | ms | `["ecs","query"]` |

### Metric Descriptor Priorities

All standard ECS metrics use `priority: 0` (default). Consumers sort by group + displayName for UI ordering.

---

## 13. Incremental Implementation Plan

### Commit 1: Structural Change Tracking

**Files**: `ecs/core/World.js`, `ecs/core/ArchetypeSystem.js`, `ecs/bootstrap/DefaultWorldBuilder.js`

**Purpose**: Add counters for component add/remove, entity migration, archetype creation.

**Changes**:
- `ArchetypeSystem.diagnostics` setter with lazy-init for `ecs.entitiesMigrated` and `ecs.archetypesCreated` metric IDs
- `ArchetypeSystem.moveEntity()` records `ecs.entitiesMigrated` counter
- `ArchetypeSystem.createArchetype()` records `ecs.archetypesCreated` counter
- `World.addComponent()` records `ecs.componentsAdded` counter
- `World.removeComponent()` records `ecs.componentsRemoved` counter
- `World.setResource()` wires Diagnostics to ArchetypeSystem (and QueryEngine, for future use)
- `DefaultWorldBuilder._registerStandardMetrics()` adds 6 new metrics (ecs.componentsAdded, ecs.componentsRemoved, ecs.entitiesMigrated, ecs.archetypesCreated, ecs.world.components, ecs.world.tables, ecs.world.capacity)

**Tests**:
- Adding a component increments `ecs.componentsAdded`
- Removing a component increments `ecs.componentsRemoved`
- Both counters in a single frame
- Entity creation/destruction increments existing counters (regression)
- Batch operations (addMany/removeMany) increment correctly
- Archetype creation increments `ecs.archetypesCreated` once per new signature
- Entity migration increments `ecs.entitiesMigrated` per entity move

### Commit 2: Aggregate System Timing

**Files**: `ecs/core/SystemScheduler.js`, `ecs/core/World.js`, `ecs/bootstrap/DefaultWorldBuilder.js`

**Purpose**: Add ecs.systems.total aggregate timer, exception-safe frame snapshots, extract `_executeSystems()`.

**Changes**:
- `SystemScheduler.update()` wraps entire scheduler body in `diag.scope(ecsSystemsTotalId, ...)`, encompassing sort, refresh, and system execution
- `SystemScheduler` extracts system iteration into `_executeSystems()` method for clean nesting
- `World.update()` moves gauge recording + endFrame into finally block for exception safety
- `DefaultWorldBuilder._registerStandardMetrics()` adds `ecs.systems.total` timer

**Tests**:
- `frame.update` > `ecs.systems.total` > sum of per-system timers
- `ecs.systems.total` includes sort time (verify sort+system > system-only)
- Disabled system excluded from `ecs.systems.total`
- Zero systems: `ecs.systems.total` records 0
- Exception in system: snapshot created before throw

### Commit 3: Query Instrumentation

**Files**: `ecs/core/QueryEngine.js`, `ecs/core/World.js`, `ecs/bootstrap/DefaultWorldBuilder.js`

**Purpose**: Track query re-scan activity.

**Changes**:
- `QueryEngine.diagnostics` setter with lazy-init for `ecs.query.scans` and `ecs.query.scanTime` metric IDs
- `QueryEngine._scanAllArchetypes()` records scan counter + timer
- `World.setResource()` wires Diagnostics to QueryEngine
- `DefaultWorldBuilder._registerStandardMetrics()` adds `ecs.query.scans` counter and `ecs.query.scanTime` timer

**Tests**:
- First query compilation triggers one scan
- Creating a new archetype triggers re-scan on next getTables()
- Scan time records non-zero after scan
- No Diagnostics: scan still works, no recording

### Commit 4: World-State Gauges + Documentation

**Files**: `ecs/core/World.js`, `ecs/bootstrap/DefaultWorldBuilder.js`

**Purpose**: Complete world-state metrics, finalize docs.

**Changes**:
- `World.update()` records `ecs.world.components`, `ecs.world.tables`, `ecs.world.capacity` gauges
- `World._initDiagMetricIds()` registers the three new metric IDs

**Tests**:
- Component count equals registered component types
- Table count grows as archetypes are created
- Entity capacity reflects EntityManager pre-allocation

---

## 14. Testing Strategy

### Test Categories

**Scheduler Timing**
- Create World with 3 systems; verify `frame.update`, `ecs.systems.total`, and per-system timers are all non-zero and ordered correctly
- Verify `ecs.systems.total` ≥ sum of individual system timers
- Verify gap `frame.update - ecs.systems.total` is non-negative

**Entity Counters** (existing + extended)
- Create N entities → `ecs.entitiesCreated` == N
- Destroy M entities → `ecs.entitiesDestroyed` == M
- Both in one frame → both counters non-zero

**Structural Changes** (new)
- Add component → `ecs.componentsAdded` incremented
- Remove component → `ecs.componentsRemoved` incremented
- Both in one frame
- Entity migration counter incremented per moveEntity call
- Archetype creation counter incremented per new signature

**System Registration**
- Add system → metrics appear in registry
- Add duplicate instance → throws
- Multiple instances of same class → both get same metric name (documented limitation)
- Remove system → no recording (metric exists but unused)
- Re-add removed system → metric re-registered (idempotent)

**Disabled Systems**
- Disable system → its timer is 0 in snapshot
- Disable system → `ecs.systems.total` does not include it

**Exception Safety**
- System that throws → timer records elapsed time up to throw
- System that throws → `ecs.systems.total` still records
- System that throws → snapshot captured (frame data + gauges)
- Subsequent frames unaffected

**Scope Correctness**
- `scope()` stops timer on exception
- `scope()` returns the function's return value
- Nested scopes (frame.update → ecs.systems.total → per-system) record correctly

**Snapshot Correctness**
- All new metrics appear in snapshot.metrics
- Timer values are positive and finite
- Counter values match expected counts
- Gauge values match world state

**Metric Registration**
- All new metrics defined in this proposal are registered before lockRegistry
- Per-system metrics use registerDynamicMetric (post-lock safe)
- Duplicate registration (same name) returns same ID

**Registry Locking**
- Standard metrics registered before lock
- lockRegistry prevents duplicate static registration
- registerDynamicMetric still works
- Per-system registration after lock does not throw

**Performance Regression**
- Baseline: measure frame time without diagnostics
- With diagnostics enabled: verify overhead < 5µs per frame
- With diagnostics disabled: verify overhead < 1µs per frame (single if check)
- Verify no allocations in update path (assert weak refs / no GC pressure)

**History Correctness**
- Counter resets each frame (autoReset=true)
- Gauges overwritten each frame
- Timer accumulators reset each frame
- All new metrics appear in snapshot after frame

### Implementation Approach

All tests use the World + Diagnostics directly (no mocks):
1. Create World with Diagnostics resource
2. Register components, add systems
3. Call world.update()
4. Read diag.lastSnapshot
5. Assert metric values via metric IDs from diag.metrics.find()

For exception tests:
1. Create a system that throws
2. Call world.update() inside try/catch
3. Verify diag.lastSnapshot is not null
4. Verify timers are non-zero

For performance regression:
1. Measure frame time with and without diagnostics
2. Use loop of 1000 updates in each configuration

---

## 15. Future Extensibility

### Parallel Scheduler

The timing hierarchy generalizes directly:

- `ecs.systems.total` becomes wall-clock dispatch time
- Per-system timers remain wall-clock per-system
- Gap between `ecs.systems.total` and sum of per-system timers reveals contention/wait overhead
- A new `ecs.systems.parallelism` gauge could report thread count or overlap factor

No Phase 2 changes conflict with this.

### Job System

If systems become jobs:
- Each job gets a dynamic metric (same registration pattern as systems)
- Parent timer spans job dispatch + wait
- The scheduler's add() method already registers per-unit metrics — same pattern applies to job registration

### Worker Threads

- `performance.now()` is monotonic per-thread
- Timers recorded on worker threads would need transfer to main-thread Diagnostics
- Metric IDs would be shared via the registry (which remains single-threaded)
- Snapshot merging would be a future addition

### SIMD Systems

No metric changes needed. SIMD-accelerated systems would show lower `ecs.system.*` execution times. The metrics remain valid.

### GPU ECS

- GPU timing would use a `GPUTimer` implementing the same start/stop interface as `CPUTimer`
- `ecs.system.*` timers would measure GPU dispatch + wait
- New `ecs.gpu.*` metrics could measure GPU execution separately

### Timeline Visualization

Frame events (`diagnostics.event()`) can tag frames with structural changes:
```js
this._diag.event("ecs", "ArchetypeCreated", { signature: sig.key, id: archetype.id });
this._diag.event("ecs", "EntityMigrated", { entity, from: oldSig.key, to: newSig.key });
```

These are not on the hot path (structural changes are rare) and would make frame graphs explainable — you'd see exactly which frame introduced a new archetype and which systems were affected.

### Editor Profiling

The editor can read `diagnostics.lastSnapshot` and `diagnostics.history` to display:
- Per-system flame chart (bar chart of `ecs.system.*` timers)
- Entity/archetype counts over time
- Structural change events
- Scheduler overhead as a computed gap

All data is exposed through the existing Phase 1 snapshot API — no new read paths needed.

### System Dependency Graphs

Future work could use metric priority values to reconstruct system ordering. Combined with per-system entity counts, you could visualize the data flow between systems:
- System A writes component X
- System B reads component X
- Entity count at A's output matches B's input

This is analysis-level work, not recording-level. The metrics already capture the raw data.

### Frame Flame Graphs

The three-level hierarchy (frame.update → ecs.systems.total → per-system) maps directly to a flame graph:
```
┌─────────────────────────────────────────────┐
│ frame.update                                │
│ ┌─────────────────────────────────────────┐ │
│ │ ecs.systems.total                       │ │
│ │ ┌──────────┐ ┌──────────┐ ┌──────────┐ │ │
│ │ │ Movement │ │Animation │ │Collision │ │ │
│ │ └──────────┘ └──────────┘ └──────────┘ │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

No additional recording needed — the existing hierarchy produces this naturally.

### Live Profiler Overlay

An in-game overlay would:
- Read `diagnostics.lastSnapshot` each frame (zero allocation — snapshot is already created)
- Display per-system bars using `snap.timerTotal(systemId)` and `snap.counter(entityId)`
- Color-code by system group
- Show gap as "scheduler overhead"

This is a consumer of the existing API. No Phase 2 changes needed for it.

### Per-Query Profiling

If per-query profiling becomes important, a new metric family `ecs.query.<id>` could be introduced:
```js
diag.scope(ecsQueryId, () => {
  // iterate matching archetypes
});
```

This would be added at query creation time (when the Query object is created by QueryEngine.createQuery). The overhead is one additional metric per query + one scope call per frame per query. For Phase 2 this is deemed unnecessary — individual system timing captures query execution time.

### Per-Component Statistics

Component-level metrics (e.g. `ecs.component.Transform.aliveCount`) would use the same world-state gauge pattern. The `ecs.world.components` gauge already provides the total. Per-component breakdown would be a future extension following the same gauge recording pattern.

---

## Appendix A: Files Changed Summary

| File | Commit | Lines Changed |
|------|--------|--------------|
| `ecs/core/World.js` | 1, 2, 4 | ~30 |
| `ecs/core/SystemScheduler.js` | 2 | ~20 |
| `ecs/core/ArchetypeSystem.js` | 1 | ~30 |
| `ecs/core/QueryEngine.js` | 3 | ~25 |
| `ecs/bootstrap/DefaultWorldBuilder.js` | 1, 2, 3, 4 | ~15 |

Total: ~120 lines across 5 files.

## Appendix B: Metric Registration Summary

| Category | Registered Where | Registration Method | Lock Status |
|----------|-----------------|-------------------|-------------|
| frame.delta, frame.fps, frame.update | DefaultWorldBuilder | registerMetric (static) | Pre-lock |
| ecs.world.* (6 metrics) | DefaultWorldBuilder | registerMetric (static) | Pre-lock |
| ecs.entitiesCreated, entitiesDestroyed | DefaultWorldBuilder | registerMetric (static) | Pre-lock |
| ecs.componentsAdded, componentsRemoved | DefaultWorldBuilder | registerMetric (static) | Pre-lock |
| ecs.entitiesMigrated, archetypesCreated | DefaultWorldBuilder | registerMetric (static) | Pre-lock |
| ecs.systems.total | DefaultWorldBuilder | registerMetric (static) | Pre-lock |
| ecs.query.scans, ecs.query.scanTime | DefaultWorldBuilder | registerMetric (static) | Pre-lock |
| ecs.system.* (per system) | SystemScheduler.add() | registerDynamicMetric | Either |
| ecs.system.*.entities/tables | SystemScheduler.add() | registerDynamicMetric | Either |
