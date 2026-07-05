# ECS Audio Integration — Architecture & Design

## 1. Architecture Overview

The ECS audio layer is a **thin bridge** between two existing systems:

```
┌─────────────────────────────────────────────────────────┐
│                    ECS World                             │
│                                                          │
│  ┌──────────────┐  ┌──────────────────────────────────┐ │
│  │ AudioSource   │  │  AudioSystem                     │ │
│  │  (tag)        │  │  ┌────────────────────────────┐  │ │
│  │               │  │  │ _configs: Map<entityId,    │  │ │
│  │  Marker for   │  │  │   AudioSourceConfig>       │  │ │
│  │  "this entity │  │  │                            │  │ │
│  │  has audio"   │  │  │ _instances: Map<entityId,  │  │ │
│  │               │  │  │   AudioInstance>           │  │ │
│  └──────────────┘  │  └─────────────────────────────┘  │ │
│                    └──────────┬─────────────────────────┘ │
│                               │                           │
│                    ┌──────────▼──────────┐                │
│                    │   AudioManager      │                │
│                    │  (World resource)   │                │
│                    └──────────┬──────────┘                │
│                               │                           │
│                    ┌──────────▼──────────┐                │
│                    │  Sound → instances  │                │
│                    │  + pool management  │                │
│                    └─────────────────────┘                │
└─────────────────────────────────────────────────────────┘
```

**Ownership boundaries:**

| Concern | Owner | Location |
|---------|-------|----------|
| "This entity emits audio" | `AudioSource` tag | ECS archetype |
| Definition key + per-entity overrides | `AudioSystem._configs` | Map in system |
| AudioInstance ↔ entity mapping | `AudioSystem._instances` | Map in system |
| Playback, pooling, attenuation | `AudioManager` | audio/ module |
| Backend, effects, groups | AudioManager → Backend | audio/ module |
| Listener position sync | AudioSystem → AudioManager | Updated each frame |

---

## 2. AudioSource API

```js
class AudioSource {}
```

**Zero-schema tag component.** AudioSource is intentionally a bare marker. The rationale:

**What AudioSource IS:**
- A declarative tag: "this entity owns a spatial audio emitter"
- Enables ECS queries like `{ all: [AudioSource, WorldTransform] }`

**What AudioSource is NOT:**
- A data container for AudioDefinition fields
- A playback controller
- A sound instance

**Why no schema fields:**

| Excluded field | Reason for exclusion |
|---|---|
| `key` (string) | Strings can't be stored in ECS typed arrays |
| `volume` | Already in AudioDefinition; per-entity override goes in AudioSystem config |
| `loop` | Already in AudioDefinition; override if needed goes in config |
| `group` | Already in AudioDefinition; override if needed goes in config |
| `spatial` | Always true when attached to an entity (the entity IS the emitter position) |
| `minDistance` / `maxDistance` | Already in AudioDefinition |
| `attenuation` | Already in AudioDefinition |

**The tag approach matches existing patterns:**
- `Children` is an empty-schema tag, with data in `HierarchyGraph._children`
- `StaticTag`, `PlayerTag`, etc. are empty-schema tags

**Entity configuration is done through AudioSystem:**

```js
// AudioSystem method:
audioSystem.play(entity, "engine", { volume: 0.8 });

// World convenience:
world.addAudioSource(entity, "engine", { volume: 0.8 });
// Shorthand for:
//   entity.add(AudioSource);
//   audioSystem.play(entity, "engine", { volume: 0.8 });
```

**AudioSourceConfig** (internal to AudioSystem):

```js
{
  key: "engine",          // AudioDefinition key (string)
  volume: 0.8,            // Per-entity volume multiplier (default: 1)
  loop: false,            // Override AudioDefinition.loop (optional)
  group: "sfx",           // Override AudioDefinition.group (optional)
}
```

Only `key` is required. All other fields default to the AudioDefinition's values. The system merges: `config[key] ?? definition[key]`.

---

## 3. AudioSystem Design

