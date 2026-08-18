# Text Architecture Design (Final)

> **Status:** Final design proposal. No code is implemented by this document.
>
> **Audit note:** this revision was produced by critically auditing the proposal
> against the actual Jygame implementation (`ecs/`, `renderer/`, `loaders/`,
> `display/`, `core/`). Claims below are marked **Proven** (the code does this
> today), **Proposed** (what Text introduces), or **Future** (out of scope for
> v1). One correctness defect found during the audit — TextSystem must run
> *after* RenderSystem's queue-clear — is fixed in §9.1.

---

## 1. Executive Summary

Text should be to **Font** what Sprite is to **Image**: a pre-built ECS entity/composition
that consumes a registered resource and participates in Jygame's normal entity/system
rendering architecture — **without weakening Jygame's strictly numeric ECS**.

Today `Font.load("Ink", bitmapConfig)` registers a named `BitmapFont`, but nothing
in the world/entity model consumes it. The only way to draw it is imperative
`Font.render(ctx, ...)`, which works only inside the immediate
`scene.render(ctx)` / `scene.renderUI(ctx)` hooks and is screen-space only.

This document finalizes:

1. A `Text` ECS component with **only compact numeric state**: `fontHandle`
   (`u16`), `contentHandle` (`u32`), `align` (`u8`), `letterSpacing` (`f32`),
   `version` (`u32`). All general rendering state comes from existing components
   (`Transform`, `Renderable`, `Visible`).
2. A **`TextResourcePool`**: a dense, handle-addressed resource pool owning the
   non-numeric data (content strings, layout caches, measured bounds) outside
   the ECS. Dense typed-array metadata, free-list reuse, generation validation.
