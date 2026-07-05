# Jygame Audio Architecture Audit

> **Date:** 2026-07-05
> **Scope:** `audio/` (including `backends/`, `effects/`) + external integration points
> **Purpose:** Build a complete factual understanding before any ECS integration design

---

## 1. High-level architecture

### Major classes and ownership

```
AudioManager (central coordinator)
 |
 |-- Map<string, AudioDefinition>     (_definitions)
 |     Registered sound descriptors (immutable config)
 |
 |-- Map<string, Sound>               (_sounds)
 |     Directly added sounds (via add())
 |
 |-- Map<string, Sound>               (_soundsByDefinition)
 |     Lazy-created sounds (first play() after define())
 |
 |-- Map<string, Music>               (_musicCache)
 |     Music track instances
 |
 |-- Map<string, AudioGroup>          (_groups)
 |     Five default groups: master, music, sfx, ui, ambient
 |
 |-- Map<string, AudioScene>          (_scenes)
 |     Named state snapshots
 |
 |-- AudioListener                    (_listener)
 |     Position: {x, y}
 |
 |-- AudioBackend                     (_backend)
 |     HtmlAudioBackend or WebAudioBackend
 |
 |-- EffectChain                      (_masterEffectChain)
 |     Master bus effects

Sound (per-definition)
 |-- ObjectPool<AudioInstance>        (_pool)
 |-- AudioInstance[]                  (_activeInstances)
 |-- EffectChain                      (_effectChain)
 |-- volume, group, maxInstances, attenuation, persistent

Music (per-track)
 |-- AudioBackend.Playback            (_playback, lazy)
 |-- volume, fadeVolume, loop
 |-- EffectChain (optional)

AudioInstance
 |-- AudioBackend.Playback            (_playback)
 |-- volume, spatial(x,y), minDistance, maxDistance
 |-- overrideSoundVolume, overrideGroup

AudioGroup
 |-- volume, muted
 |-- EffectChain

AudioScene
 |-- snapshot (plain object: master state, groups, music, sounds)
```

### Ownership diagram

```
Game Application (developer-managed)
  |
  +-- AudioManager (1 instance, created by developer)
  |     |
  |     +-- AudioBackend
  |     +-- AudioListener
  |     +-- 5 AudioGroups (default)
  |     +-- N AudioDefinitions (registered)
  |     +-- M Sounds (lazy-created or added)
  |     |     +-- ObjectPool<AudioInstance>
  |     |     +-- AudioInstance[] (active)
  |     +-- K Music tracks
  |     +-- P AudioScenes (snapshots)
  |
  +-- ECS World (completely separate)
        +-- Systems, Components
        +-- NO audio references
```

### Runtime flow

1. **Setup:** Developer creates `AudioManager`, optionally with `WebAudioBackend`
2. **Definition:** `audio.define('key', { source, group, volume, ... })` registers an `AudioDefinition`
3. **Loading:** `AudioLoader.load(path)` or `AudioLoader.loadBuffer(path, ctx)` — called manually, cached globally
4. **Playback:** `audio.play('key', { x, y })` → lazy-creates `Sound` if needed → acquires `AudioInstance` from pool → creates `AudioBackend.Playback` → starts playback
5. **Update:** `audio.update(dt)` → spatial re-apply → listener sync → music fades → transitions
6. **Cleanup:** `audio.clear()` or `audio.destroy()` → stops all, drains pools, destroys backend

---

## 2. Public API

### AudioManager

| Method | Description |
|--------|-------------|
| `constructor(options)` | Accepts `backend`, `attenuation`, `inverseRolloff`. Creates 5 default groups. Calls `backend.unlock()`. |
| `add(key, asset)` | Register a raw `Audio` element or `AudioBuffer` directly as a `Sound`. Throws on duplicate key. |
| `define(key, config)` | Register an `AudioDefinition` (lazy — Sound created on first `play()`). Throws on duplicate key. |
| `undefine(key)` | Remove definition + destroy its lazy Sound. |
| `play(name, options)` | Play a defined sound. Options: `x`, `y`, `volume`, `loop`, `group`, `minDistance`, `maxDistance`. Returns `AudioInstance` or `null` (overflow). |
| `music(key)` | Get or create a `Music` track from a definition or existing Sound. |
| `get(key)` / `has(key)` / `remove(key)` | Direct sound registry access. |
| `getSound(key)` | Lookup in both `_sounds` and `_soundsByDefinition`. |
| `getMusic(key)` / `hasMusic(key)` | Music cache lookup. |
| `hasDefinition(key)` / `getDefinition(key)` | Definition registry. |
| `getGroup(name)` / `group(name)` | Get or lazy-create a group. |
| `forEachGroup(fn)` / `forEachSound(fn)` / `forEachMusic(fn)` | Iteration helpers. |
| `pauseAll()` / `resumeAll()` / `stopAll()` | Global batch control. |
| `mute()` / `unmute()` | Master mute toggle. |
| `snapshot(name)` | Save current state as named `AudioScene`. |
| `restoreSnapshot(name)` | Restore a snapshot immediately. |
| `transition(name, options)` | Transition to a snapshot: `"cut"`, `"fadeOut"`, `"fadeIn"`, `"crossfade"`. |
| `pauseScene(name)` / `resumeScene(name)` / `stopScene(name)` | Batch control over a snapshot's sounds/music. |
| `suspend()` / `resume()` | Backend suspend/resume (Web Audio API context). |
| `clear()` | Destroy all sounds, music, definitions (not groups). |
| `destroy()` | Full teardown: clear + destroy backend + groups + scenes. |
| `update(dt)` | Per-frame: spatial re-apply → listener sync → music fades → transition processing. |

