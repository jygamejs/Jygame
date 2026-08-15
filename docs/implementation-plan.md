# Implementation Plan — Animation Sequence, Timing, and Markers

Plan for implementing `docs/prompt.md` (sequence / timing / markers / `playUntil` / `pauseAt`) in JYGame's animation system, broken into reviewable commits.

> **Authoritative spec.** The review requirement document supersedes `docs/prompt.md` where they differ. It confirms this plan's core design (normalize in `AnimationClip`; cumulative `elapsed`; O(1) uniform advance; `stopAt: "u32"` column with `0` = none, `position + 1` = stop; temporary one-shot `playUntil`; animation-relative marker lookup; no `playOnce(name, { until })`). The deltas it adds are captured below and are binding: §21 (`_toAssetClip` must preserve `sequence`/`timing`/`markers`), §2 pingPong table (1/2/3+ frames), §11 timeline-cursor preservation, §12 overshoot, §26 documentation examples.

## 1. Goal (recap)

Turn "play this clip" into:

```text
play("run")            → persistent request
playOnce("attack")     → temporary one-shot
playUntil("airborne")  → play a clip until a semantic marker, then pause
pauseAt("airborne")    → arm the current playback to pause at a marker
pause() / resume()     → pause / continue exactly where playback stopped
sequence               → choreography (order of extracted frames)
timing                 → per-playback-position durations
markers                → named positions in the playback timeline
```

Markers **must affect playback**: the controller stops *at* the marker (detecting crossing even with large `dt`), preserves the playback cursor, does not fire completion, does not advance the queue, and `resume()` continues from the marker.

---

## 2. Current architecture (context)

| File | Role |
|---|---|
| `ecs/animation/AnimationClip.js` | Immutable clip: `frames`, `fps`, `loop`, `frameCount`, `frameDuration` (1/fps), `duration` (frameCount/fps). All construction-time validation. |
| `ecs/animation/AnimationPack.js` | Builds `AnimationClip`s from configs (individual files, sprite sheets, atlas regions, JSON atlases). Currently bakes `pingPong` into the frames array itself (`_buildClip`). |
| `ecs/components/Animation.js` | Typed-array component: `clipId(u16) frameIndex(u32) elapsed(f32) isPlaying(u8) speed(f32) mode(u8) loop(u8)`. Zero-initialized; no default values (see `Table.js`). |
| `ecs/animation/AnimationPlayback.js` | `AnimationPlaybackState` (strings/queue, per entity), `PlaybackMode`, `LoopOverride`, shared `startPlayback()` starter. |
| `ecs/systems/AnimationSystem.js` | Hot loop: `elapsed += dt*speed`; `frame = floor(elapsed / frameDuration)`; loop/non-loop handling; completion → `_advanceAfterCompletion` + `onComplete`. Reads state only on completion. |
| `display/Sprite.js` | Facade `sprite.animation` (`play/playOnce/queue/clearQueue/restart/pause/resume/stop/onComplete`, `add/addAll`, `_toAssetClip`, `_getPlaybackState`, `_startPlayback`). |
| `loaders/Image.js` | `Image.animate()` routes to `AnimationPack` strategies. The **spriteSheet** strategy rebuilds each entry and currently strips `sequence/timing/markers`. |

### Hot-path constraints (existing tests enforce)
- `AnimationSystem.prototype.update.toString()` must contain `for (const table of ctx)` and `table.getColumn(` and must **not** contain `ctx.column(`.
- `update()` must not add properties to `this` (tests snapshot `Object.keys(sys)` before/after).
- Uniform-timing advancement must stay O(1): `world.update(100000)` on a looping clip must not loop per frame (`AnimationSystem.test.js` "very large dt does not crash on looping clip").
- `elapsed` is **cumulative monotonic seconds** — a test seeds `frameIndex:1, elapsed:0.1` and expects `update(0.15)` → frame 2. Do **not** reinterpret `elapsed` as "partial time in current frame".
- `duration` must remain `frameCount / fps` when no timing is supplied.
- `_toAssetClip` must keep returning plain-object clips **by reference** (compat test asserts `strictEqual` with the input object).

