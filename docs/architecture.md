# Architecture

## Archetype-Based Entity-Component-System Model

Entities are stored in archetype tables — each unique combination of component
types forms one archetype with its own columnar (SoA) storage. Adding or
removing a component moves the entity to a different archetype table.

Systems declare their component dependencies and are scheduled by priority.
The scheduler runs all systems each frame via `world.update(dt)`.

### Components

| Component | Schema | Storage |
|---|---|---|
| `Transform` | `{x: float64, y: float64, rotation: float64, scale: float64}` | SoA columns in archetype table |
| `WorldTransform` | `{x: float64, y: float64, rotation: float64, scale: float64}` | SoA columns (written by HierarchySystem) |
| `Velocity` | `{x: float64, y: float64}` | SoA columns |
| `Collider` | `{width: float64, height: float64}` | SoA columns |
| `Renderable` | `{draw(ctx,w,h), image, style}` | Per-row references |
| `Visible` | `{visible: uint8}` | SoA column |
| `RenderBounds` | `{x: float64, y: float64, w: float64, h: float64}` | SoA columns |
| `Animation` | `{clipId: u16, frameIndex: u32, elapsed: f32, isPlaying: u8, speed: f32, mode: u8, loop: u8, stopAt: u32}` | SoA columns |
| `Trail` | `{maxLength: uint32, interval: float64, elapsed: float64, points: ref}` | Mixed |
| `Text` | `{fontHandle: u16, contentHandle: u32, align: u8, letterSpacing: f32, version: u32}` | SoA columns |
| `Parent` | `{entity: uint32}` | SoA column |
| `Children` | (empty — tag component) | None |

**Tag components** (empty schemas): `EnemyTag`, `PlayerTag`, `ProjectileTag`, `StaticTag`.

### Systems

All systems extend `System` or `ArchetypeSystem` and are registered on the
World. The scheduler runs them in priority order:

| System | Priority | Reads | Writes |
|---|---|---|---|
| `HierarchySystem` | -10 | `Parent`, `Transform`, `HierarchyGraph` | `WorldTransform` |
| `SavePrevPositionSystem` | -10 | `Transform` | `Transform._prevX/_prevY` |
| `MovementSystem` | 0 | `Velocity`, `Transform` | `Transform.x/y` |
| `AnimationSystem` | 1 | `Animation`, `Renderable` | `Renderable.image`, `Animation.frame/elapsed` |
| `CollisionSystem` | 2 | `Transform`, `Collider`, `Visible` | (broad-phase structures) |
| `RenderSystem` | 3 | `Transform`, `Renderable`, `Visible`, `Camera` | canvas (side effect) |
| `TrailSystem` | 4 | `Trail`, `Transform` | `Trail.points` |
| `TextSystem` | 4 | `Transform`, `Renderable`, `Text`, `Visible` | `RenderQueue` (glyph commands) |

### Who Owns What

| Concern | Owner | Why |
|---|---|---|
| Position, rotation, scale | `Transform` — authoritative | Single source of truth |
| Computed world transform | `WorldTransform` — written by HierarchySystem | Cached parent-chain result |
| Entity size (AABB) | `Collider` — authoritative | Separate from visual bounds |
| Visual appearance | `Renderable` — authoritative | Image or shape style |
| Animation state | `Animation` — authoritative | `current`, `frame`, `elapsed`, `playing` |
| Frame advancement | `AnimationSystem` | Writes `renderable.image`, advances `Animation` state |
| Speed and direction | `Velocity` — authoritative | Consumed by MovementSystem |
| Parent-child relationships | `HierarchyGraph._children` (Map) | BFS traversal from dirty roots |
| World-to-screen transform | `Camera` — authoritative | Position, zoom, rotation applied by RenderSystem |
| Visible world region | `Camera` — derived from position + zoom + size | Used for culling |
| Archetype storage | `Table` instances | Columnar SoA per archetype |
| Component schema registration | `ComponentRegistry` | Global ID assignment |
| Query matching | `QueryEngine` | O(1) bitmask ↔ archetype |
| System scheduling | `SystemScheduler` | Priority-ordered execution |
| SpatialHash lifecycle | `CollisionSystem` | `beginFrame()` → all rebuilds |
| Broad-phase strategy | `CollisionSystem` + strategy instance | Pluggable via `useSpatialHash()` |
| Entity membership | `Group` (iterable container) | Private array |
| Text glyph state | `Text` — authoritative | `fontHandle`, `contentHandle`, `align`, `letterSpacing`, `version` |
| Text content, layout, measured bounds | `TextResourcePool` — authoritative | Content strings, cached glyph layout, bounds live outside the ECS |

### What Is Derived

| Value | Derived From | Used By |
|---|---|---|
| `WorldTransform` | `Transform` + `Parent` chain | RenderSystem, CollisionSystem — culled world-space AABB |
| Sprite `x`, `y`, `width`, `height` | `Transform + Collider` (center → top-left) | Public convenience getters |
| `Rect` from entity | `Transform + Collider` | SpatialHash cell calculation |
| Entity center | `Transform.x`, `Transform.y` | Collision checks, rendering |
| World-space AABB | `WorldTransform + Collider + scale` | Camera culling |
| Visible world bounds | `Camera (x, y, width, height, zoom)` | Culling, worldToScreen, screenToWorld |
| `Text.width` / `Text.height` | `TextResourcePool` measured bounds (cached layout) | Public convenience getters |

## Ownership Boundaries

### World

```
World
├── EntityManager           entity create/destroy, archetype assignment
├── ComponentRegistry       schema IDs, field layouts
├── QueryEngine             archetype-indexed query matching
├── SystemScheduler         priority-ordered system execution
├── _resources: Map         shared singletons (SpatialHash, events, etc.)
├── createEntity()          → entity ID
├── destroyEntity(id)       → cleanup
├── addComponent(id, Component)   → archetype move
├── removeComponent(id, Component) → archetype move
├── hasComponent(id, Component)   → boolean
├── getComponent(id, Component)   → component data
├── query(...components)    → QueryView
├── update(dt)              → run all systems
└── resources.get/set/has   → resource access
```

### Group

```
Group (entity container)
├── _entities: Entity[]     (private, iterable)
├── add/remove/clear/has     (membership)
├── dispose()                (unregister + clear)
├── useSpatialHash()         (registers with CollisionSystem)
├── collideXxx()             (delegates to CollisionSystem)
├── forEach/filter/map       (delegates to Array methods)
└── [Symbol.iterator]        (iterable)
```

- Does NOT own update, render, or collision logic
- Does NOT expose internal array
- `dispose()` is the single cleanup call

### Sprite

```
Sprite (convenience entity wrapper)
├── Transform
├── Collider
├── Velocity
├── Renderable
├── Visible
├── Animation
└── groups: Group[]
```

- No `update()`, no `render()`, no animation logic — systems handle behavior
- Internally creates an ECS entity via `World._nextEntityId` and adds components
- `kill()` removes from all groups
- Public getters (`x`, `y`, `width`, `height`, `image`, `style`, `angle`, `scale`, `velocity`) are convenience shorthands over components

### Text

```
Text (convenience entity wrapper)
├── Transform
├── Renderable
├── Visible
└── Text (fontHandle, contentHandle, align, letterSpacing, version)
```

- Mirrors the Sprite pattern: a concrete wrapper composing existing components,
  with Text-specific numeric state in the `Text` component