3. A `TextSystem` (priority **4**, after `RenderSystem`'s queue-clear) that lays
   out text and pushes one glyph quad per character into the shared `RenderQueue`
   with **zero allocation in the steady-state render loop**.
4. A `display/Text` facade composing `Transform + Renderable + Visible + Text`,
   mirroring `display/Sprite`'s concrete pattern (no shared facade base exists).
5. Small **additive** changes to the canonical Font registry: stable numeric
   font ids and `glyph`/`advance`/`lineHeight` accessors. `Font.render(ctx, ...)`
   is preserved unchanged.

**The architectural invariant:**

> The ECS owns numeric state. Resource pools own non-numeric state. Handles
> connect the two.

---

## 2. Architectural Position — The Numeric ECS + Handle Boundary

**Proven** — the ECS storage model is intentionally numeric-only and stays that
way:

- `ecs/core/ComponentRegistry.js:3-5` — canonical types are exactly
  `f32, f64, u8, u16, u32, i8, i16, i32`; anything else is rejected
  (`:166-171`).
- `ecs/core/Table.js:1-10` — the same set maps to typed arrays; unknown types
  throw (`:53-58`).

The engine is deliberately optimized around: archetype storage and SoA columns,
typed-array layout, predictable memory representation, zero-allocation iteration,
minimal GC pressure, cache-friendly access, efficient numeric serialization,
**WASM interoperability** (a future WASM implementation can operate directly on
the typed arrays without understanding JS strings/objects/GC), and
**SIMD/native potential** (uniform numeric columns are vectorizable).

The boundary this design uses is:

```text
WASM-friendly ECS (numeric columns only)
        │
        │ numeric handles
        ↓
JS / resource layer
        ├── strings
        ├── Fonts
        ├── layouts
        ├── caches
        └── other non-numeric data
```

This is **not a workaround for a limitation**. It is the intended boundary
between **hot ECS state** (things systems iterate: positions, colors, layers,
handles, versions) and **cold/non-numeric resource state** (things only touched
after an entity has been identified through normal ECS iteration).

The engineering trade the project accepts:

```text
more infrastructure   VS   weakening the ECS hot-path / storage model
```

The project chooses **more infrastructure**. Complexity belongs at the resource
boundary, never inside the ECS.

---

## 3. Why Not `ref` Fields?

A `ref` column type (a component field holding a JS string/object) was explicitly
considered and **rejected**.

### What `ref` would provide

- direct object/string storage in components
- simpler component access (no handle resolution)
- easier representation of non-numeric state

### What `ref` would weaken

- fixed-width ECS columns
- typed-array storage guarantees
- predictable memory representation
- WASM interoperability (JS object graphs cannot cross the numeric boundary)
- SIMD / native implementation potential
- zero-GC iteration guarantees (object references in hot archetypes invite hidden
  allocations and pressure)
- serialization simplicity (numeric state serializes trivially; object graphs
  require custom writers)
- cache-oriented ECS design (per-row object indirection defeats SoA locality)

### The decisive point

> **Jygame has no requirement that arbitrary objects must live inside ECS
> columns. Numeric handles already provide the boundary needed to represent them
> without weakening the ECS.**

Therefore `Numeric ECS + resource handles` is the architecture. A `ref` column is
**not** a deferred follow-up; it is intentionally outside the architecture and
would only be revisited if future evidence fundamentally changes the ECS goals.

---

## 4. Verified Architecture Facts

**Proven** — the facts the design relies on, with code references. These were
re-verified during the audit and are not assumptions.

### 4.1 Numeric-handle conventions already exist

- `Renderable.image` is `u16` → `AssetRegistry` id (`ecs/components/Renderable.js:3`).
- `Animation.clipId` is `u16` (`ecs/components/Animation.js:3`).
- Entity ids are `u32` (`ecs/core/Table.js:28`, `ecs/core/EntityManager.js:35-39`).
- `AssetRegistry` assigns monotonic, non-reused ids (`_nextId`,
  `ecs/render/AssetRegistry.js:4,13`).

So `u16` = the engine's small-resource-id width and `u32` = the engine's
entity-scale width. The Text handles follow existing conventions.

### 4.2 `RenderQueue` is pooled and allocation-free after warmup

**Proven** — `RenderQueue.push()` reads a preallocated command object and only
creates a new one when a previously unseen slot is used
(`ecs/render/RenderQueue.js:57-90`). `clear()` resets the count but keeps the
pool. Sorting (`:29-35`, `:121-127`) reuses an index array. After warmup, steady
state is allocation-free.

### 4.3 `RenderSystem` clears the queue once per frame

**Proven** — `RenderSystem.update()` calls `queue.clear()` at the start
(`ecs/systems/RenderSystem.js:40`) then repopulates exactly one command per
entity from `[Transform, Renderable, RenderBounds, Visible]`. Priority is `3`
(`:12`). **Consequence:** any other system that pushes into the same queue must
run *after* `RenderSystem` or its commands are wiped. This is the single most
important integration fact for Text (§9.1).

### 4.4 System scheduling and hook contract

**Proven** — systems declare `static query` and `static priority`; the scheduler
sorts by priority with a stable sort (equal priorities run in registration order,
`ecs/core/SystemScheduler.js:297-300`). `SystemScheduler.add()` calls
`system.onAdded(world)` and `remove()`/`clear()` call `onRemoved(world)`
(`:114`, `:136`, `:176`) — the hook point for Text's lifecycle (§7.5). Existing
priorities: `HierarchySystem -10`, `SavePrevPositionSystem -10`,
`MovementSystem 0`, `AnimationSystem 1`, `AudioSystem 1`, `CollisionSystem 2`,
`RenderSystem 3`, `TrailSystem 4`.

### 4.5 Entity destruction hook ordering

**Proven** — `World.onEntityDestroyed` callbacks run *before* the entity's row is
removed (`ecs/core/World.js:208-241`; callbacks at `:217-220`, `removeRow` at
`:228`). A callback can still read the entity's `Text.contentHandle`.

### 4.6 Immediate rendering is screen-space on GPU backends

**Proven** — `SceneStack.render` calls `scene.render(immediateBackgroundContext)`,
`renderer.render(world)`, then `scene.renderUI(immediateContext)`
(`core/SceneStack.js:251-271`). On WebGL/WebGPU the immediate contexts are
offscreen overlays composited in screen space (`WebGLRenderer.js:200-204`,
`:224-230`); on Canvas the camera transform is applied only inside
`renderer.render(world)` (`CanvasRenderer.js:56-95`). World-space text must
therefore go through the `RenderQueue`.

### 4.7 GPU texture cache keys by source image object

**Proven** — `TextureCache.get(sourceImage)` keys by the source object
(`renderer/gl/texture.cache.js:8`). Glyph canvases — including tinted glyph
canvases from `BitmapFont._tintCache` — are uploaded once and shared across
entities and worlds' renderers. This makes the tint-sharing design (§15)
valid on GPU backends, not just Canvas.

### 4.8 `AssetRegistry` descriptor shape

**Proven** — the descriptor is `{ sourceImage, sx, sy, sw, sh }`
(`ecs/render/AssetRegistry.js:15-21`). This is the shape the renderers already
consume from queue commands, and it is the region seam Text uses (§10.3).

---

## 5. The Resource → Consumer Pattern

| Resource | Registration | Consumer | Consumption |
|---|---|---|---|
| Image | `Image.load(name, path)` / `Image.animate(...)` | `Sprite` | name → animation set; element/descriptor → `AssetRegistry` id → `Renderable.image` |
| Audio | `Audio.load(name, path)` | `Audio.play(name)` | name lookup in the audio manager |
| Font | `Font.load(name, ...)` | **nothing in the ECS world (the hole)** | `Font.render(ctx, ...)` is manual, immediate-only |

The invariant: **a registered resource name must have an engine-side consumer.**
`Text` is the missing consumer for Font, and it consumes the font through a
numeric handle exactly as `Sprite` consumes images through `Renderable.image`.

---

## 6. Text's Role in ECS

Text is composed from the **same general components as Sprite**:

```text
Sprite            Text
 ├── Transform     ├── Transform
 ├── Renderable    ├── Renderable
 ├── Visible       ├── Visible
 ├── RenderBounds  └── Text      (fontHandle, contentHandle, align,
 └── Animation                           letterSpacing, version)
```

```text
Entity
├── Transform     (position, rotation, scale — reused)
├── Renderable    (color, layer, depth, imageSmoothing — reused)
├── Visible       (visibility — reused)
├── Text          (text-specific numeric state only)
└── ...           (user components: Dialogue, Lifetime, DamageNumber, ...)
```

**The architectural test** — passed: Text's position, rotation, scale,
visibility, layer, depth, and color all come from existing components.

- **Proven:** there is no shared facade base class; `display/Sprite.js` is a
  concrete bespoke entity wrapper (static `_defaultWorld`, `_ensureDefaultWorld`,
  `_wrap`, component-view getters, `destroy`). Text follows that same concrete
  pattern; no second lifecycle model is invented.
- **Proposed:** Text entities carry no `RenderBounds`, so `RenderSystem`'s query
  (which requires it) never sees them — no double-draw. Text bounds are *measured*
  from the pool layout, not stored in a component. Adding `RenderBounds` to a
  Text entity is documented as unsupported.

---

## 7. Hot and Cold State: Text Component + TextResourcePool

```text
ECS (hot, SoA columns)                    TextResourcePool (cold)
─────────────────────                    ─────────────────────
Text                                      TextResourcePool (world resource)
├── fontHandle      u16   ──────────┐     ├── content string
├── contentHandle   u32   ──────────┼──→  ├── cached layout
├── align           u8              │     ├── layoutVersion
├── letterSpacing   f32             │     ├── measured width/height
└── version         u32             │     ├── generation
                                    │     └── ownership / in-use
Transform (pos/rot/scale)            │     (dense typed arrays + cold JS arrays)
Renderable (color/layer/depth)       │
Visible (visibility)                 │
                                     │
Font registry (shared) ←── fontHandle (canonical, monotonic ids)
```

### 7.1 The `Text` component — hot state

```js
// ecs/components/Text.js — Proposed
export class Text {
  static schema = {
    fontHandle:     "u16",   // canonical Font registry id (monotonic, non-reused)
    contentHandle:  "u32",   // packed pool handle: (slot << 16) | generation; 0 = none
    align:          "u8",    // 0 = left, 1 = center, 2 = right
    letterSpacing:  "f32",
    version:        "u32",   // bumped on content/font/align/letterSpacing/color change
  };
}
```

**Field-by-field audit** (each justified against actual constraints, not copied):

| Field | Width | Verdict | Rationale |
|---|---|---|---|
| `fontHandle` | `u16` | **Keep** | §8: fonts are a small constant set (real games load < 100); `u16` = 65,535 capacity, matching the existing resource-id width (`Renderable.image`, `Animation.clipId`) and storage-compatible since `u16` columns exist. Monotonic ids never reused → no generation bits needed. |
| `contentHandle` | `u32` | **Keep** | Must pack slot + generation. `u32` matches the entity-id width. 16/16 split (§7.4). |
| `align` | `u8` | **Keep** | Only three values; matches the `Renderable.shape` `u8` precedent. Read at relayout only, but compact, queryable, serializable. |
| `letterSpacing` | `f32` | **Keep** | Relayout-only input, but compact and serializable; carries the invalidation story `component → layout` with no duplicated state. |
| `version` | `u32` | **Keep** | §14: the per-frame invalidation signal; the only per-frame write into the pool on change is `layoutVersion` (rare). |

The component contains only compact numeric state that benefits from ECS
iteration/querying. Everything else lives in resource storage.

### 7.2 The `TextResourcePool`

**Proposed** — a world resource (`world.setResource(TextResourcePool, ...)`),
registered by `DefaultWorldBuilder` and lazily by `Text._ensureDefaultWorld` for
bare default worlds. It is **Text-specific** in v1; generalizing it is future
work (§23), not a Text prerequisite.

```js
class TextResourcePool {
  // dense numeric metadata — typed arrays (SoA-friendly, WASM-compatible)
  _generation;      // Uint16Array, per slot
  _inUse;           // Uint8Array, 0 = free, 1 = live, 2 = retired (see §7.4)
  _layoutVersion;   // Uint32Array
  _width, _height;  // Float32Array (measured bounds)
  _freeList;        // Uint32Array (slot indices)

  // cold parallel storage — JS, touched only after handle resolution
  _content;         // (string | null)[]
  _layout;          // (Layout | null)[]

  allocate(content, fontHandle) → contentHandle   // (slot << 16) | generation
  release(contentHandle)                          // free-list + generation bump (idempotent)
  get(contentHandle) → entry | null               // O(1) array read + generation check
  setContent(contentHandle, content)              // facade write path
}
```

**Audit of the data structures against the requirements:**

| Requirement | How achieved |
|---|---|
| Dense storage | Contiguous slot arrays; the free list reuses released slots. No hash map, no entity-keyed dictionary. |
| O(1) lookup | `get(handle)` = one array read + one generation compare. |
| Free-list reuse | `release()` pushes the slot index onto the free list; `allocate()` pops it. |
| Generation validation | `entry.generation === (handle >> 16)` (§7.4). |
| Predictable lifetime | Entity-owned content; released on entity destruction (§7.5). |
| No Map lookup in the normal render path | The system reads pool arrays by slot index, never by entity id and never via `Map`. |
| No per-frame allocation | Metadata is typed arrays; cold JS arrays are refilled in place, not rebuilt (§19). |

**Layout cache shape** (cold): each slot's layout is a reused structure,

```js
layout = {
  canvases: [],            // glyph canvases (shared via font tint cache) — refilled in place
  positions: Float32Array, // packed x/y/w/h per glyph — refilled in place
  count: 0,                // glyph count
}
```

- `canvases[]` is **necessary**: it caches the resolved (and tinted) glyph canvas
  per character so steady-state rendering never performs per-glyph `Map` lookups
  into the font's `_glyphs`/`_tintCache`.
- `positions` is a **single packed numeric buffer** (4 floats per glyph), not an
  array of objects.
- Capacity grows **geometrically** (`×2`) only when content length increases;
  steady-state text never reallocates.

### 7.3 Handles, not entity ids

```text
Entity ID  ≠  Resource ID
```

- **Entity ids** identify ECS entities; owned by `EntityManager`.
- **Content handles** identify pool resources; owned by the pool.

The old `Map<entityId, object>` model made the entity id the resource identity.
This design does not: a resource belongs to a pool and has its own lifecycle.
The shape is reusable (`TextResourcePool`, future `AnimationResourcePool`, ...)
and the ECS never knows what the resources contain.

### 7.4 Generation handles, bit layout, and stale detection

**Proposed** — generation-based handles are the default lifetime mechanism;
reference counting is not used (§7.5).

```text
handle = (slot index) | (generation << 16)         // u32
           └──────────┬──────────┘
     TextPool[slot]
          ↓
     generation matches?
        ├── yes → valid resource
        └── no  → stale handle → get() returns null → system skips
```

**Bit split audit:** `u32`, recommended **16 slot bits + 16 generation bits**.

- **Slot count:** 65,535 concurrent content resources. Realistic concurrent text
  entities are hundreds to a few thousand — two orders of magnitude of headroom.
- **Generation count:** 65,536 cycles per slot before wraparound. A slot must be
  released and reallocated 65,536 times to revisit a generation value.
- **ABA protection (retire-on-wrap):** when a release would overflow the slot's
  generation (`0xFFFF`), the slot is marked **retired** (`_inUse = 2`) and never
  reused. This guarantees **a stale handle can never silently resolve to a
  different live resource**, even after extreme churn. The cost is a bounded,
  astronomically rare leaked slot.
- **Handle `0` is the invalid/no-content convention:** slot 0 is never allocated,
  so `contentHandle === 0` (the typed-array default) means "no content".
  `TextSystem` skips entities with `contentHandle === 0`.
- The split is **a single named constant** in the pool, not part of the ECS
  contract. 20/12 is a valid alternative if slot count ever becomes the binding
  constraint; the retire-on-wrap rule makes any split ABA-safe.

### 7.5 Ownership and the single release path

**Proposed** — two resource kinds, different ownership:

| Resource | Owner | Lifetime | Managed by |
|---|---|---|---|
| `BitmapFont` | Shared — no single entity owns it | `Font.load` → `Font.remove` | Canonical Font registry (module-level) |
| Content/layout resource | Entity-owned — one Text entity | Entity create → entity destroy | `TextResourcePool` |

Reference counting is **not** used: content is one-owner-per-entity, so counters
would add mutation and bookkeeping without benefit. Generation handles + an
explicit free list cover the ownership model.

**The authoritative release path** (chosen to avoid double ownership):

1. **`TextSystem.onAdded(world)`** registers `world.onEntityDestroyed` (verified
   to exist and to run before row removal, §4.5); `onRemoved(world)` unregisters.
   The hook reads the destroyed entity's `Text.contentHandle` and calls
   `pool.release(handle)`. This is the **authoritative** mechanism and covers
   both facade-created and pure-ECS text entities.
2. **`facade.destroy()`** delegates into the same mechanism by calling
   `world.destroyEntity(entity)` (which fires the hook), and *additionally*
   releases its own handle defensively for bare default worlds where no
   `TextSystem` exists. `release()` is **idempotent** — a generation guard makes
   releasing an already-released or foreign handle a no-op — so the two paths
   never double-free.

This satisfies "one authoritative mechanism, with facade methods delegating into
it" while remaining safe in worlds without `TextSystem`.

---

## 8. Font Handles — the `u16` `fontHandle` audit

**Proven** — the canonical Font registry is the module-level `_registry` Map in
`loaders/Font.js` (`Font.load` at `:361`, `Font.get/has/remove`). There is no
second registry.

**Proposed** — the canonical registry gains stable numeric ids (Option B from the
earlier review; the pool does **not** own a font map):

```js
// loaders/Font.js — Proposed, additive
let _nextId = 1;                       // monotonic, never reused
// each loaded font (BitmapFont and NativeFont): font.id = _nextId++;
Font.byId(id);                         // new lookup — null after removal
Font.get(name);                        // existing lookup, unchanged
```

**`u16` width audit** — decided on actual capacity, not by copy:

- Fonts are a **small constant set** — real games load well under 100 font
  resources. `u16` (65,535) is three orders of magnitude of headroom.
- `u16` is the engine's established resource-id width (`Renderable.image`,
  `Animation.clipId`) and is storage-compatible (`u16` columns exist).
