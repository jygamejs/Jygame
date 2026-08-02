# Renderer Architecture — Implementation Plan

## Status

**In progress — Sessions 1-3 complete.** Design target: `docs/renderer-architecture.md`
(Proposed). This plan turns that design into concrete, session-by-session work.

Session 1 (Renderer contract + `CanvasRenderer`) is implemented and green:
`renderer/{Renderer,CanvasRenderer,index}.js`, `Game` `renderer` option,
`World` data surface (`renderables` / `effects` / `collectTrailRenderables`),
deprecated `World.render` shim, updated render-path tests, new
`tools/ecs/tests/Renderer.test.js` (15 tests).

Session 2 (resolver + lifecycle) is implemented and green:
`renderer/RendererResolver.js` (`"auto"`/`"canvas"`/instance passthrough,
`not-implemented` for `webgl`/`webgpu`), `Game` uses the resolver,
`Game.resize(width, height)`, `_applyViewport`/ResizeObserver sync the renderer,
`Game.destroy` releases the renderer, base `Renderer.resize` bookkeeping with a
behavior-preserving `CanvasRenderer.resize` (guarded backing-store reset +
imageSmoothing re-apply). New `RendererResolver.test.js` (7) and
`GameRenderer.test.js` (8, DOM-mocked).

Session 3 (`WebGLRenderer` sprites + primitives) is implemented and green:
`renderer/WebGLRenderer.js` + `renderer/gl/{index,quad.batch,texture.cache}.js`
+ `renderer/immediate/ImmediateCanvas.js`. Instanced-quad batching (per-instance
pos/rotation/scale/size/uv/color/depth/shape), camera view-projection uniform
matching the CanvasRenderer transform, premultiplied blending, lazy texture
upload, `RenderConfig` clearColor/screenSpace/pixelPerfect/culling, `render.draw`
/`render.batch`/`render.images`/`render.primitives` metrics, offscreen 2D
immediate overlay composited in `endFrame`. `RendererResolver` `"webgl"` +
`"auto"` (via `WebGLRenderer.isAvailable()` probe); `Scene` registers
`RenderConfig` as a resource; `RenderQueue.forEachCommandSorted`. New
`WebGLRenderer.test.js` (14, mock GL) + `tools/ecs/tests/lib/MockGL.js`.
Canvas remains the fallback; trails/particles on GL are Session 4. Next:
Session 4 (GL trails + particles, wire `GpuParticleBackend`).

Each session is independently completable: it ends with a green test suite and
a working engine. Sessions build on each other; do not skip Session 1.

---

# 1. Goal Restated

Move retained-object rendering out of a Canvas2D-centric `World.render(ctx)`
and behind a `Renderer` abstraction owned by the `Game`. The World keeps owning
renderables; the Renderer draws them. `Scene.render(ctx)` stays Canvas2D
immediate-mode forever.

Three sibling implementations of the same contract:

```
Renderer
 ├── CanvasRenderer
 ├── WebGLRenderer
 └── WebGpuRenderer
```

Selected once at `Game` construction:

```js
new Game({ renderer: "auto" | "canvas" | "webgl" | "webgpu" })
```

`"auto"` resolves: WebGPU → WebGL2 → Canvas.

---

# 2. Current Architecture (exact map)

The map below is the ground truth each session works from. Read it carefully.

## 2.1 Frame orchestration — `core/Game.js`

- `constructor` creates `this.canvas`, gets `this.ctx = canvas.getContext("2d")`
  (line 49), creates `this.domLayer` (DOM UI container), stores
  `this.width` / `this.height`, handles `scaleToFit` viewport via
  `_applyViewport()`.
- `_loop` → `_frame(diag, ticks, realDt)` is the heart:
  1. `doInput`
  2. `doUpdate` — `_updateScenes` + `top.world.update`
  3. `_flushSceneOps()`
  4. interpolation (`_interpolateScenes`) + `_restoreSceneTransforms`
  5. `doCanvas` — `ctx.clearRect(0, 0, width, height)` (metric `frame.canvas`)
  6. `_renderScenes(this.ctx, renderStart)` (metric `frame.render`)
  7. debug overlay `this._debugOverlay.render(this.ctx, w, h)`