- Non-numeric state (content string, cached glyph layout, measured bounds) lives
  in the `TextResourcePool` world resource, referenced through `contentHandle`
- Rendering metadata (color/layer/depth/smoothing) comes from `Renderable`,
  position/rotation/scale from `Transform`, visibility from `Visible` — no
  parallel fields
- `destroy()` releases the content resource and destroys the entity
- Text entities carry no `RenderBounds`: `RenderSystem` (which queries it) never
  sees them, so text is not double-drawn
- See the Text section below for handles, pool conventions, and system ordering

### Camera

```
Camera (transform)
├── x, y              center of view in world space
├── width, height     viewport size in pixels
├── zoom              scale factor (higher = zoomed in)
├── rotation get/set  world rotation with cached cos/sin
├── static main       first created Camera becomes default
├── static setMain()  explicit main camera assignment
├── _cos, _sin        cached trig values (updated on rotation set)
├── apply(ctx)        one-shot canvas transform
├── worldToScreen()   world → pixel coords (uses cached cos/sin)
├── screenToWorld()  pixel → world coords (uses cached cos/sin)
└── follow(entity)    snap to entity.transform
```

- `Camera.main` is auto-set in constructor if no main exists
- `Camera.setMain(camera)` for explicit transitions (scene changes)
- `IDENTITY` (internal to RenderSystem, width=0) disables transform
  and culling when no camera exists — `render(ctx, entities)` works
  without any camera setup
- `_cos`/`_sin` cached on rotation set — no trig per query
- Not a System, not a Component — it is a standalone view abstraction
- Future features (shake, smoothing, parallax, dead zones) go in
  camera controllers, not in Camera itself

### Input — Event Stream and State

Jygame's input is built around a **central, normalized event stream**. Physical
devices publish timestamped events, the stream preserves what happened and in
what order, and the existing state/action layer derives `down` / `pressed` /
`value` / `axis` from that stream. Future APIs (`presses()`, `queue()`,
`history()`, `repeated()`, `anyPressed()`) will consume the same stream.

```
Physical devices                      Normalized event stream
  BrowserBackend  ─┐                     ┌──────────────────────┐
  TestBackend     ─┤  poll(queue)        │ InputEvent {         │
  Gamepad (poll)  ─┴───────────────────▶│  type, device,       │
                                        │  timestamp, data }   │
  PointerManager  ─┐  update(queue)     └──────────┬───────────┘
  Mouse/Keyboard  ─┴──────────────────────────────▶│
                                                   ↓
                                          Existing state/action
                                          down / pressed / released
                                          value / axis / bindings
                                                   ↓
                                          Future: presses / queue /
                                                  history / buffer /
                                                  repeated / combos
```

**What an input event is.** Every meaningful transition becomes one
`InputEvent` (`input/InputEvent.js:1`). It is a plain object with a small
common core and device-specific payload:

```js
{
  type: "keydown",          // semantic type (press/release/move/wheel/…)
  device: "keyboard",       // "keyboard" | "mouse" | "touch" | "pen" | "gamepad" | "gesture"
  timestamp: 12345.67,      // performance.now() — monotonic, not wall-clock
  data: { code: "KeyW", key: "w", repeat: false } // device-specific
}
```

```js
// Mouse — device + button + position
{ type: "pointerdown", device: "mouse", timestamp, data: { pointerId, x, y, button, pressure } }
// Gamepad — device + index + button/axis
{ type: "gamepadbuttondown", device: "gamepad", timestamp, data: { gamepadIndex, button, value } }
```

`device` and `timestamp` are top-level on `event.device` / `event.timestamp`
(`input/InputEvent.js:18`); `event.data` holds the rest. `event.type` keeps the
existing `EventType` strings (`keydown`/`pointerdown`/`gamepadbuttondown` etc.)
so the stream is Jygame semantics, not raw `KeyboardEvent`/`PointerEvent`.

**Normalization at the device boundary.** `BrowserBackend` (`input/BrowserBackend.js:81`)
converts DOM `keydown` → `KEY_DOWN` with `{key, code, repeat}` and a
`performance.now()` timestamp, `pointerdown` → `POINTER_DOWN` with
`{x,y,pointerId,button,pressure}` etc. `TestBackend` does the same for tests.
`Gamepad` (`input/Gamepad.js:168`) diffs `navigator.getGamepads()` and emits
`GAMEPAD_BUTTON_DOWN/UP/AXIS` only on transitions. The rest of the engine never
sees a `KeyboardEvent`.

**Event lifetime.** Events live for one input tick:

```
DOM event  →  Backend.__eventQueue (accumulates between ticks)
                ↓  InputSystem.update()              // input/InputSystem.js:94
                   snapshot()  — edge state collapses
                   backend.poll(queue) — drains accumulated events
                   _countEvents() + consumers.each(event)
                   devices.update(queue) — Keyboard/Mouse/PointerManager/Gamepad read the queue
                   contextStack.evaluate(devices) — bindings → ActionState
                   queue.clear() — current-tick collection is recycled
```

`Input.raw.events` (`input/Input.js:57`) exposes the `InputEventQueue`
(`input/InputEventQueue.js:51`) — three tiered ring buffers (HIGH/NORMAL/LOW).
A tick with no input produces an empty queue without error. Persistent history
is intentionally not implemented; the architecture makes it addable without
changing the device layer.

**Ordering and multi-event ticks.** The queue is FIFO within each tier and
`BrowserBackend.__eventQueue` preserves DOM arrival order, so `W → D → S` in one
frame yields three `KEY_DOWN` events in that order. `events.each()` (or
`drain()`) visits them chronologically within tier. The distinction is:

```text
STATE:  Input.down("KeyW")  — "what is true now?"
EVENTS: KEY_DOWN W, KEY_DOWN D, KEY_DOWN S — "what happened, in order?"
```

Holding `KeyW` does not generate a `press` every frame — `BrowserBackend`
sets `repeat: true` on the second `keydown` and `Keyboard` (`input/Keyboard.js:38`)
treats it as `setRepeat`, not a new press.

**Timestamps are monotonic.** Every `InputEvent` records `performance.now()`
(`input/InputEvent.js:9`); `Date.now()` is never used. Wall-clock jumps do not
affect combo windows, buffering, or latency measurement.

**Separate from action resolution.** The stream is device-level; `ActionEvaluator`
(`input/actions/ActionEvaluator.js:1`) and `ContextStack`
(`input/actions/ContextStack.js:1`) resolve `KeyW`/`ArrowUp`/`PAD_DPAD_UP` to the
same `"move"` action afterwards. The stream does not know about actions.

**Future consumption.** The stream is the primitive for:

```text
events  →  action events  →  queue / history / buffer  →  gameplay
```

so Snake can consume `Input.presses("move")` and a fighter can inspect
timestamped history without touching DOM events.

**Existing API is unchanged.** `Input.down/pressed/released/value/axis`
continue to read collapsed edge state (`KeyboardState`, `Mouse`, `ActionState`);
the stream feeds that state rather than replacing it.

### Input — Mouse, Cursor and Pointer Lock

Mouse-specific behaviour lives under `Input.mouse`; the unified surface `Input.pointer` remains device-independent. Both derive from the same normalized `POINTER_DOWN/MOVE/UP/WHEEL` stream, no second pipeline.

