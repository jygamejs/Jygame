<p align="center">
  <img src="./logo_jygame.avif" alt="JyGame Logo" width="400">
</p>

<div align="center">

⭐ **Consider Supporting The Project with a star** ⭐

</div>

# jygame

A lightweight 2D game framework for the browser built on an **archetype-based ECS** architecture.

```js
import {
  Game, Scene,
  Sprite, Colors,
  ActionKind, CompositeBinding, KeyBinding, KeyCode,
} from "jygame";

class MyScene extends Scene {
  onEnter() {
    this.player = new Sprite(100, 100, 32, 32, this.world);
    this.player.style.fill = Colors.GreenShades.MagicalMalachite;

    const move = new CompositeBinding(ActionKind.VECTOR2, [
      { binding: new KeyBinding(KeyCode.KEY_D),        vector: [ 1,  0] },
      { binding: new KeyBinding(KeyCode.KEY_A),        vector: [-1,  0] },
      { binding: new KeyBinding(KeyCode.KEY_W),        vector: [ 0, -1] },
      { binding: new KeyBinding(KeyCode.KEY_S),        vector: [ 0,  1] },
      { binding: new KeyBinding(KeyCode.ARROW_RIGHT),  vector: [ 1,  0] },
      { binding: new KeyBinding(KeyCode.ARROW_LEFT),   vector: [-1,  0] },
      { binding: new KeyBinding(KeyCode.ARROW_UP),     vector: [ 0, -1] },
      { binding: new KeyBinding(KeyCode.ARROW_DOWN),   vector: [ 0,  1] },
    ]);
    this._actionMap.bind("move", move, ActionKind.VECTOR2);
  }

  update(dt) {
    const speed = 200;
    const m = this._actionMap.getState("move").vector;
    this.player.velocity.x = m.x * speed;
    this.player.velocity.y = m.y * speed;
  }

  render(ctx) {
    ctx.fillStyle = this.player.style.fill;
    ctx.fillRect(this.player.x, this.player.y, this.player.width, this.player.height);
  }
}

const game = new Game({ parent: document.body, width: 800, height: 600 });
game.run(new MyScene());
```

## Install

```sh
npm install jygame
```

## Documentation