- `_renderScenes(ctx, start)` (line 470), per scene:
  `scene.render(ctx)` → `scene.world.render(ctx)` → `renderUI()` DOM diff.
- Metrics used: `frame.total/input/update/render/canvas/delta/fps`.

## 2.2 Retained drawing — `ecs/core/World.js`

- `render(ctx)` (line 720): opens its own diagnostics frame, `ctx.save()`,
  applies camera transform from the `Camera` + `Viewport` resources
  (translate to viewport center, scale by `camera.zoom`, rotate
  `-camera.rotation`, translate `-camera.x/-camera.y`), executes the
  `RenderQueue` resource, `_renderTrails(ctx)`, `_renderEffects(ctx)`,
  `ctx.restore()`, closes its diagnostics frame.
- `_renderTrails(ctx)` (line 767): reads `TrailManager` + a cached query view
  over `Transform + Trail + Visible`, builds plain `{ depth, buffer, color,
  width, mode }` items, sorts by depth, draws via `TrailRenderer`.
- `_renderEffects(ctx)` (line 869): sorts `this._effects` by depth, calls
  `effect.render(ctx)`.
- `_effects` array with `addEffect` / `removeEffect`.

## 2.3 Draw command layer — `ecs/render/RenderQueue.js`

- `push(sourceImage, sx, sy, sw, sh, x, y, rotation, scaleX, scaleY, width,
  height, fillColor, shape, layer, imageSmoothing, depth)`.
- `execute(ctx, layerMask)`: sorts commands by `layer` then `depth`, draws with
  2D calls (`drawImage` for images, `fillRect` / `arc` for primitives), caches
  fill styles.
- The only caller that populates it is `RenderSystem` (an ECS system).

## 2.4 ECS-side queue population — `ecs/systems/RenderSystem.js`

- Query `{ all: [Transform, Renderable, RenderBounds, Visible] }`, priority 3.
- `update(ctx, dt)`: clears the `RenderQueue` resource, walks tables, resolves
  `AssetRegistry` for image/UVs, calls `queue.push(...)`. Records
  `render.populate` / `render.commands`.

## 2.5 Trail drawing — `ecs/render/TrailRenderer.js`

- `render(ctx, items)` with `_renderLine` / `_renderRibbon` (2D canvas).
- Needs the canvas via the `CanvasContext` resource (set by `core/Scene.js`
  to `game.ctx`).

## 2.6 Particle drawing

- `ParticleEffect.render(ctx)` → `system.render(ctx)` → backend renderer:
  - `CanvasParticleRenderer` — 2D canvas (CPU backend).
  - `GpuParticleRenderer` — WebGL2, requires `{ gl }`; throws without one.
  - `WebGpuParticleRenderer` — needs `canvas.getContext("webgpu")` + async init.
- `particles/EngineResolvers.js` picks the backend; GPU is only selected when a
  GL/WebGPU context already exists (today: never for the game canvas).

## 2.7 Scene + view layer

- `core/Scene.js`: `render(ctx)` empty hook, `renderUI()` DOM hook;
  `_initScene` sets `world.setResource(CanvasContext, game.ctx)` and registers
  `Camera` / `Viewport` resources from the scene's `View`.
- `ecs/scene/SceneManager.js`: `render(ctx)` calls `scene.render(ctx)` +
  `scene.world.render(ctx)` (same as Game).
- `view/View.js`: `prepare(ctx)` / `cleanup(ctx)` implement camera transform +
  clear color + clip. **Note:** `View.prepare` is currently unused by the main
  loop (the transform is inlined in `World.render`).
- `view/RenderConfig.js`: `clearColor, screenSpace, imageSmoothing,
  pixelPerfect, culling`.