```
physical mouse → Mouse device ─┐
                                ├─→ PointerManager ─→ Input.pointer (x/y/worldX/worldY/delta/hasPosition)
                                └─→ Input.mouse (x/y/worldX/worldY/hasPosition, deltaX/Y, wheel, buttons)
                                              ├─→ cursor (visible/style/image+hotspot)
                                              └─→ pointerLock (isLocked/lock/unlock)
```

* **Mouse device** (`input/Mouse.js:1`) — holds mouse-only state: 5 buttons (`LEFT 0, MIDDLE 1, RIGHT 2, BACK 3, FORWARD 4`), `position`, `delta`, `wheel`, `hasPosition`, `isPointerLocked`. Filters by `data.type==="mouse"` so touch/pen never populate mouse state. While `isPointerLocked` delta is `movementX/Y` and position stays frozen; otherwise delta is `x - prevX`.

* **Position** — `Input.mouse.x/y` and `worldX/Y` delegate to `Mouse.position` through `CoordinateSystem` (`toViewport`/`toWorld`), same path as `PointerFacade`. `hasPosition` is mouse-specific and stays true at `(0,0)`; it persists after release.

* **Buttons** — `Input.mouse.left/right/middle/back/forward` each expose `{down, pressed, released}` via `Mouse.isDown/justPressed/justReleased`. Generic `isDown(name)/pressed(name)/released(name)/button(name)` resolve `"left"`/`"right"`/`"middle"`/`"back"`/`"forward"` case-insensitively (also `"LEFT_MOUSE"` style) to `MouseButton` indices. Raw string queries `Input.pressed("LEFT_MOUSE")` still resolve through `KeyStrings` → `Mouse`.

* **Movement** — `Input.mouse.deltaX/Y` is the `Mouse` per-tick delta, cleared in `Mouse.snapshot()`. While pointer-locked it is relative `movementX/Y`; otherwise absolute diff.

* **Wheel** — `Input.mouse.wheel/wheelX` are canonical (`Mouse.wheel`/`wheelHorizontal` accumulated per tick, cleared in snapshot). `Input.wheel/wheelX` remain compatibility aliases.

* **Cursor** (`input/CursorManager.js:1`) — owns desired state `{visible, style, image, hotspot}` and applies to `InputSystem.domElement` (the `Game` canvas, owned by `RendererHost`). `visible=false → cursor:"none"`, `style` any CSS keyword, `image` → `cursor: url("img") x y, style`. `hotspot` `{x,y}` offsets the image tip. While pointer-locked the browser hides the cursor; `CursorManager` suppresses `apply()` and `PointerLockManager` restores desired style on unlock. No DOM leaks; `reset()/destroy()` clears to `""`. Engine-rendered cursor is deferred — CSS cursor has size/hotspot/DPI limitations documented, but the abstraction leaves room for a sprite later.

* **Pointer lock** (`input/PointerLockManager.js:1`) — stateful engine API over the browser Pointer Lock API: `Input.mouse.pointerLock.isLocked`, `lock():Promise<boolean>`, `unlock()`. Targets `InputSystem.domElement` (the canvas, not `document.querySelector`), via `Host.requestPointerLock/exitPointerLock/pointerLockElement`. Listens to `pointerlockchange`/`pointerlockerror`/`blur`/`visibilitychange` through `Host.onDocument/onWindow`, synchronizes `Mouse._setLocked` and `PointerManager._setLocked`, never reports `true` on rejection, and exposes async failure honestly (promise resolves `false` when `Host.mockPointerLockShouldFail` or browser rejects). External exits (user Esc, blur) are detected via `pointerlockchange`; `destroy()` detaches listeners, exits lock, and clears flags.

* **Lifecycle ownership** — `Game` wires `inputSystem.domElement = canvas` + `inputSystem.host = host` after `RendererHost` creation and keeps it in sync on `resize`/`_replaceCanvas`. `InputSystem` owns `CursorManager`/`PointerLockManager`; `Input.mouse` is a thin `MouseFacade` (`input/facade/MouseFacade.js:1`) that delegates. `Game.destroy()` calls `inputSystem.destroy()` which unlocks, clears cursor, detaches listeners, and `Input.setSystem(null)`.

* **Compatibility** — `Input.pointer`, `Input.wheel/wheelX`, `Input.pressed("LEFT_MOUSE")`, `Input.events/history/queue/next/buffer/repeated`, gestures, keyboard repeat remain intact. No new event types; mouse motion/wheel flow through `BrowserBackend` (`movementX/Y` now forwarded) → `InputEvent` → `InputSystem` → devices.

### Input — Sequences & Combos

`input` turns physical inputs into semantic actions; `combo` turns ordered actions into named sequences. Jygame provides the mechanism, not fighting-game semantics (no Forward/Back, quarter-circle, facing).

```
physical input → input (ActionMap via BindingCompiler) → action → combo (ComboMap) → ordered sequence → Input.sequence()
```

* **Scene declaration** (`core/Scene.js:220`) — `input = { punch: "KeyJ", down: "KeyS" }` compiled to `ActionMap`; `combo = { hadoken: ["down","right","punch"] }` or `{ hadoken: { sequence:[...], within:300, consume:true } }` compiled to `ComboMap` (`input/ComboMap.js:1`). Both stored on `InputContext` (`_actionMap` + `_comboMap`), pushed to `ContextStack` (`input/actions/ContextStack.js:1`) with priority; `Scene.exit` pops, so stale combos disappear.

* **Resolution** (`input/SequenceManager.js:27` + `input/EventMatcher.js:82`) — `Input.sequence("hadoken")` first looks for combo `hadoken` in highest-priority context; if found expands to its `sequence/within/consume`. Otherwise treats string as single-step `[name]`. `Input.sequence(["down","right"])` is direct. Steps resolve via `doesEventMatchName`: highest-priority action that defines the name (via `bindingMatchesEvent`) else raw (`resolveKeyboardIdentifier` physical → `resolveGamepadIdentifier` → `resolveMouseButton` → logical fallback). No duplicate resolver.

* **Timing** — uses `InputEvent.timestamp` (`performance.now()` monotonic, `input/InputEvent.js:36`). `within` is per-step max gap; history may contain gaps (empty ticks) but timestamps drive checks, not frame counts. Exact `gap == within` passes.

* **History** — `InputSystem.historySnapshot` (`HistoryBuffer` 128) is source, sorted by `timestamp` before search to handle tier reordering, never mutated. Bounded eviction drops oldest, so old sequences naturally expire.

* **Matching** — brute-force subsequence search with backtracking, allowing unrelated events between steps, supporting multiple events per tick. Bounded (`n=128, m≤~5`) so cheap. `WeakSet` per matcher tracks consumed events when `consume:true`; history never deleted, so `Input.history()` stable and overlapping `["A","B"]` / `["B","A"]` can both be true on `A B A`. Effective `consume = perCall.consume ?? combo.consume ?? false`, `within = perCall.within ?? combo.within ?? ∞`.

* **State** — `SequenceManager` (`input/SequenceManager.js:1`) holds `Map<key, {consumed:WeakSet}>` where `key` is `combo:ctxName:name` or `seq:json` or `single:name`. `Input.setSystem(null)` clears. No unbounded global history.