| Property | Type | Description |
|----------|------|-------------|
| `listener` | `AudioListener` | Get the listener object. |
| `masterVolume` | number [0,1] | Master volume. |
| `masterMuted` | boolean | Master mute. |
| `master` | `{ effects: EffectChain }` | Master bus effect chain accessor. |
| `attenuation` | string | Global attenuation model default. |
| `inverseRolloff` | number | Rolloff factor for inverse model. |
| `transitionVolume` | number | Current transition fade volume (readonly). |
| `supportsGroupGain` | boolean | Whether backend supports per-group gain nodes. |
| `effectiveMasterVolume` | number | 0 if muted, else `masterVolume`. |

### AudioDefinition

Immutable config object created by `AudioManager.define()`.

| Property | Default | Description |
|----------|---------|-------------|
| `source` | (required) | Asset path string. |
| `group` | `"master"` | Target audio group. |
| `volume` | `1` | Base volume [0,1]. |
| `loop` | `false` | Whether sound loops. |
| `maxInstances` | `32` | Maximum concurrent instances. |
| `spatial` | `false` | Whether spatial by default. |
| `minDistance` | `32` | Full-volume radius. |
| `maxDistance` | `512` | Silence radius. |
| `attenuation` | `"linear"` | Attenuation model. |

### Sound

Created by `AudioManager.add()` or lazy-created by `AudioManager.play()`.

| Property/Method | Description |
|----------------|-------------|
| `volume` | Per-sound volume [0,1]. |
| `group` | Group name string. |
| `persistent` | Whether tracked by AudioScene snapshots. |
| `attenuation` | Override global attenuation model (or null). |
| `effects` | `EffectChain` instance. |
| `isPlaying` | Whether any active instances exist. |
| `play(options)` | Acquire instance from pool, configure spatial, start. |
| `returnInstance(instance)` | Manually return an instance to pool. |
| `destroy()` | Stop all, drain pool. |

### Music

Created by `AudioManager.music()`.

| Property/Method | Description |
|----------------|-------------|
| `volume` | Volume [0,1]. |
| `loop` | Whether looping. |
| `isPlaying` / `isPaused` | State queries. |
| `currentTime` | Seek position. |
| `duration` | Total duration. |
| `effects` | Optional `EffectChain`. |
| `play()` | Start/resume. |
| `pause()` | Pause. |
| `stop()` | Stop + destroy playback. |
| `fadeIn(seconds)` | Fade from 0 to volume. |
| `fadeOut(seconds)` | Fade from current to 0, then stop. |
| `crossFade(other, seconds)` | Fade out this, fade in other. |
| `startFadeIn(seconds)` | Alias for `fadeIn`. |
| `destroy()` | Stop + cleanup. |

### AudioInstance

Created by `Sound.play()`, pooled.

| Property/Method | Description |
|----------------|-------------|
| `volume` | Per-instance volume [0,1]. |
| `loop` | Loop flag (delegates to backend). |
| `muted` | Mute flag (delegates to backend). |
| `currentTime` | Seek (delegates to backend). |
| `duration` | Total duration (delegates to backend). |
| `paused` / `ended` | State (delegates to backend). |
| `isPlaying` | `!paused && !ended`. |
| `spatial` | Whether spatial audio enabled. |
| `x` / `y` | Spatial position (setting triggers volume+position update). |
| `minDistance` / `maxDistance` | Spatial falloff radii. |
| `play()` | Start playback (calls `_applyVolume()` first). |
| `pause()` | Pause. |
| `stop()` | Stop. |
| `restart()` | Stop + play. |
| `destroy()` | Destroy backend playback, null references. |

### AudioGroup

| Property/Method | Description |
|----------------|-------------|
| `volume` | Group volume [0,1]. |
| `muted` | Group mute. |
| `effects` | `EffectChain` instance. |

### AudioListener

| Property | Description |
|----------|-------------|
| `x` | Listener X position. |
| `y` | Listener Y position. |

### AudioScene (snapshot)

| Method | Description |
|--------|-------------|
| `save()` | Capture current AudioManager state to internal snapshot. |
| `restore()` | Restore AudioManager state from snapshot. |
| `forEachSound(fn)` | Iterate snapshot sounds paired with live Sound objects. |

---

## 3. Asset pipeline

### Loading

Two paths:

1. **HTML Audio (`HtmlAudioBackend`):**
   - `AudioLoader.load(path)` → creates `new Audio()`, sets `src`, waits for `canplaythrough`
   - Cached in `AudioLoader._cache` (module-level `Map`)
   - `AudioLoader.get(key)` returns cached `HTMLAudioElement`

2. **Web Audio (`WebAudioBackend`):**
   - `AudioLoader.loadBuffer(path, audioContext)` → `fetch` → `decodeAudioData`
   - Cached in `AudioLoader._bufferCache` (module-level `Map`)
   - `AudioLoader.getBuffer(key)` returns cached `AudioBuffer`

### What define() creates

`audio.define('key', config)`:
- Creates an `AudioDefinition` (simple config holder)
- Stores it in `AudioManager._definitions`
- Does NOT load the asset yet
- Does NOT create a Sound yet

### Lazy Sound creation

On first `audio.play('key')`:
1. Look up `AudioDefinition` from `_definitions`
2. Look for existing `Sound` in `_soundsByDefinition`
3. If not found:
   - Load asset from `AudioLoader` (based on backend type)
   - Create `Sound(asset, manager, { maxInstances, backend })`
   - Copy `volume`, `group` from definition to Sound
   - Store in `_soundsByDefinition`
