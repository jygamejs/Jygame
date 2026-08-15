# Text Implementation Plan — Commit Breakdown

Plan for implementing the Text architecture in `docs/design/text-architecture.md`.
That design document is the authoritative spec; this document breaks the work
into reviewable commits. **Each commit compiles and is green on its own tests;
the codebase always remains working.**

Test convention (per repo): `node --test tools/ecs/tests/<file>.test.js` per
commit; final verification runs `node --test tools/ecs/tests/`.

Commit message style follows `git log` conventions (`feat:`, `feat(<area>):`,
`docs:`).

> **Status: complete.** All eight commits landed:
> `e72cda1` (C1), `c64d21a` (C2), `0c40f04` (C3), `adc9a33` (C4), `3c9292e`
> (C5), `3debddc` (C6), `10d770d` (C7), and this commit (C8, docs). The full
> suite is green; the priority-4 regression (C5) and the renderer integration
> tests (C7) are in place.

---

## Dependency map

```text
C1 Font ids/accessors ──────────────┐
C2 TextResourcePool core ───────────┤
C3 Text component ──────────────────┼──▶ C5 TextSystem ─▶ C6 display/Text ─▶ C7 renderer tests ─▶ C8 docs
C4 pool layout cache ───────────────┘
```

C1–C4 are independent of each other (any order). C5 needs C1, C2, C3, C4.
C6 needs C5. C7 and C8 are last.

---

## Commit 1 — `feat: Font stable numeric ids and glyph accessors`

Foundation for the `fontHandle` → canonical registry reference (§8, §10 of the
design).

**Files**
- `loaders/Font.js`
- `tools/ecs/tests/FontFacade.test.js`

**Changes**
- Add module-level `_nextId` (starts at 1). Every loaded font — `BitmapFont`
  **and** `NativeFont` — gets `font.id = _nextId++`.