* **Matcher** (`input/Matcher.js:1`, `input/SequenceManager.js:48`) — `Input.match(predicate)` validates `typeof predicate==="function"` else `TypeError`, returns opaque `{[Symbol(InputMatcher)]:true, predicate}`. `isMatcher` checks symbol, no duck typing. `Input.sequence` accepts `string|Matcher` per element, validates `string|Matcher` else `TypeError`. For matcher steps `SequenceManager._enrichEvent(event)` builds `{type,device,timestamp,data,action,name,actions,matches(name)}` where `action` is primary matching action via `doesEventMatchName` scan, `actions` is all matching actions, `matches` helper reuses resolver. Predicate receives enriched historical event (frozen timestamp), errors propagate. Combo declarations remain declarative strings, not matchers; programmatic `Input.sequence([..., Input.match(...), ...])` is the escape hatch for facing-dependent `"forward"` etc. Matcher is stateless; per-matcher `WeakSet` and `within` handling reused via same DFS, key incorporates matcher identity (`WeakMap` id) so distinct matchers don’t share consumption.

* **Existing APIs untouched** — `history/queue/next/buffer/repeated/events/presses` remain separate consumers.

### AnimationSystem

```
AnimationSystem (extends System)
├── run(ctx, dt)             batch frame advancement via query
├── (internal) processEntity(entity, dt)
└── no per-frame allocations
```

- Operates via `ctx.queries.get(Animation, Renderable)` — no manual entity collection
- Per-clip FPS (no global animation speed)
- `Animation.mode` distinguishes persistent (`NORMAL`), one-shot (`ONCE`),
  queued (`QUEUED`), and forced (`FORCED`) playback; `Animation.loop` overrides
  the clip default (0 = respect clip, 1 = force finite, 2 = force loop)
- Non-looping clips stop on last frame; when they end the system advances the
  queue or resumes the latest persistent request, then fires `onComplete`
- Playback intent (names, queue) lives in the `AnimationPlayback` resource so
  the Sprite facade and the system share one controller
- Writes `Renderable.image` directly — RenderSystem is unaware of AnimationSystem
- Frame decoding goes through `AnimationClip.frameAt(elapsed, wrap)`:
  uniform clips stay O(1) (`floor(elapsed / frameDuration)` + modulo), while
  custom-timing clips use a prefix-sum timeline (`_timeAt`) — see the
  "Animation Timeline" section below
- Armed marker stops read the `Animation.stopAt` column (`0` = none,
  `position + 1` = target). A marker pause decodes **without wrapping** so a
  large `dt` cannot skip the marker, pauses exactly at the target, and caps
  `elapsed` at the marker boundary so `resume()` continues deterministically
  (no frame restart, no time consumed past the marker). It is a pause, not
  completion: the queue, `onComplete`, and the persistent request are untouched

### Animation Timeline: sequence, timing, and markers

An animation is a **timeline**, not just a list of images. Three orthogonal
dimensions describe it:

| Concept | Answers | Example |
|---|---|---|
| `sequence` | *which* frames play, in what order | `sequence: [0, 1, 2, 1, 0]` |
| `timing` | *how long* each playback position lasts | `timing: [0.08, 0.08, 0.40, 0.08]` |
| `markers` | *when* meaningful points occur (for gameplay sync) | `markers: { airborne: 2, landing: 4 }` |

`AnimationClip` is the single normalization point. `frames` are the extracted
source frames; the clip derives the normalized playback list with precedence
`explicit sequence > pingPong > identity`. It then stores the per-position
durations (`_durations`), a prefix-sum timeline (`_timeAt`), and the marker map
(`_markers`). `fps` remains the uniform default when `timing` is absent, so
simple animations are unchanged.

```js
const animations = await Image.animate({
  image: "jump.png",
  sliceX: 5,
  sliceY: 1,
  jump: {
    sequence: [0, 1, 2, 3, 4],
    timing: [0.08, 0.08, 0.20, 0.40, 0.08],
    markers: { airborne: 2, landing: 4 },
  },
});
```

- **Sequence** reuses source frames without duplicating images — e.g.
  `sequence: [0, 1, 2, 1, 0]` for a deliberate return, or
  `sequence: [0, 1, 2, 2, 2, 3]` where repeated positions are legitimate
  (each repeated position is still a distinct timeline point).
- **Timing** holds a pose without changing the global FPS — e.g.
  `timing: [0.08, 0.08, 0.40, 0.08]` keeps one frame on screen five times
  longer. `timing` aligns to the normalized playback positions, not the raw
  source frames.
- **Markers** name positions on the normalized playback timeline (not source
  frame indices). They are animation-relative — `impact` may exist in several
  clips without colliding.

Gameplay synchronizes with the animation through the Sprite facade. Markers are
addressed explicitly by animation + marker (never a global namespace), so the
same marker name can exist in several clips:

```js
if (Input.pressed("jump")) {
  if (king.animation.isAt("jump", "airborne")) {
    king.animation.resume();
  } else {
    king.animation.playUntil("jump", "airborne"); // 0 → 1 → 2, then PAUSED
  }
}
if (player.isFalling) {
  king.animation.resume(); // 2 → 3 → 4 → complete
}
```

or, arming the current playback without restarting it:

```js
king.animation.play("jump");
king.animation.pauseAt("jump", "airborne");
```

| Method | Meaning |
|---|---|
| `play(name)` | Persistent request (loops per the clip) |
| `playOnce(name)` | Temporary one-shot to completion |
| `playUntil(name, marker)` | Temporary playback that pauses exactly at a marker |
| `playAfter(name, marker)` | Temporary playback starting at the position after a marker |
| `pauseAt(name, marker)` | Arm the named (current) playback to pause at a marker |
| `resumeAt(name, marker)` | Position the cursor at a marker and resume from there |
| `pause()` / `resume()` | Pause / continue exactly where playback stopped |
| `stop()` | Reset playback state |
| `isAt(name, marker)` | Is the cursor exactly at the marker? |
| `hasReached(name, marker)` | Has the cursor reached or passed the marker? |

A marker stop is **not** completion: `onComplete` does not fire, the queue does
not advance, and the persistent request is preserved. `resume()` clears the
armed stop target and continues from the marker; only a genuine end of the
(clip-forced finite) playback triggers normal completion/queue behavior.
Positioning operations (`playAfter`, `resumeAt`) never fire `onComplete`
themselves.

Playback state is queryable through the facade (all facade-side reads — the hot
`AnimationSystem` loop stays numeric):

| Getter | Meaning |
|---|---|
| `current` | Name of the clip owning playback |
| `frame` / `position` | Current playback position on the normalized timeline |
| `progress` | Normalized progress through the clip (timing-aware; `1` at completion) |
| `isPlaying` | Playback is advancing |
| `isPaused` | Intentionally stopped with a resumable cursor |
| `isComplete` | A finite playback genuinely completed (a marker stop is never complete) |
| `marker` | Marker name at the current position, or `null` |

### RenderSystem

```
RenderSystem (extends System)
├── run(ctx, dt)             batch render via query (camera optional)
├── _getViewBounds(camera) → bounds|null shared bounds computation
├── _isVisible(entity, bounds) → bool    shared culling (bounds=null → true)
├── _drawEntity(ctx, entity)             shared entity transform + draw
└── camera ??= Camera.main ?? IDENTITY
```

- Camera transform applied once per batch (not per entity)
- `_getViewBounds`: returns null when `camera.width === 0` (no culling) —
  avoids `Infinity` arithmetic
- `_isVisible`: single culling implementation used by both `render`
  and `renderOne`
- `_drawEntity`: single entity-drawing implementation used by both
- `IDENTITY` sentinel (width=0, plain object) disables both transform
  and culling — no camera setup required for simple games
- Uses `QueryView` to iterate entities with `Transform + Renderable + Visible`

## Text

