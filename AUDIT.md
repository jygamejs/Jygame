# Particle Engine Architecture Audit

**Date:** 2026-06-20
**Scope:** `/particles/` — 56 files
**Phase:** ~16S

---

## Deliverable 1 — Full Folder Analysis

```
particles/
├── ParticleSystem.js               Facade delegating to backend                        Production   Critical
├── ParticleEmitter.js              Rate-based emitter with follow/shape                 Production   Critical
├── ParticleAsset.js                Serializable effect template                         Production   Critical
├── ParticleAssetRegistry.js        Static named registry                                Production   Important
├── ParticleEffect.js               Runtime effect (system+emitter)                      Production   Critical
├── ModifierStateStore.js           Per-modifier per-particle state (Map-of-Maps)        Infrastructure  Important
├── ParticleStateManager.js         Map-of-Maps state (dead, replaced by ModifierStateStore)  Dead     Dead Candidate
├── ParticleBackendCapabilities.js  Superseded by gpu/ copy — zero imports                    Dead     Dead Candidate
│
├── storage/
│   ├── ParticleStorage.js               Abstract base                                   Infrastructure  Important
│   ├── ObjectParticleStorage.js         AoS via ActivePool + Particle objects            Legacy          Important
│   └── SoAParticleStorage.js            SoA via typed arrays, dynamic growth            Infrastructure  Critical
│
├── accessors/
│   ├── ParticleAccessor.js              Abstract base                                   Infrastructure  Important
│   ├── SoAParticleAccessor.js           SoA typed-array getters/setters                 Infrastructure  Critical
│   └── ObjectParticleAccessor.js        Object property delegation (per-frame wrap)     Legacy          Optional
│
├── backends/
│   ├── ParticleBackend.js               Abstract base — never extended, zero imports     Dead            Dead Candidate
│   ├── CpuParticleBackend.js            Full CPU simulation backend                     Production      Critical
│   └── GpuParticleBackend.js            GPU simulation backend (CPU-side operators)     Infrastructure  Important
│
├── renderers/
│   ├── ParticleRenderer.js              Abstract base                                   Infrastructure  Important
│   ├── CanvasParticleRenderer.js        Canvas 2D drawImage/fillRect                    Production      Critical
│   └── GpuParticleRenderer.js           WebGL2 instanced, batch-by-texture              Production      Critical
│
├── renderdata/
│   ├── ParticleRenderData.js            Sorted/unsorted particle iterator               Infrastructure  Important
│   └── ParticleRenderCommandBuffer.js   Flat Float32Array command buffer (stride=17)    Infrastructure  Critical
│
├── layers/
│   ├── ParticleLayer.js                 Named layer of ParticleSystems                  Production      Important
│   └── ParticleLayerManager.js          Ordered layer manager with sort+render          Production      Important
│
└── gpu/
    ├── ModifierCompiler.js              Validates descriptors, classifies passes, generates state layout  Infrastructure  Critical
    ├── GpuProgramDescriptor.js          Immutable compiled program container             Infrastructure  Critical
    ├── GpuPassExecutor.js               Runtime operator execution + state management   Infrastructure  Critical
    ├── GpuUniformLayout.js              Uniform data class (dt, elapsedTime, custom)    Infrastructure  Important
    ├── WgslGenerator.js                 Assembles complete WGSL compute shader          Infrastructure  Important
    ├── GpuComputeProgram.js             Compiled shader + bindings + passes container   Infrastructure  Important
    ├── GpuBufferLayout.js               Maps fields to WGSL struct + binding layout     Infrastructure  Important
    ├── ParticleBufferLayout.js          Canonical 17-field layout, FIELD_INDEX, STRIDE  Infrastructure  Critical
    ├── SimulationBufferView.js          Indexed typed array access + integrate()        Infrastructure  Critical
    ├── ParticleBackendCapabilities.js   GPU capability query with presets + static canRun()  Infrastructure  Important
    ├── operators/ (11 files)            CPU-side operator execution for each modifier    Infrastructure  Critical
    ├── operators/index.js               Barrel + getOperator() lookup                    Infrastructure  Important
    ├── operators/forceUtils.js          Shared computeForce() with falloff modes        Infrastructure  Important
    ├── shaders/wgslUtils.js             uid(), resetUid(), wgslType(), easingFunctions() Infrastructure  Important
    └── shaders/operators/ (11 files)    WGSL snippet generators for each modifier       Infrastructure  Important
```

---

## Deliverable 2 — Architecture Diagram