4. Call `sound.play(spatialOpts)` → acquire instance, start playback

### What is immutable vs mutable

| Object | Immutable | Mutable |
|--------|-----------|---------|
| `AudioDefinition` | `source` | Nothing (no setters) |
| `Sound` | `_asset`, `_pool.maxSize` | `volume`, `group`, `persistent`, `attenuation`, `effects` |
| `Music` | `_asset` | `volume`, `loop`, `currentTime`, `effects` |
| `AudioInstance` | `_playback` (while alive) | `volume`, `x`, `y`, `loop`, `muted`, `currentTime`, `minDistance`, `maxDistance` |
| `AudioGroup` | `_name` | `volume`, `muted`, `effects` |

---

## 4. Playback pipeline

Full trace of `audio.play('player_hit', { x: 100, y: 200 })`:

```
AudioManager.play('player_hit', { x: 100, y: 200 })
  │
  ├─ 1. Lookup AudioDefinition from _definitions (throws if not found)
  │
  ├─ 2. Lookup Sound from _soundsByDefinition
  │     └─ If not found:
  │           ├─ AudioLoader.getBuffer(def.source) or AudioLoader.get(def.source)
  │           ├─ new Sound(asset, this, { maxInstances, backend })
  │           ├─ sound.volume = def.volume
  │           ├─ sound.group = def.group
  │           └─ _soundsByDefinition.set(name, sound)
  │
  ├─ 3. Build spatialOpts
  │     └─ { spatial: true, x: 100, y: 200, minDistance: 32, maxDistance: 256 }
  │
  ├─ 4. Sound.play(spatialOpts)
  │     │
  │     ├─ 4a. Check maxInstances (return null if exceeded + "drop-new")
  │     │     └─ If "replace-oldest": stop+return oldest instance
  │     │
  │     ├─ 4b. Sound._getInstance() → ObjectPool.acquire()
  │     │     └─ If pool has free: return popped free object
  │     │     └─ If pool empty: create new AudioInstance
  │     │           └─ new AudioInstance(playback, this)
  │     │                 └─ Where playback = backend.createPlayback(asset, effectChain, groupName)
  │     │                       ├─ HtmlAudioBackend: clone Audio element
  │     │                       └─ WebAudioBackend: create WebAudioPlayback with buffer
  │     │
  │     ├─ 4c. Configure instance
  │     │     ├─ instance._x = 100
  │     │     ├─ instance._y = 200
  │     │     ├─ instance._spatial = true
  │     │     ├─ instance._minDistance = 32
  │     │     └─ instance._maxDistance = 256
  │     │
  │     ├─ 4d. instance.restart()
  │     │     └─ playback.stop()
  │     │     └─ _applyVolume() → compute volume stack
  │     │     └─ playback.play()
  │     │           ├─ HtmlAudioBackend: audio.play()
  │     │           └─ WebAudioBackend: create BufferSource, connect through
  │     │                                panner → effects → gain → groupGain, start()
  │     │
  │     └─ 4e. Return instance
  │
  ├─ 5. Apply per-play overrides
  │     ├─ instance._overrideSoundVolume (if options.volume)
  │     ├─ instance.loop (if options.loop)
  │     ├─ instance._overrideGroup (if options.group)
  │     └─ instance._applyVolume() (if overrides changed volume stack)
  │
  └─ 6. Return instance to caller
```

### Audio graph (WebAudioBackend, spatial, with effects)

```
AudioBufferSourceNode
  │
  ├── PannerNode (spatial, lazy-created)
  │     └── (if effects) EffectChain nodes
  │           └── GainNode (instance._gain)
  │                 └── GainNode (group gain)
  │                       └── (if group effects) Group EffectChain nodes
  │                             └── GainNode (master gain)
  │                                   └── (if master effects) Master EffectChain nodes
  │                                         └── AudioContext.destination
```

### Update loop

`AudioManager.update(dt)` runs every frame (manually called by developer):
1. For each Sound's `_activeInstances`:
   - If `inst._spatial`: call `_applyVolume()` (recomputes volume stack including spatial attenuation)
   - If `inst._playback.setPosition`: call `setPosition(inst._x, inst._y)`
2. `_backend.setListenerPosition(listener.x, listener.y)`
3. If `dt > 0`:
   - For each Music: `music.update(dt)` (fade progress)
   - If transition active: `_processTransition(dt)`

---

## 5. Runtime ownership

| Object | Owner | Created by | Destroyed by | When destroyed |
|--------|-------|------------|--------------|----------------|
| `AudioManager` | Developer | `new AudioManager()` | `manager.destroy()` | Game teardown |
| `AudioBackend` | `AudioManager` | `AudioManager` constructor or developer-provided | `AudioManager.destroy()` | Manager teardown |
| `AudioDefinition` | `AudioManager._definitions` | `manager.define()` | `manager.undefine()` / `manager.destroy()` | On demand or teardown |
| `Sound` | `AudioManager._sounds` or `_soundsByDefinition` | `manager.add()` or lazy in `manager.play()` | `manager.remove()` / `manager.clear()` / `sound.destroy()` | On demand or teardown |
| `Music` | `AudioManager._musicCache` | `manager.music()` | `manager.clear()` / `music.destroy()` | On demand or teardown |
| `AudioInstance` | `Sound._activeInstances` (while playing), `Sound._pool._free` (after return) | `Sound._getInstance()` → `ObjectPool.acquire()` | `instance.destroy()` (pool eviction) or `Sound.destroy()` | When pool exceeds maxSize or sound destroyed |
| Backend playback | `AudioInstance` or `Music` | `backend.createPlayback()` | `instance.destroy()` / `music.stop()` | On instance return (eviction) or music stop |
| `AudioGroup` | `AudioManager._groups` | `AudioManager` constructor or `manager.group()` | `AudioManager.destroy()` | Manager teardown |
| `AudioScene` | `AudioManager._scenes` | `manager.snapshot()` | `manager.removeSnapshot()` / `manager.destroy()` | On demand or teardown |
| `AudioListener` | `AudioManager._listener` | `AudioManager` constructor | `AudioManager.destroy()` | Manager teardown |
| `EffectChain` | Owned by Sound, AudioGroup, AudioManager (master), or Music | Respective constructors | Respective destroy methods | Various |

