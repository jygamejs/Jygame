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
  Game, Scene, World, Input, DefaultWorldBuilder,
  Transform, Velocity, Renderable, Visible,
  Sprite, Colors,
} from "jygame";

class MyScene extends Scene {
  enter() {
    // ECS world with all built-in systems registered
    this.world = DefaultWorldBuilder.createDefault();

    // Sprite is a convenience wrapper that creates an ECS entity
    this.player = new Sprite(100, 200, 32, 48);
    this.player.style.fill = Colors.GreenShades.MagicalMalachite;

    // Direct ECS access
    this.player.velocity.x = 0;
    this.player.velocity.y = 0;
  }

  update(dt) {
    // Input binds and queries
    Input.bind("JUMP", "SPACE");
    if (Input.justPressed("JUMP")) console.log("jump");

    if (Input.isDown("RIGHT")) this.player.velocity.x = 200;
    else if (Input.isDown("LEFT")) this.player.velocity.x = -200;
    else this.player.velocity.x = 0;

    if (Input.isDown("UP")) this.player.velocity.y = -200;
    else if (Input.isDown("DOWN")) this.player.velocity.y = 200;
    else this.player.velocity.y = 0;

    // Systems run automatically via world.update(dt)
  }

  render(ctx) {
    ctx.clearRect(0, 0, 800, 600);
    // RenderSystem draws all entities with Transform + Renderable + Visible
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
| `Scene` | Engine Scene (extends ECS Scene). Lifecycle hooks (`enter`, `exit`, `pause`, `resume`, `update`, `interpolate`, `render`, `renderUI`), blocking properties, stack delegators, and auto-cleaned event helpers (`on`, `onSwipe`, `onTap`, `cleanup`). |
| `DefaultWorldBuilder` | Creates a pre-configured `World` with all engine components, systems, and resources registered. |
| `Sprite` | Convenience entity wrapper with `Transform`, `Collider`, `Velocity`, `Renderable`, `Visible`. Exposes `x`, `y`, `width`, `height`, `angle`, `scale`, `velocity`, `image`, `style` shorthands. |
| `Group` | Entity container. Iterable (`for...of`). Collision queries delegate to `CollisionSystem`. Optional `SpatialHash` acceleration. `dispose()` for cleanup. |
| `Camera` | View abstraction — world position, zoom, rotation, coordinate conversion. `Camera.main` auto-set on first construction. `Camera.setMain()` for explicit assignment. |
| `Vec2` | 2D vector with add, sub, scale, dot, normalize, rotate, lerp. |
| `Rect` | AABB rectangle utility with collision, containment, overlap, and anchor helpers. |
| `Clock` | Fixed-timestep accumulator for deterministic updates. |
| `Timer` | Countdown timer with optional looping. |
| `Input` | Keyboard (`isDown`, `justPressed`, `justReleased`), action bindings (`bind`/`unbind`), and touch (swipe/tap) input handling. |
| `InputContext` | `Input` implementation — pluggable context for per-scene bindings. |
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

### Action Bindings

Actions decouple gameplay logic from physical keys:

```js
Input.bind("JUMP", "SPACE");
Input.bind("JUMP", "W");

// Later: key mapping resolves W → UP, bindings resolve UP → JUMP
if (Input.justPressed("JUMP")) {
  player.jump();
}
```

Resolution order: `Physical Key → Key Alias → Action`. `isDown`,
`justPressed`, and `justReleased` all follow this chain automatically.

## License

GNU General Public License v3.0