- **Stale font handles:** ids are monotonic and **never reused** — including
  across `Font.remove()` and `Font.clear()` (which, unlike `AssetRegistry.clear`,
  must **not** reset `_nextId`). A removed font's id resolves to `null` via
  `Font.byId`, so an old handle can never alias a different font. There is no
  slot reuse, so no generation bits are needed for font handles.

**Removed-font behavior:** at relayout, `Font.byId(fontHandle) === null` →
`TextSystem` skips that entity until the facade re-points `fontHandle`. No crash,
no fallback rendering.

---

## 9. Rendering Architecture

```text
Text entity
      ↓
Text component (version, handles) + TextResourcePool (content, layout)
      ↓
TextSystem (priority 4)
      ↓
glyph quads → RenderQueue
      ↓
Canvas / WebGL / WebGPU
```

### 9.1 System ordering — the critical integration fact

**Proven:** `RenderSystem` clears the queue at the start of its `update()`
(`RenderSystem.js:40`). **Proposed:** `TextSystem.priority = 4` — strictly
greater than `RenderSystem`'s `3` and equal to `TrailSystem`'s `4` (which does
not touch the queue). This guarantees TextSystem always appends glyph commands
*after* RenderSystem's clear+populate, regardless of registration order.

> If TextSystem ran at or below priority 3 (or before RenderSystem in the
> scheduler), its commands would be wiped by RenderSystem's `clear()` every frame.
> Priority 4 is a hard requirement, verified against the scheduler's stable
> priority sort.