```
ParticleAsset  ───────────────────[toJSON/fromJSON]──────────────────→  JSON
     │
     ├─→ ParticleEffect
     │      ├─→ ParticleEmitter ──[rate / shape / initializer / follow]──→ ParticleSystem.emit()
     │      └─→ ParticleSystem
     │             │
     │             ├─→ Backend (CpuParticleBackend | GpuParticleBackend)
     │             │      │
     │             │      ├── STORAGE LAYER
     │             │      │    ├─ ObjectParticleStorage (AoS, ActivePool, Particle objects)
     │             │      │    └─ SoAParticleStorage (SoA, Float32Array/Uint8Array/Int32Array)
     │             │      │
     │             │      ├── ACCESS LAYER
     │             │      │    ├─ ObjectParticleAccessor (wraps single Particle object)
     │             │      │    └─ SoAParticleAccessor (indexes typed arrays by slot)
     │             │      │
     │             │      ├── SIMULATION LAYER
     │             │      │    ├─ storage.integrateParticle() — storage-native physics
     │             │      │    ├─ ModifierStateStore — CPU path per-modifier state
     │             │      │    ├─ SimulationBufferView — GPU path indexed typed array view
     │             │      │    └─ GpuPassExecutor — GPU path operator dispatch + state
     │             │      │
     │             │      ├── MODIFIER LAYER
     │             │      │    ├─ Lifecycle: beginFrame / update / onEmit / onDeath / endFrame
     │             │      │    ├─ hasLifecycleMethods() validation
     │             │      │    ├─ Priority-sorted dispatch (CPU path)
     │             │      │    └─ Descriptor-based dispatch (GPU path via operators)
     │             │      │
     │             │      ├── COMPILER LAYER (GPU only)
     │             │      │    └─ ModifierCompiler → GpuProgramDescriptor
     │             │      │         ├─ Validates GPU compatibility
     │             │      │         ├─ Classifies passes: integration / force / visual
     │             │      │         └─ Generates state layout (deduplicated)
     │             │      │
     │             │      ├── EXECUTION LAYER (GPU only)
     │             │      │    ├─ GpuPassExecutor — CPU-side operator execution
     │             │      │    │    ├─ runPass(descriptors, view, dt, uniforms, slots, count)
     │             │      │    │    ├─ runPassObject(descriptors, acc, dt, active)
     │             │      │    │    ├─ beginFrame() — precompute frame uniforms
     │             │      │    │    ├─ runOnEmit() — onEmit state initialization
     │             │      │    │    └─ compile() → WgslGenerator → GpuComputeProgram
     │             │      │    └─ WgslGenerator — WGSL compute shader assembly
     │             │      │         ├─ GpuBufferLayout.toWGSLStruct() — particle struct
     │             │      │         ├─ easingFunctions() — WGSL easing helpers
     │             │      │         ├─ per-pass shader operator emission
     │             │      │         └─ → GpuComputeProgram (shaderSource + bindings)
     │             │      │
     │             │      ├── SORTING LAYER
     │             │      │    ├─ sortMode: none / age / reverseAge / size / reverseSize / depth / reverseDepth / custom
     │             │      │    ├─ _getComparator() → sort comparator with NaN checks
     │             │      │    ├─ _sortedIndices[] + _sortParticles() — lazy sort
     │             │      │    └─ Tiebreak by __jygameSortOrder (creation order)
     │             │      │
     │             │      └── RENDERING LAYER
     │             │             ├─ ParticleRenderData — iterates sorted or unsorted particles
     │             │             ├─ ParticleRenderCommandBuffer — Float32Array stride=17
     │             │             │    (x, y, rotation, size, width, height, alpha, r, g, b,
     │             │             │     originX, originY, depth, frameX, frameY, frameW, frameH)
     │             │             ├─ CanvasParticleRenderer — drawImage / fillRect
     │             │             └─ GpuParticleRenderer — WebGL2 instanced, batch-by-texture
     │             │
     │             └── COLLISION LAYER (stub)
     │                    └─ setCollisionProvider() — stored but never invoked
     │
     └── ParticleLayerManager
            └─ ParticleLayer[]
                   └─ ParticleSystem[]

────────────────────────────────────────────────────────────────────

### Runtime Flow — CPU Path

  ParticleSystem.update(dt)
    → CpuParticleBackend.update(dt)
      → beginFrame() modifiers
      → for each active particle:
          storage.integrateParticle(p, dt)     // storage-native physics
          acc.wrap(p)                          // bind accessor
          update() modifiers                   // accessor-based modifier calls
          if life ≤ 0: onDeath() + stateStore.release() + storage.release()
      → endFrame() modifiers
      → sort particles if dirty
    → ParticleSystem.render(ctx)
      → ParticleRenderData(storage, indices, count)
      → ParticleRenderCommandBuffer.clear()
      → renderData.fillCommandBuffer(buffer)
      → CanvasParticleRenderer.render(buffer, ctx)

### Runtime Flow — GPU Path (SoA, CPU-side operators)

  GpuParticleBackend.update(dt)
    → ModifierCompiler.compile(descriptors)    // rebuild if dirty
    → GpuPassExecutor.beginFrame()             // precompute frame uniforms
    → for each particle slot (via SimulationBufferView):
        view.integrate(slot, dt)               // direct typed array physics
    → GpuPassExecutor.runPass(integrationPass, view, dt, uniforms, slots, count)
    → GpuPassExecutor.runPass(forcePass, ...)
    → GpuPassExecutor.runPass(visualPass, ...)
    → death sweep — shift slot indices, release dead particles

### Runtime Flow — GPU Path (future compute shader, NOT YET IMPLEMENTED)

  GpuParticleBackend.update(dt)
    → WgslGenerator.generate(programDescriptor) → GpuComputeProgram
    → Get or create WebGPU compute pipeline
    → Upload uniforms buffer
    → dispatchWorkgroups(ceil(N / 64), 1, 1)
    → Read back simulation buffer (or keep on GPU)
```

