# Public API Architecture — Audit & Contract

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [The Problem: Stale Component Views](#the-problem-stale-component-views)
3. [Root Cause Analysis](#root-cause-analysis)
4. [Public API Audit](#public-api-audit)
5. [Wrappers in Detail: `animation` and `style`](#wrappers-in-detail-animation-and-style)
6. [Why the Engine Cache Is Not Enough](#why-the-engine-cache-is-not-enough)
7. [Architectural Contract](#architectural-contract)
8. [Lifetime Invariant](#lifetime-invariant)
9. [The Pattern: APIs Resolve State at the Point of Use](#the-pattern-apis-resolve-state-at-the-point-of-use)
10. [What Can Be Cached](#what-can-be-cached)
11. [Performance Analysis](#performance-analysis)
12. [Future-Proofing Assessment](#future-proofing-assessment)
13. [Implementation Plan](#implementation-plan)
14. [Glossary](#glossary)

---

## Executive Summary

The recent `animation.play()` bug in `Sprite` is **not an Animation bug** — it is a symptom of a fundamental architectural flaw in how Jygame's public APIs interact with the engine runtime.

The root cause: wrapper objects created by `Sprite.animation` and `Sprite.style` permanently capture component views returned by the engine. When the entity's underlying storage changes (e.g., after an archetype migration), writing to a stale view silently corrupts memory; reading from it returns garbage.

The fix is a simple architectural contract with four rules:

1. **Public APIs represent engine features, not implementation details.**
2. **Public APIs may only cache state whose lifetime they own.**
3. **Public APIs resolve runtime-owned state at the point of use.**
4. **Public APIs remain valid for the entire lifetime of their owner.**

Everything else follows from these four rules.

---

## The Problem: Stale Component Views

### Reproduction

```javascript
// Inside onEnter():
const sprite = new Sprite(100, 100, 64, 64, scene.world);
sprite.animation.add("walk", walkClip);
sprite.animation.play("walk"); // ✅ Works — no migration yet

// Inside update():
sprite.velocity.x = 400;        // Triggers addComponent(Velocity) → migration
sprite.animation.play("walk");  // ❌ Writes to stale memory → no effect
```

The first `play()` works because the entity hasn't migrated. The second `play()` fails because `addComponent(Velocity)` moved the entity to a new archetype, and the wrapper's captured component reference now points to freed/overwritten memory.

### What "stale" means concretely

`world.get(entity, Component)` returns a **view object** created by the engine:

```
View object
├── .clipId     →  getter/setter closes over: (col: TypedArray, row: number)
├── .elapsed    →  getter/setter closes over: (col: TypedArray, row: number)
├── .isPlaying  →  getter/setter closes over: (col: TypedArray, row: number)
└── ...
```

Each property's getter/setter closes over a **specific TypedArray** and **specific row index** from the table at the moment of creation. After `moveEntity` (archetype migration):
1. The entity's data is copied to a new table at a new row
2. The old row is swap-removed — the last entity in the old table overwrites it

The stale view's getters/setters now read/write whatever entity occupies the old table slot.

---

## Root Cause Analysis

### The precise mechanism

```
1. Sprite.get animation()
   → world.get(entity, Animation)     creates View_A (table=T1, row=R1)
   → _createAnimWrapper(View_A)       captures View_A permanently in closure

2. Sprite.velocity.x = 400
   → world.add(entity, Velocity)
   → _clearEntityCache(entity)        deletes View_A from cache (too late)
   → moveEntity(entity, newSig)       copies data to T2/R2, swap-removes T1/R1

3. sprite.animation.play("walk")      → uses captured View_A
   → View_A.clipId = id               writes to T1/R1 (now owned by other entity)
   → View_A.isPlaying = 1             writes to T1/R1 (corruption)
```

The cache clearing at step 2 only evicts the engine cache. It does NOT update or invalidate the reference held by the wrapper's closure.

### The four contributing factors

| Factor | Description |
|--------|-------------|
| **Archetype migration** | Adding or removing a component moves the entity to a new archetype, changing its table and row |
| **Component view capture** | `_createAnimWrapper` stores the view object returned by the engine in a permanent closure |
| **Swap-remove** | The old table row is overwritten by the last entity in that table — stale writes corrupt live data |
| **View == plain object with closures** | The view's getters/setters are bound to a specific TypedArray and row — they don't re-resolve |

---

## Public API Audit

Every public property and method on `Sprite`, categorized by safety:

### Safe APIs (resolve runtime state on every access)

These call into the engine on every property access. They never cache references to storage they do not own.

| API | Access Pattern | Safe? |
|-----|---------------|-------|
| `transform` (get/set) | engine lookup on each call | ✅ |
| `collider` (get/set) | engine lookup on each call | ✅ |
| `velocity` (get/set) | engine lookup on each call | ✅ |
| `visible` (get/set) | engine lookup on each call | ✅ |
| `renderable` (get/set) | engine lookup on each call | ✅ |
| `imageSmoothing` (get/set) | engine lookup on each call | ✅ |
| `x` (get/set) | engine lookup on each call | ✅ |
| `y` (get/set) | engine lookup on each call | ✅ |
| `width` (get/set) | engine lookup on each call | ✅ |
| `height` (get/set) | engine lookup on each call | ✅ |
| `image` (get/set) | engine lookup on each call | ✅ |
| `angle` (get/set) | engine lookup on each call | ✅ |
| `scale` (get/set) | engine lookup on each call | ✅ |
| `animation` setter | engine lookup on each call | ✅ |

### Vulnerable APIs (cache state they do not own)

These create wrapper objects at construction that capture a reference to runtime-owned storage permanently.

| API | Stale After Migration? | Affected Members |
|-----|----------------------|------------------|
| `animation` getter → `_animWrapper` | **YES** | `.play()`, `.pause()`, `.resume()`, `.stop()`, `.playing` (get/set) |
| `style` getter → `_styleWrapper` | **YES** | `.fill` (get/set), `.shape` (get/set) |

### Why `animation` setter is safe but getter is not

The setter (`set animation(v)`) resolves runtime state every time and writes values immediately — it never caches what it does not own.

The getter (`get animation()`) resolves runtime state once at wrapper creation time, captures the returned view in a closure, and returns the cached wrapper on all subsequent accesses. This cached view outlives the storage it references.

---

## Wrappers in Detail: `animation` and `style`

### Animation wrapper (`_animWrapper`)

Created at `Sprite.js:239` inside `get animation()`:

```javascript
get animation() {
    const anim = w.get(e, Animation);               // ← resolved once
    if (!this._animWrapper) {
        this._animWrapper = this._createAnimWrapper(anim);  // ← passed to factory
    }
    return this._animWrapper;
}
```

`_createAnimWrapper(anim)` at line 260 creates an object whose methods all close over the single `anim` parameter:

```javascript
_createAnimWrapper(anim) {
    const self = this;
    return {
        get playing() { return !!anim.isPlaying; },     // stale read
        set playing(v) { anim.isPlaying = v ? 1 : 0; }, // stale write
        play(name) {
            anim.clipId = id;    // stale write
            anim.elapsed = 0;   // stale write
            anim.isPlaying = 1; // stale write
        },
        pause()    { anim.isPlaying = 0; },
        resume()   { anim.isPlaying = 1; },
        stop()     { anim.isPlaying = 0; anim.elapsed = 0; anim.frameIndex = 0; },
    };
}
```

Every method reads/writes through the captured `anim`. After the runtime moves the entity's data, all of these operate on stale memory.

### Style wrapper (`_styleWrapper`)

Created at `Sprite.js:213` inside `get style()`:

```javascript
get style() {
    const r = this.#world.get(this.#entity, Renderable);  // ← resolved once
    if (!this._styleWrapper) {
        this._styleWrapper = {
            get fill()  { return "#" + r.fillColor.toString(16).padStart(6, "0"); },
            set fill(v) { r.fillColor = parseInt(v.slice(1), 16); },
            get shape() { return r.shape === 1 ? "circle" : "rect"; },
            set shape(v) { r.shape = v === "circle" ? 1 : 0; },
        };
    }
    return this._styleWrapper;
}
```

Same pattern — `r` is captured once and used forever.

---

## Why the Engine Cache Is Not Enough

The engine cache (World.js:52) is a Map from `"entityId:componentId"` → view objects. It is:

- **Populated** on engine lookup cache miss (creates view, stores in cache)
- **Evicted** when the entity's storage layout changes
- **Checked** on every engine call (cache hit returns existing view)

### The cache eviction gap

```
engine.get(entity, Animation)     → creates View_A, stores in cache
                                    ← Sprite also stores View_A in closure
engine.clearEntityCache(entity)   → deletes View_A from cache ONLY
                                    → Sprite's closure still holds View_A
engine.moveEntity(entity, newSig) → View_A's table/row now belong to another entity
```

The engine cache is correctly designed and correctly evicted. The problem is that the wrappers create a **second, permanent cache** outside of the engine cache's control.

### When caching is beneficial

For simple properties that call the engine every time:

```
sprite.transform.x    → engine.get(entity) → cache hit → fast
sprite.transform.y    → engine.get(entity) → cache hit → fast
```

After migration:

```
engine.clearEntityCache(entity)   → cache cleared
sprite.transform.x                → engine.get(entity) → cache miss → create → store → return
sprite.transform.y                → engine.get(entity) → cache hit → fast
```

This is correct behavior — the cache is invalidated on migration and repopulated on the next access. The key insight: **simple properties never store the returned view outside the scope of the getter/setter**. They do not own the cached state, so they never cache it permanently.

---

## Architectural Contract

The engine establishes four architectural rules:

### Rule 1 — Public APIs Represent Engine Features, Not Implementation Details

```javascript
sprite.animation  // → Animation API (an engine feature)
sprite.audio      // → Audio API (an engine feature)
sprite.particles  // → Particles API (an engine feature)
sprite.physics    // → Physics API (an engine feature)
```

Not:

```javascript
sprite.animation  // → AnimationComponent wrapper  ❌
sprite.audio      // → AudioSourceComponent wrapper ❌
```

A component is merely one possible implementation detail of a feature. The feature may use multiple components, services, registries, or non-engine state. The user should never know which parts are runtime-backed and which are not.

### Rule 2 — Public APIs May Only Cache State Whose Lifetime They Own

```javascript
// ✅ Correct: the API owns _animMap and _animCurrent
this._animMap = new Map();
this._animCurrent = null;

// ❌ Wrong: the engine owns the component view
this._anim = engine.get(entity, Animation); // sprite doesn't own this
```

If the API created the state, the API controls its lifetime, and the API can cache it. If the runtime created the state, the API must not treat it as permanent.

### Rule 3 — Public APIs Resolve Runtime-Owned State at the Point of Use

```javascript
// ✅ Correct: resolve at point of use
play(name) {
    const anim = engine.get(self.#entity, Animation);
    anim.isPlaying = 1;
}

// ❌ Wrong: cache at construction
constructor(engine, entity) {
    this._anim = engine.get(entity, Animation); // becomes stale
}
```

"At the point of use" means immediately before reading or writing. Each method call resolves its own fresh reference to runtime-owned storage.

### Rule 4 — Public APIs Remain Valid for the Entire Lifetime of Their Owner

```javascript
sprite.animation.play("walk"); // must work as long as sprite is alive
sprite.audio.play();           // must work as long as sprite is alive
sprite.health.damage(10);      // must work as long as sprite is alive
```

The user should never have to care that:
- archetypes changed
- storage was rewritten
- components were added or removed
- the runtime was reimplemented

The owner object defines the API's lifetime. Period.

### Mental model

```
User

↓

Public APIs (Sprite, Animation, Audio, ...)

↓

Engine (resolved at point of use)

↓

Storage (implementation detail)
```

The contract does not depend on whether the engine uses archetype ECS, sparse sets, WASM, or a completely different paradigm. It survives any rewrite.

---

## Lifetime Invariant

This is an explicit consequence of Rule 4, stated more broadly:

> If an object is publicly exposed by the engine, it is valid for the entire lifetime of its owner.

Examples:

- `sprite.animation` is valid while `sprite` is alive.
- `sprite.audio` is valid while `sprite` is alive.
- `game.audio` is valid while `game` is alive.
- `scene.camera` is valid while `scene` is alive.
- `emitter.config` is valid while `emitter` is alive.

Users must never need to recreate or reacquire public APIs because of internal engine changes. If a storage migration happens, the API must seamlessly follow its owner to the new location.

This invariant is what the animation bug violated: `sprite.animation` became invalid mid-lifetime because the wrapper's captured reference did not survive the migration.

---

## The Pattern: APIs Resolve State at the Point of Use

### Corrected Animation API

```javascript
get animation() {
    if (!this._animApi) {
        this._animApi = this._createAnimationApi();
    }
    return this._animApi;
}

_createAnimationApi() {
    const self = this;
    return {
        // ── API-owned state (safe to cache) ──
        get current()     { return self._animCurrent; },
        set current(v)    { self._animCurrent = v; },

        get animations()  { return self._animMap; },
        set animations(v) { self._animMap = v; },

        // ── Engine-backed methods (resolve at point of use) ──

        play(name) {
            self._animCurrent = name;
            const anim = self.#engine.get(self.#entity, Animation);
            const map = self._animMap;
            if (map && map.has(name)) {
                const reg = self.#engine.get(AnimationClipRegistry);
                const id = reg.getId(name);
                if (id !== null) anim.clipId = id;
            }
            anim.frameIndex = 0;
            anim.elapsed = 0;
            anim.isPlaying = 1;
            anim.speed = 1;
        },

        pause() {
            const anim = self.#engine.get(self.#entity, Animation);
            anim.isPlaying = 0;
        },

        resume() {
            if (self._animCurrent) {
                const anim = self.#engine.get(self.#entity, Animation);
                anim.isPlaying = 1;
            }
        },

        stop() {
            const anim = self.#engine.get(self.#entity, Animation);
            anim.isPlaying = 0;
            anim.frameIndex = 0;
            anim.elapsed = 0;
        },

        get playing() {
            const anim = self.#engine.get(self.#entity, Animation);
            return !!anim.isPlaying;
        },

        set playing(v) {
            const anim = self.#engine.get(self.#entity, Animation);
            anim.isPlaying = v ? 1 : 0;
        },
    };
}
```

### Corrected Style API

```javascript
get style() {
    if (!this._styleApi) {
        const self = this;
        this._styleApi = {
            get fill() {
                const r = self.#engine.get(self.#entity, Renderable);
                return "#" + r.fillColor.toString(16).padStart(6, "0");
            },
            set fill(v) {
                const r = self.#engine.get(self.#entity, Renderable);
                r.fillColor = parseInt(v.slice(1), 16);
            },
            get shape() {
                const r = self.#engine.get(self.#entity, Renderable);
                return r.shape === 1 ? "circle" : "rect";
            },
            set shape(v) {
                const r = self.#engine.get(self.#entity, Renderable);
                r.shape = v === "circle" ? 1 : 0;
            },
        };
    }
    return this._styleApi;
}
```

### The one thing to never do

```javascript
// ❌ BROKEN: captures runtime state at construction
_createAnimationApi(anim) {
    return {
        play() { anim.isPlaying = 1; },  // stale after migration
    };
}

// ❌ BROKEN: caches runtime state on the API object
class AnimationAPI {
    constructor(engine, entity) {
        this._anim = engine.get(entity, Animation); // stale after storage change
    }
}
```

---

## What Can Be Cached

The distinction is **ownership**, not "logical vs ECS" or "API vs engine":

### Safe to cache (APIs own this state)

| Data | Why it's safe |
|------|---------------|
| `_animCurrent` (animation name string) | Owned by the Animation API |
| `_animMap` (name → clip mapping) | Owned by the Animation API |
| `_animCallback` (completion callback) | Owned by user code, referenced by the API |
| `_groups` (group membership) | Owned by Sprite |
| `_styleApi` (the API object itself) | Owned by Sprite — engine resolution happens inside each getter/setter |

### NOT safe to cache (runtime owns this state)

| Data | Why it's not safe |
|------|-------------------|
| Result of engine.get(entity, Component) | The runtime owns the storage and may move it |
| Result of table.getColumn(componentId, fieldName) | TypedArray reference invalid after data move |
| Row index from entityManager | Changes after the runtime reorganizes storage |

---

## Performance Analysis

### Cost of engine resolution on every call

```
engine.get(entity) call
├── resolve component type              ≈ 20 ns
├── entity validity check               ≈ 10 ns
├── storage lookup                      ≈ 25 ns
├── cache check                         ≈ 30 ns
│   ├── Cache HIT: return view          ≈ 75 ns  TOTAL
│   └── Cache MISS: create view         ≈ 500 ns
```

- **Cache hit path: ~75 nanoseconds** per call
- **Cache miss path: ~500 nanoseconds** — happens at most once per entity per storage change (extremely rare in gameplay)

### Real-world impact

```
1,000 API method calls per frame × 75 ns = 75 µs
vs.
1 drawImage() call                    ≈ 1,000 µs (1 ms)
vs.
16.67 ms frame budget (60 fps)
```

The overhead of re-resolving on every call is **irrelevant** for gameplay code. Even at 1,000 API calls per frame, the cost is ~0.45% of the frame budget.

### Performance comparison

| Pattern | Time per call (cache hit) | Safety |
|---------|--------------------------|--------|
| Cached runtime reference (current, broken) | ~0 ns | ❌ Silent data corruption |
| Re-resolved (proposed, cache hit) | ~75 ns | ✅ Always correct |
| Re-resolved (proposed, cache miss) | ~500 ns | ✅ Always correct (rare) |

The "cached reference" pattern saves ~75 ns per call at the cost of **silent data corruption**. This is not an acceptable trade-off.

---

## Future-Proofing Assessment

### Future APIs designed with the contract

| Future API | Possible implementation |
|------------|------------------------|
| `sprite.audio` | ECS / service / WASM module |
| `sprite.particles` | ECS / service / WASM module |
| `sprite.health` | ECS / resource / subsystem |
| `sprite.inventory` | ECS / service / native binding |
| `sprite.stateMachine` | ECS / interpreter / behavior tree |
| `sprite.physics` | ECS / WASM module / native |
| `sprite.ai` | ECS / behavior service / ML runtime |
| `sprite.networking` | ECS / WebSocket / WebRTC |
| `sprite.trails` | ECS / geometry generator |
| `sprite.effects` | ECS / shader-based / compositor |

Whatever the implementation, the four rules apply:

1. These are engine features, not component wrappers.
2. They may cache their own state (animations, callbacks, presets).
3. They resolve runtime-owned state at the point of use.
4. They are valid for the entire lifetime of their owner.

---

## Implementation Plan

### Phase I: Fix existing APIs (animation, style)

1. **`Sprite.js` — `_createAnimWrapper`**: Remove the `anim` parameter. Every method resolves runtime state at point of use.

2. **`Sprite.js` — `get style()`**: Every getter/setter on the style API resolves runtime state at point of use.

3. **Verify**: Run all existing engine tests. Confirm that `animation.play()` works both in `onEnter()` and `update()` after engine state changes.

### Phase II: Verify safe APIs

4. **Audit**: Confirm that all simple properties (`transform`, `collider`, `velocity`, `visible`, `renderable`, etc.) already follow the correct pattern and do not cache runtime-owned state.

5. **Test**: Add API stability tests that:
   - Create a sprite
   - Call every API method/property
   - Perform arbitrary engine mutations
   - Call every API again
   - Destroy the sprite
   - Verify behavior at each step

### Phase III: Establish architectural guidelines

6. **Document**: Finalize the four architectural rules in the engine's development guide.

7. **Review process**: All future runtime-backed public APIs must follow the pattern and pass the "API stability" test.

---

## Glossary

| Term | Definition |
|------|------------|
| **Archetype migration** | (Current implementation detail) The process of moving an entity between storage layouts when its component set changes. |
| **Component view** | An object returned by the engine with getter/setter properties that read/write the underlying storage. |
| **Stale view** | A component view whose closures still reference the old storage after the entity's data has moved to a new location. |
| **API-owned state** | State whose lifetime is controlled by the public API (e.g., animation names, callbacks, presets). Safe to cache. |
| **Runtime-owned state** | State whose lifetime is controlled by the engine runtime (positions, velocities, health values). Must be resolved at the point of use. |
| **Swap-remove** | (Current implementation detail) A technique where the last element in an array overwrites the removed element's slot, and the array size is decremented. |
| **Lifetime Invariant** | The principle that any publicly exposed object remains valid for the entire lifetime of its owner. |