No change to `RenderSystem` is made. Both systems are sibling producers of one
shared `RenderQueue`.

### 9.2 The steady-state loop (allocation-free)

**Proposed** — `TextSystem` queries `{ all: [Transform, Renderable, Text,
Visible] }` and follows `RenderSystem`'s proven iteration pattern (`for (const
table of ctx)`, per-table `table.getColumn(...)`, `this._compiled.componentIds`):

```text
iterate ECS archetype tables
    ↓
read numeric columns (Transform, Renderable, Text)
    ↓
contentHandle === 0 ? skip
    ↓
pool.get(contentHandle)  → null ? skip (stale handle)
    ↓
Text.version === layoutVersion ?  (no) → relayout (§14)
    ↓
read cached layout (canvases[], positions, count)
    ↓
per glyph: RenderQueue.push(canvas, 0, 0, w, h,
            layout.x + Transform.x, ..., Transform.rotation,
            Transform.scaleX, Transform.scaleY, w, h,
            Renderable.fillColor, 0,
            Renderable.layer, Renderable.depth,
            Renderable.imageSmoothing, Renderable.depth, ...)
```

**Rendering metadata comes from the shared components** — `Transform` (position,
rotation, scale), `Renderable` (`fillColor` = color, `layer`, `depth`,
`imageSmoothing`), `Visible` (skip when `0`). Text introduces no parallel
rendering fields.

### 9.3 Interleaving, camera, culling, backends

**Proven** (queue, renderers) + **Proposed** (Text as another producer):

- **Interleaving with Sprite:** both push into one `RenderQueue`; commands sort
  by `layer → depth → insertion` (`RenderQueue.js:29-35`). Text and Sprite
  interleave via `Renderable.layer`/`depth`. Equal layer+depth resolves by
  insertion order — the same pre-existing behavior sprites already have across
  tables.
- **Camera transform:** glyph commands carry world coordinates; the renderers
  apply the camera (Canvas: `CanvasRenderer.js:56-95`; WebGL/WebGPU:
  `buildViewProjection`). Text follows the camera exactly like Sprite.
- **Culling:** WebGL/WebGPU cull per command (`WebGLRenderer.js:497-508`); each
  glyph quad is culled individually. Whole-text culling is a future micro-
  optimization, not a correctness issue.
- **Backends:** glyph canvases are valid `sourceImage`s. Canvas draws them via
  `RenderQueue.execute`; WebGL uploads once via `TextureCache.get(canvas)` (keys
  by object, §4.7) and batches through the existing `QuadBatch`; WebGPU likewise.
  Text is expressed entirely in queue commands — no backend-specific code.

---

## 10. Bitmap Fonts

### 10.1 Canonical registry numeric ids

Covered in §8. The pool never duplicates font identity; `fontHandle` is the
canonical registry id, and the font is re-resolved via `Font.byId` only at
relayout time (a rare, single lookup). Steady-state rendering never touches the
font registry.

### 10.2 Accessors (additive only)

**Proposed** — `BitmapFont` already has everything needed; expose thin public
accessors over private data (`_glyph` `:243`, `_advance` `:257`, `_lineHeight`):

```js
font.glyph(ch)      // → canvas | null
font.advance(ch)    // → number
font.lineHeight     // → number
font.measure(text)  // already public
```

`Font.render(ctx, ...)` and `NativeFont` are untouched.

### 10.3 Glyph region seam

**Proposed** — `TextSystem` consumes each glyph through the **proven descriptor
shape** `{ sourceImage, sx, sy, sw, sh }` — the same shape `AssetRegistry`
returns and `RenderQueue` consumes (`AssetRegistry.js:15-21`).

- **Current implementation (v1):** the region is
  `{ sourceImage: glyphCanvas, sx: 0, sy: 0, sw: canvas.width, sh: canvas.height }`.
- **Intended architecture (Future):**
  ```text
  BitmapFont → glyph atlas (single texture) → glyph UV rectangles → TextSystem → RenderQueue
  ```
  The atlas is a `BitmapFont`-internal change; `TextSystem`, the queue, and the
  public `Text` API are untouched because glyphs already flow through region
  descriptors.

No parallel descriptor shape is invented; the existing queue shape is used
directly.

---

## 11. Native Fonts

**Proposed** — native fonts are **not** forced into the bitmap rendering pipeline
in v1.

- **Proven:** native fonts are natively consumed by the browser
  (`ctx.font = "24px Pixel"; ctx.fillText(...)`). `NativeFont` also receives a
  stable numeric id in v1 (uniform registry), but its world-space rendering is
  **Future**:
  ```text
  NativeFont → Canvas 2D rasterization → cached texture → single quad → RenderQueue
  ```
- Immediate rendering via `Font.render(ctx, ...)` remains the native-font path
  for v1 — correct for UI/debug text on all backends.

### 11.1 Render-mode capabilities

The retained-Text boundary is an explicit capability contract, not a
concrete-class check. Both font types extend the shared `FontBase` abstraction,
which exposes `font.capabilities` (`{ glyph, raster }`) and
`font.supportsRenderMode(mode)`; `Text` validates the requested render mode
against the font at construction, on any `font`/`renderMode` change, and again
in `TextSystem` every frame before any renderer runs.

```text
BitmapFont: capabilities = { glyph: true,  raster: true }
NativeFont: capabilities = { glyph: false, raster: false }
```

`TextRenderMode.GLYPH` and `TextRenderMode.RASTERIZED` are both accepted for
bitmap fonts. Native fonts report neither retained mode, so any `Text` that
targets them throws:

```text
Text: font "Pixel" does not support render mode "glyph".
```

The mode is honored or rejected — never silently rerouted (no `glyph → raster`
or `raster → glyph` fallback). Unsupported combinations fail at the API boundary
and again in `TextSystem`, so a renderer only ever receives a `Text` whose font
declares support for that renderer's mode.

The `Text` component/system contract does not preclude the future native path:
once native rasterization exists, `NativeFont.capabilities.raster` flips to
`true` and the existing pipeline (whole-string raster → one quad through the
same region seam) applies — no new component, no new facade, no public `Text`
API change. The same applies to a future native glyph representation.

---

## 12. Immediate Rendering — preserved (non-negotiable)

**Proven:** `Font.render(ctx, ...)` stays. It serves the immediate hooks
(`scene.render(ctx)` / `scene.renderUI(ctx)`), screen-space. `Text` is an
*additional* consumption path:

```text
Font
 ├── Font.render(ctx, ...)
 │      → immediate Canvas rendering (unchanged)
 │
 └── numeric font id
        → TextSystem → RenderQueue (new)