## 2.8 Resources (via `ecs/bootstrap/DefaultWorldBuilder.js`)

`Diagnostics`, `SpatialHash`, `TrailManager`, `RenderQueue`, `AssetRegistry`,
`AnimationClipRegistry`, plus the standard systems incl. `RenderSystem`.

## 2.9 Tests touching the render path

- `tools/ecs/tests/RuntimeIntegration.test.js` — "Render Pipeline" block
  (`mockRenderCtx`, `world.render`, camera-transform assertion).
- `tools/ecs/tests/Diagnostics.test.js` — trail metrics recorded during
  `world.render(canvasCtx)`.
- `tools/ecs/tests/TrailSystem.test.js` — renders via `world.render`.
- `tools/ecs/tests/ParticleFacade.test.js` — World integration uses
  `world.render(mockCtx())`.
- `tools/ecs/tests/Scene.test.js`, `RenderSystem.test.js`.

---

# 3. Target Architecture

## 3.1 Ownership

| Concern | Owned by |
|---|---|
| Immediate-mode drawing | `Scene.render(ctx)` — 2D canvas, unchanged |
| Retained renderables | `World` (store / register / expose) |
| Drawing retained renderables | `Renderer` |
| Frame lifecycle | `Game` → `Renderer` |
| DOM UI | `Scene.renderUI()` — unchanged |

## 3.2 New directory `renderer/`

```
renderer/
  Renderer.js            # abstract contract
  CanvasRenderer.js      # wraps today's 2D path
  WebGLRenderer.js       # WebGL2 (Session 3-4)
  WebGpuRenderer.js      # WebGPU (Session 5)
  RendererResolver.js    # "auto" | "canvas" | "webgl" | "webgpu"
  immediate/
    ImmediateCanvas.js   # transparent 2D overlay for GL renderers (Session 3+)
  gl/                    # WebGL2 helpers: shaders, batch, texture cache
  wgpu/                  # WebGPU helpers (Session 5)
```

## 3.3 Renderer contract

```js
class Renderer {
  constructor({ canvas, width, height, options } = {}) {}

  beginFrame()              // start a frame (diag frame, state)
  clear()                   // clear the frame
  render(world)             // draw retained renderables of one World
  endFrame()                // finish frame (flush, composite, restore)

  resize(width, height)     // canvas + viewport + DPR
  destroy()                 // release GPU/GL resources

  get immediateContext()    // 2D context handed to Scene.render(ctx)
  get canvas()              // primary canvas element
  get width()               // logical width
  get height()              // logical height
}
```

`Renderer` is abstract; it declares the contract and throws on direct use.

## 3.4 Target frame flow

`Game._frame`:

```
doInput
doUpdate
_flushSceneOps
interpolate / restoreTransforms

renderer.beginFrame()
  renderer.clear()                              // metric frame.canvas

  _renderScenes(renderer, renderStart)          // metric frame.render
    per scene:
      scene.render(renderer.immediateContext)   // immediate 2D (unchanged API)
      renderer.render(scene.world)              // retained
      scene.renderUI()                          // DOM diff (unchanged)

  debug overlay render (2D surface)             // CanvasRenderer: same ctx

renderer.endFrame()
```

`_renderScenes` no longer takes the raw `ctx`; it takes the `renderer`.

## 3.5 World renderable surface

The World stops drawing. It exposes data for the Renderer:

```js
world.renderables
// → { queue: RenderQueue|null,
//     trails: TrailRenderable[],      // {depth,buffer,color,width,mode}
//     effects: ParticleEffect[] }     // depth-sorted copy

world.effects          // getter over this._effects
world.collectTrailRenderables()
// → TrailRenderable[] (the items World._renderTrails builds today, no drawing)
```

The camera transform and all drawing move to the Renderer. World keeps owning
`RenderQueue` as a resource (populated by `RenderSystem` during update) — the
Renderer only executes it.