```js
import { System } from "../core/System.js";
import { AudioSource } from "./AudioSource.js";
import { WorldTransform } from "../components/WorldTransform.js";
import { AudioManager } from "../../audio/AudioManager.js";
import { Transform } from "../components/Transform.js";

export class AudioSystem extends System {
  static query = { all: [AudioSource, WorldTransform] };
  static priority = 1;  // After MovementSystem(0), before CollisionSystem(2)

  constructor() {
    super();
    this._configs = new Map();    // entityId → AudioSourceConfig
    this._instances = new Map();  // entityId → AudioInstance
    this._onEntityDestroyed = (entity) => this._onEntityDestroyed(entity);
  }

  onAdded(world) {
    world.onEntityDestroyed(this._onEntityDestroyed);
  }

  onRemoved(world) {
    world.offEntityDestroyed(this._onEntityDestroyed);
  }

  configure(entity, key, overrides = {}) {
    this._configs.set(entity, {
      key,
      volume: overrides.volume ?? null,   // null = use definition default
      loop: overrides.loop ?? null,
      group: overrides.group ?? null,
    });
  }

  play(entity, key, overrides = {}) {
    this.configure(entity, key, overrides);
    if (!this._instances.has(entity)) {
      this._startPlayback(entity);
    }
  }

  stop(entity) {
    const instance = this._instances.get(entity);
    if (instance) {
      instance.stop();
      this._releaseInstance(entity, instance);
    }
    this._configs.delete(entity);
    this._instances.delete(entity);
  }

  update(ctx, dt) {
    const audio = ctx.resources.get(AudioManager);
    if (!audio) return;

    const tables = ctx.tables();

    // 1. Start playback for new entities
    for (const table of tables) {
      const entities = table.getEntities();
      for (let i = 0; i < entities.length; i++) {
        const entity = entities[i];
        if (this._configs.has(entity) && !this._instances.has(entity)) {
          this._startPlayback(entity, audio);
        }
      }
    }

    // 2. Sync spatial positions
    for (const table of tables) {
      const entities = table.getEntities();
      const wtCol = table.getColumn(this._compiled.componentIds.get(WorldTransform), "x");
      // ...read x, y from WorldTransform column, write to instance
      for (let i = 0; i < entities.length; i++) {
        const entity = entities[i];
        const instance = this._instances.get(entity);
        if (instance) {
          const row = table.getRow(entities[i]);
          const xCol = table.getColumn(wtId, "x");
          const yCol = table.getColumn(wtId, "y");
          instance.x = xCol[row];
          instance.y = yCol[row];
        }
      }
    }

    // 3. Sync listener
    if (Camera.main) {
      audio.listener.x = Camera.main.x;
      audio.listener.y = Camera.main.y;
    }

    // 4. Handle entities that lost AudioSource
    for (const [entity, instance] of this._instances) {
      if (!ctx.world.has(entity, AudioSource)) {
        instance.stop();
        this._releaseInstance(entity, instance);
        this._instances.delete(entity);
        this._configs.delete(entity);
      }
    }
  }

  _startPlayback(entity, audio) {
    const config = this._configs.get(entity);
    if (!config) return;

    const opts = {};
    if (config.volume !== null) opts.volume = config.volume;
    if (config.loop !== null) opts.loop = config.loop;
    if (config.group !== null) opts.group = config.group;

    const instance = audio.play(config.key, opts);
    if (instance) {
      this._instances.set(entity, instance);
    }
  }

  _releaseInstance(entity, instance) {
    // Instance stops via stop(). The natural onEnded callback
    // will return it to the pool. If we need to force-return,
    // a minimal public releaseInstance() on Sound would be added.
  }

  _onEntityDestroyed(entity) {
    this.stop(entity);
  }
}
```

**Why priority 1:**

| System | Priority | Reason |
|--------|----------|--------|
| HierarchySystem | -10 | Computes WorldTransform |
| MovementSystem | 0 | Moves entities |
| **AudioSystem** | **1** | **Syncs positions AFTER movement, BEFORE render/audio tick** |
| AnimationSystem | 1 | Visual animation |
| CollisionSystem | 2 | Physics |
| RenderSystem | 3 | Draws frame |