### In-flight work (do not clobber)
Uncommitted changes exist for the Atlas feature: `ecs/animation/AnimationPack.js` (grid-rect `origin/spacing`), `loaders/Image.js` (`Image.atlas`), new `loaders/Atlas.js`, `ecs/render/AtlasRegion.js`. Only touch the specific lines listed below in `AnimationPack.js`/`Image.js`.

---

## 3. Design decisions

### D1 — Normalize once in `AnimationClip`
The clip is the single normalization point. Input `frames` = **extracted source frames**. The clip computes the **playback list**:

```text
explicit sequence  >  pingPong  >  default (identity)
```

`pingPong` moves into the clip (removed from `AnimationPack._buildClip`), so `sequence` indices always refer to the extracted source list — not a ping-ponged list.

After normalization the clip stores:
- `_frames` — playback-ordered frames (frozen). `frames` getter returns this.
- `_durations` — `null` for uniform, else frozen array of per-playback-position durations.
- `_timeAt` — prefix-sum array `timeAt[i] = Σ durations[0..i-1]` (length `frameCount+1`), `null` for uniform.
- `_markers` — frozen `{ name → playback position }` or `null`.

`fps` stays **required** (validation unchanged) — the pack always supplies the default `8`.

### D2 — Timing decode helpers on the clip
The system needs `decode(elapsed)` and `timeAt(position)` with no allocation and O(1) for the common uniform case:

- `frameAt(elapsed, wrap)`
  - uniform: `floor(elapsed / frameDuration)`, `% frameCount` when `wrap`.
  - timing: `elapsed % duration` when `wrap`, then a linear scan over `_durations` (≤ frameCount steps; frameCount is small). Returns `frameCount` (== "past the end") when `elapsed ≥ duration` and `wrap=false`.
- `timeAt(position)` — `position * frameDuration` (uniform) or `_timeAt[position]`.
- `duration` — `_timeAt[frameCount]` when timing present, else `frameCount / fps`.
- `frameDurationAt(i)` — `_durations[i]` or `frameDuration`.

The marker path always calls `frameAt(elapsed, /*wrap=*/false)` so a marker crossing is detected even after a huge `dt` (no wrap, target grows past the marker).

### D3 — Marker stop target lives in the Animation component
Add a typed column `stopAt: "u32"` to `Animation.schema`. Store **position + 1**; `0` = no stop target. 1-based encoding avoids the zero-init problem (typed arrays cannot have a `-1` default — see `Table.js`).

- `startPlayback()` and `Sprite.animation.stop()` reset `stopAt = 0`.
- `Sprite.animation.resume()` and `pause()` clear `stopAt = 0`.
- The system reads `stopAtCol[r]` directly — no per-entity map lookup, preserving the hot path.

### D4 — Marker-stop semantics (the "stop exactly, preserve cursor" contract)
Per entity, after `elapsed += dt * speed` (clamped to ≥ 0):

```text
if stopAt > 0:
    stopTarget = stopAt - 1
    target = clip.frameAt(elapsed, wrap=false)
    if target >= stopTarget:                     # crossing detected (incl. overshoot)
        cap = clip.timeAt(stopTarget + 1)
        if elapsed > cap: elapsed = cap          # do NOT consume post-marker time
        isPlaying = 0
        frameIndex = stopTarget
        image = clip.frames[stopTarget]
        continue                                 # NO completion, NO queue advance, NO onComplete
    else:
        frameIndex = target; image = clip.frames[target]
        continue
```

- Normal case (target lands exactly on the marker): `elapsed` is already `< cap`, so it is preserved. On `resume()` frame 2 continues its remaining duration, then 3, 4. (Satisfies "do not restart frame 2".)
- Overshoot case (large `dt` jumps past the marker): `elapsed` is capped at the marker-frame boundary. Frame 2 was displayed at the stop; on `resume()` decode yields frame 3 immediately — frame 2 is not restarted because it had already completed. Deterministic.
- Marker stop sets `isPlaying = 0` only. `mode`, `loop`, `current`, `requested`, and the queue are untouched → §14/§15 hold automatically.