Text is the Font consumer in the ECS world (Sprite is the Image consumer). It
follows the engine's numeric-only ECS invariant, keeps `Font.render(ctx, ...)`
intact, and pushes glyph quads through the shared `RenderQueue` so Canvas/WebGL/
WebGPU behave identically. See
[`docs/design/text-architecture.md`](design/text-architecture.md) for the full
design; this section records the invariants and conventions.

### The numeric-handle invariant

> The ECS owns numeric state. Resource pools own non-numeric state. Handles
> connect the two.

Non-numeric data (content strings, cached glyph layouts, measured bounds) never
enters a component column. `Text` references it through compact numeric handles.

### The `Text` component

```js
static schema = {
  fontHandle:    "u16",   // canonical Font registry id; 0 = none
  contentHandle: "u32",   // packed pool handle (slot << 16 | generation); 0 = no content
  align:         "u8",    // 0 = left, 1 = center, 2 = right
  letterSpacing: "f32",
  version:       "u32",   // bumped on content/font/align/letterSpacing/color change
};
```

All rendering metadata (color, layer, depth, imageSmoothing) stays in
`Renderable`; position/rotation/scale in `Transform`; visibility in `Visible`.
Text adds no parallel rendering fields and no `RenderBounds`.

### `TextResourcePool`

A world resource holding the cold state behind every `contentHandle`:

- **Dense storage** — typed-array metadata (generation, in-use, layoutVersion,
  measured width/height) plus a free list; cold JS arrays for content strings
  and cached glyph layouts.
- **Generation handles** — `handle = (slot << 16) | generation`. `get(handle)`
  is one array read + one generation compare; a stale handle returns `null`.
- **Slot 0 is never allocated**, so `contentHandle === 0` means "no content"
  (typed-array zero-init makes it free).
- **Retire-on-wrap** — a release that would overflow a slot's 16-bit generation
  retires the slot instead of wrapping, so a stale handle can never alias a
  different live resource.
- **Idempotent release** — the generation guard makes double-release a no-op,
  so the facade `destroy()` and the system's destruction hook may both fire.
- **Ownership** — content is entity-owned: `TextSystem.onAdded` registers
  `world.onEntityDestroyed` (callbacks run before row removal) and releases the
  destroyed entity's handle. Fonts are shared and owned by the canonical
  registry.

### `TextSystem`

`static priority = 4` — after `RenderSystem` (priority 3), which clears the
`RenderQueue` at the start of its `update()`. This ordering is a hard
requirement: glyph commands are appended to the same queue after the clear, so
text and sprites interleave by `layer → depth → insertion` regardless of
registration order.

Query: `{ all: [Transform, Renderable, Text, Visible] }`. On relayout (only when
`version !== layoutVersion`) it resolves the font via `Font.byId(fontHandle)`
and pushes one `RenderQueue` command per glyph. Steady state is allocation-free:
it reads the cached layout and pushes pooled commands.

### Font render-mode capabilities

Retained-`Text` rendering is gated by an explicit capability contract between
`Text` and the font — never by switching on the concrete font class. Every font
type extends `FontBase`, which exposes `font.capabilities` (`{ glyph, raster }`)
and `font.supportsRenderMode(mode)`.

```text
BitmapFont: capabilities = { glyph: true,  raster: true }
NativeFont: capabilities = { glyph: false, raster: true }
```

`Text` validates the requested render mode against the font at construction, on
every `font`/`renderMode` change, and in `TextSystem` before any renderer runs.
Without an explicit `renderMode` option the mode is chosen automatically from
the font's capabilities — a bitmap font defaults to `GLYPH`, a native font
(which cannot do glyph) to `RASTERIZED`. An explicit option is a deliberate
override and is validated like any other. An unsupported combination throws
`Text: font "<name>" does not support render mode "<mode>".` — it is never
silently rerouted to another mode, and a renderer only ever receives a `Text`
whose font declares support for that renderer's mode. Immediate
`Font.render(ctx, ...)` is unaffected.

`NativeFont + RASTERIZED` produces the same retained representation as a
rasterized bitmap `Text`: the whole string is measured with Canvas2D text
metrics (`ctx.measureText` + `actualBoundingBox*`) and rasterized into one
cached text surface with a single `fillText`, then emitted as one textured
quad. The layout stage dispatches on whether the font has glyph records
(`getGlyph`) — glyph layout for bitmap fonts, metric layout for native fonts —
and both refill the identical layout target, so the renderer never knows which
font kind produced a surface.

### Font registry numeric ids

`Font.load()` assigns each font a monotonic, never-reused numeric `id`
(`font.id`); `Font.byId(id)` looks it up. `Font.remove()`/`Font.clear()` free
the registry entry but never reuse ids, so a removed font's handle resolves to
`null` and can never alias a different font. Unlike `AssetRegistry.clear()`,
`Font.clear()` does **not** reset the id counter.

### CollisionSystem

```
CollisionSystem (extends System)
├── _groups: Map<Group, { strategy, entities }>
├── run(ctx, dt)             beginFrame orchestration
├── beginFrame()            rebuilds all strategy instances
├── useSpatialHash()        registers a Group with SpatialHash
├── removeGroup()           unregisters a Group
├── collideRect/Point/Group/Sprite()
└── _query/_queryPairs      internal helpers
```

- `beginFrame()` takes no arguments — iterates all registered groups
- Strategy is pluggable (currently `SpatialHash`)
- `_queryPairs` supports callback mode (zero-allocation)

### SpatialHash

```
SpatialHash (broad-phase strategy)
├── rebuild(entities)           clears + rebuilds cell grid
├── collideRect/Point/Sprite()  stamp-based single-entity dedup
├── collideGroup()              scratch Set pair dedup (reused)
├── _queryStamp                 stamp counter (no Set allocation)
├── _seen                       reusable Set for pair dedup
└── __shId, __shStamp           entity markers (internal)
```

- Single-entity queries (`collideRect`, `collideSprite`) use `_queryStamp++`
  and stamp each entity — zero allocation per query.
- `collideGroup` uses a scratch `_seen` Set per instance (one constructor
  allocation), cleared each call.
- `collideGroup` supports callback mode (zero pair allocation).

## Scene Architecture

### Scene Hierarchy

There is a single canonical Scene hierarchy. The ECS Scene is the generic base,
and the engine Scene extends it with game-specific functionality.

```
ecs/scene/Scene           (ECS layer — generic, reusable)
        ↑
core/Scene                (Engine layer — game-specific)
```

### ECS Scene (`ecs/scene/Scene`)

Responsibilities:
- Owns a `World` instance (lazy-created via `_createWorld()`)
- Manages the `_created` flag for SceneManager integration
- Provides lifecycle hooks: `onCreate`, `onEnter`, `onExit`, `onPause`, `onResume`, `onDestroy`
- Provides `update(dt)` and `render(ctx)` — no-ops by default

The `_createWorld()` method can be overridden by subclasses to customize World
construction. By default it returns `new World()`.

### Engine Scene (`core/Scene`)

Extends ECS Scene with:

- **DOM integration**: creates a `root` `<div>` element for UI rendering
- **Input helpers**: `on(event, handler)`, `onSwipe(cb)`, `onTap(cb)`, `cleanup(fn)`
- **Game navigation**: `pushScene`, `popScene`, `replaceScene`, `switchScene`, `transitionTo`
- **Engine lifecycle**: `enter()`/`exit()` (called by `Game._mountScene`/`_unmountScene`)
- **Sprite integration**: manages `Sprite._defaultWorld` on enter/exit
- **Camera/CanvasContext**: installs game-specific resources on enter when a Game is available