## 3.6 Diagnostics ownership

| Metric | Owner after change |
|---|---|
| `frame.canvas` | `Renderer.clear()` (Game still scopes it) |
| `frame.render` | Game scopes `_renderScenes` |
| `render.draw` | `Renderer.render(world)` |
| `render.populate`, `render.commands` | stays in `RenderSystem` |
| `render.batch`, `render.images`, `render.primitives` | Renderer (already counted in `RenderQueue.execute`) |
| `render.trails*` | `Renderer.render` (from `world.collectTrailRenderables`) |
| `render.particles*` | unchanged (particle renderers) |

---

# 4. Open Decisions

Resolved during the sessions noted; assumptions here are the recommended path.

1. **Immediate mode on GL renderers (Session 3).** A canvas cannot expose both
   a 2D and a WebGL context. Recommended: `WebGLRenderer` keeps the game
   canvas as WebGL2 and creates a transparent 2D overlay canvas stacked on top
   (`renderer/immediate/ImmediateCanvas.js`); `scene.render(immediateContext)`
   and the debug overlay draw there, composited in `endFrame()`.
   Alternative: composite an offscreen 2D canvas into the GL frame. Decision:
   stacked overlay (simpler, keeps pixel-perfect 2D drawing untouched).
2. **`World.render` removal.** Breaking change for internal callers and tests.
   Deprecate in Session 1 (keep a passthrough that constructs a throwaway
   `CanvasRenderer`), remove in Session 5.
3. **`RenderQueue` ownership.** Stays a World resource (populated by the ECS
   `RenderSystem`); the Renderer executes it. A future Renderer-owned command
   buffer is possible but out of scope.
4. **Debug `OverlayHost` on GL renderers.** Draws to the immediate 2D surface
   (decision 1). Session 3.