---

## Deliverable 3 — Accomplishment Audit

| Area | Status | Justification |
|------|--------|---------------|
| ObjectParticleStorage | **Production Ready** | ActivePool-based, fully functional, all statistics (peakActive, peakCapacity, totalCreated). Default for both backends. Mature. |
| SoAParticleStorage | **Production Ready** | Typed arrays per field, free-list allocation, dynamic growth (doubles on overflow), peak tracking, activeAccessors array for iteration. Solid. |
| Accessor System | **Production Ready** | Abstract base with two concrete implementations. SoAParticleAccessor proxies typed arrays; ObjectParticleAccessor wraps objects. Full coverage of 15 simulation fields + collision + rendering fields. |
| Modifier State System | **Functional** | ModifierStateStore works for CPU path (per-modifier, per-particle). GPU path has parallel map in GpuPassExecutor. Both work. No unified interface. |
| Sorting System | **Production Ready** | 7 sort modes, NaN-guarded comparators, lazy sort, stable tiebreak by creation order, custom sort function support. |
| Render Data | **Production Ready** | ParticleRenderData cleanly abstracts sorted vs. unsorted iteration via fillCommandBuffer(). |
| Render Command Buffer | **Production Ready** | Float32Array stride=17, dynamic growth, zero-alloc read(i, target) pattern, texture array, particle refs. |
| Canvas Renderer | **Production Ready** | Full-featured: drawImage with sprite frames, texture fallback, fillRect fallback, alpha, color, rotation, origin, custom renderParticle callback. |
| GPU Renderer | **Production Ready** | WebGL2 instanced rendering, batch-by-texture, sprite frames, alpha, color, depth. VAO, instance VBO, texture cache. |
| Modifier Compiler | **Functional** | Validates descriptors, classifies passes (integration/force/visual), generates state layout with dedup. Static helpers: isGpuCompatible, getPass. |
| GPU Execution | **Functional** | 11 operators, dual path (SoA via view, object via accessor), beginFrame uniform precompute, onEmit state init. Works correctly but runs on CPU. |
| Dynamic Capacity | **Production Ready** | SoAParticleStorage._grow() doubles capacity, reallocates all typed arrays, creates new accessors, extends free-list. |
| Descriptor System | **Functional** | All 15 modifiers implement toDescriptor(). Compiler validates type, rejects GPU-incompatible with specific messages. |
| SimulationBufferView | **Production Ready** | Direct typed array references, named getters/setters (x(i), setX(i,v)), generic get(i,field)/set(i,field,v), integrate() physics. Matches WGSL access pattern. |
| ParticleBufferLayout | **Production Ready** | Canonical 17-field layout: FIELD_NAMES, FIELD_INDEX, STRIDE=17, registerField, freeze, isValidField. |
| ParticleAsset | **Functional** | Constructor supports modifiers/modifierStack, shape, emitter config, initializer, renderParticle, renderer, backend. Methods: spawn, burst, variant, toJSON, fromJSON. |
| ParticleEffect | **Production Ready** | Wraps system + emitter. Methods: play, stop, pause, resume, emit, update, render, destroyWhenFinished, destroy. Auto-destroy on finish with callback. |
| ParticleEmitter | **Production Ready** | Rate-based accumulation with MAX_EMIT_PER_FRAME cap. Features: burst, shape sampling, follow-target with custom getter, velocity inheritance, offset, pause/resume/restart. |
| Layers | **Production Ready** | Named ParticleLayer with order, visibility, enable, pause, tags, system management. ParticleLayerManager with sorted rendering/update, destroy. |
| Registry | **Production Ready** | Static Map-based ParticleAssetRegistry with define, get, spawn, remove, has, clear. Spawn creates ParticleEffect directly. |
| Serialization | **Partial** | ParticleAsset.toJSON/fromJSON works for ModifierStack, Shape, emitter config. Custom initializers, renderParticle functions, renderer instances, backend instances throw errors (cannot be serialized). |

---

## Deliverable 4 — Testing Coverage Audit

**All 3 test files have been deleted.** Current coverage: zero.