Overrides `_createWorld()` to use `DefaultWorldBuilder.createDefault()`.

### WorldFactory / DefaultWorldBuilder

All ECS initialization logic is extracted from Scene into a dedicated builder.

**File**: `ecs/bootstrap/DefaultWorldBuilder.js`

```js
const world = DefaultWorldBuilder.createDefault();
```

The builder:

1. Creates a new `World`
2. Registers all engine components:
   - Transform, Velocity, Collider, Renderable, RenderBounds
   - Animation, Visible, Trail
   - EnemyTag, PlayerTag, ProjectileTag, StaticTag
3. Installs engine resources:
   - SpatialHash, TrailManager, RenderQueue, AnimationClipRegistry
4. Installs engine systems:
   - MovementSystem, AnimationSystem, CollisionSystem
   - RenderSystem, TrailSystem

Game-specific resources (Camera, CanvasContext) are NOT installed by the builder
— they are set up by `core/Scene.enter()` when a Game is available.

### SceneManager

Decomposed internally into three concerns:

| Concern | Implementation | Responsibility |
|---------|---------------|----------------|
| **SceneRegistry** | Private `_registry` (Map) | `add`, `remove`, `get`, `has` — owns loaded scenes |
| **SceneStack** | Public `_stack` (Array) | `push`, `pop`, `peek`, `length` — active scene ordering |
| **SceneManager** | Coordinator | Lifecycle orchestration: `start`, `change`, `replace`, `push`, `pop`, `update`, `render` |

Public API unchanged. The decomposition is purely internal.

### Ownership Relationships

```
Game
├── owns _sceneStack: Scene[]       (core/Scene instances)
├── manages enter/exit lifecycle
└── delegates to scene.world.*       (ECS World per scene)

SceneManager
├── owns _registry: Map<string, Scene>  (ecs/scene/Scene instances)
├── owns _stack: Scene[]               (active scenes)
└── manages onCreate/onEnter/onExit/onPause/onResume/onDestroy lifecycle
```

Each Scene owns exactly one World. Worlds are never shared between scenes.
Systems, components, prefabs, and events are isolated per World.

## Scene Stack

### Overview

`Game` replaces the single `scene` property with `_sceneStack[]`. The top
scene is the active scene. Underlying scenes remain alive — nothing is
destroyed when a new scene is pushed on top.

```
Game
├── _sceneStack: Scene[]     (index 0 = bottom, top = active)
├── run(scene)               initial scene (clears stack)
├── pushScene(scene)         stack an overlay
├── popScene()               remove the top overlay
├── replaceScene(scene)      pop current + push new (correct lifecycle)
├── peekScene() → Scene      top without side effects
├── switchScene(scene)       full replacement (clears stack)
├── get scene                → peekScene() (backward compat)
├── get sceneCount           → _sceneStack.length
├── getScenes() → Scene[]    → shallow copy of stack (safe)
├── getScene(index) → Scene  → bounds-checked access
├── containsScene(scene)     → _sceneStack.includes(scene)
├── isTopScene(scene)        → this.scene === scene
└── Scene delegates          pushScene/popScene/replaceScene/switchScene
```

### Lifecycle Order

```
pushScene(newScene)
├── if newScene.blocksUpdateBelow:
│   └── top.pause()
└── newScene.enter()

popScene()
├── top.exit()
├── if top.blocksUpdateBelow:
│   └── below.resume()
└── refresh UI

replaceScene(scene)
├── old = stack.pop()
├── old.exit()
├── stack.push(scene)
├── scene.enter()
└── refresh UI

switchScene(newScene)
├── for each s in stack:
│   ├── s.exit()
│   └── s.root.remove()
├── stack = [newScene]
├── newScene.enter()
└── refresh UI
```

### Blocking Rules

Each scene can control whether scenes below it receive updates and renders.

| Property | Default | Purpose |
|---|---|---|
| `blocksUpdateBelow` | `true` | Stop game logic when paused |
| `blocksRenderBelow` | `false` | Show game dimmed behind menu |

Pause/resume lifecycle is aligned with update blocking. A scene pushed with
`blocksUpdateBelow = false` (e.g. FPS overlay, chat) does NOT pause the scene
below it. On pop, the scene below is resumed only if the popped scene had been
blocking updates.

Traversal walks downward from top until a blocker is found, then executes
the visible set bottom-to-top. Blocking indices are computed once per frame
inside `_loop()` and shared across `_updateScenes`, `_interpolateScenes`, and
`_renderScenes` — zero redundant scans.

```
Stack: [GameScene, PauseScene, InventoryScene]

_updateScenes:
  Inventory allows updates below  → continue
  Pause   blocks updates below   → start = 1
  Execute: Pause.update(), Inventory.update()

_renderScenes:
  Inventory allows render below  → continue
  Pause   allows render below    → continue
  Game    reaches bottom         → start = 0
  Execute: Game.render(), Pause.render(), Inventory.render()
```

### Scene Lifecycle Hooks

| Hook | When Called |
|---|---|---|
| `enter()` | Scene is mounted (after push, replace, switch, or run) |
| `exit()` | Scene is unmounted (pop, replace, switch, or destroy) |
| `pause()` | Another scene is pushed above AND `blocksUpdateBelow` is true |
| `resume()` | Scene becomes top again AND the popped scene had been blocking |
| `update(dt)` | Each frame if not blocked from below |
| `interpolate(alpha)` | Each frame, follows same rules as update |
| `render(ctx)` | Each frame if not blocked from below |
| `renderUI(ctx)` | Each frame if not blocked from below — canvas foreground, above retained objects |
| `renderDOM()` | Called after push/pop/switch to refresh DOM |
| `pushScene` / `popScene` / `replaceScene` / `switchScene` | Stack management delegated to `this.game` |

### Lifecycle Safety

#### Single-Use Scenes

Scenes are single-use objects. Once `exit()` is called, the same scene instance
must not be mounted again. Both `enter()` and `exit()` guard against double
calls and throw descriptive errors.

```js
const pause = new PauseScene();
game.pushScene(pause);
game.popScene();
game.pushScene(pause); // throws: scene has already exited
```

#### Scene Ownership

Each scene belongs to exactly one `Game` instance. Attempting to mount a scene
on a second game throws:

```js
gameA.pushScene(scene);
gameB.pushScene(scene); // throws: belongs to another Game
```

#### Mutation Safety During Update

Scene operations (`pushScene`, `popScene`, `replaceScene`, `switchScene`) that
occur during `update()` or `interpolate()` are queued and deferred. They are
flushed in FIFO order after the update phase finishes and before rendering.

This prevents subtle iteration bugs when scene code mutates the stack:

```js
update(dt) {
  this.pushScene(new PauseScene()); // queued, not executed now
  this.popScene();                   // queued
}
// flushed after update, before render
```

#### Input Validation

All scene-accepting methods validate their argument:

| Method | Rejects |
|---|---|
| `run(scene)` | null, non-Scene, already-running game |
| `pushScene(scene)` | null, non-Scene |
| `replaceScene(scene)` | null, non-Scene |
| `switchScene(scene)` | null, non-Scene |
| `popScene()` | empty stack or last remaining scene |

### Per-Frame Lifecycle