Position 1 ensures WorldTransform is fresh. AudioManager.update(dt) is called externally (in the game loop's main update), so AudioSystem writes updated positions to instances before AudioManager reads them.

---

## 4. Data Flow

```
Entity has AudioSource + WorldTransform
  │
  ▼
AudioSystem.update(ctx, dt)
  │
  ├── 1. For each entity with config but no instance:
  │      audioManager.play(key, opts) → AudioInstance
  │      store in _instances[entityId]
  │
  ├── 2. For each entity with instance:
  │      read WorldTransform.x/y from typed column
  │      instance.x = value
  │      instance.y = value
  │      (spatial volume auto-computed by AudioInstance._computeSpatialVolume)
  │
  ├── 3. Sync listener:
  │      audioManager.listener.x = Camera.main.x
  │      audioManager.listener.y = Camera.main.y
  │
  └── 4. For stopped/removed entities:
         instance.stop()
         release tracking
  │
  ▼
AudioManager.update(dt)
  │
  ├── spatial sounds recompute volume based on instance.x/y vs listener
  ├── music fade envelopes progress
  ├── transitions process
  │
  ▼
Backend plays/updates audio
```

---

## 5. Transform Synchronization

**Use WorldTransform, not Transform.** Audio is spatial in world space. HierarchySystem computes WorldTransform at priority -10. By priority 1, it's guaranteed fresh.

The sync is a direct typed-array read → property write per entity per frame:

```js
const xCol = table.getColumn(wtId, "x");
const yCol = table.getColumn(wtId, "y");
instance.x = xCol[row];
instance.y = yCol[row];
```

**No per-frame allocation.** The loop reads columns directly — no proxy objects, no wrapper allocation.

**How hierarchy affects emitters:** If an entity moves relative to its parent, HierarchySystem updates WorldTransform, which AudioSystem then reads. Emitters follow their entity through the transform hierarchy automatically. No special-case code needed.

---

## 6. Listener Synchronization

**Recommendation: Automatic sync from Camera.main.**

```js
// In AudioSystem.update:
const cameraModule = Camera;  // imported at module level
if (cameraModule.main) {
  audio.listener.x = cameraModule.main.x;
  audio.listener.y = cameraModule.main.y;
}
```

**Why this is the right approach:**

| Approach | Pros | Cons |
|----------|------|------|
| **Camera.main (recommended)** | Zero config, follows existing Camera.main convention | Requires Camera import |
| Tagged entity `[AudioListener]` | Configurable per-scene | More boilerplate, component needed |
| Manual set | Full control | Every scene must set it |
| SceneManager integration | Automatic per-scene | Couples to SceneManager |

The `Camera.main` static is already the established pattern (see `Camera.setMain()`). It's implicitly set by the game code that owns the camera. AudioSystem can read it without additional configuration.

**Configurability:** Add AudioSystem.camera property to allow overriding:

```js
// Default: auto-sync from Camera.main
// Can be overridden to follow a specific entity:
audioSystem.followEntity = playerEntity;
// Or disabled entirely:
audioSystem.followEntity = null;
```

---

## 7. Lifecycle

| Event | Behavior |
|-------|----------|
| **AudioSource added** (via `addComponent`) | System detects in update; if a config exists, starts playback |
| **AudioSystem.play(entity, key)** | Creates config + starts playback immediately via `audioManager.play()` |
| **Entity moves each frame** | System syncs WorldTransform → instance.x/y each update |
| **AudioSource removed** | System detects on next update; calls `instance.stop()`, cleans up |
| **Entity destroyed** | Via `World.onEntityDestroyed` callback; calls `instance.stop()`, cleans up |
| **System removed** | Stops all tracked instances |
| **World update with no changes** | No-op — only syncs positions (zero allocations) |
| **Cell unload** | Entity destroyed → `onEntityDestroyed` callback → clean stop |
| **Key changes at runtime** | Call `audioSystem.play(entity, newKey)` — stops old, starts new |

**Stop vs release:** `instance.stop()` stops playback. The instance's `_onEnded` callback triggers `Sound._returnInstance()`, returning it to the pool. For looping sounds, stop() triggers ended → pool return. For one-shots already ended, the pool already has the instance.

**What about the gap between stop and pool return?** The instance remains in `Sound._activeInstances` until `_returnInstance` fires. This is acceptable — it's a brief window, and the old instance will be overwritten if a new play() call creates another one (subject to `maxInstances`).

---

## 8. ECS-Friendly Playback Control

**Recommendation: Component state over imperative methods.**

Instead of:

```js
audioSource.play();
audioSource.stop();
audioSource.pause();
```

Use:

```js
// Add AudioSource tag → auto-play
// Remove AudioSource tag → auto-stop
// For pause: new Paused component (or audioSource.isPlaying = false)
```

**Why state is better:**

| Approach | ECS fit | Determinism | Serialization |
|----------|---------|-------------|---------------|
| Imperative methods | Poor — methods are not data | No — order-dependent | Can't serialize |
| Component state | Natural — components ARE data | Yes — state drives behavior | Native support |

**Future AudioSource schema (Phase 2):**

```js
class AudioSource {
  static schema = {
    isPlaying: "u8",  // 0 = stopped, 1 = playing (default)
    volume: "f32",    // per-entity volume override (-1 = use definition default)
  };
}
```

This avoids strings in the schema. `volume = -1` signals "use definition default." `isPlaying` controls playback state declaratively.

But wait, this requires a non-tag component with fields. That's fine — it just means AudioSource needs schema when we add fields. For Phase 33 (initial), it's a tag with config stored in AudioSystem's Map.

**Phase roadmap:**

1. Phase 33 (this): Tag + AudioSystem config Map
2. Future: Add schema fields to AudioSource, deprecate Map config

---

## 9. One-Shot Sounds

**Recommendation: Do NOT add one-shots to AudioSource.**

AudioSource represents a **persistent spatial emitter** — an entity that continuously produces sound. One-shots are transient fire-and-forget effects: an explosion, a coin pickup, a UI click.

**Why they're separate:**

| Dimension | AudioSource (persistent) | One-shot (transient) |
|-----------|-------------------------|---------------------|
| Lifetime | Entity lifetime | Instantaneous |
| Position tracking | Every frame | Fixed at fire time |
| Entity association | Yes | Maybe not |
| Pooling | Long-lived instance | Short burst |

**Future architecture for one-shots:**

Option A — **AudioEvent** (recommended):

```js
// Define event:
class ExplosionEvent {
  static fields = ["x", "y", "key"];
}

// Emit:
world.events.emit(ExplosionEvent, { x: 10, y: 20, key: "explosion" });

// System processes:
class OneShotAudioSystem extends System {
  update(ctx, dt) {
    for (const evt of ctx.world.events.read(ExplosionEvent)) {
      ctx.resources.get(AudioManager).play(evt.key, { x: evt.x, y: evt.y });
    }
  }
}
```

This reuses the existing `EventChannel` / `Events` infrastructure (already in the codebase) and doesn't conflict with AudioSource.

Option B — **AudioCommand** component:

```js
class AudioCommand {
  static schema = { key: "u32", x: "f32", y: "f32", _frame: "u32" };
}
```

A system reads + clears these each frame. More allocation-heavy than events.

**Recommendation:** Use EventChannel (Option A). The Events system already exists, supports per-frame clearing, and is the natural fit for transient actions.

---

## 10. Streaming Compatibility

**No special-case code required.** AudioSource is an ECS component on an entity. When the StreamingManager unloads a cell:

1. `StreamingManager.unload()` calls `world.destroyEntity()` for each entity
2. `World.destroyEntity()` fires `_entityDestroyedCallbacks`
3. `AudioSystem._onEntityDestroyed()` fires → `instance.stop()`, cleans up tracking

**When a cell loads again:**

1. Entities are created and configured (by game code, probably via prefab)
2. `AudioSource` component re-added, `AudioSystem.play()` called
3. New AudioInstance created from pool, playback begins

**No dangling references.** The `_onEntityDestroyed` callback guarantees cleanup. No stale AudioInstances remain after entity destruction.

**Streaming compatibility matrix:**

| Operation | Audio behavior | Mechanism |
|-----------|---------------|-----------|
| Cell unload | Stop + clean up | Entity destroyed → callback |
| Entity in unloaded cell | No instance exists | Entity wrapped in destroy |
| Cell reload | Fresh playback | New entity → new audio |
| Entity pooling (entity reuse) | Works naturally | New entityId → new tracking |
| Destroy entity manually | Same as cell unload | Same callback path |

---

## 11. Serialization

**AudioSource as a tag serializes as present/absent.** The EntitySerializer will include `"AudioSource"` in the entity's component list. When deserialized, the entity gets the AudioSource component.

**The key and overrides are NOT in ECS storage.** They live in `AudioSystem._configs` (a runtime Map). This means:

- **Serialization of AudioSource:** Just the tag — "entity has audio"
- **Config persistence:** Handled by scene/level serialization at a higher level (stored alongside other asset references like prefab definitions)
- **What should never serialize:** AudioInstance references (they're runtime handles)

**Future serialization approach:** When AudioSource gains schema fields, the key can be stored as a registry-assigned numeric ID:

```js
class AudioSource {
  static schema = {
    definitionId: "u32",  // audioSystem.definitionId("engine") → numeric
    volume: "f32",
  };
}
```

For now, the tag is serializable and the config is re-established by game code (e.g., prefab instantiation or scene setup).

---

## 12. Scene Compatibility

**AudioSource ↔ AudioScene: Independent.**

- `AudioScene` is a snapshot/restore mechanism for AudioManager state (volumes, groups, playing sounds)
- `AudioSource` is an ECS component on a World entity

**Interaction:**

| Scenario | What happens |
|----------|-------------|
| SceneManager changes scene | New World → new AudioManager → new AudioSystem |
| AudioScene snapshot taken | Captures AudioManager state, NOT ECS state |
| AudioScene restored | Restores volumes/groups, restarts tracked sounds by key |
| AudioSource exists during snapshot | The underlying AudioInstance is captured (if persistent) |

**No coupling needed.** AudioScene snapshots capture AudioManager's running instances. AudioSource creates instances through AudioManager. A snapshot taken while AudioSource instances are playing will include them. When restored, those instances restart. This "just works" because AudioSource → AudioInstance → AudioManager → AudioScene is a dependency chain, not a circular one.

---

## 13. Edge Cases

| Edge Case | Behavior |
|-----------|----------|
| **Remove AudioSource while playing** | On next update, system detects missing component, stops instance, cleans up |
| **Change Transform every frame** | System syncs WorldTransform each update — natural, no allocation |
| **Change AudioSource key at runtime** | Call `audioSystem.play(entity, newKey)` → stops old, starts new |
| **Pause the world** | AudioManager.pauseAll() or system-level pause. Instances pause. |
| **Scene transition** | Old World destroyed → instances cleaned up. New World sets up fresh. |
| **Duplicate emitters** | Two entities can have the same key. Two independent instances. |
| **Overflow (maxInstances reached)** | AudioManager's Sound handles this (drop-new or replace-oldest). System gets null → no instance. |
| **Missing AudioDefinition** | `audioManager.play(unknownKey)` returns null. System handles by not storing an instance. |
| **Entity destroyed before update runs** | `onEntityDestroyed` callback fires immediately, cleans up before next update. |
| **System disabled** | No updates run. Positions not synced. Instances continue with last known position. |
| **Multiple worlds** | Each world has its own AudioSystem + AudioManager. Fully independent. |
| **Camera.main is null** | Listener stays at origin. Spatial audio works relative to (0,0). |

---

## 14. Implementation Plan

**Commit 1 — AudioSource component**

Files: `ecs/audio/AudioSource.js`, `ecs/audio/index.js`

```js
// AudioSource.js
export class AudioSource {}
```

```js
// index.js
export { AudioSource } from "./AudioSource.js";
```

**Commit 2 — AudioSystem (initial)**

Files: `ecs/audio/AudioSystem.js`

- Singleton system with `static query = { all: [AudioSource, WorldTransform] }`
- Internal `_configs` and `_instances` maps
- `play(entity, key, overrides)`, `stop(entity)`, `configure(entity, key, overrides)`
- Update loop: start new, sync positions, remove stale

**Commit 3 — World integration**

Modify: `ecs/core/World.js`, `ecs/index.js`

- `world.addAudioSource(entity, key, overrides)` convenience
- Export `AudioSystem` from ECS index
- Register in relevant builders

**Commit 4 — Listener sync**

- AudioSystem.update syncs `Camera.main` → `audioManager.listener`
- Configurable `audioSystem.followEntity` property

**Commit 5 — Tests**

File: `tools/ecs/tests/Audio.test.js`

- AudioSource add/remove
- Instance creation
- Position sync
- Lifecycle (destroy, cell unload)
- Edge cases

**Commit 6 — Documentation**

- Update docs/architecture.md with Audio section

---

## 15. Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| AudioSource type | Tag component (no schema) | Strings incompatible with typed arrays; follows Children/Trail pattern |
| Config storage | AudioSystem._configs Map | Key strings live here; avoids ECS schema limitations |
| Instance ownership | AudioSystem._instances Map | O(1) entity→instance lookup |
| Transform source | WorldTransform | World-space position; HierarchySystem guarantees freshness |
| Update priority | 1 | After MovementSystem(0), before CollisionSystem(2) |
| Listener sync | Camera.main | Established pattern; zero config |
| Playback control | State-based (component) | ECS-native; serializable; deterministic |
| One-shots | AudioEvent (future, via EventChannel) | Reuses existing Events infrastructure |
| Pooling | AudioManager owns it | AudioSystem just calls play/stop |
| Streaming | No special code | Entity destruction callback handles cleanup |
| Serialization | Tag serializes; config is runtime | Key is an asset reference, not ECS data |
| AudioScene | Independent | Captures AudioManager state; AudioSource instances are transparent |