5. **Device pixel ratio.** Currently ignored except in input
   `CoordinateSystem`. **Session 2 resolved: deferred.** To honor the
   behavior-preservation rule, `Renderer.resize` keeps the 2D canvas at the
   logical size (matching today's DPR-ignoring behavior); DPR-aware backing
   stores are introduced with the GL renderers (Session 3+), where the GL
   viewport is physical pixels and the camera stays logical.
6. **`RenderConfig` parity** (`screenSpace`, `pixelPerfect`, `culling`).
   `CanvasRenderer` preserves current behavior; GL renders culling via camera
   viewport test and `screenSpace` via an identity-view uniform. Sessions 3-4.
7. **`CanvasContext` resource.** Repurpose as the renderer's 2D immediate
   context (set by Game from `renderer.immediateContext`), keeping trails and
   CPU particles working on the 2D surface for `CanvasRenderer`. Session 1.
8. **Texture upload timing for GL.** `AssetRegistry.sourceImage` is an
   `HTMLImageElement`; WebGL needs `WebGLTexture`. Upload lazily in Session 3
   with a cache keyed by asset id.

---

# 5. Session Plan

## Session 1 — Renderer contract + `CanvasRenderer` (behavior-preserving)

### Goal
Introduce the `Renderer` abstraction and a `CanvasRenderer` that draws exactly
what `World.render` draws today, with zero visual/behavior change. The World
stops drawing; the Game drives frames through the renderer.

### Scope
- New `renderer/Renderer.js` (abstract contract).
- New `renderer/CanvasRenderer.js`:
  - `beginFrame` / `endFrame` (own diagnostics frame, matching today's
    `World.render` diag frame).
  - `clear()` = `ctx.clearRect(0, 0, width, height)`.
  - `render(world)` = camera transform + `RenderQueue.execute` +
    `collectTrailRenderables` → `TrailRenderer` + `effects` sorted by depth.
  - `immediateContext` = the 2D context.
- Move `World.render` internals:
  - `ecs/core/World.js`: remove `render(ctx)`, `_renderTrails` drawing,
    `_renderEffects` drawing. Add `world.renderables`,
    `world.collectTrailRenderables()`, `world.effects`.
  - Camera transform moves to `CanvasRenderer.render`.
- Wire the Game:
  - `core/Game.js`: accept `renderer` option (`"canvas"` or instance; default
    `"canvas"` for now). Construct `this.renderer`. `_frame` uses
    `renderer.beginFrame/clear/_renderScenes(renderer)/endFrame`.
    Keep `this.ctx` (2D) as an alias of `renderer.immediateContext` for
    backward compatibility during the session.
  - `core/Scene.js`: `world.setResource(CanvasContext, game.renderer.immediateContext)`
    instead of `game.ctx`.
  - `ecs/scene/SceneManager.js`: `render(renderer)` mirrors Game.
- Keep `RenderQueue`, `RenderSystem`, `AssetRegistry`, `TrailRenderer`,
  particle renderers unchanged.

### Files
```
+ renderer/Renderer.js
+ renderer/CanvasRenderer.js
+ renderer/index.js
~ core/Game.js
~ ecs/core/World.js
~ core/Scene.js
~ ecs/scene/SceneManager.js
```

### Tests
- New `tools/ecs/tests/Renderer.test.js` (contract: abstract throw,
  CanvasRenderer renders queue/trails/effects).
- Update `RuntimeIntegration.test.js`, `Diagnostics.test.js`,
  `TrailSystem.test.js`, `ParticleFacade.test.js`, `Scene.test.js`: replace
  `world.render(ctx)` with `renderer.render(world)` (construct a
  `CanvasRenderer` with a mock 2D context).
- Keep all existing assertions identical (camera transform, trail metrics,
  effect depth sort, queue execution).

### Acceptance criteria
- All suites green (ECS 2566+, particles, input pre-existing 3 only).
- No retained-object pixel is drawn differently.
- `new Game({ renderer: "canvas" })` works; `game.renderer` is a
  `CanvasRenderer`; `game.ctx` still resolves.

### Risks
- Diagnostics frame ownership (World had its own frame; renderer now owns it —
  keep `frame.canvas` / `frame.render` scoping intact).
- Test churn across ~6 files; keep mock-2D-context helper shared.

---

## Session 2 — Resolver + Game option + lifecycle

### Goal
Full `renderer` option plumbing, `"auto"` resolution, resize, destroy.

### Scope
- New `renderer/RendererResolver.js`:
  - `resolve({ renderer, canvas, width, height })`.
  - `"auto"`: WebGPU → WebGL2 → Canvas (checks return
    `not-implemented` only for requested-but-missing backends; since only
    `CanvasRenderer` exists after Session 1, auto → canvas).
  - `"canvas"` → `CanvasRenderer`.
  - `"webgl"` / `"webgpu"` → clear error `Renderer 'webgl' not implemented yet`
    until Sessions 3/5.
  - instance → used as-is.
- `core/Game.js`:
  - `renderer` option passed through the resolver.
  - `resize(width, height)` on renderer from `_applyViewport` /
    `ResizeObserver`.
  - `renderer.destroy()` in `Game.destroy`.
  - `game.renderer` public getter.
- `Renderer.resize`:
  - sets canvas logical + physical size (DPR-aware), re-syncs viewport.
  - `CanvasRenderer` re-derives 2D transform; base `Renderer` handles the
    shared bookkeeping.

### Files
```
+ renderer/RendererResolver.js
~ core/Game.js
~ renderer/Renderer.js
~ renderer/CanvasRenderer.js
```

### Tests
- New `tools/ecs/tests/RendererResolver.test.js`: mock `navigator`,
  `canvas.getContext`; verify `"auto"` → canvas today; explicit strings;
  instance passthrough; `not-implemented` errors for webgl/webgpu.
- New Game-level tests: `renderer` option accepted, `game.renderer`,
  `resize` propagates, `destroy` calls renderer.destroy.

### Acceptance criteria
- Suites green.
- `new Game({ renderer: "auto" })` behaves exactly like `"canvas"` (only
  backend available).
- Resizing (incl. `scaleToFit`) resizes the renderer.
- Destroy releases the renderer.

### Risks
- DPR change could subtly alter canvas sizing vs today; verify against current
  behavior first (today ignores DPR for the canvas).

---

## Session 3 — `WebGLRenderer` for retained sprites + primitives

### Goal
A real WebGL2 renderer for the retained ECS path: sprites and primitives,
batched, depth-sorted, camera transform via uniform. Immediate mode moves to a
2D overlay.

### Scope
- New `renderer/WebGLRenderer.js` + `renderer/gl/*`:
  - Compile a program (instanced quad; per-instance x/y/rotation/scale/
    width/height/uv/color/alpha/depth).
  - `beginFrame` / `clear` (`gl.clearColor` from `RenderConfig.clearColor` or
    default, `gl.clear`).
  - `render(world)`:
    - build camera matrix from `Camera`/`Viewport` resources → uniform;
    - walk `world.renderables.queue` → batch into a dynamic buffer;
    - draw depth-sorted (existing queue order already sorts by layer/depth);
    - lazy texture upload from `AssetRegistry` with a `Map<assetId, WebGLTexture>`.
  - `endFrame` (flush + composite immediate overlay).
  - `resize` (physical viewport = `canvas.width/height`).
- New `renderer/immediate/ImmediateCanvas.js`: transparent 2D canvas stacked
  over the game canvas; `immediateContext` returns its 2D context;
  composited by `endFrame`.
- `core/Game.js`: create the overlay layer (CSS `position:absolute; inset:0`);
  `renderer.immediateContext` used by `scene.render` and the debug overlay.
- `RendererResolver`: `"webgl"` selects `WebGLRenderer` when
  `canvas.getContext("webgl2")` succeeds; `"auto"` now prefers it.
- Debug `OverlayHost` renders to the 2D overlay.

### Files
```
+ renderer/WebGLRenderer.js
+ renderer/gl/index.js          # shader + program + VAO helpers
+ renderer/gl/quad.batch.js     # dynamic instance buffer
+ renderer/gl/texture.cache.js
+ renderer/immediate/ImmediateCanvas.js
~ renderer/RendererResolver.js
~ core/Game.js
~ debug/overlay/OverlayHost.js  # target surface becomes renderer.immediateContext
```

### Tests
- New `tools/ecs/tests/WebGLRenderer.test.js` using a mocked WebGL2 context
  (extend the mock pattern in `tools/particles/tests/lib/TestHelpers.js`):
  - program compile/link called;
  - sprite commands produce batched instance data (positions/uvs/colors/depth);
  - camera uniform reflects Camera/Viewport;
  - clear color from `RenderConfig`;
  - texture cache uploads `AssetRegistry` images.
- Manual browser check: a scene of sprites/primitives identical on canvas vs
  webgl renderers.

### Acceptance criteria
- Sprites + primitives render correctly via WebGL2 in a browser.
- Mock-GL unit tests pass; canvas remains the default fallback.
- Immediate-mode and debug overlay still work (on the 2D overlay).
- `render.images` / `render.primitives` metrics still recorded.

### Risks
- Alpha/blending: premultiplied-alpha and `gl.blendFunc` parity with 2D
  `drawImage` / `fillRect`.
- `RenderConfig` parity: `screenSpace` (identity-view uniform), `pixelPerfect`
  (round to device pixels), `culling` (skip instances outside viewport).
- Overlay stacking order vs DOM UI layer (`domLayer`).
- Texture filter parity with `imageSmoothing` (nearest vs linear).

---

## Session 4 — `WebGLRenderer` trails + particles

### Goal
Render trails and particle effects through the WebGL renderer, and wire the
existing GPU particle backend to the game's GL context (resolving the
"`backend: 'gpu'` throws without a GL context" gap).