```

```js
// Immediate — debug overlay, screen space:
renderUI(ctx) { debugFont.render(ctx, `FPS: ${this.fps}`, 10, 10); }

// World-space — camera-following, layer/depth-ordered:
const label = new Text(100, 200, "Ink", "Score: 0", { layer: Layer.ENTITIES, depth: 5 });
```

---

## 13. Resource Resolution

**Proposed** — the facade accepts both a registered name and a direct object,
resolving by name (Sprite's convention):

```js
new Text(100, 200, "Ink", "Hello");   // name → Font.get("Ink") → fontHandle
new Text(100, 200, ink, "Hello");     // direct BitmapFont → fontHandle
```

1. String → `Font.get(name)` → font's numeric id → `Text.fontHandle`.
2. Instance → its numeric id.
3. Missing font → descriptive throw (the engine's strict validation style).

**Hot-path separation (explicit):** the name → handle lookup happens **during
construction/mutation**, never in the render loop. `TextSystem` reads only the
numeric `fontHandle` column; the string name is never in the hot path.

Constructor signature: `new Text(x, y, font, content)` — resource third, matching
`new Sprite(x, y, image)`. A facade detail; the architecture is
`Text component → handle → Font resource`.

---

## 14. State and Mutation

**Proposed** — the facade writes numeric columns and pool cold state:

```js
text.value  = "Score: 100";  // content          → pool.setContent + Text.version++
text.font   = "Ink";         // font             → Text.fontHandle + Text.version++
text.color  = "#ffcc00";     // tint             → Renderable.fillColor + Text.version++ (see below)
text.align  = "center";      //                  → Text.align + Text.version++
text.letterSpacing = 1;      //                  → Text.letterSpacing + Text.version++
text.layer  = Layer.ENTITIES;//                  → Renderable.layer
text.depth  = 5;             //                  → Renderable.depth
text.x / y / angle / scale   //                  → Transform
text.visible                //                  → Visible
```

**Invalidation mechanism — audit:** `Text.version` (component column) is retained
over a pool dirty flag. Reasoning:

- The system must check *something* per entity per frame. A column read
  (`Text.version`) is the cheapest, is SoA/SoA-iterable, and is serializable.
- A pool dirty flag would be the *same* per-frame read, but cold (touched only
  after handle resolution) and non-serializable.
- `version` gives mutation → relayout **exactly once**: any relevant change bumps
  it; the system relayouts when `version !== layoutVersion` and stores
  `layoutVersion = version`. Unchanged text does not relayout.
- The render path performs **no mutation of cold JS objects**: it only *reads*
  the layout and (on relayout, rare) *writes* `layoutVersion` and refills the
  layout buffers.

```text
Text component            TextPool[handle]
    version = 17    ───→     layoutVersion = 17
                             layout = [...]