### D5 — `playUntil` / `pauseAt` API
- `playUntil(marker)`
  1. Resolve marker → `{ name, position }` (see D6).
  2. If the current clip **is** the resolved clip: arm it — `stopAt = position+1`; if `frameIndex >= position`, pause now (already past), else `isPlaying = 1`.
  3. Otherwise start it as a **temporary one-shot** (mirrors `playOnce`): clear the queue, `startPlayback(name, ONCE, { loop: NON_LOOP })`, then `stopAt = position+1`.
  4. Forced animation owns the sprite: if `anim.mode === FORCED` and the resolved clip is not the forced one, do nothing (same guard `playOnce` uses).
- `pauseAt(marker)`
  1. Requires a current clip; the marker must exist **in the current clip** (else a helpful error). §7 = "configure the currently playing animation".
  2. If already at/past the marker → `isPlaying = 0`. Else `stopAt = position+1` (does not force `isPlaying = 1`).
- `playOnce(name, { until: marker })` is **not** added (spec §13: only if it fits naturally; it does not — keep the smallest API).

### D6 — Marker resolution is animation-relative, never global
`_resolveMarker(marker)` searches, in order:
1. the **current** clip,
2. the **requested** (persistent) clip,
3. this sprite's own `_animMap` (per-sprite scope, not a global namespace).

If >1 sprite clip defines the marker → throw "ambiguous". If none → throw a helpful error naming the marker, the current animation, and the available markers/animations.

Marker positions are normalized against the **playback sequence** at clip construction (spec §5/§9/§10), so they survive `sequence`/`timing`.

### D7 — Plain-object clip boundary
`_toAssetClip` keeps returning plain clips by reference (compat contract). Plain-object clips used with the `AnimationSystem` remain out of scope (already latent: no `frameCount`). The facade reads `.markers`/`.timing` off whatever clip object is stored, so it works for both. `_toAssetClip` (for frame-descriptor clips) now passes `timing`/`markers` through so normalized positions survive the asset-id remap.

### D8 — `_toAssetClip` preserves `sequence` semantics (§21)
`_toAssetClip` reconstructs the clip from `clip.frames`, which is **already the normalized playback sequence**. Remapping those to asset IDs preserves the choreography by construction. Therefore the reconstructed clip receives `frames` (playback-ordered ids), `fps`, `loop`, plus `timing` and `markers`.

`sequence` and `pingPong` are **not** re-passed to the new `AnimationClip` — doing so would re-apply them to an already-normalized frame list (double sequencing). The spec's "preserve `sequence`" requirement is satisfied because the resulting playback order is identical; passing the raw `sequence`/`pingPong` again would actively corrupt it. Add a comment in `_toAssetClip` stating this.

---

## 4. Concrete changes per file

### 4.1 `ecs/animation/AnimationClip.js` (commit 1)
Constructor signature: `{ frames, fps, loop = true, sequence, timing, pingPong, markers }`.

Add validation (all throw descriptive `TypeError`/`Error` at construction):
- `sequence` (optional): non-empty array; every value an integer in `[0, frames.length)`; else reject.
- `timing` (optional): array; length **must equal** the normalized playback length; every value finite and `> 0`.
- `markers` (optional): plain object; every key a non-empty string; every value an integer in `[0, frameCount)`.
- `pingPong` (optional): boolean.

Normalization order:
```js
let playback = frames;
if (sequence != null) playback = sequence.map(i => frames[i]);
else if (pingPong) {
  const n = frames.length;
  if (n > 2) playback = [...frames, ...frames.slice(1, -1).reverse()];
  else if (n === 2) playback = [frames[0], frames[1], frames[0]]; // doc §2: 0→1→0
  else playback = frames;
}
```
(2-frame pingPong changes from "2 frames" to "3 frames" per the spec; no existing test asserts the old value — the pack tests only use 3-frame pingPong → 4.)

Store (all frozen where applicable): `_frames`, `_fps`, `_loop`, `_durations`, `_timeAt` (Float64Array prefix sums, only when timing present), `_markers`. Keep `Object.freeze(this)`.

New getters/methods:
- `timing` → `_durations` (or `null`), `markers` → `_markers` (or `null`)
- `frameDurationAt(i)` → `_durations ? _durations[i] : this.frameDuration`
- `duration` → `_timeAt[frameCount]` when timing, else `frameCount / fps`
- `frameAt(elapsed, wrap)` and `timeAt(position)` (see D2)

### 4.2 `ecs/components/Animation.js` (commit 3)
Add `stopAt: "u32"` to the schema.