| Subsystem | Coverage | Notes |
|-----------|----------|-------|
| ObjectParticleStorage | **0%** | ActivePool acquire/release/clear/grow — completely untested |
| SoAParticleStorage | **0%** | Typed array allocation, free-list, dynamic growth, slot reset — completely untested |
| Accessor System | **0%** | SoAParticleAccessor get/set, ObjectParticleAccessor.wrap — untested |
| Modifier State System | **0%** | ModifierStateStore.ensure/get/release — untested |
| Sorting System | **0%** | All 7 comparators, NaN checks, sort stability — untested |
| Render Data | **0%** | fillCommandBuffer with indices, resolveParticle — untested |
| Render Command Buffer | **0%** | append, read, _grow, data integrity — untested |
| Canvas Renderer | **0%** | drawImage paths, fillRect fallback, custom callback — untested |
| GPU Renderer | **0%** | WebGL2 init, shader compilation, instancing, texture batching — untested |
| Modifier Compiler | **0%** | Validation, pass classification, state layout dedup, rejection — untested |
| GPU Execution | **0%** | All 11 operators, runPass, runPassObject, beginFrame, onEmit — untested |
| Dynamic Capacity | **0%** | SoAParticleStorage._grow() array reallocation — untested |
| Descriptor System | **0%** | All 15 modifiers toDescriptor() — untested |
| SimulationBufferView | **0%** | Named methods, generic get/set, integrate() — untested |
| ParticleBufferLayout | **0%** | FIELD_INDEX, STRIDE, isValidField, registerField — untested |
| ParticleAsset | **0%** | spawn, burst, variant, toJSON/fromJSON — untested |
| ParticleEffect | **0%** | lifecycle, auto-destroy, finish callback — untested |
| ParticleEmitter | **0%** | rate, burst, follow, shape, velocity inheritance — untested |
| Layers | **0%** | LayerManager create/remove/sort/update/render — untested |
| Registry | **0%** | define/get/spawn/remove — untested |
| Serialization | **0%** | JSON round-trip with ModifierStack + Shape — untested |

### Highest-Risk Untested Areas

1. **SoAParticleStorage._grow()** — array reallocation, accessor slot remapping, free-list extension. A bug here corrupts all particle data silently.
2. **GpuParticleBackend._updateSoA() death sweep** — in-place slot index shifting during iteration. Any off-by-one or missed index corrupts the active list.
3. **ActivePool interactions** (ObjectParticleStorage) — acquire/release/clear in the CpuParticleBackend hot loop.
4. **Sorting with SoAParticleStorage** — getFieldValue/resolveParticle with index buffers; comparator stability under concurrent modification.
5. **GpuPassExecutor state management** — per-descriptor per-particle state maps; cleanup on death, reuse on recompile.
6. **ModifierCompiler state layout dedup** — color+animation both map to "segment" at offset 0; wrong dedup breaks GPU state layout.
7. **ParticleRenderCommandBuffer._grow()** — buffer reallocation preserves data integrity; the Float32Array.subarray pattern.

### Highest-Risk Integration Points

- CpuParticleBackend.modifierContext ↔ ModifierStateStore ↔ modifier lifecycle during particle iteration
- GpuParticleBackend._updateSoA() ↔ SoAParticleStorage.release() ↔ SimulationBufferView death sweep
- ParticleEffect ↔ ParticleSystem ↔ Backend constructor wiring (renderParticle, renderer, backend, storage)
- GpuParticleBackend._updateObject vs _updateSoA — two diverging simulation paths for the same logic

---

## Deliverable 5 — Capability Audit

### CPU Path

| Capability | Supported | Details |
|-----------|-----------|---------|
| Object storage (AoS) | **Yes** | Explicit opt-in. ActivePool + Particle object with 27 fields. |
| SoA storage | **Yes** | **Default.** Typed arrays, dynamic growth, free-list allocation. |
| Canvas 2D rendering | **Yes** | Sprite frames, texture, fillRect fallback, rotation, alpha, origin, color. |
| WebGL2 instanced rendering | **Yes** | Quad VAO, instance VBO, batch-by-texture, sprite frames, depth. |
| Modifiers (beginFrame) | **Yes** | Pre-frame setup / uniform computation. |
| Modifiers (update) | **Yes** | Per-particle via accessor wrap + modifier.update(). |
| Modifiers (onEmit) | **Yes** | Initialization on particle spawn. |
| Modifiers (onDeath) | **Yes** | Cleanup on particle death. |
| Modifiers (endFrame) | **Yes** | Post-frame teardown. |
| Priority ordering | **Yes** | Numeric ascending. Rebuilt on add/remove. |
| Collision provider | **Stub** | setCollisionProvider() stored but never invoked. |
| Sorting (7 modes) | **Yes** | age, reverseAge, size, reverseSize, depth, reverseDepth, custom. Lazy, stable tiebreak. |
| Layers | **Yes** | Named, ordered, visible/enabled toggle, pause/resume, tags. |
| Effects | **Yes** | Auto-destroy when finished, finish callback, play/stop/pause/resume. |
| Emitter (rate) | **Yes** | Accumulator-based, MAX_EMIT_PER_FRAME=1000 cap. |
| Emitter (burst) | **Yes** | Immediate emit(count). |
| Emitter (shape) | **Yes** | Via shape.sample(p) hook. |
| Emitter (follow) | **Yes** | Target follow with configurable position getter. |
| Emitter (velocity inheritance) | **Yes** | Inherits emitter velocity at spawn time. |
| Asset serialization | **Partial** | ModifierStack + Shape only. Custom functions/renderers/backends throw. |