### Scope
- Trails: add `renderer/gl/trails.batch.js` — line and ribbon geometry
  (triangle strips) from `world.collectTrailRenderables()`; color/width/depth
  per trail.
- Particles (CPU backend): draw each alive particle as an instanced quad using
  `world.renderables.effects` and each effect's `system` data (position/size/
  rotation/alpha/color/uv). Depth from `effect.depth`.
- Particles (GPU backend): give `GpuParticleBackend` / `GpuParticleRenderer`
  the renderer's WebGL2 context so `backend: "gpu"` renders into the same
  frame:
  - `particles/EngineResolvers.js`: accept a context source from the renderer;
    facade auto-selects GPU when the renderer provides WebGL2.
  - Ensure the GPU renderer is destroyed with the renderer (Session 2 destroy).
- Sort order: queue (sprites) → trails → particles by depth (match today's
  per-category sort within the camera transform).

### Files
```
+ renderer/gl/trails.batch.js
+ renderer/gl/particles.batch.js
~ renderer/WebGLRenderer.js
~ particles/EngineResolvers.js
~ particles/facade.js            # optional: context from renderer
~ tools/particles/tests/lib/TestHelpers.js   # share mock GL
```

### Tests
- WebGL trail/particle mock-GL tests (geometry counts, depth order).
- `ParticleFacade.test.js`: `backend: "gpu"` now constructs successfully when a
  GL context is provided by a renderer; still throws without one.
