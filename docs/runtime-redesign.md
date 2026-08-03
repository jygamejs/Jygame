# Jygame Runtime Bootstrap Redesign

Specification for replacing module-based engine usage with a runtime bootstrap API centered around `jy()`.

This document defines the long-term direction for how developers initialize and interact with Jygame. It establishes Jygame as a runtime rather than a collection of independent JavaScript modules.

---

# 1. Motivation

Today, a typical Jygame project begins by importing numerous engine modules.

```js
import {
    Game,
    Scene,
    Sprite,
    Image,
    Input,
    Audio,
    Particle,
} from "jygame";

const game = new Game({
    width: 1280,
    height: 720,
});

game.run(new MainScene());
```

Although explicit imports are standard in JavaScript, they introduce unnecessary friction when writing games.

Developers repeatedly answer questions that are unrelated to gameplay:

* Which classes do I need to import?
* Did I forget one?
* Which package owns this feature?
* Should Camera be imported?
* Should Particle modifiers be imported separately?

Examples become filled with import boilerplate before any game logic appears.

Documentation grows because every page begins with a different collection of imports instead of immediately explaining the feature being demonstrated.

As the engine continues to grow, this problem only becomes worse.

---

# 2. Design Philosophy

Jygame is not intended to be a collection of unrelated utility modules.

It is the runtime in which the game executes.

Once the runtime has been initialized, developers should focus entirely on describing game behavior.

The engine should already exist.

The engine should already be configured.

The engine should already know how to:

* render
* simulate
* process input
* update animations
* update particles
* manage audio
* manage scenes

The developer should describe a game.

They should not assemble an engine.

This philosophy already exists throughout Jygame.

Particle effects automatically manage themselves.

Sprites automatically render themselves.

Animations automatically update themselves.

Audio automatically manages playback.

The runtime bootstrap simply extends this philosophy to engine initialization itself.

---

# 3. Runtime Bootstrap

The new primary entry point becomes:

```js
import jy from "jygame";

jy({
    width: 1280,
    height: 720,
});
```

Calling `jy()` initializes the complete engine runtime.

Unlike constructing a `Game` directly, the runtime is responsible for preparing the entire execution environment before the first scene is started.

After initialization, the engine is ready to use immediately.

Running the game becomes:

```js
jy.run(new MainScene());
```

instead of:

```js
const game = new Game(...);

game.run(new MainScene());
```

---

# 4. Runtime Responsibilities

The bootstrap process owns engine initialization.

Calling:

```js
jy(options);
```

performs responsibilities such as:

* creating the Game instance
* creating the renderer
* initializing the rendering pipeline
* initializing the input system
* initializing audio
* initializing particle systems
* initializing physics
* initializing the asset pipeline
* preparing scene management
* exposing the public engine API

Developers should never manually initialize these systems during normal engine usage.

---

# 5. Global Runtime API

After bootstrap, every public Jygame API becomes immediately available.

This is an intentional design decision.

The runtime exposes the complete engine environment.

The rule is extremely simple:

> After calling `jy()`, every public Jygame API is available.

There are no "special" APIs.

There are no "core" APIs.

There are no "beginner" APIs.

Everything follows the same rule.

---

## Scenes

```js
Scene
```

---

## Rendering

```js
Sprite
AnimatedSprite
Text
Tilemap
Trail
Camera
```

---

## Assets

```js
Image
Audio
Font
```

---

## Input

```js
Input
Keyboard
Mouse
Touch
Gamepad
```

---

## Particles

```js
Particle

CircleShape
RingShape
RectangleShape
ConeShape
LineShape
PathShape
PolygonShape
SplineShape

FadeModifier
ScaleModifier
ColorModifier
VelocityModifier
WindModifier
CollisionModifier
TrailModifier
...
```

---

## Physics

```js
Physics
RigidBody
Collider
```

---

## Mathematics

```js
Vector2
Vector3
Rectangle
Circle
Polygon
Color
Random
```

---

## Utilities

```js
Tween
Timer
Noise
```

The exact API surface may continue to grow, but the rule remains unchanged.

If something is part of Jygame's public API, it becomes available after bootstrap.

---

# 6. Example

A complete game should look like this:

```js
import jy from "jygame";

jy({
    width: 1280,
    height: 720,
    imageSmoothing: false,
});

class MainScene extends Scene {

    input = {
        jump: "SPACE",

        move: {
            up: "W",
            down: "S",
            left: "A",
            right: "D",
        },
    };

    async onEnter() {

        this.player = new Sprite(400, 300);

        this.fire = Particle.create({

            rate: 80,

            shape: new ConeShape({

                radius: 5,
                angle: Math.PI / 4,
                direction: -Math.PI / 4,
                speed: 250,

            }),

            modifiers: [

                new FadeModifier({
                    mode: "out",
                }),

                new ScaleModifier({
                    from: 5,
                    to: 0,
                }),

            ],

            lifetime: [2.5, 4.5],
        });
    }

    update() {

        if (Input.pressed("jump")) {

            Audio.play("jump");
        }
    }
}

jy.run(new MainScene());
```

Notice what is missing.

There are no named imports.

There is no manual engine construction.

There is no engine configuration beyond bootstrapping.

The game code immediately begins describing gameplay.

---

# 7. Why Everything Is Global

The runtime intentionally exposes the complete API rather than a curated subset.

A partially-global API quickly becomes inconsistent.

For example:

```js
Input
```

being global while:

```js
Particle
```

still requires imports immediately raises questions.

Why is one global but not the other?

Where is the rule?

Instead, the runtime adopts a single consistent principle.

Everything exported by Jygame becomes available after initialization.

Developers no longer need to remember which systems are global and which are not.

The answer is always the same.

Everything is.

---

# 8. Why This Is Appropriate

Global APIs are often discouraged in general-purpose JavaScript libraries.

Jygame is fundamentally different.

A game engine is not one library among many.

It is the environment in which the game executes.

Developers are already relying on:

* one renderer
* one input system
* one asset pipeline
* one audio manager
* one scene manager

The runtime simply exposes that environment directly.

Instead of assembling engine modules, developers write game logic.

---

# 9. Relationship with the Existing API

The traditional API remains available.

```js
const game = new Game(...);
```

continues to function.

This API is intended for advanced users who require explicit engine construction, embedding scenarios, or custom initialization flows.

However, it is no longer considered the primary way to begin a Jygame project.

The recommended entry point becomes:

```js
import jy from "jygame";

jy(...);
```

---

# 10. Future Runtime Isolation

Although the default runtime exposes globals, the architecture should not permanently depend on them.

Future runtime variants may support isolated environments.

For example:

```js
const runtime = jy({

    globals: false,
});
```

or:

```js
const runtime = jy.createRuntime();
```

allowing editors, testing environments, multiple runtime instances, or embedded games.

This capability does not change the default programming model.

It simply ensures the architecture remains flexible.

---

# 11. Documentation Benefits

The bootstrap redesign dramatically simplifies documentation.

Current examples often begin with large import blocks.

```js
import {
    Sprite,
    Particle,
    ConeShape,
    FadeModifier,
    ScaleModifier,
} from "jygame";
```

After bootstrap, examples focus entirely on the feature being taught.

```js
Particle.create({

    shape: new ConeShape(...),

    modifiers: [

        new FadeModifier(...),

        new ScaleModifier(...),

    ],
});
```

Every documentation page becomes shorter, easier to read, and easier to maintain.

Developers immediately see the API they are learning rather than unrelated import statements.

---

# 12. Relationship to Other Runtime Systems

This redesign is not an isolated API change.

It aligns with the broader architectural direction of Jygame.

Rendering owns retained objects.

Particles own their own lifecycle.

Animations update automatically.

Audio manages playback automatically.

Input maintains global action state.

The runtime bootstrap extends this same philosophy to engine initialization.

The runtime owns the engine.

Developers own the game.

---

# 13. Responsibilities

## Runtime

Responsible for:

* creating the engine
* initializing subsystems
* exposing the public API
* managing the renderer
* managing scenes
* managing runtime state

## Engine Systems

Responsible for:

* rendering
* simulation
* animation
* particles
* input
* physics
* audio

## Developers

Responsible for:

* creating scenes
* describing gameplay
* responding to player input
* building game content

The runtime exists to eliminate engine setup from everyday game development.

---

# 14. Final Design Decision

Jygame adopts a runtime-first architecture.

The engine is initialized once through:

```js
import jy from "jygame";

jy(options);
```

After initialization, every public Jygame API becomes immediately available without additional imports.

Developers no longer construct the engine piece by piece.

Instead, they describe gameplay inside an already-running runtime.

This approach reduces boilerplate, simplifies documentation, produces cleaner examples, lowers the barrier for new users, and remains consistent with Jygame's broader philosophy of hiding infrastructure while exposing meaningful game concepts.

The runtime becomes the execution environment for the game rather than another object that must be manually assembled before development can begin.