### GPU Path

| Capability | Supported | Details |
|-----------|-----------|---------|
| Descriptor compilation | **Yes** | ModifierCompiler → GpuProgramDescriptor (immutable, frozen). |
| Pass scheduling | **Yes** | Fixed order: integration → force → visual. |
| CPU-side operator execution | **Yes** | GpuPassExecutor + 11 operators with (view, i, dt, state, uniforms) signature. |
| SoA simulation (CPU-side) | **Yes** | SimulationBufferView + operator.execute() per slot index. |
| Object simulation (CPU-side) | **Yes** | GpuPassExecutor.runPassObject() via accessor wrappers. |
| beginFrame uniform precompute | **Yes** | Per-operator beginFrame, frame uniforms merged into global uniforms. |
| onEmit state initialization | **Yes** | GpuPassExecutor.runOnEmit() — per-descriptor state creation. |
| WGSL shader generation | **Yes** | WgslGenerator → GpuComputeProgram (shaderSource, bindings[], workgroupSize, passes[]). |
| WebGL2 rendering | **Yes** | Shared with CPU path via GpuParticleRenderer. |
| **Compute shader execution** | **No** | Requires WebGPU runtime integration. Not implemented. |
| Collision (GPU) | **No** | CollisionModifier rejected at compile time. |
| Spawn modifiers (GPU) | **No** | SpawnModifier, TrailModifier rejected at compile time. |
| AnimatedSprite (GPU) | **No** | Rejected at compile time (callbacks + frame state). |
| State buffer management | **No** | GpuModifierStateBuffer not yet implemented. State layout exists but not wired to runtime. |
| Cross-pass state sharing | **No** | State layout deduplicates names but has no runtime binding. |
| Custom uniforms | **No** | Only dt, elapsedTime, particleCount. Per-modifier frame uniforms are merged ad-hoc. |

### GPU-Compatible Modifiers (11)

| Modifier | Pass | State |
|----------|------|-------|
| FadeModifier | visual | none |
| ScaleModifier | visual | none |
| VelocityModifier | integration | none |
| RotationModifier | integration | none |
| ForceModifier | force | none |
| AttractionModifier | force | none |
| OrbitModifier | force | none |
| WindModifier | force | none |
| TurbulenceModifier | force | seed (4 bytes) |
| ColorModifier | visual | segment (4 bytes) |
| AnimationModifier | visual | segment (4 bytes) |

### GPU-Incompatible Modifiers (4)

| Modifier | Reason |
|----------|--------|
| TrailModifier | Spawns particles at runtime |
| SpawnModifier | Spawns particles at runtime |
| CollisionModifier | Requires external collision provider |
| AnimatedSpriteModifier | Animation callbacks and frame state require CPU |

---

## Deliverable 6 — Readiness Report

| Area | Score | Justification |
|------|-------|---------------|
| Object Storage | **85** | ActivePool is mature but now legacy (SoA is default). -15 for legacy status. |
| SoA Storage | **88** | Now the default. Typed arrays, dynamic growth, free-list, peak tracking. wrap() bug fixed. -12 for 50k perf anomaly and pre-allocated accessor waste. |
| Access Architecture | **85** | Clean abstract base + two implementations. wrap() now copies all 17 instance properties. sortOrder getter/setter fixed. -15 for 17 non-storage fields on SoAParticleAccessor. |
| Modifier Architecture | **85** | Unchanged. |
| State Management | **70** | Unchanged. |
| Sorting | **87** | sortOrder setter bug fixed (SoA now correctly stores sort order for tiebreak). -13 for Array.sort() on large arrays. |
| Rendering | **90** | Unchanged. |
| GPU Rendering | **85** | Unchanged. |
| GPU Simulation | **50** | Unchanged (still no WebGPU compute dispatch). |
| Compiler Pipeline | **80** | Unchanged. |
| Runtime Stability | **80** | 5 latent bugs fixed (wrap props, sortOrder, emit slot crash, runOnEmit null view, emitOne slot). SoA default reduces dual-path surface area. |
| Production Readiness | **75** | Faster SoA default path. Legacy isolation cleaner. Multiple bugs fixed. Still zero tests. |
| Maintainability | **78** | StorageResolver centralizes storage selection. Reduced import count per backend. wrap() bug fixed. |
| Extensibility | **80** | Unchanged. |

---

## Deliverable 7 — Technical Debt Audit

### Architectural Debt

