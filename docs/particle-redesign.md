# Particle API Redesign

Specification for a public `Particle` facade. The facade exists to hide
engine infrastructure, not particle concepts.

> This document is the design target. `Particle.create()` is implemented in
> `particles/facade.js` (wired up via `display/Particle.js`) and returns a
> `ParticleEffect`. The lower-level building blocks (`ParticleSystem`,
> `ParticleEmitter`, `ParticleAsset`, backends, storage, renderers) remain
> available. See `docs/audit/particles-api.md` for the current public API as it
> exists today.

---

## 1. Design Goals

The public particle API should satisfy the following principles:

* Zero knowledge of storage, backends, capacities, renderers, or emission internals.
* GPU-first with automatic CPU fallback.
* No manual update or render calls.
* No facade-specific modifier or shape options.
* Existing shapes and modifiers remain the source of truth.
* Custom modifiers and shapes automatically work with the facade.
* Particle effects behave similarly to `Audio` and `Sprite` APIs.

The API should answer a single question:

> What visual effect are you trying to create?

Game developers think about particle effects in terms of:

```text
Shapes
Modifiers
Lifetime
Spawn rate
```

They do not think about:

```text
Storage implementations
Capacity formulas
Backends
Renderers
Simulation pipelines
```

---

## 2. The Facade

The facade exposes the concepts that are meaningful when designing effects
while hiding all engine-specific infrastructure.

### Final Public API

```js
Particle.create({
    rate: 80,

    shape: new ConeShape({
        radius: 5,
        angle: Math.PI / 4,
        direction: -Math.PI / 4,
        speed: 250,
    }),

    modifiers: [
        new VelocityModifier({ drag: 1.5 }),
        new FadeModifier({ mode: "out", easing: "quadOut" }),
        new ScaleModifier({ from: 5, to: 0 }),
        new ColorModifier({ from: "#ffaa00", to: "#ff0044" }),
    ],

    lifetime: [2.5, 4.5],
});
```

No capacity is required. No backend is required. No renderer is required.
No `ParticleEmitter` or `ParticleSystem` needs to be constructed manually.

---

## 3. What Is Exposed

The following concepts are part of the public particle language and should
remain first-class citizens.

### Particle Facade

```js
Particle.create()
```

### Shapes

```js
CircleShape
RingShape
RectangleShape
ConeShape
LineShape
PathShape
PolygonShape
SplineShape
```

Users instantiate shape classes directly:

```js
shape: new CircleShape({ ... })
```

### Modifiers

```js
FadeModifier
ScaleModifier
ColorModifier
VelocityModifier
WindModifier
TurbulenceModifier
ForceModifier
AttractionModifier
OrbitModifier
AnimationModifier
SpawnModifier
TrailModifier
CollisionModifier
AnimatedSpriteModifier
```

Users instantiate modifier classes directly:

```js
modifiers: [
    new FadeModifier(...),
    new ScaleModifier(...),
]
```

### Particle Properties

```js
rate
lifetime
shape
modifiers
```

These are meaningful properties when designing visual effects and therefore
belong in the facade.

---

## 4. What Is Hidden

The following concepts are implementation details and must not be required
by the facade.

### Infrastructure

```js
ParticleSystem
ParticleEmitter
ParticleEffect
ParticleAsset
ParticleAssetRegistry
ParticleLayerManager
```

### Backend Details

```js
GpuParticleBackend
CpuParticleBackend
ParticleBackend
```

### Storage Details

```js
SoAParticleStorage
ObjectParticleStorage
ParticleStorage
```

### Rendering Details

```js
ParticleRenderer
CanvasParticleRenderer
GpuParticleRenderer
```

### Optimization Details

```js
capacity
backend
renderer
storage
```

The engine is responsible for selecting the optimal implementation.

---

## 5. Automatic Behavior

### 5.1 Automatic Backend Selection

The facade automatically selects the most optimized backend available.

```text
WebGPU available?
        |
       YES
        |
        v
GPU Backend

        |

       NO
        |
        v

CPU Backend
```

Particle effects always attempt to use the fastest available implementation.
The default path should always attempt to maximize performance. The user
should never manually choose between GPU and CPU rendering unless they
intentionally use the advanced APIs.

### 5.2 Automatic Capacity Calculation

The facade estimates an appropriate particle capacity. Users should not be
required to answer questions such as:

* How many particles will exist simultaneously?
* What storage size should I allocate?
* What formula should I use?
* Should I allocate 512, 1000, or 5000 particles?

The engine has access to `rate` and `lifetime`, which are sufficient to
estimate the equilibrium particle count:

```js
rate: 120
lifetime: [2, 4]
```

```text
Average lifetime:            3 seconds
Estimated alive particles:   120 * 3 = 360
```

The engine may then:

* apply a safety margin
* round to a preferred capacity
* dynamically grow storage if necessary

The general formula:

```text
rate × maximumLifetime × safetyMultiplier
```

Example:

```js
Particle.create({ rate: 80, lifetime: [2.5, 4.5] });
```