version ≠ layoutVersion  →  relayout (rare; may allocate cold buffers)
version = layoutVersion  →  push cached layout (steady state, zero allocation)
```

**Color/tint nuance (corrected from earlier drafts):** the layout's `canvases[]`
caches *tinted* glyph canvases, so a color change makes them stale. The facade
therefore bumps `version` on color change; relayout refills `canvases[]` from
`font._getTinted(ch, color)`. The tint cache (`BitmapFont._tintCache`, keyed by
`char\u0000color`) means a color never seen before allocates a new tinted canvas
**once** (mutation-time), and every later use shares it. Steady-state rendering
creates no tinted canvases.

---

## 15. Caching

**Proposed** — separate the architectural requirement (Text is a proper
renderable) from the optimization (how glyphs are rendered):

| Concern | Cached? | Where | Invalidated by | Allocation |
|---|---|---|---|---|
| Glyph slicing | Yes | `BitmapFont` at load time | `Font.remove` | load-time |
| Glyph tinting | Yes | `BitmapFont._tintCache` (shared across entities) | per (char,color) key | first use of a color |
| Layout | Yes | `TextResourcePool` per content resource | `Text.version` bump | on change, geometrically |
| Queue commands | **No** | — the queue is rebuilt every frame by design | per frame | pooled, none after warmup |

**Proven:** the `RenderQueue` is repopulated each frame (`RenderSystem.clear()` +
populate), so caching text cannot mean caching queue commands — that is what the
engine deliberately regenerates for every renderable. What *is* cached is the
**layout computation** (the per-character loop and the resolved/tinted glyph
references), which runs only on `version` change.

**Proven:** tinted glyph canvases are shared across entities via
`BitmapFont._tintCache`, and GPU texture caches key by source object (§4.7), so
two Text entities with the same color share GPU textures — no per-entity glyph
duplication.

---

## 16. Backend Compatibility

**Proven + Proposed:** because Text goes through `RenderQueue`, it behaves
identically across backends:

| Backend | Path | Result |
|---|---|---|
| Canvas | `RenderQueue.execute` → `drawImage(glyphCanvas, ...)` | Camera-transformed, ordered |
| WebGL | `TextureCache.get(canvas)` → `QuadBatch` instanced quad | Uploaded once per glyph canvas, batched, ordered, culled |
| WebGPU | `WgpuTextureCache.get(canvas)` → batch | Same as WebGL |

Caveats:

- **Glyph filtering:** `Renderable.imageSmoothing` applies as for sprites.
- **Culling:** per-command; each glyph quad culled individually (§9.3).
- **Immediate inconsistency (pre-existing, Proven):** Canvas draws immediate
  hooks inline; WebGL/WebGPU composite offscreen overlays in screen space. This
  is exactly why Text must not depend on the immediate path for world rendering.
  It does not affect the recommended architecture.

---

## 17. Serialization — stated honestly

**Proposed** — serialization is a **two-layer problem**, and Text serialization
is **not part of v1**:

```text
World
├── ECS numeric state
│     └── Text handles (fontHandle, contentHandle, align, letterSpacing, version)
└── resource state
      └── TextResourcePool entries (content strings, measured bounds)
```

- The **ECS layer serializes cleanly**: handles are numbers, exactly like
  `Renderable.image` ids. This is a strength of the handle model.
- The **resource layer is a separate remapping problem**: a deserialized world
  needs a fresh pool; old content handles must be rewritten to new slots. Font
  handles need no remap (globally monotonic ids) if the font is loaded.

The design makes Text serialization *possible* (handles are explicit) without
solving it in v1. No serialization infrastructure is introduced to make the
proposal look complete. The existing `Serializer` (`ecs/serialization/Serializer.js`)
serializes numeric columns only and is unchanged.

---

## 18. Costs (stated honestly)

Handles are not free. These costs are acceptable because they occur at the
**ECS/resource boundary** and preserve the ECS's performance characteristics.
Implementation complexity is **not** a reason to reject this architecture; the
project explicitly prioritizes optimization over minimizing machinery.

### Runtime

- extra indirection: content/font reached through handles, not direct references
- handle validation: one generation compare per `get()`
- resource lookup: one O(1) array read per entity per frame
- potential cache miss crossing the ECS/resource boundary
- lifecycle checks (in-use, generation)

### Memory

- handle columns (`fontHandle`, `contentHandle`) per Text entity
- pool metadata: generation counters, in-use flags, free list, layout buffers
- retire-on-wrap leaks an astronomically rare slot (§7.4)
- pool growth/compaction policy (§22 open question)

### Architecture

- explicit ownership (entity-owned content, shared fonts)
- two-layer serialization (§17)
- stale-handle handling (generation guard, null skips)
- pool growth and optional compaction

---

## 19. Allocation Guarantees (precise)

The distinction that matters:

```text
allocation-free steady state
```

versus

```text
allocation-free under every possible mutation
```

The requirement is the first. Text mutation/layout invalidation may allocate or
resize cold resources.

**Steady-state render loop — where allocations NEVER occur (verified):**

- No object creation: layout buffers and pool entries are reused, not rebuilt.
- No array creation: `positions` is a single refilled `Float32Array`;
  `canvases[]` is refilled in place; the queue's command pool and sort-order
  array are reused (`RenderQueue.js:57-90`, `:121-127`).
- No string creation: content strings are stored in the pool at mutation time
  and only *read* during rendering.
- No Map creation/lookup: pool access is by slot index; the font registry is not
  touched in steady state.
- No temporary layout objects: relayout fills a preallocated structure.
- No per-glyph allocations: each glyph is an array read + one `queue.push` into
  the pooled command store.
- No queue command allocations after warmup: `push()` reuses pooled command
  objects.
- No closures per entity: `TextSystem` iterates tables and pushes directly (the
  renderers' single closure per render pass is **pre-existing** engine behavior,
  not introduced by Text).
- No hidden conversions: all columns are read as numbers; no `toFixed`/template
  strings etc. in the loop.

**Where allocations ARE allowed (bounded to mutation events, not per frame):**

- Text creation (entity, components, pool slot, first layout).
- Content change (new string, possible geometric layout-buffer resize).
- Color first use (a new tinted canvas in `_tintCache`).
- Font load (registry entry).
- Pool growth and queue-pool growth (first time a command count is reached).

---

## 20. Alternatives Considered

### A. Immediate-only Text
`Text` calls `font.render(ctx, ...)` each frame. Screen-space only on GPU
backends; no camera; no layer/depth. **Rejected** (kept only as `Font.render`).

### B. ECS Text + immediate rendering
`TextSystem` renders via `font.render` into the immediate context. Same
screen-space problem; no queue integration. **Rejected.**

### C. ECS Text + RenderQueue (**recommended**)
Glyph quads enter the existing queue. Uniform across backends; inherits
camera/order/cull/batch; `Font.render` intact. **Recommended.**

### D. Per-domain / per-layer immediate canvases
Multiplies overlay textures; does not solve queue interleaving. **Rejected.**

### E. Text-specific rendering metadata in `Text`
Duplicating color/layer/depth in `Text`; `Renderable` already owns them.
**Rejected.**

### F. Merged renderer (`RenderSystem` handles Text)
One-command-per-entity vs N-command layout; archetype ambiguity (no
`RenderBounds`); layout coupled into the zero-alloc hot path. **Rejected** in
favor of a separate `TextSystem` (§9).

### G. `Map<entityId, object>` side state (earlier `TextState`)
Hash lookups, object-heavy storage, unclear ownership/lifetime, poor locality, a
second storage model beside the ECS. **Rejected** in favor of the handle pool
(§7).

### H. `ref` component columns
Direct string/object storage; weakens typed arrays, WASM interop, SIMD/native
potential, zero-GC iteration, serialization, cache-oriented design. **Rejected**
(§3). The decision is closed.

---

## 21. Recommended Architecture

```text
                         Font Registry (canonical)
                              │
                              ↓
                         BitmapFont  (shared; stable monotonic id)
                              │
                              │