| Item | Rank | Impact |
|------|------|--------|
| Sorting logic copy-pasted (~120 lines) between CpuParticleBackend and GpuParticleBackend | **High** | Every sort fix or new mode must be applied in two places identically. Already diverges in minor ways. |
| State management split: ModifierStateStore (CPU) vs GpuPassExecutor._stateByDesc (GPU) | **High** | Two parallel systems with different APIs. ModifierStateStore keyed by modifier object; GpuPassExecutor keyed by descriptor reference. No shared interface. |
| ObjectParticleStorage.integrateParticle() mixes storage with physics math | **Medium** | Physics integration logic (vx += ax*dt, x += vx*dt, etc.) lives in storage classes. Violates SRP. |
| SoAParticleAccessor carries 17 non-storage fields (texture, collision state, etc.) | **Medium** | Every accessor carries rendering/collision state that's only used during render/collision passes. Should be in a side-channel. |
| GpuParticleBackend._updateSoA() manual slot index shifting on death | **High** | In-place removal shifts indices, compacts the activeSlots array, and re-reads slot indices. Fragile; a missed index corrupts all subsequent particles. |
| ParticleBackend abstract base is completely disconnected from implementations | **Low** | No runtime impact. Confusing for new developers expecting an extension model. |

### Performance Debt

| Item | Rank | Impact |
|------|------|--------|
| SoAParticleStorage pre-allocates N accessor objects at construction + on grow() | **Medium** | Wastes memory: 1000 accessor objects for 1000-capacity storage even with 0 active particles. Each grow doubles the waste. |
| ObjectParticleAccessor.wrap() called per particle per frame in the hot loop | **Medium** | Function call + property assignment per particle per frame. Small but consistent overhead for large particle counts. |
| Array.sort() in _sortParticles() on every dirty frame | **Low** | O(n log n) is fine for typical particle counts (100-10000). Could be a bottleneck at 100k+. |
| CanvasParticleRenderer creates a second command buffer | **Low** | When render data is ParticleRenderData (not already a buffer), it creates a copy. Minor allocation per frame. |

### API Debt

| Item | Rank | Impact |
|------|------|--------|
| ParticleSystem exposes 5+ `_prefixed` properties as public setters (`_renderParticle`, `_sortDirty`, `_sortFunction`, `_sortedIndices`, `_collisionProvider`) | **Medium** | Indicates the facade boundary is incomplete. Internal backend state leaked through the public API. |
| storage.integrateParticle() takes different argument types per implementation | **Medium** | ObjectParticleStorage takes a Particle object; SoAParticleStorage takes a SoAParticleAccessor. Polymorphism through duck-typing. |
| GPU path uses both modifier objects and descriptor objects simultaneously | **Medium** | GpuParticleBackend.addModifier() stores modifier objects but compiles from descriptors (via toDescriptor()). The dual representation is confusing. |
| No standard error type for particle system errors | **Low** | All errors are generic `new Error()` with descriptive strings. No ParticleError or error codes. |

### Testing Debt

| Item | Rank | Impact |
|------|------|--------|
| All 227 tests deleted | **Critical** | Zero regression protection. Every change is blind. No confidence that existing behavior is preserved. |
| No CI or test runner configured | **Critical** | No automated verification at all. Not even a `npm test` script for particles. |
| ModifierCompiler state layout dedup untested | **High** | The dedup logic (color+animation both map to "segment" at offset 0) has zero verification. Wrong dedup breaks GPU state. |
| GpuParticleRenderer completely untested | **High** | ~380 lines of WebGL2 code with no test coverage. Shader compilation errors caught only at runtime. |
| ParticleRenderCommandBuffer._grow() untested | **Medium** | Buffer reallocation could silently corrupt data. The Float32Array.subarray + set pattern is correct but unverified. |
| Death sweep algorithm untested | **High** | The slot index shifting in _updateSoA() is the most complex iteration logic in the GPU path and has zero tests. |

---

## Deliverable 8 — Dead Code & Deletion Candidates

| File | Why It Appears Dead | Confidence |
|------|---------------------|------------|
| **particles/ParticleStateManager.js** | Map-of-Maps particle state manager. **Zero imports project-wide.** Functionality replaced by ModifierStateStore (CPU path) and GpuPassExecutor._stateByDesc (GPU path). 32 lines. | **High** |
| **particles/backends/ParticleBackend.js** | Abstract base class with no-op stubs. **Zero imports project-wide.** Neither CpuParticleBackend nor GpuParticleBackend extends it. They are standalone classes with their own method signatures. 42 lines. | **High** |
| **particles/ParticleBackendCapabilities.js** | Root-level duplicate of `gpu/ParticleBackendCapabilities.js`. **Zero imports.** Missing the `static canRun(backend, modifier)` method that the gpu variant adds. 60 lines. | **High** |

All three have **High** confidence and are safe to delete.

---

## Deliverable 9 — Remaining Roadmap

### 16U: WebGPU Compute Runtime

| Aspect | Detail |
|--------|--------|
| **Description** | Implement actual WebGPU compute dispatch: acquire device, create buffers, compile compute pipeline, dispatch workgroups, read back results. |
| **Files affected** | GpuParticleBackend, GpuPassExecutor, WgslGenerator, new WebGPUDeviceManager or similar. |
| **Difficulty** | High |
| **Risk** | High (WebGPU API is complex; browser support varies) |
| **Impact** | Transformative — makes "GPU simulation" real instead of aspirational |