### Key ownership rules

- **AudioInstance is pooled:** After playback ends (`onEnded`), automatically returned to `Sound._pool` via `_returnInstance`. If pool is at maxSize, the instance is `destroy()`ed (evicted).
- **Backend playback nodes:** Created by `backend.createPlayback()` when an AudioInstance is acquired from pool. Destroyed when instance is evicted or destroyed.
- **Music playback nodes:** Created lazily in `music.play()`, destroyed in `music.stop()`.
- **No cross-ownership:** Audio does not reference or own any ECS objects, and vice versa.

---

## 6. Spatial audio

### Current implementation

**Position tracking:**
- `AudioListener` has `x` and `y` properties (default `0, 0`)
- `AudioInstance` has `_x`, `_y`, `_spatial`, `_minDistance`, `_maxDistance`
- Positions set at play time via `sound.play({ x, y })` or `manager.play('key', { x, y })`
- Positions can change after playback via `instance.x = newX` (setter triggers `_applyVolume()` + `playback.setPosition()`)

**Attenuation:**
- Computed in `AudioInstance._computeSpatialVolume()`:
  1. If `distance <= minDistance`: return `1`
  2. If `distance >= maxDistance`: return `0`
  3. Otherwise: apply chosen model (linear, quadratic, or inverse)
- Uses `AudioListener` position from `Sound._manager.listener`
- Supports per-sound attenuation override (`Sound.attenuation`) or falls back to `AudioManager.attenuation`

**Volume stack (AudioInstance._applyVolume()):**
```
final = instanceVolume * spatialVolume * soundVolume * groupVolume * masterVolume * transitionVolume
```