Full API reference, guides, and examples: [jygame-documentation.vercel.app](https://jygame-documentation.vercel.app/)

## API

### ECS Core

| Import | Description |
|---|---|
| `World` | Archetype-based ECS world. Owns all entities, components, systems, queries, and resources. `update(dt)` runs all registered systems in priority order. |
| `System` | Base class for all systems. Override `run(ctx, dt)` or use lifecycle hooks (`onInit`, `onBegin`, `onEnd`). Systems declare their component queries and execute on matching archetypes. |
| `ArchetypeSystem` | Base class for systems that operate on archetype tables. Subclasses override `processEntity(entity, dt)` or `processTable(archetype, dt)` for bulk operations. |
| `QueryView` | Iterable view into matching entities. Created via `world.query(Transform, Velocity)`. Supports `for...of`, `.forEach()`, `.length`, and optional `TagComponent` filters. |
| `ComponentSignature` | Bitmask-based signature for matching archetypes to queries. Used internally by `QueryEngine` for O(1) archetype matching. |
| `EntityManager` | Manages entity creation/destruction, archetype assignment on component add/remove, and entity-to-id mapping. |
| `ComponentRegistry` | Global registry of component schemas. Each component type gets a unique numeric ID and an `ObjectSchema` describing its field layout for typed-array storage. |
| `QueryEngine` | Maintains registered queries and notifies them when archetypes are created/destroyed. Supports `beforeAdd`/`afterAdd`/`beforeRemove`/`afterRemove` hooks. |
| `SystemContext` | Per-world context object passed to system `run()`. Provides access to resources, queries, and the entity manager. |
| `SystemScheduler` | Runs systems in priority order with `before`/`after` dependency resolution. |
| `Table` | Columnar data store (SoA — Structure of Arrays) for a single archetype. Each component field is a typed array column. |

### ECS Components

| Import | Description |
|---|---|
| `Transform` | Position (`x`, `y`), rotation, scale — the single source of truth for world position. Field layout: `{ x: float64, y: float64, rotation: float64, scale: float64 }` |
| `WorldTransform` | Computed world-space transform (updated by `HierarchySystem`). Same field layout as `Transform`. |
| `Velocity` | Per-axis velocity (`x`, `y`) as float64. |
| `Collider` | AABB dimensions (`width`, `height`) with static helpers. |
| `Renderable` | Image or shape style. `draw(ctx, w, h)` method. |
| `Visible` | Tag/flag component: `{ visible: boolean }`. |
| `RenderBounds` | Cached render bounds for culling (`x`, `y`, `w`, `h`). |
| `Animation` | Animation state: `{ current: string, frame: uint32, elapsed: float64, playing: boolean }`. |
| `Trail` | Trail effect state: `{ maxLength, interval, elapsed, points }`. |
| `Parent` | Single-component parent reference: `{ entity: uint32 }`. |
| `Children` | Empty-schema tag component. Entities with children have this component. |

### ECS Tag Components

| Import | Description |
|---|---|
| `EnemyTag` | Empty schema — marks an entity as an enemy. |
| `PlayerTag` | Empty schema — marks an entity as the player. |
| `ProjectileTag` | Empty schema — marks an entity as a projectile. |
| `StaticTag` | Empty schema — marks an entity as static (skip collision checks). |

### ECS Systems

| Import | Description |
|---|---|
| `MovementSystem` | Reads `Velocity` + `Transform`, writes `Transform.x/y`. Priority: 0. |
| `AnimationSystem` | Reads `Animation` + `Renderable`, advances frames. Priority: 0. |
| `CollisionSystem` | Manages broad-phase strategies and collision queries. Priority: 10. |
| `RenderSystem` | Reads `Transform` + `Renderable` + `Visible`, draws to canvas with camera culling. Priority: 100. |
| `TrailSystem` | Updates trail point history for entities with `Trail` component. Priority: 0. |
| `HierarchySystem` | Propagates parent transforms to children (BFS from dirty roots). Priority: -10 (before all others). |

### ECS Resources

| Import | Description |
|---|---|
| `SpatialHash` | Spatial partitioning for broad-phase collision acceleration. Stamp-based single-entity dedup. |
| `CollisionQuery` | Collision query helpers registered on the world. |
| `RenderQueue` | Sorted render command queue. Supports z-ordering. |
| `CanvasContext` | Holds the 2D rendering context for the scene. |
| `TrailManager` | Manages trail effect state across entities. |
| `TrailBuffer` | Point history buffer for a single trail. |
| `AnimationClip` | Frame sequence descriptor with per-clip FPS. |
| `AnimationClipRegistry` | Global registry of named animation clips. |
| `HierarchyGraph` | Manages parent-child relationships and dirty-set propagation. |
| `EventChannel` | Typed event channel for entity-component events. |
| `Events` | High-level event API for watching component add/remove/change. |
| `Prefab` | Reusable entity template. Instantiate via `prefab.create(world)`. |
| `Serializer` | Serializes/deserializes entire world state to/from JSON. |
| `StreamingCell` | Logical collection of entities within a world. Named, loadable/unloadable. |
| `StreamingManager` | Manages StreamingCell lifecycle, load/unload orchestration. |
| `SceneManager` | Manages registry and stack of ECS scenes. |

### Game Engine

| Import | Description |
|---|---|
| `Game` | Main game loop with fixed timestep, canvas setup, UI layer, scene stack (`pushScene`, `popScene`, `replaceScene`, `peekScene`, `switchScene`), and lifecycle management. |
| `Scene` | Engine Scene (extends ECS Scene). Lifecycle hooks (`onEnter`, `onExit`, `onCreate`, `pause`, `resume`, `update`, `interpolate`, `render`, `renderUI`), blocking properties, stack delegators, auto-cleaned event helpers (`on`, `onSwipe`, `onTap`, `cleanup`), and built-in `_actionMap`/`_inputContext` for input. |
| `DefaultWorldBuilder` | Creates a pre-configured `World` with all engine components, systems, and resources registered. |
| `Sprite` | Convenience entity wrapper with `Transform`, `Collider`, `Velocity`, `Renderable`, `Visible`. Exposes `x`, `y`, `width`, `height`, `angle`, `scale`, `velocity`, `image`, `style` shorthands. |
| `Group` | Entity container. Iterable (`for...of`). Collision queries delegate to `CollisionSystem`. Optional `SpatialHash` acceleration. `dispose()` for cleanup. |
| `Camera` | View abstraction — world position, zoom, rotation, coordinate conversion. `Camera.main` auto-set on first construction. `Camera.setMain()` for explicit assignment. |
| `Vec2` | 2D vector with add, sub, scale, dot, normalize, rotate, lerp. |
| `Rect` | AABB rectangle utility with collision, containment, overlap, and anchor helpers. |
| `Clock` | Fixed-timestep accumulator for deterministic updates. |
| `Timer` | Countdown timer with optional looping. |
| `Input`, `OldInputContext` | Legacy input singleton (kept for migration; new code uses the modern Input System below). |
| `State` | Observable state container with subscribe/unsubscribe. |
| `Storage` | `localStorage` wrapper with JSON serialization. |
| `Color`, `Colors` | Color class with parsing, manipulation, and 96 named palettes. |
| `Palettes` | Curated color palette collections (96 palettes, ~15 colors each). |
| `ImageLoader` | Image preloading with in-memory cache. |
| `FontLoader` | FontFace loading for custom web fonts. |
| `AudioLoader` | Audio asset loader with in-memory cache. |
| `AudioManager` | Sound registry with `add(key, asset)` / `get(key)` / `remove(key)`. Manages `Sound` lifecycle. |
| `AudioScene` | Per-scene audio context with spatial audio support. |
| `AudioListener` | Positional audio listener (tracks camera position). |
| `AudioGroup` | Named group of audio instances with shared volume/pause/resume. |
| `AudioInstance` | Single playable audio instance with volume/loop/pitch/pan. |
| `AudioDefinition` | Audio asset descriptor with metadata. |
| `Pool` | Low-level object pool for allocation-free reuse. |
| `ActivePool` | Lifecycle-aware object pool. Tracks active/inactive objects, O(1) acquire/release via index-tagged objects. |

### Input System

| Import | Description |
|---|---|
| `InputSystem` | Orchestrates per-frame input: `snapshot()` → `backend.poll()` → notify consumers → `devices.update()` → `contextStack.evaluate()` → `events.clear()`. |
| `InputEvent` | Typed event with data payload and metadata. |
| `InputEventQueue` | Bounded FIFO queue with tier-aware prioritisation. |
| `EventType` | Enum: `KEY_DOWN`, `KEY_UP`, `POINTER_DOWN`, `POINTER_MOVE`, `POINTER_UP`, `WHEEL`, `COMPOSITION_*`, `GESTURE`. |
| `Device` | Base class for input devices. Each device `update(queue)` peeks at events read-only. |
| `DeviceRegistry` | Maps device types to instances. `get(ClassType)` / `getAll(ClassType)`. |
| `InputBackend` | Abstract backend. `start()` / `stop()` / `poll(queue)`. |
| `BrowserBackend` | DOM backend — binds `keydown`/`keyup`/`pointer*`/`wheel`/`composition*` on a target element. |
| `TestBackend` | Programmatic backend for injecting events in tests. |
| `KeyCode` | Enum of all physical key codes (e.g. `KEY_W`, `SPACE`, `ARROW_UP`). |
| `Modifier` | Bitmask flags: `SHIFT`, `CTRL`, `ALT`, `META`. |
| `Keyboard` | Device. Tracks `pressed`/`justPressed`/`justReleased`/`repeat` for every key. |
| `MouseButton` | Enum: `LEFT`, `MIDDLE`, `RIGHT`, `BACK`, `FORWARD`. |
| `Mouse` | Device. Tracks button states, position, and wheel delta. `resetWheel()` to clear. |
| `PointerType` | Enum: `MOUSE`, `TOUCH`, `PEN`. |
| `PointerManager` | Device. Tracks all active pointers with history storage. |
| `TouchSurface` | Device. Multi-touch contact tracking. |
| `Stylus` | Device. Pen-specific data (pressure, tilt, twist). |
| `TextInput` | Device. IME composition events and consumed character queue. |
| `GestureType` | Enum: `TAP`, `DOUBLE_TAP`, `LONG_PRESS`, `DRAG`, `SWIPE`, `PINCH`, `ROTATE`, `PAN`. |
| `GestureEvent` | Gesture event with type, position, velocity, motion deltas. |
| `GestureEngine` | Device. Reads from `PointerManager`, pushes `GESTURE` events. |
| `GestureRecognizer` | Base class. 8 built-in recognizers: `TapRecognizer`, `DoubleTapRecognizer`, `LongPressRecognizer`, `DragRecognizer`, `SwipeRecognizer`, `PinchRecognizer`, `RotateRecognizer`, `PanRecognizer`. |

### Input Actions

| Import | Description |
|---|---|
| `ActionKind` | Enum: `DIGITAL` (on/off), `VECTOR2` (analogue 2D). |
| `ActionState` | Per-action runtime state: `pressed`, `justPressed`, `justReleased`, `strength`, `vector`, `buffer(durationMs)` / `consumeBuffered()`. |
| `Binding` | Base class for all bindings. `evaluate(deviceRegistry)` returns strength `[0, 1]`. |
| `KeyBinding` | Evaluates true when a specific `KeyCode` is held. |
| `MouseButtonBinding` | Evaluates true when a specific `MouseButton` is held. |
| `WheelBinding` | Reads `Mouse.wheel` delta. |
| `ChordBinding` | Combines multiple bindings with optional modifers — all must be active. |
| `CompositeBinding` | Aggregates sub-bindings with per-direction vectors, normalised to unit circle. Ideal for WASD + Arrow stick emulation. |
| `GestureBinding` | Matches a `GestureType` (e.g. swipe, pinch). |
| `GamepadButtonBinding` | Gamepad button binding. |
| `GamepadAxisBinding` | Gamepad axis binding. |
| `ActionEvaluator` | Runs bindings through optional processors, picks the highest-strength result, and updates the corresponding `ActionState`. |
| `Processor` | Base class for post-processing binding strength/vector. |
| `DeadZoneProcessor` | Discards values below a threshold. |
| `ScaleProcessor` | Multiplies strength by a factor. |
| `InvertProcessor` | Negates strength or vector axis. |
| `SmoothProcessor` | Moving-average filter for analogue input. |
| `ActionMap` | Collection of named actions, each with a list of bindings and an `ActionState`. `bind(name, binding, kind)` / `getState(name)` / `serialize()` / `static deserialize(data)`. |
| `InputContext` | Named container for an `ActionMap` with `priority` and `consumePolicy` ("block"/"pass"). |
| `ContextStack` | Ordered stack of `InputContext`s. Higher-priority contexts shadow lower ones. `evaluate(deviceRegistry)` runs all contexts in priority order. |
| `Space` | Enum: `SCREEN`, `VIEWPORT`, `WORLD`, `UI`. |
| `CoordinateSystem` | Manages transformations between all four spaces. Supports `project`/`unproject` and `worldToScreen`/`screenToWorld` camera interfaces. |

### Debug & Diagnostics

| Import | Description |
|---|---|
| `Diagnostics` | Frame-level metric aggregation with timers, counters, and gauges. Built-in budget/warn/crit thresholds. |
| `DiagnosticsConfig` | Configuration for diagnostics (metric registration, capture limits). |
| `MetricRegistry` | Global registry of typed metrics. |
| `MetricDescriptor` | Descriptor for a single metric (name, category, unit, type, budget). |
| `MetricType` | Enum: `TIMER`, `GAUGE`, `COUNTER`. |
| `MetricUnit` | Enum: `MILLISECONDS`, `FPS`, `COUNT`, `BYTES`, `PERCENT`. |
| `MetricCategory` | Enum: `FRAME`, `ECS`, `RENDER`, `INPUT`, `PHYSICS`, `AUDIO`, `ASSETS`, `STREAMING`, `SCENE`. |
| `CPUTimer` | High-resolution CPU timer backed by `performance.now()`. |
| `FrameStorage` | Circular buffer of frame snapshots. |
| `FrameSnapshot` | Snapshot of all metric values at a given frame. |
| `FrameHistory` | Rolling window of frame data for trend analysis. |
| `TriggerEngine` | Fires callbacks when metrics cross configurable thresholds. |
| `Analysis` | Frame analysis utilities (min, max, avg, percentile over a window). |
| `CaptureResult` | Snapshot of captured metric data. |
| `resolveMetricIds` | Resolves metric name strings to numeric IDs for fast frame-loop scoping. |
| `DebugOverlay` | HUD overlay with `addInputConsumer`-based key bindings (F1 toggles, F2 profiles, etc.). Access via `game.debug`. |
| `OverlaySession` | Full debug session manager — panels, themes, layout, persistence. |
| `OverlayContext` | Debug overlay rendering context. |
| `PanelManager` | Manages debug panel lifecycle. |
| `LayoutEngine` | Panel layout with `createDefaultLayout()`. |
| `DarkTheme`, `LightTheme` | Built-in overlay themes. |
| `PerformancePanel` | Real-time FPS, frame timings, budget bars. |
| `FrameGraphPanel` | Visual frame-by-frame breakdown (input/update/render). |
| `TimelinePanel` | System-level timeline view. |
| `MetricBrowserPanel` | Browse/search all registered metrics. |
| `EventViewerPanel` | Entity-component event log. |
| `CaptureBrowserPanel` | Browse saved metric captures. |
| `SettingsPanel` | Overlay configuration panel. |

### Audio Effects

| Import | Description |
|---|---|
| `AudioBackend` | Abstract backend interface for audio playback. |
| `HtmlAudioBackend` | HTMLAudioElement-based backend. |
| `WebAudioBackend` | Web Audio API backend with spatial audio support. |
| `AudioEffect` | Base class for audio effects. |
| `EffectChain` | Chain of audio effects with connect/disconnect. |
| `LowPassEffect` | Low-pass filter effect. |
| `HighPassEffect` | High-pass filter effect. |
| `BandPassEffect` | Band-pass filter effect. |
| `DelayEffect` | Delay/echo effect. |
| `CompressorEffect` | Dynamic range compression. |
| `DistortionEffect` | Wave-shaping distortion. |
| `ReverbEffect` | Convolution reverb with IR support. |

### Particle System

| Import | Description |
|---|---|
| `ParticleSystem` | SoA particle system with ActivePool-backed lifecycle, modifier pipeline, O(n) update/render, and full statistics. |
| `Particle` | Lightweight data container for particle effects. Fields: `x`, `y`, `vx`, `vy`, `ax`, `ay`, `life`, `maxLife`, `size`, `rotation`, `alpha`, `color`. |
| `ParticleEmitter` | Automated spawner on top of `ParticleSystem`. Frame-rate independent accumulator. `start()`, `stop()`, `burst()`, `toggle()`. |
| `ParticleLayer` | Rendering layer for particle effects (supports multiple layers). |
| `ParticleLayerManager` | Manages multiple `ParticleLayer` instances. |
| `ParticleAsset` | Serializable particle effect definition. |
| `ParticleEffect` | Runtime particle effect instance from a `ParticleAsset`. |
| `ParticleAssetRegistry` | Global registry of named `ParticleAsset` definitions. |

### Particle Modifiers

| Import | Description |
|---|---|
| `FadeModifier` | Fades alpha over lifetime (`"out"`, `"in"`, `"in-out"`). |
| `ScaleModifier` | Interpolates size from `from` to `to`. |
| `VelocityModifier` | Exponential velocity damping with per-axis control. |
| `ColorModifier` | Color transition (two-stop or multi-stop gradient). |
| `RotationModifier` | Rotation speed control. |
| `AnimationModifier` | Per-particle animation state. |
| `AnimatedSpriteModifier` | Sprite-sheet animation (`once`, `loop`, `pingpong`, `random`). |
| `WindModifier` | Constant wind force. |
| `TurbulenceModifier` | Perlin-noise-based turbulence. |
| `ForceModifier` | Constant force (e.g., gravity). |
| `AttractionModifier` | Attraction/repulsion toward a point. |
| `OrbitModifier` | Orbital motion around a point. |
| `SpawnModifier` | Spawns child particles. |
| `TrailModifier` | Particle trail effect. |
| `CollisionModifier` | Particle-world collision. |
| `KeyframeTrack` | Keyframe-based interpolation for custom modifier values. |
| `ModifierStack` | Ordered collection of modifiers with priority sorting. |
| `ModifierRegistry` | Global registry of named modifier types. |

### Emitter Shapes

| Import | Description |
|---|---|
| `EmitterShape` | Abstract base for emitter shapes. |
| `RectangleShape` | Rectangular spawn area. |
| `CircleShape` | Circular spawn area. |
| `RingShape` | Annular spawn area. |
| `LineShape` | Linear spawn area. |
| `ConeShape` | Conical spawn area. |
| `PolygonShape` | Arbitrary convex polygon spawn area. |
| `PathShape` | Bezier/cubic path spawn distribution. |
| `SplineShape` | Catmull-Rom spline path spawn distribution. |
| `ShapeRegistry` | Global registry of named emitter shapes. |

## Architecture

See [`docs/architecture.md`](docs/architecture.md) for the full design.

**Quick summary:** Archetype-based Entity-Component-System architecture.

### World

A `World` owns all entities, components, systems, and resources. Systems
are registered with a priority and run in order via `world.update(dt)`.

```
World
├── EntityManager       (create/destroy entities)
├── ComponentRegistry   (component schema IDs)
├── QueryEngine         (archetype-indexed queries)
├── SystemScheduler     (priority-ordered system execution)
└── Resources           (singletons: SpatialHash, events, prefabs, etc.)
```

### Archetype Storage

Components are stored column-wise (SoA) in `Table` instances. Each unique
combination of components forms an archetype with its own table.

```
Archetype Table "Transform + Renderable + Visible"
├── Transform.x:    Float64Array[1000]
├── Transform.y:    Float64Array[1000]
├── Transform.rotation: Float64Array[1000]
├── Transform.scale: Float64Array[1000]
├── Renderable.image:     (per-row references)
├── Renderable.style:     (per-row references)
└── Visible.visible: Uint8Array[1000]
```

Adding/removing a component moves the entity to a different archetype
table. Queries match archetypes by bitmask signature in O(1).

### Systems

Systems extend `System` or `ArchetypeSystem` and declare their component
dependencies via the base class. The scheduler runs them in priority order:

| Priority | System | Description |
|---|---|---|
| -10 | `HierarchySystem` | Propagate parent transforms to children (BFS from dirty roots) |
| 0 | `MovementSystem` | Apply `Velocity` → `Transform` |
| 0 | `AnimationSystem` | Advance animation frames |
| 0 | `TrailSystem` | Update trail point history |
| 10 | `CollisionSystem` | Run broad-phase collision queries |
| 100 | `RenderSystem` | Cull and render visible entities |

Systems access entities through `QueryView` iterables:

```js
class GravitySystem extends System {
  run(ctx, dt) {
    const view = ctx.queries.get(Transform, Velocity);
    for (const entity of view) {
      entity.velocity.y += 9.8 * dt;
    }
  }
}
```

### Scene

Each `Scene` owns one `World`. The engine `Scene` (core/Scene) extends the
ECS `Scene` (ecs/scene/Scene) and adds DOM integration, input helpers,
stack navigation, and camera setup.

`DefaultWorldBuilder.createDefault()` creates a World pre-configured with
all engine components (Transform, Velocity, Collider, Renderable, etc.),
systems (Movement, Animation, Collision, Render, Trail, Hierarchy), and
resources (SpatialHash, RenderQueue, AnimationClipRegistry, etc.).

### Sprite and Group

`Sprite` is a convenience wrapper that creates an ECS entity with
Transform, Collider, Velocity, Renderable, and Visible components.
Exposes `x`, `y`, `width`, `height`, `velocity`, `style`, `image` shorthands.

`Group` is a pure entity container (iterable). Collision queries delegate
to `CollisionSystem`. Optional `SpatialHash` acceleration.

### Input Actions

Actions decouple gameplay logic from physical keys via an `ActionMap` + `ContextStack` pipeline.
Bindings are evaluated against the `DeviceRegistry` each frame, processed through optional
`Processor` chains, and written to `ActionState` instances:

```js
import { ActionKind, CompositeBinding, KeyBinding, KeyCode } from "jygame";

const move = new CompositeBinding(ActionKind.VECTOR2, [
  { binding: new KeyBinding(KeyCode.KEY_D), vector: [ 1,  0] },
  { binding: new KeyBinding(KeyCode.KEY_A), vector: [-1,  0] },
  { binding: new KeyBinding(KeyCode.KEY_W), vector: [ 0, -1] },
  { binding: new KeyBinding(KeyCode.KEY_S), vector: [ 0,  1] },
]);
this._actionMap.bind("move", move, ActionKind.VECTOR2);

// Each frame:
const v = this._actionMap.getState("move").vector;
this.player.velocity.x = v.x * 200;
this.player.velocity.y = v.y * 200;
```

Resolution order: `Physical Key → Device → Binding → Processor → ActionState`.
`ContextStack` supports priority-based shadowing — a pause menu context at higher
priority can block gameplay bindings with `consumePolicy: "block"`.

Architecture reference: [`docs/audit/input-system-architecture.md`](docs/audit/input-system-architecture.md)
and beginner-friendly guide at [`docs/audit/input-system-guide.md`](docs/audit/input-system-guide.md).

## License

GNU General Public License v3.0