```
Game._loop(time)
│
├── compute updateStart = _findBlockingIndex("blocksUpdateBelow")
├── compute renderStart = _findBlockingIndex("blocksRenderBelow")
│
├── _updating = true
│   │  scene operations are queued, not executed immediately
│   │
│   ├── _updateScenes(fixedDt, updateStart)
│   │   │  only scenes at or above updateStart
│   │   ├── user input handling
│   │   ├── scene.world.update(dt)   ← all ECS systems run in priority order
│   │   └── scene-specific collision queries
│   │
│   ├── _interpolateScenes(alpha, updateStart)
│   │   same visibility as update
│   │
│   └── _updating = false
│
├── _flushSceneOps()
│   executes all queued push/pop/replace/switch in FIFO order
│
└── _renderScenes(ctx, renderStart)
    │  only scenes at or above renderStart
    ├── RenderSystem runs as part of world.update(dt) — culls + draws visible entities
    └── scene-specific overlay rendering
```

### Allocations Per Frame (hot path)

| Operation | Allocation |
|---|---|
| `world.update(dt)` — system scheduling | 0 (pre-built priority list) |
| `MovementSystem.run` | 0 |
| `AnimationSystem.run` | 0 |
| `RenderSystem.run` (no camera) | 0 (IDENTITY sentinel, width=0 → no culling, no transform) |
| `RenderSystem.run` (with camera) | 0 (one `ctx.save/restore`, bounds computed once) |
| `Camera.apply` | 0 |
| `Camera.worldToScreen` | 0 (writes to user-provided `out`) |
| `Camera.screenToWorld` | 0 (writes to user-provided `out`) |
| `CollisionSystem.beginFrame()` | 0 (cells cleared + reused) |
| `SpatialHash.collideRect` / `collideSprite` | 0 (stamp++) |
| `SpatialHash.collideGroup` (with callback) | 0 (reused scratch Set) |
| `SpatialHash.collideGroup` (with out array) | 0 (scratch Set + reuses out array) |
| `SpatialHash._insert` | cell key string (unavoidable) |
| `Renderable.draw` with circle/ellipse | 0 (Path2D cached) |

Goal: **0 allocations per frame** during normal gameplay on the hot path.
Pull-based APIs (`out`, callback) shift allocation control to the caller.

## ECS Component Schema Contract

Components are registered on the `World` via `ComponentRegistry`. Each
component type has a unique numeric ID and an `ObjectSchema` defining
its field layout for typed-array storage.

```js
ComponentRegistry.register(Transform, {
  x: { type: "float64", default: 0 },
  y: { type: "float64", default: 0 },
  rotation: { type: "float64", default: 0 },
  scale: { type: "float64", default: 1 },
});
```

Systems access component data through `QueryView` iteration. Entity
objects expose component instances as properties matching the class name:

```js
// Inside a System.run(ctx, dt):
const view = ctx.queries.get(Transform, Velocity);
for (const entity of view) {
  // entity.transform → { x, y, rotation, scale }
  // entity.velocity → { x, y }
  entity.transform.x += entity.velocity.x * dt;
}
```

### Query Signatures

Systems declare their component dependencies explicitly:

| System | Query Signature | Access Pattern |
|---|---|---|
| `MovementSystem` | `Transform + Velocity` | `entity.transform`, `entity.velocity` |
| `AnimationSystem` | `Animation + Renderable` | `entity.animation`, `entity.renderable` |
| `RenderSystem` | `Transform + Renderable + Visible` | `entity.transform`, `entity.renderable` |
| `CollisionSystem` | `Transform + Collider + Visible` | `entity.transform`, `entity.collider` |
| `HierarchySystem` | `Parent + Transform + WorldTransform` | System internals via Table columns |

### Tag Components

Tag components (empty schemas) act as query filters:

```js
// Find all enemies:
const view = ctx.queries.get(Transform, Renderable, EnemyTag);
```

Tags add no storage overhead (zero-byte schemas) and are matched by
archetype bitmask — no runtime type checks.

### Entity Lifecycle

```
world.createEntity()           → entity (with Transform added by default)
entity.addComponent(Velocity)  → archetype move (new table)
entity.removeComponent(Velocity) → archetype move (previous table)
entity.hasComponent(Velocity)  → boolean (O(1))
entity.getComponent(Velocity)  → component data reference
entity.destroy()               → removed from all tables, ID recycled
```

Entity IDs are recycled after destruction. Active entity tracking
uses a free-list via `EntityManager`.

### Compatibility with Old API

`Sprite` and `Group` remain available as convenience wrappers that
internally use the ECS World:

- `new Sprite(x, y, w, h)` creates an ECS entity with `Transform`,
  `Collider`, `Velocity`, `Renderable`, `Visible` components.
- `Group` is a pure entity container that delegates queries to the
  `CollisionSystem` and supports `SpatialHash` acceleration.

## Strategy Interface

Pluggable broad-phase strategies must implement:

```js
interface BroadPhaseStrategy {
  rebuild(entities): void
  collideRect(rect, out?): Entity[]
  collidePoint(point, out?): Entity[]
  collideSprite(entity, out?): Entity[]
  collideGroup(other, cbOrOut?): Pair[] | void
}
```

`SpatialHash` is the default strategy. Future strategies (`SweepAndPrune`,
`Quadtree`, `BVH`) implement the same interface and are swapped in via
`CollisionSystem.useSpatialHash()`.

---

## Hierarchy System

### Ownership Model

| Concern | Owner | Type |
|---------|-------|------|
| Parent pointer | `Parent` component | `{ entity: u32 }` — stored in ECS table |
| Child list | `HierarchyGraph._children` | `Map<entityId, entityId[]>` — authoritative |
| Child marker | `Children` component | Empty-schema tag for ECS queries |
| Dirty set | `HierarchyGraph._dirty` | `Set<entityId>` — entities needing WT recomputation |

**Children ownership (Option B):** The `Children` component is a lightweight marker
that enables ECS queries (e.g., "find all entities with children"). The authoritative
child list lives in `HierarchyGraph._children` as a `Map`. This avoids the ECS's
fixed-schema limitation — child lists are variable-length and sparse, which fits a
Map better than table columns.

**Dirty ownership:** Dirty state lives in `HierarchyGraph._dirty` as a `Set<entityId>`.
This was chosen over per-component dirty flags for several reasons:

- Adding a dirty column to every entity's table would impose memory overhead on all
  entities regardless of hierarchy membership.
- The dirty set is naturally sparse (only entities whose Transform changed since the
  last update are dirty).
- `Set<entityId>` provides O(1) add/delete/has with no per-entity storage overhead
  for non-dirty entities.
- Moving dirty state into a dedicated `DirtyTransform` component was considered but
  rejected: adding/removing a component on every Transform change would cause
  archetype moves, which are significantly more expensive than a Set operation.

### Hierarchy Traversal Algorithm

The `HierarchySystem` replaces full-table iteration with a **BFS from dirty roots**:

```
1. Snapshot the dirty set into an array (one allocation per frame).
2. For each entity in the snapshot:
   a. If already processed (removed from dirty set), skip.
   b. If it has a Parent that is still dirty, skip (parent will reach it via BFS).
   c. Otherwise, BFS from this entity:
      - Resolve entity → (Table, row) via archetype system + entity manager.
      - If root (no Parent): copy local Transform → WorldTransform via typed arrays.
      - If child: read parent's WorldTransform via parent's table columns, compute.
      - Remove from dirty set.
      - Push dirty children (from hierarchy._children) to the BFS queue.
3. After all seeds processed: any remaining dirty entries are stale (safety clear).
```