**Panning (stereo):**
- `WebAudioBackend`: Lazy-created `PannerNode` with `distanceModel = "linear"`, extremely large `refDistance`/`maxDistance` (effectively disabling Web Audio's own distance model — JyGame handles attenuation in JS). Sets `positionX`, `positionY`, `positionZ`.
- `HtmlAudioBackend`: No spatial/panning support (no `setPosition` method).

**Update frequency:**
- Every call to `AudioManager.update(dt)` (expected to be called each frame)
- Re-applies volume + backend position for all spatial instances
- Re-sets listener position on backend

**Per-frame responsibility:**
1. Iterate all active instances across all Sounds
2. For spatial instances: `_applyVolume()` + `playback.setPosition(x, y)`
3. `backend.setListenerPosition(listener.x, listener.y)`

### Can positions change after playback?

**Yes.** Two mechanisms:
1. **Property setters:** `instance.x = newX` immediately calls `_applyVolume()` + `playback.setPosition()`.
2. **Per-frame update:** `AudioManager.update(dt)` re-reads `inst._x` and `inst._y` and re-applies them to the backend. If you mutate `inst._x` externally, the update loop will push it to the backend.

### Who updates positions?

**Nobody by default.** The developer must:
1. Update `instance.x` / `instance.y` manually after play, OR
2. Store a reference to the instance and mutate its coordinates each frame, OR
3. Update `manager.listener.x` / `manager.listener.y` to track the camera/player

---

## 7. Update loop

`AudioManager.update(dt)` — complete responsibility list:

```
1. For each Sound in _sounds:
     For each AudioInstance in sound._activeInstances:
       If instance._spatial:
         instance._applyVolume()
           ├─ _computeSpatialVolume() (distance + attenuation)
           └─ compute final volume = instance * spatial * sound * group * master * transition
         If playback.setPosition exists:
           playback.setPosition(instance._x, instance._y)

2. For each Sound in _soundsByDefinition:
     (same as above)

3. backend.setListenerPosition(listener.x, listener.y)

4. If dt > 0:
     For each Music in _musicCache:
       music.update(dt)
         ├─ advance fade timer
         ├─ interpolate fadeVolume
         ├─ _updateVolume() (compute final volume with fades)
         └─ if fade complete: _onFadeComplete() (stop or finalize)

     If _transition exists:
       _processTransition(dt)
         ├─ advance transition timer
         ├─ interpolate transitionVolume
         ├─ _notifyAllSoundsVolumeChange()
         └─ if complete: restore snapshot or switch phase
```

---

## 8. Instance lifecycle

### Creation

```
Sound.play(options)
  → Sound._getInstance()
    → ObjectPool.acquire()
      → if pool has free items: pop()
      → otherwise: createFn() = new AudioInstance(backend.createPlayback(), this)
```

### Playing

```
instance.play()
  → _applyVolume()
  → playback.play()
    ├─ HtmlAudioBackend: audio.play()
    └─ WebAudioBackend: create BufferSource, connect through audio graph, start()
```

### Pausing

```
instance.pause() → playback.pause()
  ├─ HtmlAudioBackend: audio.pause()
  └─ WebAudioBackend: accumulate offset, stop source
```

### Stopping

```
instance.stop() → playback.stop()
  ├─ HtmlAudioBackend: pause() + currentTime = 0
  └─ WebAudioBackend: offset = 0, stop source
```

### Natural end

When playback finishes:
1. Backend fires `onEnded` callback
2. `AudioInstance._onEnded()` calls `Sound._returnInstance(this)`

### Pooling / returning

```
Sound._returnInstance(instance):
  ├─ Skip if already returned
  ├─ instance._reset()  (zero all state)
  ├─ Swap-remove from _activeInstances array
  ├─ pool.release(instance)
  │   └─ if pool free list >= maxSize:
  │         instance.destroy()  (evicted — destroys backend playback)
  │       else:
  │         push to free list
  └─ instance is now reusable
```

### Eviction (voice stealing)

When pool is at maxSize and `release()` is called, the instance is destroyed (backend playback destroyed, cannot be reused). New instances are still created by `acquire()` if the free list is empty.

### Maximum instance limits

Two-tier:
1. **`Sound._maxInstances`** (default 32, from definition): Before creating a new instance, `Sound.play()` checks `_activeInstances.length >= maxInstances`.
   - `overflowPolicy = "drop-new"` (default): Return `null`, play is silently dropped
   - `overflowPolicy = "replace-oldest"`: Stop and return the oldest (`_activeInstances[0]`), then proceed

2. **`ObjectPool._maxSize`** (default 64, from `options.maxPoolSize`): Controls how many free instances can be cached. Does NOT limit active instances — only limits the free pool.

### Cleanup / destroy

```
instance.destroy():
  ├─ Mark _destroyed = true
  ├─ Clear onEnded callback
  ├─ playback.destroy()
  │   ├─ HtmlAudioBackend: remove listener, pause, null audio
  │   └─ WebAudioBackend: stop source, disconnect all nodes, null references
  ├─ null _playback, _sound
```

---

## 9. Audio groups

### Hierarchy

```
Master (AudioManager._masterEffectChain)
  └── Group "master"
  └── Group "music"    ─── Music tracks route here
  └── Group "sfx"      ─── Sound effects
  └── Group "ui"       ─── UI sounds
  └── Group "ambient"  ─── Ambient audio
```

Five default groups created in `AudioManager` constructor. Additional groups created on demand via `manager.group('name')`.

### Volume propagation

Volume stack (applied in `AudioInstance._applyVolume()` and `Music._updateVolume()`):
```
final = instanceVol * spatialVol * soundVol * groupVol * masterVol * transitionVol
```

Each layer clamps to [0, 1]. Muted groups contribute `0` to `groupVol`.

### Backend-specific behavior

| Backend | Volume handling |
|---------|----------------|
| `HtmlAudioBackend` | `supportsGroupGain = false`. All volume math done in JS, applied to `HTMLAudioElement.volume`. Group/master changes trigger `_notifyAllSoundsVolumeChange()` which iterates all instances and re-applies volume. |
| `WebAudioBackend` | `supportsGroupGain = true`. Each group has a `GainNode`. `setGroupVolume()` sets its gain value directly. No per-instance iteration needed for group/master changes. Per-instance `_applyVolume()` only computes instance-local volume (spatial + instance volume). |

### Effects routing

Groups have `EffectChain` instances. When modified, the chain is re-wired into the audio graph via `backend._connectGroupEffectChain(groupName, chain)`.

### No solo

There is no solo feature. Only volume and mute per group.

---

## 10. Effects

### Architecture

```
AudioEffect (abstract base)
  ├─ connect(inputNode, context) → output AudioNode
  ├─ disconnect()
  ├─ update(params)    → sets _fields + calls _applyParam()
  └─ _applyParam(key)  → override to apply live param change
```

### Supported effects

| Effect | WebAudio Node | Params |
|--------|---------------|--------|
| `LowPassEffect` | `BiquadFilterNode` (lowpass) | `frequency`, `Q` |
| `HighPassEffect` | `BiquadFilterNode` (highpass) | `frequency`, `Q` |
| `BandPassEffect` | `BiquadFilterNode` (bandpass) | `frequency`, `Q` |
| `DelayEffect` | Custom: `DelayNode` + feedback loop + dry/wet mix | `time`, `feedback`, `wet` |
| `CompressorEffect` | `DynamicsCompressorNode` | `threshold`, `ratio`, `attack`, `release`, `knee` |
| `DistortionEffect` | `WaveShaperNode` (generated curve) | `amount` |
| `ReverbEffect` | `ConvolverNode` (generated or loaded IR) | `decay`, `reverse` |

### Routing

Effects can be attached at three levels:

| Level | Accessor | When re-wired |
|-------|----------|---------------|
| Master bus | `manager.master.effects` | Via `_connectMasterEffectChain()` |
| Per-group | `group.effects` | Via `_connectGroupEffectChain()` |
| Per-sound | `sound.effects` | Per-playback in `WebAudioPlayback._connectSourceToChain()` |

Each `EffectChain` has `add(effect)`, `remove(effect)`, `clear()` methods. Changes trigger `onChange` callback which re-wires the audio graph.

### Adding custom effects

Extend `AudioEffect` and implement:
- `connect(inputNode, context)` → create WebAudio nodes, connect, return output node
- `disconnect()` → tear down nodes
- `_applyParam(key)` → apply live param changes

### HTMLAudioBackend limitation

`HtmlAudioBackend` does NOT support effects. Creating a playback with an effect chain logs a warning.

---

## 11. Backend abstraction

### Interface (`AudioBackend`)

```js
class AudioBackend {
  createPlayback(asset, effectChain, groupName)  // → Playback object
  setGroupVolume(name, value)                     // No-op by default
  setMasterVolume(value)                          // No-op by default
  setListenerPosition(x, y)                       // No-op by default
  _connectGroupEffectChain(groupName, chain)      // No-op by default
  _connectMasterEffectChain(chain)                // No-op by default
  unlock()                                        // No-op by default
  suspend()                                       // No-op by default
  resume()                                        // No-op by default
  destroy()                                       // No-op by default
  get supportsGroupGain()                         // false by default
}
```

### Playback contract

`createPlayback()` returns an object with:

| Property/Method | Required |
|-----------------|----------|
| `play()` | Yes |
| `pause()` | Yes |
| `stop()` | Yes |
| `currentTime` (get/set) | Yes |
| `duration` (get) | Yes |
| `loop` (get/set) | Yes |
| `volume` (get/set) | Yes |
| `muted` (get/set) | Yes |
| `paused` (get) | Yes |
| `ended` (get) | Yes |
| `onEnded(callback)` | Yes |
| `destroy()` | Yes |
| `setPosition(x, y)` | Optional (spatial) |
| `setGroup(name)` | Optional (group switching) |

### Backend comparison

| Feature | `HtmlAudioBackend` | `WebAudioBackend` |
|---------|-------------------|-------------------|
| Asset type | `HTMLAudioElement` | `AudioBuffer` |
| Loader | `AudioLoader.load()` | `AudioLoader.loadBuffer()` |
| Spatial audio | No | Yes (PannerNode) |
| Effects | No | Yes (full chain) |
| Group gain nodes | No | Yes (per-group GainNode) |
| `setPosition()` | Not implemented | Yes (PannerNode) |
| `setGroup()` | Not implemented | Yes (reconnect GainNode) |
| `setListenerPosition()` | Not implemented | Yes (AudioContext.listener) |
| Latency | Higher (DOM-based) | Lower (native) |
| Multi-instance | Cloned `<audio>` elements | Reused `AudioBuffer` with new `BufferSource` |
| Browser autoplay | `audio.play()` may fail | `context.resume()` |

---

## 12. Existing extension points

| Extension point | Location | Mechanism | Used by |
|----------------|----------|-----------|---------|
| **Backend abstraction** | `AudioBackend` class | Inheritance | `HtmlAudioBackend`, `WebAudioBackend` |
| **Effect abstraction** | `AudioEffect` class | Inheritance + `connect()`/`disconnect()`/`_applyParam()` | 7 effect types |
| **Effect chain `onChange`** | `EffectChain._onChange` | Callback | `AudioGroup`, `AudioManager` (re-wire audio graph) |
| **Overflow policy** | `Sound._overflowPolicy` | String value `"drop-new"` or `"replace-oldest"` | Developer configuration |
| **Per-instance overrides** | `AudioInstance._overrideSoundVolume`, `_overrideGroup` | Properties (internal, not part of public API) | `AudioManager.play()` |
| **Snapshot iteration** | `AudioScene.forEachSound()` | Callback | `pauseScene`/`resumeScene`/`stopScene` |
| **Instance position setters** | `AudioInstance.x` / `AudioInstance.y` | Public getters/setters | General use |
| **Sound.attenuation** | `Sound.attenuation` | Per-sound override | Developer |
| **Return instance** | `Sound.returnInstance()` | Public method | Manual pool management |
| **Global iterators** | `AudioManager.forEachSound/Music/Group()` | Callback | Iteration |
| **Definition access** | `AudioManager.getDefinition()` | Public method | Inspect registered definitions |

---

## 13. Integration with the engine

### Integration score: **Zero**

| Engine component | Audio references? |
|-----------------|------------------|
| `core/Game.js` | **None.** No `audio` property, no audio lifecycle calls. |
| `core/Scene.js` | **None.** No audio init, no audio update, no audio cleanup. |
| `ecs/` (any file) | **None.** No audio components, systems, resources, or events. |
| `Camera` | **None.** No integration with `AudioListener`. |
| `Loader` | **Indirect.** `AudioLoader` uses `LoadingTask` from `core/`. |
| `Storage` | **None.** |
| `Timer` | **None.** |
| `Pool` / `ActivePool` | **None.** Audio uses its own `ObjectPool`. |
| `jygame.js` (entry) | Re-exports all audio classes. Never instantiates `AudioManager`. |

The only dependency from audio to the rest of the engine:
- `AudioLoader` uses `LoadingTask` for progress tracking
- `AudioManager` constructor creates an `HtmlAudioBackend` by default (no other engine dependency)

**Dependencies the engine has on audio: Zero.** Audio is a fully optional, standalone module.

---

## 14. ECS readiness

### Entity-following sounds

**Partially supported.** The infrastructure exists but must be wired manually:
- `instance.x` / `instance.y` setters immediately push position changes to the backend
- `AudioManager.update(dt)` re-applies positions every frame (so even if you mutate `inst._x` directly, it gets pushed)
- No automatic sync with ECS `Transform` component
- No `AudioSource` component
- No system to manage the sync

### External position updates

**Supported.** `instance.x = value` and `instance.y = value` are public setters that trigger immediate volume + position update (Architecture.md §6 confirms).

### Automatic cleanup

**Not supported.** No ECS lifecycle integration:
- Destroying an ECS entity does not stop its associated audio
- No component destruction hook for audio
- Developer must manually track and clean up audio instances

### Listener synchronization

**Partially supported.** `AudioManager.listener` is a publicly accessible `AudioListener`:
- `manager.listener.x = camera.x` and `manager.listener.y = camera.y` works
- No automatic sync — developer must update each frame
- No ECS `Camera` integration

### Persistent emitters

**Not supported.** There is no emitter abstraction:
- No concept of "looping spatial sound attached to entity"
- Would need to manually track `AudioInstance` reference and update its position each frame
- No mechanism to automatically restart a sound if it ends while the entity is still alive

### One-shot emitters

**Supported.** `audio.play('key', { x, y })` is the one-shot API:
- Plays at position, auto-returns to pool on end
- Works for fire-and-forget effects

---

## 15. Hidden capabilities

| Capability | Where | What it enables |
|------------|-------|-----------------|
| **ObjectPool** | `audio/ObjectPool.js` | Generic pool with factory, maxSize, eviction, drain. Reusable for any pooled resource. |
| **Sound._returnInstance (public `returnInstance`)** | `Sound.js:92` | Allows manual pool management — useful for custom lifecycle control. |
| **Instance position setters** | `AudioInstance.js:51-70` | `x`/`y` setters immediately apply volume + backend position. Enables real-time position updates without re-playing. |
| **Per-instance override system** | `AudioInstance._overrideSoundVolume`, `_overrideGroup` | Per-play overrides don't modify the Sound's base config. Enables "play this one louder" without mutating the definition. |
| **Sound.attenuation per-sound override** | `Sound.js:52-58` | Override global attenuation model per sound. |
| **Overflow policy** | `Sound._overflowPolicy` | `"drop-new"` or `"replace-oldest"` — prevents audible voice-cut artifacts. |
| **AudioScene.forEachSound** | `AudioScene.js:159` | Iterates snapshot+sound pairs. Enables batch operations over a scene's audio without tracking individual references. |
| **Transition processing** | `AudioManager._processTransition` | Four transition modes (cut, fadeOut, fadeIn, crossfade). Already works for cross-scene audio transitions. |
| **Backend.createPlayback signature** | `AudioBackend.js:2` | Accepts `(asset, effectChain, groupName)` — any future backend receives the full context. |
| **EffectChain.onChange callback** | `EffectChain.js:26` | Hook fires on add/remove/clear. Used for graph re-wiring, available for any side effect. |
| **Global iterators** | `AudioManager.forEachSound/Music/Group` | Public iteration over all owned objects. Enables external inspection/serialization. |

---

## 16. Architectural constraints

### Singleton assumptions

- **AudioManager is NOT a singleton.** It's a plain instantiable class. However, the entire audio system is designed around a single manager — there's no built-in multi-manager support (groups, definitions, snapshots are all keyed per-manager).
- **AudioLoader IS a singleton module.** Module-level `_cache` and `_bufferCache` `Map`s — shared across all AudioManager instances. Two managers with the same backend type share asset caches.
- **No static `AudioManager.instance`** — developer must manage the reference.

### Update order

- `AudioManager.update(dt)` must be called every frame by the developer.
- `manager.update()` reads `listener.x/y` and `inst._x/_y` — these must be updated by the developer BEFORE calling update.
- No integration with `Game._loop()` — audio updates run independently of the ECS update.

### Ownership model

- **Sound → AudioInstance** is a strict owner → pooled relationship. Instances are never shared between Sounds.
- **AudioManager → Sound/Music/Group** is owner → owned. Destroying the manager destroys everything.
- **Backend playback nodes** are owned by AudioInstance or Music. They are created and destroyed inline (not pooled separately from the instance).
- **No cross-Sound awareness.** Each Sound's instance pool is independent. Two definitions with the same source get separate Sounds with separate pools.

### Backend limitations

- **HtmlAudioBackend:** No spatial, no effects, higher latency, clones `<audio>` elements (no buffer reuse, each clone loads its own decoder).
- **WebAudioBackend:** Requires `AudioContext` (may be suspended on first load, `unlock()` handles this via user gesture). `setPosition()` creates a `PannerNode` lazily but only supports 2D (z=0 always).
- **No streaming.** Both backends load the full asset into memory before playback. No chunked/streaming for long audio.

### Mutable state

- `AudioInstance._x` / `_y` are plain properties — can be mutated externally without going through setters (bypassing `_applyVolume()` and `setPosition()`). However, `AudioManager.update()` re-reads them each frame and re-applies, so external mutation is eventually consistent.
- `Sound._volume` / `_groupName` are mutable but trigger `_updateAllVolumes()` on set — no direct mutation without side effects.
- `AudioScene._snapshot` is a plain object — mutable after `save()`. Could be externally modified to adjust snapshot data before `restore()`.

### Object lifetime

- AudioInstance can be destroyed either by: (a) pool eviction after return, (b) `Sound.destroy()`, or (c) `instance.destroy()`. After destruction, `_destroyed = true` and all property accessors return safe defaults (0, false, or no-op).
- Music playback (`_playback`) is created lazily on `music.play()` and destroyed on `music.stop()` or `music.destroy()`.
- After `AudioManager.destroy()`, the instance is unusable — all internal maps cleared, backend destroyed, references nulled.

---

## 17. Feature matrix

| Feature | Supported | Partial | Missing | Notes |
|---------|-----------|---------|---------|-------|
| Sound playback | ✅ | | | Via `Sound.play()` / `AudioManager.play()` |
| Music playback | ✅ | | | Via `AudioManager.music()` |
| Looping | ✅ | | | Per-instance and per-sound |
| Volume control | ✅ | | | Per-instance, per-sound, per-group, master |
| Mute | ✅ | | | Per-group and master |
| Pause/Resume | ✅ | | | Per-instance, per-sound, per-scene, global |
| Stop | ✅ | | | Per-instance, per-sound, per-scene, global |
| Spatial audio | ✅ | | | Full 2D spatial with listener + source positions |
| Attenuation models | ✅ | | | Linear, quadratic, inverse |
| Per-sound attenuation override | ✅ | | | `Sound.attenuation` |
| Stereo panning | ✅ | | | Via WebAudio PannerNode (2D) |
| Listener position | ✅ | | | Mutable `AudioListener.x/y` |
| Position after playback | ✅ | | | `instance.x`/`instance.y` setters + per-frame update |
| Audio groups | ✅ | | | 5 defaults, volume/mute/effects per group |
| Group solo | | | ❌ | Not implemented |
| Instance pooling | ✅ | | | ObjectPool per Sound, configurable maxSize |
| Max instance limits | ✅ | | | Per-Sound via `maxInstances` + overflow policy |
| Voice stealing | ✅ | | | `"replace-oldest"` policy |
| Effect chains | ✅ | | | Master, group, per-sound |
| Filter effects | ✅ | | | LowPass, HighPass, BandPass |
| Delay effect | ✅ | | | With feedback + wet/dry |
| Compressor | ✅ | | | DynamicsCompressorNode wrapper |
| Distortion | ✅ | | | WaveShaper with generated curve |
| Reverb | ✅ | | | ConvolverNode with generated or loaded IR |
| Custom effects | ✅ | | | Extend `AudioEffect` |
| Crossfade transitions | ✅ | | | FadeOut, fadeIn, crossfade between snapshots |
| Audio snapshots | ✅ | | | Save/restore full audio state |
| Per-scene audio management | ✅ | | | `pauseScene`/`resumeScene`/`stopScene` |
| Backend abstraction | ✅ | | | Two backends, extensible via inheritance |
| Multiple backends | ✅ | | | HtmlAudioBackend + WebAudioBackend |
| Autoplay unlock | ✅ | | | Gesture-based AudioContext resume |
| Global asset cache | ✅ | | | AudioLoader module-level cache |
| Object pooling (generic) | ✅ | | | Reusable ObjectPool class |
| Entity-following sounds | | ⚠️ | | Infrastructure exists (position setters + per-frame update), but no ECS component or automatic sync |
| Automatic cleanup on destroy | | | ❌ | No ECS lifecycle hooks |
| Listener auto-sync with Camera | | | ❌ | Must be done manually |
| Persistent emitters | | | ❌ | No "looping spatial at entity position" abstraction |
| Streaming audio | | | ❌ | Full asset in memory |
| Audio occlusion | | | ❌ | Not implemented |
| Reverb zones | | | ❌ | Not implemented |
| Environmental audio | | | ❌ | Not implemented |
| Audio mixer/visualizer | | | ❌ | Not implemented |
| Per-sound effect chain | ✅ | | | Via `sound.effects` |
| Per-instance volume override | ✅ | | | `options.volume` in `manager.play()` |
| Per-instance group override | ✅ | | | `options.group` in `manager.play()` |
| MP3/OGG/WAV support | ✅ | | | Depends on browser/backend support |

---

## 18. Candidate building blocks

Existing primitives that enable future features without redesigning the core:

### ECS AudioSource component

Building blocks available:
- `AudioManager` is a standalone class that can be registered as a World resource
- `Sound` + `AudioInstance` provide the complete playback pipeline
- `instance.x` / `instance.y` setters allow external position control
- `Sound.returnInstance()` allows manual pool management
- `Sound.persistent` flag marks sounds for snapshot tracking

### AudioSystem (ECS)

Building blocks available:
- `AudioManager.update(dt)` already does per-frame spatial re-application
- A custom system could call `manager.update(dt)` as part of `world.update(dt)`
- System priority can be set to run after `MovementSystem` and before `RenderSystem`
- `SystemContext` provides access to World resources

### Entity-following playback

Building blocks available:
- `instance.x` / `instance.y` property setters (immediate update)
- `AudioManager.update()` re-reads `inst._x`/`_y` every frame and pushes to backend
- An `AudioSystem` could query `Transform + AudioSource` and sync positions

### Automatic lifecycle (play-on-create, stop-on-destroy)

Building blocks available:
- `Sound.play()` returns an `AudioInstance`
- `instance.destroy()` cleans up backend playback
- A system could observe component add/remove events and trigger play/stop

### Listener synchronization

Building blocks available:
- `AudioManager.listener` is publicly accessible
- `manager.listener.x` / `manager.listener.y` are plain properties
- A system could sync `Camera.main` → `manager.listener.position` each frame

### Persistent emitters

Building blocks available:
- `Sound.maxInstances` + `instance.loop` provide looping playback
- `instance.x`/`instance.y` provide position tracking
- What's missing is the "attach to entity" abstraction (component + system)

### One-shot emitters

Building blocks available:
- `AudioManager.play('key', { x, y })` is the complete one-shot API
- Instance auto-returns to pool on `onEnded`
- No additional work needed

### Audio snapshots per scene (AudioScene)

Building blocks available:
- `AudioScene.save()` / `restore()` captures and restores full state
- `AudioManager.transition()` supports cut, fadeOut, fadeIn, crossfade
- `AudioManager.pauseScene/resumeScene/stopScene` for batch control
- Could be tied to ECS Scene lifecycle (`onEnter`/`onExit`/`onPause`/`onResume`)

### Custom effects

Building blocks available:
- `AudioEffect` base class with `connect()`/`disconnect()`/`_applyParam()`
- `EffectChain` with `add()`/`remove()`/`clear()` and `onChange` callback
- Effects can be added to master, group, or per-sound chains
