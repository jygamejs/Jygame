# Image Loading & Animation API Reference

## Table of Contents

- [ImageLoader](#imageloader) — load individual images or batches
- [LoadingTask](#loadingtask) — progress-tracked batch loading
- [AnimationClip](#animationclip) — immutable frame sequence
- [AnimationClipRegistry](#animationclipregistry) — global clip registry
- [AnimationPack](#animationpack) — four loading strategies
  - [load()](#animationpackload) — individual file convention
  - [fromSpriteSheet()](#animationpackfromspritesheet) — fixed-grid sprite sheet
  - [fromAtlas()](#animationpackfromatlas) — flexible atlas regions
  - [fromJSONAtlas()](#animationpackfromjsonatlas) — TexturePacker JSON
- [Sprite.animation API](#spriteanimation-api) — playback controls
- [AssetRegistry](#assetregistry) — frame-to-ID mapping
- [End-to-End Loading Pipeline](#end-to-end-loading-pipeline)
- [Art Asset Layout Conventions](#art-asset-layout-conventions)

---

## ImageLoader

`ImageLoader` is the foundational primitive. It creates `HTMLImageElement` objects, caches them by path string, and provides diagnostics.

```
import { ImageLoader } from "jygame";
```

| Method | Returns | Description |
|--------|---------|-------------|
| `load(path, options?)` | `Promise<HTMLImageElement>` | Load one image by URL. Cached — subsequent calls return the same promise. Options: `{ decode: true }` (default) calls `img.decode()` after load. |
| `loadAll(map, options?)` | `LoadingTask` | Batch load. `map` keys are names, values are paths. Returns a `LoadingTask` that resolves to `{ name: HTMLImageElement, ... }`. |
| `get(key)` | `HTMLImageElement \| null` | Sync lookup from the cache. |
| `has(key)` | `boolean` | Check if a path is cached. |
| `unload(key)` | `boolean` | Remove one entry from cache. |
| `clear()` | `void` | Empty the entire cache. |

```js
// Single image
const img = await ImageLoader.load("assets/player.png");

// Batch
const task = ImageLoader.loadAll({
  bg:   "assets/background.png",
  hero: "assets/hero.png",
  enemy: "assets/enemy.png",
});
task.onProgress((loaded, total) => console.log(`${loaded}/${total}`));
const images = await task; // { bg: HTMLImageElement, hero: HTMLImageElement, ... }
```

---

## LoadingTask

Used by `ImageLoader.loadAll()` (and `FontLoader`, `AudioLoader`) to track batch progress.

```
import { LoadingTask } from "jygame";
```

| Property / Method | Returns | Description |
|-------------------|---------|-------------|
| `.promise` | `Promise` | The underlying promise |
| `.progress` | `number` | `loaded / total` (0–1) |
| `.loaded` | `number` | Count completed |
| `.total` | `number` | Count expected |
| `.then(onfulfilled, onrejected)` | `Promise` | Chain directly |
| `.onProgress(cb)` | `function` (teardown) | Register `(loaded, total) => {}` callback |

```js
const task = ImageLoader.loadAll({ ... });
task.onProgress((loaded, total) => {
  updateProgressBar(loaded / total);
});
const result = await task;
```

---

## AnimationClip

An immutable frozen object holding a sequence of frames, playback speed, and loop mode.

```
import { AnimationClip } from "jygame";
```

```js
new AnimationClip({ frames, fps, loop = true })
```

| Property | Type | Description |
|----------|------|-------------|
| `.frames` | `array` | Frame descriptors (`{ sourceImage, sx, sy, sw, sh }`) or numeric asset IDs |
| `.fps` | `number` | Playback speed (frames per second) |
| `.loop` | `boolean` | Whether the animation loops |
| `.frameCount` | `number` | `frames.length` |
| `.frameDuration` | `number` | `1 / fps` (seconds per frame) |
| `.duration` | `number` | `frameCount / fps` (total seconds) |

Frames are one of:
- An **asset descriptor** `{ sourceImage, sx, sy, sw, sh }` — a sub-rectangle of a source image
- A **numeric asset ID** (u16) — registered via `AssetRegistry`

```js
const clip = new AnimationClip({
  frames: [
    { sourceImage: img, sx: 0, sy: 0, sw: 32, sh: 32 },
    { sourceImage: img, sx: 32, sy: 0, sw: 32, sh: 32 },
    { sourceImage: img, sx: 64, sy: 0, sw: 32, sh: 32 },
  ],
  fps: 12,
  loop: true,
});
```

---

## AnimationClipRegistry

Global registry mapping string names to numeric clip IDs, used by the ECS `AnimationSystem` for efficient lookups.

```
import { AnimationClipRegistry } from "jygame";
```

| Method | Returns | Description |
|--------|---------|-------------|
| `register(name, clip)` | `number` (id) | Register a clip. Throws if name already exists. |
| `get(name)` | `AnimationClip \| null` | Retrieve clip by name. |
| `getById(id)` | `AnimationClip \| null` | Retrieve clip by numeric ID. |
| `getId(name)` | `number \| null` | Get numeric ID for a name. |
| `has(name)` | `boolean` | Check existence. |
| `remove(name)` | `boolean` | Remove from registry. |
| `clear()` | `void` | Reset entire registry. |
| `.count` | `number` | Number of registered clips. |

---

## AnimationPack

Four static methods for loading animation data. Each returns `Promise<{ name: AnimationClip, ... }>`.

### AnimationPack.load()

**Individual file convention.** Given a base `path`, constructs filenames like:

```
{path}/{animName}/{prefix}{padded}{suffix}.{extension}
```

```js
AnimationPack.load({
  path: "assets/characters/hero",
  defaults: { fps: 12, loop: true, extension: "png", padding: 2 },

  idle: { frames: 4, prefix: "idle_" },         // assets/characters/hero/idle/idle_01.png ... idle_04.png
  run:  { from: 1, to: 8, prefix: "run_" },      // range syntax
  jump: 6,                                        // shorthand: just frame count
  attack: {
    frames: 5,
    fps: 15,
    pingPong: true,                               // plays forward then reversed
  },
});
```

**Entry formats:**

| Shape | Meaning |
|-------|---------|
| `run: 6` | 6 frames, numbered 1–6 |
| `run: { frames: 6 }` | 6 frames numbered 1–6 |
| `run: { from: 3, to: 8 }` | Frames 3 through 8 (6 frames) |
| `run: { frames: 6, prefix: "run_", suffix: "_a" }` | Custom prefix/suffix |
| `run: { frames: 4, folder: "." }` | Files in `{path}/` directly (no subfolder) |
| `run: { frames: 4, folder: "King" }` | Files in `{path}/King/` instead of `{path}/run/` |

**Entry defaults:**

| Property | Default | Description |
|----------|---------|-------------|
| `fps` | `defaults.fps ?? 8` | Frames per second |
| `loop` | `defaults.loop ?? true` | Loop mode |
| `extension` | `defaults.extension ?? "png"` | File extension |
| `padding` | `defaults.padding ?? 0` | Zero-pad digit width (0 = no pad) |
| `prefix` | `""` | Filename prefix |
| `suffix` | `""` | Filename suffix |
| `pingPong` | `false` | Forward + reverse playback |
| `folder` | `undefined` | Subfolder name (defaults to animation key). Use `"."` to read from `path` directly. |
| `start` | `1` | Starting frame number (overridden by `from`) |

---

### AnimationPack.fromSpriteSheet()

**Fixed-grid sprite sheet.** Requires `image` (path or HTMLImageElement), `frameWidth`, `frameHeight`. Each entry specifies a row/column position and frame count.

```js
AnimationPack.fromSpriteSheet({
  image: "assets/characters.png",
  frameWidth: 32,
  frameHeight: 32,
  margin: 1,                   // pixels of blank margin around the sheet
  spacing: 1,                  // pixels between frames
  columns: 8,                  // frames per row (inferred from image width if omitted)
  defaults: { fps: 12, loop: true, pingPong: false },

  idle: { frames: 4, row: 0 },               // row 0, columns 0–3
  run:  { frames: 8, row: 1, column: 2 },     // row 1, starting at column 2
  jump: { frames: 5, fps: 15 },                // row 2 (default), columns 0–4
})
```

**Entry format:**
- Number shorthand: `run: 8` — frame count only
- Object: `{ frames, row?, column?, fps?, loop?, pingPong?, crop? }`

**Entry defaults:**

| Property | Default | Description |
|----------|---------|-------------|
| `row` | `0` | Row index (0-based) |
| `column` | `undefined` | Starting column; defaults to 0 per animation |
| `fps` | `defaults.fps ?? 8` | |
| `loop` | `defaults.loop ?? true` | |
| `pingPong` | `false` | |
| `crop` | `defaults.crop ?? null` | `{ left, top, right, bottom }` per-frame inset crop |

---

### AnimationPack.fromAtlas()

**Flexible atlas / irregular sprite sheet.** Each animation can be a grid region or an explicit list of frame rectangles.

```js
AnimationPack.fromAtlas({
  image: "assets/ui.png",

  // Grid region: evenly divided frames
  button: {
    x: 10, y: 10, width: 200, height: 40,
    frames: 4,
  },

  // Grid region with explicit sub-frame size
  explosion: {
    x: 0, y: 100, width: 256, height: 64,
    frameWidth: 64, frameHeight: 64,
    frames: 4,
  },

  // Explicit frame rectangles (irregular)
  particles: {
    frames: [
      [0, 200, 16, 16],
      [16, 200, 8, 8],
      [24, 200, 12, 12],
      { x: 36, y: 200, width: 16, height: 16 },
    ],
    fps: 10,
  },
});
```

**Entry format (object only):**

| Property | For grid | For explicit |
|----------|----------|--------------|
| `x`, `y` | Top-left of region | — |
| `width`, `height` | Region dimensions | — |
| `frames` | Frame count | Array of `[x, y, w, h]` or `{ x, y, width, height }` |
| `frameWidth`, `frameHeight` | Optional — sub-frame size | — |

If `frameWidth`/`frameHeight` are given, the region is divided into a grid of those cells. Otherwise the region is divided evenly horizontally.

---

### AnimationPack.fromJSONAtlas()

**TexturePacker-compatible JSON atlas.** Loads a JSON file alongside the image. Supports both Hash format and Array format.

```js
AnimationPack.fromJSONAtlas({
  image: "assets/hero.png",
  json:  "assets/hero.json",

  idle:   { prefix: "hero_idle_" },     // match frames by name prefix
  run:    { prefix: "hero_run_" },
  attack: { prefix: "hero_atk_" },
});
```

**JSON format support:**

- **TexturePacker Hash (default):** `{ frames: { "hero_idle_01": { frame: { x, y, w, h } }, ... } }`
- **Array format:** `{ frames: [ { filename: "hero_idle_01", frame: { x, y, w, h } }, ... ] }`

Frames are matched by `prefix` and sorted naturally by trailing number.

**Entry format (object only):**

| Property | Default | Description |
|----------|---------|-------------|
| `prefix` | `name` (the entry key) | String prefix to match frame names in the atlas |
| `fps` | `defaults.fps ?? 8` | |
| `loop` | `defaults.loop ?? true` | |
| `pingPong` | `false` | |
| `crop` | `defaults.crop ?? null` | Per-frame inset crop |

---

## Sprite.animation API

After loading animations via `AnimationPack`, attach them to a `Sprite` and control playback.

```js
const sprites = await AnimationPack.load({ path: "assets/hero", ... });
this.player = new Sprite(400, 300);
this.player.animation.addAll(sprites);     // { idle: AnimationClip, run: AnimationClip, ... }
this.player.animation.play("idle");
```

| Method | Description |
|--------|-------------|
| `.add(name, clip)` | Register a clip for this sprite. Converts frame descriptors to asset IDs automatically. Returns `this` for chaining. |
| `.addAll(animations)` | Bulk add from `AnimationPack` result (`{ name: AnimationClip, ... }`). Returns `this`. |
| `.play(name)` | Start playing an animation. Resets to frame 0. No-op if already playing that clip. |
| `.restart(name)` | Same as `play` but always resets (no early-out). |
| `.pause()` | Freeze on current frame. |
| `.resume()` | Resume from current frame. |
| `.stop()` | Pause and reset to frame 0. |
| `.playing` | `boolean` get/set — read or set the playing state directly. |
| `.current` | Name of the currently-playing animation (read/write). |
| `.animations` | The internal `Map<string, AnimationClip>` (read/write). |
| `.onComplete(cb)` | Register a callback `() => {}` fired when a non-looping animation reaches its last frame. Returns `this` for chaining. |

**Internally,** `add`/`addAll` do three things:
1. Convert each frame descriptor `{ sourceImage, sx, sy, sw, sh }` into a numeric asset ID via `AssetRegistry.register()`
2. Create a new `AnimationClip` with numeric IDs
3. Register the clip in `AnimationClipRegistry` under the sprite's entity-scoped key
4. Store the clip in the sprite's local `_animMap`

So each sprite can have its own independent set of animations even if multiple sprites share the same source spritesheet.

---

## AssetRegistry

Low-level registry that maps frame descriptors to numeric IDs for efficient ECS rendering.

```
import { AssetRegistry } from "jygame";
```

| Method | Returns | Description |
|--------|---------|-------------|
| `register(asset)` | `number` (id) | Assign an auto-incrementing ID to a frame descriptor `{ sourceImage, sx?, sy?, sw?, sh? }`. |
| `get(id)` | `object \| null` | Retrieve `{ sourceImage, sx, sy, sw, sh }` by ID. |
| `clear()` | `void` | Reset registry (starts IDs from 1 again). |
| `.size` | `number` | Number of registered assets. |

Used automatically by `Sprite.animation.add()` and `Sprite.image` setter. Rarely called directly.

---

## End-to-End Loading Pipeline

```
                 AnimationPack.load() / .fromSpriteSheet() / .fromAtlas() / .fromJSONAtlas()
                              │
                    ┌─────────┴──────────┐
                    ▼                    ▼
           ImageLoader.load()     fetch + ImageLoader.load()
           (individual files)     (spritesheet/atlas image)
                    │                    │
                    └─────────┬──────────┘
                              ▼
                    AnimationPack internal
                    _extractFrames() → frame descriptors
                    _buildClip() → AnimationClip
                              │
                              ▼
                    { name: AnimationClip, ... }
                              │
               Sprite.animation.addAll()
                    │                    │
                    ▼                    ▼
            AssetRegistry          AnimationClipRegistry
            register()             register()
            (frame→ID)            (name→ID)
                    │                    │
                    └─────────┬──────────┘
                              ▼
                    Sprite._animMap
                    Map<name, AnimationClip>
                              │
                    Sprite.animation.play("idle")
                              │
                              ▼
                    Animation component
                    { clipId, frameIndex, elapsed, isPlaying, speed }
                              │
                              ▼
                    AnimationSystem.update(dt)
                    advances elapsed → computes frameIndex
                    writes frame asset ID → Renderable.image
                              │
                              ▼
                    RenderSystem → AssetRegistry.get(id)
                    → { sourceImage, sx, sy, sw, sh }
                    → canvas.drawImage()
```

---

## Art Asset Layout Conventions

### Individual files (AnimationPack.load)

Directory structure convention:

```
assets/hero/
├── idle/
│   ├── idle_01.png
│   ├── idle_02.png
│   ├── idle_03.png
│   └── idle_04.png
├── run/
│   ├── run_01.png
│   ├── run_02.png
│   └── ...
└── jump/
    ├── jump_01.png
    └── jump_02.png
```

Config:

```js
AnimationPack.load({
  path: "assets/hero",
  idle: { frames: 4, prefix: "idle_" },
  run:  { frames: 8, prefix: "run_" },
  jump: { frames: 2, prefix: "jump_" },
});
```

### Sprite sheet (AnimationPack.fromSpriteSheet)

A single image with evenly-spaced frames in a grid:

```
┌──────┬──────┬──────┬──────┐
│ idle │ idle │ idle │ idle │  ← row 0
├──────┼──────┼──────┼──────┤
│ run  │ run  │ run  │ run  │  ← row 1
├──────┼──────┼──────┼──────┤
│ jump │ jump │      │      │  ← row 2
└──────┴──────┴──────┴──────┘
  margin=1, spacing=1, columns=4, frameWidth=32, frameHeight=32
```

### Atlas / irregular sheet (AnimationPack.fromAtlas)

Flexible placement of frames at arbitrary coordinates.

```
┌───────────┬────┬────┬────┐
│  button   │ p1 │ p2 │ p3 │
├───────────┼────┴────┴────┤
│ explosion │              │
│           │   particles  │
│           │              │
└───────────┴──────────────┘
```

### TexturePacker JSON (AnimationPack.fromJSONAtlas)

Use TexturePacker (or any tool that exports the standard JSON hash/array format). Export with `"JSON Hash"` or `"JSON Array"` format. Frame names should have a trailing number for natural sorting.