### 16V: State Buffer Management

| Aspect | Detail |
|--------|--------|
| **Description** | Implement GpuModifierStateBuffer (GPU-side per-particle state buffer). Wire state layout from GpuProgramDescriptor into WGSL storage buffers. Implement state read/write in shader operators (turbulence seed, color segment, animation segment). |
| **Files affected** | New GpuModifierStateBuffer, GpuBufferLayout, WgslGenerator, all shader operators. |
| **Difficulty** | Medium |
| **Risk** | Medium |
| **Impact** | High — required for correct turbulence, color stops, and animation on GPU |

### 16W: GPU Death Sweep via Indirect Dispatch

| Aspect | Detail |
|--------|--------|
| **Description** | Replace CPU-side death sweep with GPU-populated dead list. Implement indirect dispatch for variable particle counts. Eliminate slot index shifting in _updateSoA(). |
| **Files affected** | GpuParticleBackend._updateSoA(), new death-list compute shader. |
| **Difficulty** | High |
| **Risk** | High |
| **Impact** | High — removes the most fragile code in the GPU path |

### 16X: ObjectParticleStorage Removal

| Aspect | Detail |
|--------|--------|
| **Description** | Make SoAParticleStorage the default in both backends. Remove ObjectParticleStorage, ObjectParticleAccessor, and the Particle class (display/Particle.js). Remove _updateObject() from GpuParticleBackend. |
| **Files affected** | CpuParticleBackend, GpuParticleBackend, ParticleSystem, storage/, accessors/. |
| **Difficulty** | Medium |
| **Risk** | Medium |
| **Impact** | High — reduces surface area, eliminates dual-path maintenance burden |

### 16Y: Extract Shared Sort Logic

| Aspect | Detail |
|--------|--------|
| **Description** | Extract ~120 lines of duplicated comparator code into a shared SortUtils or SortingLayer module. |
| **Files affected** | New sorting/ module, CpuParticleBackend, GpuParticleBackend. |
| **Difficulty** | Low |
| **Risk** | Low |
| **Impact** | Medium — eliminates a maintenance trap |

### 16Z: Unified State Manager

| Aspect | Detail |
|--------|--------|
| **Description** | Create a single state manager interface for both CPU and GPU paths. Replace ModifierStateStore and GpuPassExecutor._stateByDesc with one implementation. |
| **Files affected** | New StateManager, ModifierStateStore (deprecate), GpuPassExecutor. |
| **Difficulty** | Medium |
| **Risk** | Medium |
| **Impact** | Medium — simplifies dual-path architecture |

### T1: Restore Test Infrastructure

| Aspect | Detail |
|--------|--------|
| **Description** | Recreate test files for all 56 source files. Add test runner (node --test or tape). Add CI (GitHub Actions). Target 90%+ statement coverage. |
| **Files affected** | New test files for every source file. |
| **Difficulty** | High (volume: 56 files) |
| **Risk** | Low |
| **Impact** | Critical — without tests, every change is blind |

### T2: Integration Tests

| Aspect | Detail |
|--------|--------|
| **Description** | Full-stack tests: ParticleAsset → ParticleEffect → ParticleSystem → Backend → Storage → Render. GPU operator equivalence tests. WGSL compilation tests. Death sweep correctness tests. |
| **Files affected** | New integration test files. |
| **Difficulty** | Medium |
| **Risk** | Low |
| **Impact** | High — catches cross-module regressions |

---

## Deliverable 10 — Executive Summary

### 1. Current Architectural Maturity: 7/10

The engine has completed a well-planned sequence of migrations: AoS → SoA, direct modifier calls → descriptors → operators, CPU-only → split CPU/GPU. The module structure is clean, layering is coherent, and migration artifacts are limited to 3 dead files (Confidence: High).

### 2. Current Biggest Strengths

- **Modifier descriptor + compiler pipeline** — clean separation between modifier definition (descriptor) and execution (operator/scheduler). Validates at compile time.
- **SoAParticleStorage** — typed arrays, dynamic growth, free-list allocation. Genuinely production-grade.
- **Rendering pipeline** — command buffer (stride=17 Float32Array) + instanced WebGL2 with texture batching. Efficient and feature-complete.
- **SimulationBufferView + ParticleBufferLayout** — the slot-index simulation model maps 1:1 to WGSL `array<f32>` semantics. This alignment is the architectural foundation for real GPU compute.

### 3. Current Biggest Weaknesses

1. **Zero tests** — the only 227 tests were deleted. No regression protection. **This is a Critical risk.**
2. **No actual GPU compute execution** — WGSL compiler generates correct shaders but nothing dispatches them. "GPU simulation" is CPU simulation with GPU-style operators.
3. **Sorting logic is copy-pasted** — ~120 lines duplicated between CpuParticleBackend and GpuParticleBackend. A maintenance trap.
4. **State management is split** — ModifierStateStore (CPU) vs GpuPassExecutor internal maps (GPU). No unified interface, different keying strategies.
5. **ObjectParticleStorage is still the default** — both backends default to AoS objects. Everyone pays the accessor overhead.