### 4.3 `ecs/animation/AnimationPlayback.js` (commit 3)
In `startPlayback()`, after `anim.loop = ...`, add `anim.stopAt = 0;`.

### 4.4 `ecs/systems/AnimationSystem.js` (commit 3)
Rewrite the per-entity advance loop (see D4). Uniform timing keeps the exact current arithmetic (`floor(elapsed/dur)` + `% frameCount`) for zero regression. Timing clips use `clip.frameAt`/`clip.timeAt`. The completion branch is byte-for-byte behavior-identical to today (write last frame → `_advanceAfterCompletion` → `onComplete` → `continue`). The marker branch simply `continue`s without touching completion.

Also clamp `elapsedCol[r]` to ≥ 0 after the `+=` (negative elapsed is meaningless; the "negative dt" test only requires no crash).

### 4.5 `display/Sprite.js` (commit 4)
- `_toAssetClip`: pass `timing: clip.timing ?? undefined` and `markers: clip.markers ?? undefined` into the reconstructed `AnimationClip`. Do **not** re-pass `sequence`/`pingPong` (see D8 — they are baked into the already-normalized `clip.frames`).
- New `_resolveMarker(marker)` and `_markerPosition(clip, name, marker)` helpers (D6).
- New `playUntil(marker)` / `pauseAt(marker)` (D5).
- `pause()` → `comp.stopAt = 0; comp.isPlaying = 0;`
- `resume()` → `comp.stopAt = 0;` then existing behavior.
- `stop()` → add `comp.stopAt = 0;`.

### 4.6 `ecs/animation/AnimationPack.js` (commit 2)
- `_buildClip`: drop the manual ping-pong expansion; pass `sequence`, `timing`, `pingPong`, `markers` through:
  ```js
  return new AnimationClip({ frames, fps: anim.fps, loop: anim.loop,
    sequence: anim.sequence, timing: anim.timing,
    pingPong: anim.pingPong, markers: anim.markers });
  ```
- `_normalizeJSONAtlasEntry`: include `sequence`, `timing`, `markers` in the returned object (it currently rebuilds the entry and drops them).
- `_normalize`, `_normalizeSpriteSheetEntry`, `_normalizeAtlasEntry` already spread `...value` → they carry the new fields; no change needed.

### 4.7 `loaders/Image.js` (commit 2)
`spriteSheet` strategy's rebuilt `packConfig[key]`: add `sequence`, `timing`, `markers` from `entry`. (The individual / jsonAtlas / atlas strategies pass entries through untouched.)

---

## 5. Test plan

Run each commit's tests with `node --test tools/ecs/tests/<file>.test.js`; final verification runs the full suite (`node --test tools/ecs/tests/`).

### Commit 1 — new `tools/ecs/tests/AnimationClipFeatures.test.js`
- Sequence: default identity; custom; repeated source frame; reversed; arbitrary order; with `timing` aligned to the sequenced length.
- PingPong: 3 → 4; 2 → 3 (doc); 1 unchanged; `sequence` beats `pingPong`.
- Timing: uniform FPS default; `frameDurationAt(i)`; `duration` = sum; repeated frame with different durations; `frameAt` (uniform + timing, wrap + no-wrap); `timeAt` prefix sums.
- Validation: bad sequence (non-array/empty/non-integer/out-of-range), bad timing (non-array/wrong length/non-finite/≤0), bad markers (non-string name/non-integer/out-of-range), first & last position markers, multiple markers, marker after repeated frames.

### Commit 2 — `AnimationPack.test.js`, `Image.test.js`
- `load` with `sequence`/`timing`/`markers`; `fromSpriteSheet`, `fromAtlas`, `fromJSONAtlas` with the same; existing pingPong tests still pass (3-frame → 4).
- `Image.animate` spriteSheet entry passes `sequence`/`timing`/`markers` through to the clip.

### Commit 3 — `AnimationSystem.test.js`
- Timing advancement: `update(0.1)`/`update(0.2)` with `timing:[0.1,0.2,...]`; large dt holds/completes; timing + loop wraps via `duration`; exact boundary.
- Schema now includes `stopAt`; `startPlayback` zeroes it.
- System-level marker stop: set `stopAt` column, verify stops at position, `isPlaying=0`, `onComplete` does **not** fire, image = marker frame; overshoot (large dt) stops at marker, not past it.