```text
80 * 4.5 * safetyMultiplier
```

The engine chooses the nearest optimal capacity. Capacity management is
entirely automatic. Users may override it manually when desired:

```js
Particle.create({ rate: 80, lifetime: [2.5, 4.5], capacity: 1000 });
```

The automatic mode is the default behavior.

### 5.3 Automatic Update and Rendering

Particles are engine-managed objects. The following API is intentionally
avoided:

```js
particle.update(dt);
particle.render(ctx);
```

The particle system should behave similarly to:

```js
Audio.play()
```

or

```js
sprite.animation.play()
```

The user is not responsible for:

```text
updating emitters
updating particle systems
rendering particles
cleaning up dead particles
```

The engine owns the particle lifecycle. Internally, the game loop handles:

```text
Update
|
+-- update emitters
|
+-- update particle systems
|
+-- apply modifiers
|
+-- render particles
|
+-- cleanup dead particles
```

The entire simulation pipeline is invisible to the user. The facade
registers the effect into the Scene/Game so it is updated and rendered every
frame automatically, and destroyed when necessary.

---

## 6. Effect API Reference

### Creating Effects

```js
const fire = Particle.create({
    rate: 80,
    shape: new ConeShape({
        radius: 5,
        angle: Math.PI / 4,
        direction: -Math.PI / 4,
        speed: 250,
    }),
    modifiers: [
        new VelocityModifier({ drag: 1.5 }),
        new FadeModifier({ mode: "out", easing: "quadOut" }),
        new ScaleModifier({ from: 5, to: 0 }),
        new ColorModifier({ from: "#ffaa00", to: "#ff0044" }),
    ],
    lifetime: [2.5, 4.5],
});
```

### Particle Lifetime

Single value:

```js
lifetime: 2
```

Random range:

```js
lifetime: [1.5, 3]
```

Internally this maps to:

```js
particle.life
particle.maxLife
```

No initializer is required for common use cases. If an initializer is
provided, it runs after the lifetime initialization:

```js
initializer(particle) { }
```

### Playing Effects

Effects never start automatically. A particle effect needs a position to
emit from and a reason to emit, so creation only sets it up:

```js
const smoke = Particle.create({ ... });
```

The effect is ready but not emitting. Start it explicitly:

```js
effect.play();
```

Or emit on demand without ever calling `play()`:

```js
effect.emit(50);   // spawn 50 particles right now
effect.burst(50);  // alias
```

This covers the two common cases: an effect attached to a target
(`follow`) that plays for as long as it is active, and one-shot effects
fired at a position or on an event (click, explosion, pickup).

Position and follow targets can be supplied at creation time:

```js
Particle.create({ position: { x: 320, y: 240 }, ... });
Particle.create({ position: [320, 240], ... });
Particle.create({ follow: player, ... });
Particle.create({ follow: { target: player, getter: p => p.weapon.position }, ... });
```

And still mutated afterward via `effect.position.x`, `effect.position.y`,
`effect.position.set(x, y)`, or `effect.move(dx, dy)`.

### Stopping Effects

```js
effect.stop();
```

Stops future emission. Existing particles continue their lifetime normally.

### Pause & Resume

```js
effect.pause();
effect.resume();
```

Pausing affects:

* emission
* modifier updates
* particle simulation

Rendering continues.

### Restart

```js
effect.restart();
```

Equivalent to:

```js
effect.stop();
effect.clear();
effect.play();
```

### Burst Emission

Spawn particles immediately:

```js
effect.emit(50);
```

or:

```js
effect.burst(50);
```

Example:

```js
const explosion = Particle.create({ ... });
explosion.burst(120);
```

### Position

Effects expose their world position directly:

```js
effect.position.x
effect.position.y
```

or:

```js
effect.position.set(x, y);
```

Example:

```js
fire.position.set(400, 250);
```

### Movement Helpers

```js
effect.move(dx, dy);
```

Example:

```js
effect.move(5, 0);
```

### Rotation

For shapes that support rotation:

```js
effect.rotation
```

Example:

```js
effect.rotation += dt;
```

The engine forwards this value to the underlying shape whenever applicable.
This removes private access patterns such as:

```js
emitter._shape._coneDirection
```

which should never exist in the public API.

### Following Objects

Attach a particle effect to anything:

```js
effect.follow(target);
```

Example:

```js
effect.follow(player);
```

Custom getter:

```js
effect.follow(player, p => p.weapon.position);
```

Detach:

```js
effect.unfollow();
```

Check state:

```js
effect.following;
```

The engine updates the particle effect position automatically every frame.

### Visibility

```js
effect.visible
```

Example:

```js
effect.visible = false;
```

Invisible effects:

* are not rendered
* continue simulation normally

### Enabled State

```js
effect.enabled
```

Example:

```js
effect.enabled = false;
```

Disabled effects:

* do not update
* do not emit
* do not render

### Layering

Effects may optionally specify a render layer:

```js
Particle.create({ layer: "foreground", ... });
```

Examples:

```js
layer: "background"
layer: "particles"
layer: "ui"
```

The engine manages ordering internally.

### Destruction

Destroy the entire particle effect:

```js
effect.destroy();
```

This releases:

* particle system
* emitter
* storage
* modifiers
* renderer
* backend resources

### Clearing Existing Particles

```js
effect.clear();
```

Stops all currently alive particles immediately.

### Completion Callback

Useful for explosions and temporary effects:

```js
effect.onFinish(callback);
```

Example:

```js
effect.onFinish(() => {
    console.log("finished");
});
```

The callback executes once when:

* emission has stopped
* all particles are dead

---

## 7. Extensibility

One of the primary goals of this redesign is future-proofing. The facade
intentionally does not attempt to abstract Shapes or Modifiers.

Bad approach:

```js
fadeOut: true
scale: [5, 0]
color: [...]
drag: 1.5
```

This design creates a second particle language that must be maintained
indefinitely. Every new modifier would require a new facade option:

```js
orbitRadius
trailLength
spawnOnDeath
collisionLayer
windStrength
...
```

The facade would continuously grow in complexity.

Instead:

```js
new FadeModifier(...)
new ScaleModifier(...)
new ColorModifier(...)
```

allows the modifier ecosystem to evolve independently of the facade. The
same applies to Shapes.

### Third-Party Shapes and Modifiers

This design naturally supports custom extensions:

```js
Particle.create({
    shape: new LightningShape(...),
    modifiers: [
        new NoiseModifier(...),
    ],
});
```

The facade requires no modifications whatsoever. As long as a class
implements the appropriate Shape or Modifier contract, it is automatically
compatible with the facade:

```js
Particle.create({ shape: new MyCustomShape() });
Particle.create({ modifiers: [new MyModifier()] });
```

The facade does not need to know anything about shape or modifier
implementations. This allows the particle API to scale indefinitely without
adding new facade methods or options.

---

## 8. Advanced Overrides

Normal users should never need these:

```js
Particle.create({
    capacity: 2000,
    backend: "gpu",
    renderer: renderer,
    storage: storage,
    initializer(particle) { },
});
```

Backend override values:

```js
backend: "cpu"
```

or:

```js
backend: "gpu"
```

These options exist solely for advanced use cases.

---

## 9. Responsibilities

### Particle Facade

Responsible for:

* Creating particle systems
* Creating emitters
* Selecting the optimal backend
* Calculating particle capacity
* Selecting storage implementations
* Registering itself with the engine
* Updating automatically
* Rendering automatically
* Cleaning itself up
* Managing the particle lifecycle

### Shapes

Responsible for:

* Spawn positions
* Initial velocities
* Directional behavior

### Modifiers

Responsible for:

* Particle behavior over time
* Animation
* Physics
* Collision
* Visual transitions
* Particle spawning behavior

### Users

Responsible for:

* Describing the desired particle effect

---

## 10. Documentation Benefits

The redesigned API significantly improves documentation:

```js
Particle.create(...)
```

Each shape becomes its own documentation page:

```js
ConeShape
CircleShape
RectangleShape
```

Each modifier becomes its own documentation page:

```js
FadeModifier
ScaleModifier
TrailModifier
CollisionModifier
```

The Particle facade remains extremely small and stable while the ecosystem
grows independently.

---

## 11. Final Public API

### Static API

```js
Particle.create(options)
```

### Instance API

```js
effect.play()
effect.stop()
effect.pause()
effect.resume()
effect.restart()
effect.emit(count)
effect.burst(count)
effect.clear()
effect.destroy()
effect.follow(target, getter?)
effect.unfollow()
effect.move(dx, dy)
effect.onFinish(callback)
```

### Properties

```js
effect.position
effect.rotation
effect.visible
effect.enabled
effect.following
```

### Creation Options

```js
{
    rate,
    shape,
    modifiers,
    lifetime,

    position,
    follow,

    initializer,

    capacity,
    backend,
    renderer,
    storage,
    renderParticle,
}
```

There is intentionally no `autoplay` option: an effect needs a position or a
trigger before it makes sense to emit, so creation never starts it. Begin
emission with `effect.play()`, `effect.emit(count)`, or `effect.burst(count)`
(see "Playing Effects").

---

## 12. Final Design Decision

The Particle facade hides infrastructure, not abstractions.

Shapes and Modifiers are already excellent abstractions that directly model
how game developers think about particle effects. They remain fully exposed
and composable.

Everything related to storage, rendering, capacity, backend selection, and
simulation management is handled automatically by the engine.

The finalized public particle API is therefore centered around a single
entry point:

```js
Particle.create({
    rate,
    shape,
    modifiers,
    lifetime,
});
```

The particle facade exists solely to remove boilerplate and make the optimal
path the default path, while exposing the full power of the underlying
particle engine whenever users need it.

This API is scalable, extensible, easy to document, future-proof, and
consistent with the rest of Jygame's philosophy.