- Update particle `EngineResolvers` tests for the new context-source path.

### Acceptance criteria
- Trails + CPU particles render via WebGL2 (browser check).
- `Particle.create({ backend: "gpu" })` works end-to-end under `WebGLRenderer`.
- Depth ordering matches the canvas renderer.

### Risks
- Particle z-ordering within a single batch (use per-instance depth → z).
- Lifecycle: GPU renderer/context cleanup on renderer destroy.
- Two GPU paths (WebGL2 `GpuParticleRenderer` vs WebGPU compute) — keep WebGPU
  particle path wired to the WebGPU renderer in Session 5, not here.

---

## Session 5 — `WebGpuRenderer` + finalization

### Goal
WebGPU renderer implementing the same contract (sprites + basic trails/
particles), full auto-selection, documentation, cleanup, regression.

### Scope
- New `renderer/WebGpuRenderer.js` + `renderer/wgpu/*`:
  - device via `WebGpuDeviceManager.initialize()`; `canvas.getContext("webgpu")`;
  - clear via render pass; batch sprites as instanced draw;
  - camera matrix in a uniform buffer;
  - trails/particles: reuse the existing `WebGpuParticleRenderer` (wired to the
    renderer's canvas) for particles; trails as line strip geometry.
- `RendererResolver`: `"auto"` → `WebGpuRenderer` when
  `WebGpuDeviceManager.isAvailable()` and a `webgpu` context is obtainable;
  else WebGL2; else canvas.
- Finalization:
  - `docs/renderer-architecture.md`: status → Implemented; note resolved open
    decisions (immediate-mode overlay, `World.render` removal).
  - Remove deprecated `World.render` (Session 1 deprecation window closes).
  - Decide/keep `CanvasContext` resource (or replace with `game.renderer`).
  - Diagnostics parity: `render.batch`, `render.images`, `render.primitives`
    recorded by all backends.
  - Delete dead code (unused `View.prepare` path if still unused; stale tests).
  - Full regression + a micro-benchmark comparing canvas vs webgl vs webgpu.

### Files
```
+ renderer/WebGpuRenderer.js
+ renderer/wgpu/index.js
+ renderer/wgpu/render.pass.js
+ renderer/wgpu/sprites.batch.js
~ renderer/RendererResolver.js
~ particles/renderers/webgpu/WebGpuParticleRenderer.js  # adopt renderer canvas
~ core/Game.js
~ docs/renderer-architecture.md
```

### Tests
- WebGPU mock tests (device/pass/batch/uniforms) with a mocked GPU device.
- Auto-resolution matrix: webgpu → webgl → canvas under mocked capability flags.
- Full regression across all suites.

### Acceptance criteria
- Auto-selection works in supporting browsers; both GPU paths functional.
- All suites green (only the pre-existing 3 input failures).
- Design doc updated; no stale `World.render` callers; dead code removed.
- Benchmarks documented in the plan's appendix or a `docs/audit/` note.

---

# 6. Cross-Session Rules

1. **Behavior preservation.** Sessions 1-2 must not change a single rendered
   pixel for the canvas backend. Every refactor keeps the existing golden
   assertions intact.
2. **Green suite per session.** Do not end a session with failures other than
   the 3 pre-existing `tools/input/*` failures.
3. **No public API churn beyond the plan.** `Scene.render(ctx)`,
   `Scene.renderUI()`, `Game.run/pushScene/...`, input, audio, and DOM UI are
   untouched by this work.
4. **Renderer selection is one-shot.** Once `Game` constructs a renderer it is
   never swapped; backends never stack (except the immediate 2D overlay, which
   is a convenience surface, not a second renderer).
5. **World stays render-agnostic.** After Session 1, `World` contains no
   `ctx.*` calls and no canvas imports; it exposes plain data.

---

# 7. Migration & Compatibility

- `Game` public additions: `renderer` option, `game.renderer` getter.
- `World.render(ctx)` deprecated (Session 1) → removed (Session 5). Internal
  callers updated in Session 1; external users see a clear deprecation error.
- `game.ctx` kept as an alias of `renderer.immediateContext` so immediate-mode
  examples keep working across all sessions.
- `CanvasContext` resource remains the 2D immediate context (Session 1) for
  trails and CPU particles; may be folded into `game.renderer` in Session 5.
- No change to `Scene.render(ctx)` signature or `renderUI()`.
- The existing `GpuParticleRenderer` / `WebGpuParticleRenderer` classes are
  reused, not rewritten.

---

# 8. Testing Strategy

## Per session
- New unit tests for every new module (abstract contract, resolver, each
  renderer with a mock context/device).
- Update only the tests that consume the changed entry points (`world.render`
  → `renderer.render`).
- Manual browser smoke test for visual parity (canvas backend) after Sessions
  1-2 and for WebGL/WebGPU after 3-5.

## Mock infrastructure
- Share a mock 2D context (already used in `RuntimeIntegration` /
  `ParticleFacade`).
- Add a mock WebGL2 context (records `bufferData`, `uniform*`, `draw*` calls)
  and a mock GPU device (`requestAdapter/requestDevice/queue/encodeRenderPass`)
  in `tools/particles/tests/lib/TestHelpers.js` (or a new
  `tools/renderer/tests/lib/`).

## Commands
- ECS + particles: `node --test "tools/ecs/tests/*.test.js"` and
  `node --test "tools/particles/tests/**/*.test.js"`.
- Full: `node --test "tools/**/*.test.js"`.
- Pre-existing unrelated failures to ignore: `tools/input/{ActionState,
  InputSystemLifecycle, Performance}.test.js`.

---

# 9. Definition of Done

- `new Game({ renderer: "canvas" })` matches today's output exactly.
- `renderer: "webgl"` renders sprites, primitives, trails, and particles.
- `renderer: "webgpu"` renders sprites (and trails/particles per Session 5
  scope).
- `renderer: "auto"` picks the best supported backend.
- `World` contains zero canvas/GL code; `Renderer` owns all drawing.
- `Scene.render(ctx)` and `Scene.renderUI()` unchanged for users.
- All suites green; docs updated; dead code removed.

---

# 10. Out of Scope

- Replacing Canvas2D for immediate mode.
- A new immediate-mode drawing API.
- Tilemap-specific GPU batching beyond the generic quad path.
- Text glyph atlas / font rendering on GPU (generic sprite path only).
- Post-processing effects / render targets (future work).
- Multi-renderer per Game, or dynamic renderer swapping.