Complexity analysis:

| Scenario | Old (table scan) | New (BFS) |
|----------|-----------------|-----------|
| No dirty entities | O(world entities) | O(1) — early return |
| Single root changed, N descendants dirty | O(N × D × world) | O(N) |
| K roots changed, N total dirty | O(K × N × world) | O(N) |
| Deep chain (depth D), single root changed | O(D × world) | O(D) |

**Key insight:** The old algorithm scanned every table for every pass (number of
passes = max depth). The new algorithm only visits dirty entities, processing each
exactly once via BFS from its dirty root ancestor.

### Determinism

- BFS queue preserves parent-before-child ordering.
- Children are enqueued in insertion order (from `_children` array), preserving
  sibling order.
- The snapshot of the dirty set (`[...dirty]`) is processed in insertion order,
  but the BFS from each seed guarantees correct propagation regardless of seed order.

### Dirty Propagation (Explicit Stack)

The recursive `_markDirtyRecursive` was replaced with an explicit stack to avoid
JavaScript recursion limits on deep hierarchies:

```js
_markDirtyRecursive(entity) {
    const stack = [entity];
    while (stack.length > 0) {
        const current = stack.pop();
        if (this._dirty.has(current)) continue;
        this._dirty.add(current);
        const children = this._children.get(current);
        if (children) {
            for (let i = 0; i < children.length; i++) {
                stack.push(children[i]);
            }
        }
    }
}
```

This handles arbitrarily deep hierarchies (up to available memory) without stack
overflow.

### World API Lookup Reduction

The optimized HierarchySystem reduces per-entity World API calls in the hot loop:

| Operation | Old (per entity per pass) | New (per entity, one pass) |
|-----------|--------------------------|---------------------------|
| `world.has(entity, Parent)` | 1 | 0 — uses `sig.contains(pid)` |
| `world.has(parent, WorldTransform)` | 1 | 0 — parent guaranteed to have WT |
| `world.get(entity, Parent)` | 1 | 1 (only for children) |
| `world.get(parent, WorldTransform)` | 1 | 0 — reads parent WT from typed arrays directly |
| `world.isAlive(parent)` | 1 | 0 — parent is alive by invariant |
| `hierarchy.isDirty(entity)` | 1 | 1 — O(1) Set lookup |
| entity → (Table, row) | 0 (table iteration) | 2 (`entityTable` + `getRow`) |

### Integration with ECS

The HierarchySystem uses `priority = -10` to run before all gameplay systems
(which default to priority 0). This ensures WorldTransform is up-to-date before
MovementSystem, RenderSystem, CollisionSystem, etc. read it.

`HierarchyGraph` is stored as a World resource, retrieved via
`ctx.resources.get(HierarchyGraph)`.

---

## Scene Streaming System

### Current Phase

The streaming system (Phase 33) provides the **infrastructure only**. It enables
entities to be grouped into named cells and cells to be loaded and unloaded
deterministically. No serialization, asynchronous loading, disk I/O, world
partitioning, or LOD is implemented in this phase.

### StreamingCell

A `StreamingCell` represents a logical collection of entities within a World.

**Responsibilities:**
- Unique name identification
- `loaded` / `unloaded` state tracking
- Ownership of entity membership via a `Set<entityId>`
- Deterministic cleanup

**Entity ownership rules:**
- Each entity belongs to at most one `StreamingCell`.
- Adding an entity already owned by another cell throws.
- Adding a dead or invalid entity ID throws.
- Destroyed entities are automatically removed from their owning cell.

**API:**

| Member | Type | Description |
|--------|------|-------------|
| `cell.name` | `string` | Unique cell name |
| `cell.loaded` | `boolean` | Whether the cell is loaded |
| `cell.entityCount` | `number` | Number of owned entities |
| `cell.entities` | `Set<number>` | Set of owned entity IDs |
| `cell.addEntity(entity)` | `void` | Add entity to cell |
| `cell.removeEntity(entity)` | `void` | Remove entity from cell |
| `cell.clear()` | `void` | Remove all entities (no destruction) |
| `cell.contains(entity)` | `boolean` | Check entity membership |

### StreamingManager

The `StreamingManager` owns every `StreamingCell` within a World. It is stored
as a World resource.

**Responsibilities:**
- Cell lifecycle: create, retrieve, destroy
- Load/unload orchestration (entity destruction on unload)
- Entity-to-cell mapping for O(1) cleanup on entity destruction

**API:**

| Method | Description |
|--------|-------------|
| `createCell(name)` | Create a new cell (throws on duplicate) |
| `getCell(name)` | Retrieve cell or null |
| `hasCell(name)` | Check if cell exists |
| `destroyCell(name)` | Remove cell (unloads first if loaded) |
| `load(name)` | Activate cell (no-op if already loaded) |
| `unload(name)` | Destroy all owned entities, clear cell, mark unloaded |
| `loadAll()` | Activate all cells |
| `unloadAll()` | Unload all cells |
| `loadedCells()` | Return array of loaded cells |
| `cellCount` | Total number of cells |

### Loading Lifecycle

```
load(name)
  → cell found?  (throw if not)
  → already loaded?  (no-op)
  → mark cell._loaded = true
  → entities are preserved
```

### Unloading Lifecycle

```
unload(name)
  → cell found?  (throw if not)
  → already unloaded?  (no-op)
  → snapshot entity IDs
  → clear cell._entityIds
  → remove entity→cell mappings
  → destroyEntity() for each entity
  → mark cell._loaded = false
```

### Entity Destruction Integration

When `World.destroyEntity(entity)` is called, the streaming system is notified
via a registered callback. The callback:
1. Looks up the entity in `StreamingManager._entityToCell` (a `Map<entityId, StreamingCell>`).
2. Removes the entity from the cell's `_entityIds` Set.
3. Removes the entity→cell mapping.

This ensures no stale entity IDs remain in any cell after entity destruction,
and that unload remains safe even if entities were destroyed externally.

### Relationship with SceneManager

The streaming system is **orthogonal** to SceneManager:
- `Scene` owns an entire World with full lifecycle (create, enter, pause, resume,
  exit, destroy).
- `StreamingCell` organizes entities within a single World.
- A Scene may have zero or more StreamingCells.
- Future phases may integrate cell loading with scene transitions.

### Relationship with Serialization (Future)

- `StreamingCell._name` serves as a serialization identifier.
- Future phases will introduce serialized cells: cells that can be written to
  disk as prefab-like assets and instantiated on demand.
- No serialization logic exists in this phase.

### Performance Characteristics

| Operation | Cost |
|-----------|------|
| `createCell` | O(1) Map insert |
| `destroyCell` | O(N) if loaded (N = entities to destroy) |
| `addEntity` | O(1) Set add + Map set |
| `removeEntity` | O(1) Set delete + Map delete |
| `contains` | O(1) Set has |
| `load` | O(1) flag set |
| `unload` | O(N) (N = entities to destroy) |
| `onEntityDestroyed` | O(1) Map get + Set delete + Map delete |

### Future Phases

- **Phase 34:** Serialized cells — cells become assets streamed from disk.
- **Phase 35:** Asynchronous loading — cells load in the background.
- **Phase 36:** Streaming radii — cells activate based on proximity.
- **Phase 37:** World partitioning — spatial subdivision for large worlds.
- **Phase 38:** LOD — level-of-detail cell variants.