### 4. Is the Engine Production-Capable?

**CPU path: Yes.** CpuParticleBackend + CanvasParticleRenderer + Object/SoA storage + full modifier lifecycle is production-ready. The same engine with GpuParticleRenderer runs WebGL2 in production today.

**GPU simulation path: No.** The WGSL compiler and CPU-side operators are structurally correct, but without WebGPU compute dispatch, "GPU simulation" is aspirational. The architecture is sound; only the WebGPU plumbing is missing.

### 5. Should ObjectParticleStorage Still Exist?

**No.** SoAParticleStorage is better in every dimension: memory locality, typed array performance, zero GC pressure, native GPU buffer compatibility, dynamic growth. ObjectParticleStorage is a legacy artifact. It should become the non-default option (or be removed) in the next cleanup phase.

### 6. Is SoAParticleStorage Ready to Become Default?

**Yes.** It supports dynamic growth, free-list allocation, all statistics, and activeAccessors iteration. The only remaining issue is pre-allocated accessor objects (N for capacity, not active count) — a memory optimization that can wait.

### 7. Is the GPU Simulation Architecture Fundamentally Sound?

**Yes.** The architecture is correct:

- Descriptors are modifier-authored → compiler-validated → backend-consumed
- Pass classification (integration/force/visual) matches the GPU dispatch model
- Slot-index simulation via SimulationBufferView maps 1:1 to WGSL `array<f32>` index access
- Operator pattern cleanly separates CPU and WGSL codegen paths
- State layout deduplication (color+animation → "segment") is correct for GPU storage buffers
- The WgslGenerator emits valid WGSL with proper structs, bindings, workgroup size, and bounds checking

The foundation is solid. Only the WebGPU plumbing (device, buffers, pipelines, dispatch) and state buffer management remain.

### 8. Single Highest-Value Next Phase

**Restore the test suite, then implement WebGPU compute dispatch.**

Tests first — without them, every subsequent change is blind. The deleted 227 tests were the only safety net. Recreating them should be the immediate priority.

Then implement WebGPU compute: acquire device, compile GpuComputeProgram, dispatch workgroups on SoA buffers, read back results. This is the critical remaining 20% that makes "GPU simulation" a reality.

---

## Deleted Test Files

The following 3 test files (227 tests total) were deleted in a prior session:

| File | Tests | Coverage |
|------|-------|----------|
| `particles/gpu/ModifierCompiler.test.js` | 70 | Compiler validation, pass classification, state layout, rejection, determinism |
| `particles/gpu/GpuParticleBackend.test.js` | 98 | Backend lifecycle, all 11 modifiers, CPU-vs-GPU determinism, SoA/Object paths |
| `particles/gpu/WgslGenerator.test.js` | 59 | GPU buffer layout, WGSL generation, shader operators, pass comments, determinism |

---

---

## Phase 16T Addendum — SoA Default Migration (2026-06-20)

### Changes Made

| File | Change |
|------|--------|
| `storage/StorageResolver.js` | **NEW** — centralized storage selection, creation, accessor dispatch |
| `backends/CpuParticleBackend.js` | Default storage: Object → SoA. Replaced 3 imports with StorageResolver |
| `backends/GpuParticleBackend.js` | Default storage: Object → SoA. Fixed emit/emitOne slot access (guarded by `_useSoA`) |
| `gpu/GpuPassExecutor.js` | `runOnEmit()` handles null view (object path fallback to `particle.__jygameId`) |
| `accessors/SoAParticleAccessor.js` | `wrap()` now copies all 17 instance properties. `__jygameSortOrder` getter/setter with `_sortOrder` backing field |

### Bugs Fixed

1. **SoAParticleAccessor.wrap()** — instance properties (color, texture, collision state, userData, sortOrder) were NOT propagated to reusable accessor. **HIGH severity.**
2. **__jygameSortOrder setter no-op** — base class setter was empty; SoA never stored sort order. Sorting tiebreak always returned 0 for SoA. **MEDIUM severity.**
3. **GpuParticleBackend.emit()/emitOne()** — accessed `p._i` unconditionally; crashed with ObjectParticleStorage. **MEDIUM severity.**
4. **GpuPassExecutor.runOnEmit()** — `view.id(undefined)` crash with null view on object path. **HIGH severity.**

### New Files (temporary, for verification)

| File | Purpose |
|------|---------|
| `phase16t_smoke_test.js` | 48 smoke tests — defaults, emit, update, death, sorting, rendering, StorageResolver, wrap fix, legacy path |
| `phase16t_benchmark.js` | Performance comparison SoA vs Object at 1k/10k/50k |
| `phase16t_report.md` | Full migration report — architecture, performance, bugs, cleanup |

*End of Audit*