### Commit 4 — `AnimationPlayback.test.js` (+ `SpriteCompatibility.test.js` spot-checks)
- `playUntil` starts playback, stops exactly at marker (observed frames `0,1,2` then stop), preserves frame, no `onComplete`, queue intact, `resume()` continues `2→3→4` and completes → `onComplete` fires once.
- `playUntil` marker at first position / final position; unknown marker → helpful error; ambiguous marker (two clips) → error.
- `pauseAt` pauses at marker, preserves position, resumes correctly, works with timing; **does not replace the current animation** (arms it, never starts a new clip).
- Animation-relative lookup: `jump.airborne` vs `attack.impact` (same sprite).
- Integration: `playOnce` + marker; forced + marker (forced clip owns playback, marker in forced clip arms it); queues + marker (no silent advance while paused at marker); persistent `play()` while marker-paused; multiple marker pauses/resumes.
- `_toAssetClip` carries `timing`/`markers` when remapping frame-descriptor frames to asset ids.

---

## 6. Commit breakdown

Each commit compiles and is green on its own tests; the codebase always remains working.

1. **`feat: AnimationClip sequence/timing/markers/pingPong normalization`**
   `ecs/animation/AnimationClip.js` + new `tools/ecs/tests/AnimationClipFeatures.test.js`.
   Verify: AnimationClipFeatures, AnimationSystem, AnimationPlayback, AnimationPack, SpriteCompatibility.

2. **`feat: pass sequence/timing/markers through AnimationPack and Image.animate`**
   `ecs/animation/AnimationPack.js`, `loaders/Image.js`, tests in `AnimationPack.test.js`/`Image.test.js`.
   Verify: AnimationPack, Image, AnimationSystem (existing clip tests).

3. **`feat: marker-aware AnimationSystem with per-frame timing and stop targets`**
   `ecs/components/Animation.js` (`stopAt`), `ecs/animation/AnimationPlayback.js`, `ecs/systems/AnimationSystem.js`, tests in `AnimationSystem.test.js`.
   Verify: AnimationSystem, AnimationPlayback, Serialization/Prefab (new component field), full suite.

4. **`feat: Sprite animation playUntil/pauseAt and animation-relative marker resolution`**
   `display/Sprite.js`, tests in `AnimationPlayback.test.js` (+ `SpriteCompatibility.test.js`).
   Verify: AnimationPlayback, SpriteCompatibility, full suite.

5. **`docs: record animation sequence/timing/markers in architecture`** — update `docs/architecture.md`; do not duplicate `prompt.md`. Include the §26 documentation examples: sequence for deliberate frame reuse (`[0,1,2,1,0]`, `[0,1,2,2,2,3]`), timing for holding a pose without changing FPS (`[0.08, 0.08, 0.40, 0.08]`), and markers as gameplay/animation sync points (`airborne: 2, landing: 4` + `playUntil`/`resume`).

---

## 7. Edge cases & risks

- **Rewind guard**: facade pauses immediately (no `stopAt`) if the marker is already behind the cursor, so the system never snaps playback backward.
- **`elapsed` semantics preserved**: it stays cumulative; only the marker stop caps it (to the marker boundary). All existing advancement tests must pass unchanged.
- **Forced animations**: `playUntil` never interrupts a forced clip except to arm a marker inside that forced clip.
- **Column addition**: `Animation.schema` gains `stopAt`; zero-init default is safe because `0` = "no target". Serialization/prefab is schema-generic (no hard-coded `Animation` fields — confirmed).
- **Perf**: uniform timing stays O(1); timing clips only scan ≤ `frameCount` entries; marker path reads only the `stopAt` column (no map lookups). No allocations in `update(dt)`.
- **Plain-object clips**: unchanged boundary; facade works, system is not expected to process them (pre-existing).

---

# Part 2 — Explicit marker control & playback state queries

## 1. Goal (recap)

Extend `sprite.animation` (do **not** redesign sequence/timing/markers/`playUntil`/`pauseAt`/`pause`/`resume`) with:

1. Explicit clip + marker addressing: `playUntil(name, marker)`, `pauseAt(name, marker)`.
2. `playAfter(name, marker)` — start at playback position `marker + 1`.
3. `resumeAt(name, marker)` — position the cursor **at** the marker and resume.
4. Marker queries: `isAt(name, marker)`, `hasReached(name, marker)`.
5. State getters: `current`, `frame`, `position`, `progress`, `isPlaying`, `isPaused`, `isComplete`, and optional `marker`.
6. No hot-path regressions (all new logic lives in the facade; the system stays numeric).

The motivating pattern:

```js
if (Input.pressed("jump")) {
  if (king.animation.isAt("jump", "airborne")) king.animation.resume();
  else king.animation.playUntil("jump", "airborne");
}
```

## 2. Established state semantics (inspected)

| State | Source | Current meaning |
|---|---|---|
| `current` | `AnimationPlaybackState.current` | Name of the clip owning playback |
| `isPlaying` | `Animation.isPlaying` (u8) | System advances while non-zero |
| `frameIndex` | `Animation.frameIndex` (u32) | **Playback position** in the normalized list (`clip.frames` is already sequenced) — this is the marker timeline cursor |
| `elapsed` | `Animation.elapsed` (f32) | Cumulative playback time |
| `stopAt` | `Animation.stopAt` (u32) | `0` = none, `position + 1` = armed marker stop |
| `mode` | `PlaybackMode` (NORMAL/ONCE/QUEUED/FORCED) | Ownership |
| `loop` | `LoopOverride` | Effective loop override |
| Marker stop | system sets `isPlaying=0`, keeps `stopAt` | Pause, **not** completion (no `onComplete`, no queue advance) |
| Completion | system sets `isPlaying=0`, frame=last, `stopAt` stays 0, then transitions | `onComplete` + queue/persistent resume |

Key finding: because `clip.frames` is the **normalized playback list**, `frameIndex` **is** the playback position. So `frame` and `position` are the same value, and `isAt`/`hasReached` compare `frameIndex` against the marker's stored playback position — no source-frame identity involved. Repeated source frames are naturally distinguished (positions 2, 3, 4 each have their own `frameIndex`).

## 3. Design decisions

### D1 — Explicit resolution replaces implicit search
Replace `_resolveMarker` (current → requested → sprite map) and `_markerPosition` with one helper:

```js
_resolveClipMarker(name, marker) // → { clip, position }
```
- Unknown animation → `Unknown animation "<name>".`
- Known animation without the marker → `Animation "<name>" has no marker "<marker>".`

No global marker namespace, no ambiguity. The old single-arg forms are removed (feature shipped same session; no real-world back-compat pressure — spec mandates the two-arg contract).

### D2 — `playUntil(name, marker)` / `pauseAt(name, marker)`
Same core behavior as today, but resolve via `_resolveClipMarker`.
- `pauseAt` additionally requires `state.current === name`, else throws a descriptive error (the `stopAt` column is per-entity; arming a non-current clip is meaningless).

### D3 — Shared positioning routine
Add a Sprite-level helper used by `playAfter`/`resumeAt`:

```js
_positionPlayback(name, position, { playing = true })
```
- `state.current = name`; writes `frameIndex = position`, `elapsed = clip.timeAt(position)`, `clipId`, `image = clip.frames[position]`, `mode = ONCE`, `loop = NON_LOOP`, `stopAt = 0`, `isPlaying = playing ? 1 : 0`.
- Uses `resolveClipId` (exported from `AnimationPlayback.js`) and `_resolveFromClip` for native size.
- Respects forced ownership: if `mode === FORCED` and `state.current !== name`, no-op (mirrors `playOnce`).
- Does **not** fire `onComplete` (positioning is not completion — §15).

### D4 — `playAfter(name, marker)` → position `marker + 1`
- `start = position + 1`.
- If `start >= clip.frameCount`: **ended, no wrap** — `_positionPlayback(name, frameCount - 1, { playing: false })`, `elapsed = clip.duration`. `isComplete` reads true; cursor is not restarted at 0.
- Else `_positionPlayback(name, start)`, clearing the queue only when `state.current !== name` (fresh temporary playback, like `playOnce`).

### D5 — `resumeAt(name, marker)` → position `marker`
- `_positionPlayback(name, position)` (always a valid position).
- Cursor-selecting, not cursor-preserving: `resume()` keeps the cursor; `resumeAt` moves it (§4).

### D6 — State getters (all read-only facade reads; no system changes)