- Add `Font.byId(id)` → font or `null`. `Font.get(name)` unchanged.
- `Font.remove(name)` removes the font but **never frees/reuses its id**.
- `Font.clear()` removes all fonts but **does not reset `_nextId`** (deliberate
  deviation from `AssetRegistry.clear`, which resets — see design §8: ids must
  stay globally unique so a removed font's id can never alias a different font).
- Add public accessors on `BitmapFont`: `glyph(ch)` (→ canvas | null), `advance(ch)`
  (→ number), `lineHeight` (getter). Thin delegates over `_glyph`/`_advance`/
  `_lineHeight`. `Font.render(ctx, ...)` untouched.

**Tests (extend `FontFacade.test.js`)**
- loaded fonts expose `id`; ids are distinct and monotonic.
- `Font.byId(id)` returns the font; `Font.byId(unknownId)` → `null`.
- after `Font.remove(name)`, `Font.byId(oldId)` → `null` and a reloaded font gets
  a **new** id (no reuse).
- after `Font.clear()`, the next loaded font's id is greater than any prior id
  (counter not reset).
- `glyph`/`advance`/`lineHeight` return the same values the private members use;
  missing char → `null`/0; case-insensitive mode still works.

**Verify:** FontFacade, then full suite.

---

## Commit 2 — `feat: TextResourcePool — dense generation-handled resource pool`

The core handle-pool infrastructure (§7.2, §7.4). Standalone; no Text component
or system yet.

**Files**
- new `ecs/render/TextResourcePool.js`
- `ecs/render/index.js` (export)
- `ecs/bootstrap/DefaultWorldBuilder.js` (register `TextResourcePool` resource)
- new `tools/ecs/tests/TextResourcePool.test.js`

**Changes**
- Dense storage: typed-array metadata (`_generation` Uint16Array, `_inUse`
  Uint8Array, `_freeList` Uint32Array) plus cold parallel arrays (`_content`
  `(string|null)[]`, `_layout` `(Layout|null)[]`).
- `allocate(content, fontHandle)` → packed `u32` handle `(slot << 16) | generation`
  (16/16 split as a single named constant). Slot `0` is never allocated →
  handle `0` is the invalid/no-content value.
- `release(handle)` — returns slot to free list, bumps generation; **idempotent**
  (a generation mismatch makes re-release a no-op). **Retire-on-wrap:** a release
  that would overflow the slot's 16-bit generation marks the slot retired
  (`_inUse = 2`) instead of wrapping, guaranteeing a stale handle can never alias
  a live resource.
- `get(handle)` → entry or `null`: one array read + one generation compare.
- Geometric growth (`×2`) of all arrays on demand.

**Tests**
- allocate/get round-trip; handles from consecutive allocations are distinct.
- release → slot returns to free list (next allocate reuses the index with a new
  generation).
- stale handle after release → `get()` → `null`.
- handle `0` → `null`.
- double-release → second call is a no-op (idempotent).
- retire-on-wrap: forcing a slot's generation to the max then releasing retires
  the slot; a pre-retirement handle stays invalid.
- growth: allocate beyond initial capacity without corruption.

**Verify:** TextResourcePool, then full suite.

---

## Commit 3 — `feat: Text ECS component (numeric schema)`

The load-bearing artifact of the numeric-only decision (§7.1).

**Files**
- new `ecs/components/Text.js`
- `ecs/components/index.js` (export)
- new `tools/ecs/tests/TextComponent.test.js`

**Changes**
```js
export class Text {
  static schema = {
    fontHandle:     "u16",   // canonical Font registry id; 0 = none
    contentHandle:  "u32",   // packed pool handle; 0 = no content
    align:          "u8",    // 0 = left, 1 = center, 2 = right
    letterSpacing:  "f32",
    version:        "u32",
  };
}
```
No `Renderable`-duplicating fields (color/layer/depth/smoothing stay in
`Renderable`). No `RenderBounds` component is used by Text (§6 caveat).

**Tests**
- registering `Text` and adding/removing it moves entities between archetypes.
- fields round-trip through `world.set`/`get`.
- default `contentHandle` is `0`.

**Verify:** TextComponent, then full suite.

---

## Commit 4 — `feat: TextResourcePool layout cache and measured bounds`

Extends the pool with the cold layout cache (§7.2, §15). Depends on C2.

**Files**
- `ecs/render/TextResourcePool.js`
- `tools/ecs/tests/TextResourcePool.test.js`

**Changes**
- Per-slot layout structure (reused, never rebuilt per frame):
  ```js
  layout = {
    canvases: [],            // glyph canvases (shared via font tint cache), refilled in place
    positions: Float32Array, // packed x/y/w/h per glyph, refilled in place
    count: 0,
  }
  ```
- `positions` grows **geometrically** only when content length increases.
- Add `_layoutVersion` Uint32Array, `_width`/`_height` Float32Array (measured
  bounds).
- Add `setContent(handle, content)`, `setLayout(handle, ...)`, measured-bounds
  helpers.

**Tests**
- relayout refills buffers in place (same buffer identity across layouts of the
  same capacity).
- positions capacity grows ×2 on longer content and is preserved on shrink.
- measured width/height correct for left/center/right alignment cases.

**Verify:** TextResourcePool, then full suite.

---

## Commit 5 — `feat: TextSystem — RenderQueue glyph producer`

The rendering system (§9). Depends on C1, C2, C3, C4.

**Files**
- new `ecs/systems/TextSystem.js`
- `ecs/systems/index.js` (export)
- `ecs/bootstrap/DefaultWorldBuilder.js` (register `TextSystem` in
  `_ECS_SYSTEMS`; register `Text` component in `_ECS_COMPONENTS`)
- new `tools/ecs/tests/TextSystem.test.js`

**Changes**
- Query `{ all: [Transform, Renderable, Text, Visible] }`.
- **`static priority = 4`** — hard requirement (§9.1): `RenderSystem` clears the
  queue at the start of its `update()` (`RenderSystem.js:40`); TextSystem must
  append glyph commands strictly after that clear, regardless of registration
  order (stable sort, `SystemScheduler.js:297-300`).
- Requires `RenderQueue` and `TextResourcePool` resources; descriptive throw if
  missing (mirrors `RenderSystem`).
- Steady-state loop (§9.2): iterate tables via `for (const table of ctx)` +
  per-table `getColumn` (the proven `RenderSystem` pattern); skip
  `contentHandle === 0`, `Visible === 0`, stale handles (`pool.get` → null);
  relayout only when `Text.version !== layout.layoutVersion`; push one
  `RenderQueue.push(...)` per glyph with
  `sourceImage = glyphCanvas, sx = sy = 0, sw/sh = glyph dims, x/y = layout +
  Transform, rotation/scale from Transform, width/height = glyph dims,
  fillColor/layer/depth/imageSmoothing from Renderable`. Zero allocation in the
  steady-state loop (§19).
- **Lifecycle hook (§7.5):** `onAdded(world)` registers
  `world.onEntityDestroyed` (reads the destroyed entity's `Text.contentHandle`
  and calls `pool.release`; callbacks run before row removal, `World.js:217-228`);
  `onRemoved(world)` unregisters.
- Font resolution at relayout via `Font.byId(fontHandle)`; `null` (removed font)
  → skip the entity (§8).

**Tests (critical)**
- one queue command per glyph with correct region/x/y/width/height.
- color/layer/depth sourced from `Renderable`, not `Text`.
- alignment math (left/center/right).
- relayout on `version` change; **no** relayout when unchanged (assert same
  buffer identity).
- `Visible === 0` skipped; stale handle skipped; `contentHandle === 0` skipped.
- `Font.byId` → null after `Font.remove` → entity skipped, no crash.
- **§9.1 regression test:** a world with `RenderSystem` + `TextSystem` produces
  both sprite and text commands in one queue (proves TextSystem runs after
  RenderSystem's clear).
- Text entity with `Renderable` but no `RenderBounds` is **not** drawn by
  `RenderSystem` (no double-draw).
- Sprite + Text interleaved ordering by layer/depth.
- missing resources → descriptive throw.

**Verify:** TextSystem, then full suite (serialization/prefab still green — the
new component is schema-generic).

---

## Commit 6 — `feat: display/Text facade`

The public API (§6, §7.5, §14, §19). Depends on C5.

**Files**
- new `display/Text.js`
- `core/Scene.js` (`_initScene`/`exit` — `Text._defaultWorld` swap, parallel to
  `Sprite`, `Scene.js:198-201`/`317-323`)
- `jygame.js` (exports)
- new `tools/ecs/tests/Text.test.js`

**Changes**
- Static `_defaultWorld` + `_ensureDefaultWorld` (registers
  `[Transform, Renderable, Visible, Text]` and lazily sets a `TextResourcePool`
  resource so construction works in any world; rendering requires the real scene
  world, exactly as Sprite requires `RenderSystem`).
- Constructor `new Text(x, y, font, content)` (resource third, matching
  `new Sprite(x, y, image)`); accepts a font name (`Font.get`) or a Font instance;
  missing font → descriptive throw.
- Composes `Transform + Renderable + Visible + Text`; allocates the content
  resource via the pool.
- Facade getters/setters (§14): `value`/`text`/`string` (content), `font` (name or
  object), `color` → `Renderable.fillColor`, `align`, `letterSpacing`, `layer`/
  `depth` → `Renderable`, `x`/`y`/`angle`/`scale` → `Transform`, `visible`,
  `width`/`height` (measured from pool layout). Mutations bump `Text.version` as
  specified in §14 (color change included — it invalidates the cached tinted
  glyph canvases).
- `destroy()` → `world.destroyEntity(entity)` (fires the TextSystem release
  hook) plus a defensive idempotent `pool.release` fallback for bare worlds.
- Exports in `jygame.js`: `Text` (facade), `Text as TextComponent`,
  `TextSystem`, `TextResourcePool` (following the `Trail`/`TrailComponent`
  precedent).

**Tests**
- construction in a bare default world and in a scene world.
- name and object font resolution; missing font throws.
- mutation updates component / `Renderable` / pool and bumps `version`.
- `destroy()` releases the slot (slot reusable by a new Text).
- `Text._defaultWorld` swap on scene enter/exit (Sprite-parallel).
- facade `Text` and component `TextComponent` both exported without collision.

**Verify:** Text, TextSystem, full suite.

---

## Commit 7 — `feat: Text renderer integration tests`

No production changes expected; proves the queue path on all backends (§16).

**Files**
- `tools/ecs/tests/Renderer.test.js`
- `tools/ecs/tests/WebGLRenderer.test.js`
- `tools/ecs/tests/WebGpuRenderer.test.js`

**Tests**
- a `Transform + Renderable + Text + Visible` world with `TextSystem` produces
  the expected queue commands.
- Canvas / WebGL / WebGPU `render(world)` consume them without error.
- glyph canvases upload through the existing texture caches (WebGL/WebGPU); two
  Text entities sharing a font+color share the uploaded texture (texture cache
  keys by source object, `gl/texture.cache.js:8`).
- camera transform applied to text glyphs (world-space follow).

**Verify:** the three renderer test files, then full suite.

---

## Commit 8 — `docs: Text architecture, handle conventions, and usage`

Design decision record + usage (§2, §7.1, §22 of the design).

**Files**
- `docs/architecture.md` — add `Text` component (schema + "who owns what"),
  `TextSystem` (priority 4, after RenderSystem), `TextResourcePool` (handle/
  generation/free-list conventions), the numeric-handle invariant, and the
  `Font` registry numeric-id note. Do not duplicate the design document.
- `README.md` — `new Text(x, y, font, content)` usage and the
  `Font.render` vs `Text` distinction.
- `docs/design/text-implementation-plan.md` — this plan (status note).

---

## Test plan

- Per commit: `node --test tools/ecs/tests/<file>.test.js` for the listed files.
- Final: `node --test tools/ecs/tests/` (full suite) — must stay green, including
  serialization/prefab tests (the `Text` component is schema-generic).

---

## Risks & notes

- **§9.1 ordering is the top risk.** The priority-4 requirement exists because
  `RenderSystem` clears the queue in its `update()`. C5 carries the regression
  test; do not "simplify" TextSystem to priority 3.
- **`Font.clear()` must not reset `_nextId`** (C1). This intentionally differs
  from `AssetRegistry.clear()`; the test pins it.
- **`contentHandle === 0`** is the no-content sentinel; typed-array zero-init
  makes it free. Never allocate slot 0.
- **Color changes bump `Text.version`** (C6) because the layout caches tinted
  glyph canvases; a new color allocates a new tinted canvas once (mutation-time),
  never per frame.
- **Out of scope for these commits** (design §23): `ref` columns, generic
  resource infrastructure, glyph atlas, native world-space text, two-layer
  serialization, whole-text culling, WASM ABI.