ECS                         Text Resources
─────────────────          ─────────────────────
Transform                  TextResourcePool
Renderable                 content string
Visible                     cached layout
Text                        layout version
 ├─ fontHandle ───────────→ measured bounds
 ├─ contentHandle ───────→ generation metadata
 ├─ align                   ownership / in-use metadata
 ├─ letterSpacing
 └─ version
        │
        ↓
   TextSystem (priority 4 — after RenderSystem's queue-clear)
        │
        ↓
   RenderQueue (shared with RenderSystem; layer→depth→insertion)
        │
        ↓
 Canvas / WebGL / WebGPU
```

**Components involved:** new `Text` component; existing `Transform`, `Renderable`,
`Visible`.
**Systems involved:** new `TextSystem` (priority 4); `RenderSystem` untouched.
**Resources:** new `TextResourcePool` (world resource); existing `RenderQueue`,
`AssetRegistry`, canonical `Font` registry unchanged. **No new font registry.**
**Font:** additive accessors + stable numeric ids; `Font.render` preserved.
**Backends:** no changes — Text is expressed entirely in queue commands.
**Public API:** new `display/Text` facade, exported from `jygame.js`.

---

## 22. Implementation Plan

Resource infrastructure first, then Text. Each step is independently reviewable.

### Step 1 — Audit record (no code)
Files: `ecs/render/AssetRegistry.js`, `ecs/render/RenderQueue.js`,
`loaders/Font.js`, `ecs/core/World.js`, `ecs/core/SystemScheduler.js`.
Activity: codify the verified facts in §4 into `docs/architecture.md` — handle
widths, priority ordering, hook contract, queue pooling.

### Step 2 — Define the numeric handle representation
Decisions: `fontHandle` u16 (monotonic, non-reused, no generation); `contentHandle`
u32 packed 16/16 (slot/generation), split as a single pool constant, handle `0`
= none, retire-on-wrap rule.
Files: `docs/architecture.md`.

### Step 3 — Minimal dense pool + lifetime mechanism
Files: new `ecs/render/TextResourcePool.js`; update `ecs/render/index.js`;
register in `ecs/bootstrap/DefaultWorldBuilder.js`.
Implements: typed-array metadata (generation, inUse, layoutVersion, width/height),
free list, `allocate`/`release` (idempotent)/`get` (generation-validated),
retire-on-wrap, cold parallel arrays for content/layout.
Tests: `tools/ecs/tests/TextResourcePool.test.js` — allocate/get; release →
free-list; stale handle (generation mismatch) → null; slot reuse bumps
generation; retire-on-wrap; handle `0` invalid; release idempotence; growth.

### Step 4 — Font registry numeric ids + accessors
Files: `loaders/Font.js`.
Changes: `_nextId` + `font.id` (BitmapFont *and* NativeFont), `Font.byId(id)`,
`Font.remove`/`clear` do **not** reset `_nextId`; `glyph(ch)`, `advance(ch)`,
`lineHeight`. `Font.render` untouched.
Tests: extend `tools/ecs/tests/FontFacade.test.js` — id stability, removed font
→ `byId` null, no id reuse after remove/clear.

### Step 5 — `Text` component
Files: new `ecs/components/Text.js` (schema §7.1); update `ecs/components/index.js`.
Tests: register/query/arity; field round-trip; default `contentHandle === 0`.

### Step 6 — Text resource storage
Files: extend `ecs/render/TextResourcePool.js` (layout cache, `setContent`,
measured bounds).
Lifecycle: `TextSystem.onAdded` registers `world.onEntityDestroyed` → release;
`onRemoved` unregisters (single authoritative path, §7.5).
Tests: pool lifecycle integration; entity destruction releases the slot; release
idempotent under double-release.

### Step 7 — `TextSystem`
Files: new `ecs/systems/TextSystem.js`; update `ecs/systems/index.js`; register in
`DefaultWorldBuilder._ECS_SYSTEMS`.
Query `{ all: [Transform, Renderable, Text, Visible] }`; **`priority = 4`**
(hard requirement, §9.1). Requires `RenderQueue` + `TextResourcePool` (descriptive
throw if missing). Steady-state loop per §9.2 — column reads, O(1) handle
resolution, cached-layout push; relayout on `version !== layoutVersion`.
Tests: `tools/ecs/tests/TextSystem.test.js` —
- one command per glyph with correct region/x/y/width/height;
- color/layer/depth sourced from `Renderable`;
- alignment; version-based relayout (none when unchanged);
- `Visible=0` skipped; stale handle skipped; `contentHandle === 0` skipped;
- missing-font error path; `Font.byId` null after removal → entity skipped;
- **priority ordering: TextSystem (4) runs after RenderSystem (3); a world with
  both produces sprite + text commands in the same queue** (the §9.1 defect
  regression test);
- Text entity without `RenderBounds` is not drawn by `RenderSystem`;
- interleaved Sprite+Text ordering by layer/depth.

### Step 8 — `display/Text` facade
Files: new `display/Text.js`; hook `core/Scene.js` `_initScene`/`exit` for
`Text._defaultWorld` (parallel to `Sprite`, `Scene.js:198-201`/`317-323`);
export from `jygame.js`.
Compose `Transform + Renderable + Visible + Text`; allocate content resource;
facade getters/setters (§14); `destroy()` → `world.destroyEntity` + defensive
idempotent release.
`Text._ensureDefaultWorld` registers `[Transform, Renderable, Visible, Text]` and
a `TextResourcePool` so construction works in any world; rendering requires the
real scene world (TextSystem + RenderQueue), exactly as Sprite requires
`RenderSystem`.
Tests: `tools/ecs/tests/Text.test.js` — bare default world and scene world
construction; mutation updates component/Renderable/pool; destroy releases slot;
Sprite-parallel lifecycle; name and object font resolution.

### Step 9 — Renderer integration verification
Files: no production changes expected; extend renderer tests.
Tests: `tools/ecs/tests/Renderer.test.js` / `WebGLRenderer.test.js` /
`WebGpuRenderer.test.js` — a `Transform + Renderable + Text + Visible` world with
`TextSystem` produces the expected queue commands; Canvas/WebGL/WebGPU consume
them; glyph canvases upload through existing texture caches; two entities sharing
a font+color share the uploaded texture.

### Step 10 — Documentation
Files: `README.md` (Text usage), `docs/architecture.md` (Text component,
TextSystem priority, TextResourcePool, handle conventions).

---

## 23. Future Work (explicitly separable)

- **`ref` columns** — rejected for the current architecture, not a deferred
  follow-up (§3). Revisit only if the ECS goals fundamentally change.
- **Generic resource infrastructure** — extract the dense-pool/generation/free-list
  shape for `TextResourcePool`, `AnimationResourcePool`, etc. Not required by Text.
- **Atlas-backed `BitmapFont`** — glyph atlas + UV regions through the existing
  region seam (§10.3).
- **Native world-space text** — rasterization + texture cache (§11).
- **Two-layer serialization** for Text (§17).
- **Whole-text culling** (§9.3).
- **WASM ABI** — a numeric handle ABI at the ECS boundary (§2).

---

## 24. Design Questions Answered

| # | Question | Answer |
|---|---|---|
| 1 | Why does ECS remain numeric-only? | §2 — typed-array/SoA storage, zero-alloc iteration, low GC, WASM/SIMD/native potential, serialization. |
| 2 | Why handles over `ref`? | §3 — the boundary without weakening the ECS; no requirement that objects live in columns. |
| 3 | What is hot state? | §7.1 — `Text` numeric columns + `Transform`/`Renderable`/`Visible` columns. |
| 4 | What is cold state? | §7.2 — pool content, layout, bounds, generation, in-use. |
| 5 | Who owns each resource? | §7.5 — fonts shared (registry); content entity-owned (pool). |
| 6 | How are resources allocated? | §7.2 — `pool.allocate` at facade construction; free-list pop. |
| 7 | How are resources released? | §7.5 — `TextSystem.onAdded` hook on `world.onEntityDestroyed`; facade `destroy` delegates + idempotent fallback. |
| 8 | How are stale handles detected? | §7.4 — generation compare; `get()` → null; system skips. |
| 9 | What happens when a slot is reused? | §7.4 — generation bumped; old handle invalid; retire-on-wrap prevents ABA. |
| 10 | What happens when a font is removed? | §8 — `Font.byId` → null; relayout skips the entity; ids never reused so no alias. |
| 11 | What happens when text changes? | §14 — facade bumps `Text.version`; system relayouts; may allocate cold buffers. |
| 12 | What happens when text does not change? | §14, §19 — version matches; cached layout pushed; zero allocation. |
| 13 | Where can allocations occur? | §19 — creation, content change, first color, font load, pool/queue growth. |
| 14 | Where must allocations never occur? | §19 — the steady-state render loop. |
| 15 | How does Text enter RenderQueue? | §9 — `TextSystem` (priority 4) pushes glyph commands after `RenderSystem`'s clear. |
| 16 | How does Text interleave with Sprite? | §9.3 — shared queue, layer → depth → insertion. |
| 17 | How does camera transformation work? | §9.3 — commands carry world coords; renderers apply the camera. |
| 18 | How does backend abstraction remain intact? | §16 — queue commands + texture caches; no backend-specific code. |
| 19 | How does `Font.render()` remain available? | §12 — unchanged immediate path. |
| 20 | What happens with NativeFont? | §11 — immediate-only in v1; world-space is future rasterization. |
| 21 | What happens during serialization? | §17 — ECS layer numeric; resource layer separate, not in v1. |
| 22 | What is explicitly out of scope? | §23 — native world-space text, atlas, generic pools, WASM ABI, serialization, `ref`. |
| 23 | What depends on current implementation details? | §4 — numeric columns, RenderSystem clears once (priority-4 requirement), queue pooling, `onEntityDestroyed` ordering, texture-cache keying, tint cache, monotonic id convention. |

---

## 25. Open Questions

1. **Content field naming** — `text.value`, `text.text`, or `text.string`?
   (Deferred to implementation.)
2. **Multi-line support** — `BitmapFont.render` is single-line. Recommended: no
   `\n` handling in v1; match the existing render behavior.
3. **Pool compaction** — free-list reuse for v1; `compact()` only if
   fragmentation is observed.
4. **Content sharing** — the pool supports explicit sharing (same handle on two
   entities), but v1 assumes one content per entity. When is sharing worth
   exposing? (Recommended: after the pool is proven.)
5. **`Text.width`/`height`** — measured bounds from the pool layout, not
   `RenderBounds` (§6 caveat). Confirm at implementation.

---

## 26. Conclusion

> **Jygame's ECS remains strictly numeric. Text does not require weakening that
> invariant. Text-specific non-numeric state is stored in a dedicated resource
> pool and referenced from the ECS through compact numeric handles. The pool uses
> dense storage, free-list reuse, explicit ownership, and generation-aware handles
> so that resource lifetime and stale-reference safety are handled without
> introducing object references, strings, or GC-heavy structures into the ECS hot
> path.**

Text is a `Transform + Renderable + Visible + Text` composition — the same shape
as Sprite — rendered by a `TextSystem` (priority 4, after `RenderSystem`'s
queue-clear) that turns `Font` glyphs into `RenderQueue` commands with zero
allocation in the steady-state loop. The ECS owns numeric state.
`TextResourcePool` owns non-numeric state. Handles connect the two. This makes
Text a real, camera-ordered, backend-uniform world renderable while leaving
`Font.render(ctx, ...)`, native fonts, and the numeric ECS exactly where they
already work.