| Getter | Definition |
|---|---|
| `current` | existing |
| `frame` | `comp.frameIndex` (playback position) |
| `position` | `comp.frameIndex` (documented as the semantic cursor; same value as `frame`) |
| `progress` | effective-loops-aware: looping → `(elapsed % duration) / duration`; finite → `min(1, elapsed / duration)`. `1` at the end of a non-looping clip. Uses `clip.duration` (timing-aware). |
| `isPlaying` | existing `!!comp.isPlaying` |
| `isPaused` | `!isPlaying && state.current && !isComplete` |
| `isComplete` | `!isPlaying && stopAt === 0 && !loops && frameIndex === frameCount - 1 && elapsed >= duration` — a marker stop (even at the final position) is never complete; a looping clip is never complete |
| `marker` | marker name whose position equals `frameIndex`, else `null` (O(markers) scan, query-only) |

Effective loops helper shared by `progress`/`isComplete`: `loop === NON_LOOP ? false : loop === LOOP ? true : clip.loop`.

### D7 — `isAt(name, marker)` / `hasReached(name, marker)`
Both: `state.current === name`, clip has the marker, else `false`.
- `isAt` → `frameIndex === position` (position-based; repeated source frames stay distinct).
- `hasReached` → `frameIndex >= position` (true after completion too).
- Playing state is irrelevant to both.

### D8 — Hot path
Nothing added to `AnimationSystem`. All lookups/strings/allocations are facade-only, invoked by gameplay, never per-entity per-frame in `update(dt)`.

## 4. Tests (mapped to spec §18)

- **Explicit addressing**: two-arg `playUntil`/`pauseAt` select the right clip; same marker name in two clips is unambiguous; unknown animation / unknown marker throw with both names; `pauseAt` on a non-current clip throws.
- **`playAfter`**: starts at marker+1; works with `sequence` and repeated frames (position 3 of `[0,1,2,2,2,3,4]`); works with `timing`; final-frame marker → ended (not playing, not wrapped, `isComplete` true); no `onComplete` from positioning; forced ownership respected.
- **`resumeAt`**: positions exactly at the marker, resumes immediately, works while paused, works with timing and repeated frames, respects forced ownership, no `onComplete` from positioning.
- **`isAt`**: before→false, at→true, after→false; repeated frames report true only at the marker position; false when a different clip is current; true while paused at the marker.
- **`hasReached`**: before→false, at→true, after→true; true after completion.
- **State getters** across normal playback / marker pause / manual pause / resume / completion / queue / forced: `current`, `frame`, `position`, `progress` (uniform + timed, `1` at completion), `isPlaying`, `isPaused`, `isComplete`, `marker`.
- **Regression**: full existing animation + ECS suites unchanged except call-site updates for the new two-arg signature (spec mandates the signature change; assertions are not weakened).

## 5. Commit breakdown

1. **`feat: explicit clip+marker addressing for playUntil/pauseAt`**
   `display/Sprite.js` (`_resolveClipMarker`, two-arg signatures), tests: update existing marker tests to two-arg + new explicit-addressing tests.
   Verify: AnimationPlayback, SpriteCompatibility, full suite.

2. **`feat: Sprite animation playAfter and resumeAt`**
   `display/Sprite.js` (`_positionPlayback`, `playAfter`, `resumeAt`), tests.
   Verify: AnimationPlayback, full suite.

3. **`feat: Sprite animation state getters and marker queries`**
   `display/Sprite.js` (`frame`/`position`/`progress`/`isPaused`/`isComplete`/`marker`/`isAt`/`hasReached`), tests.
   Verify: AnimationPlayback, full suite.

4. **`docs: update animation API for explicit addressing and state queries`**
   `docs/architecture.md`, `JyDocs-New/api/image.md` (two-arg examples + new API/table rows).

## 6. Risks

- `isComplete` inference relies on `elapsed >= duration` and `stopAt === 0` — verified against system completion semantics (system only completes when `frameAt >= frameCount`, so `elapsed >= duration` at completion; marker stops leave `stopAt > 0`).
- Looping clips must never read `isComplete` true — guarded by the effective-loops check.
- Two-arg change is a deliberate breaking change to the just-shipped single-arg API; all callers (tests + both doc sites) updated in the same change.
