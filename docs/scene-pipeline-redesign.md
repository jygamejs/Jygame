# Scene Rendering Pipeline Redesign

## Status

**Accepted Design**

This document defines the rendering pipeline used by Jygame going forward. Its primary goals are:

* Remove hidden rendering behavior.
* Eliminate `super.render()` entirely.
* Support both immediate-mode and retained-mode rendering.
* Keep rendering order predictable.
* Make the engine responsible for rendering retained objects.
* Allow retained objects to coexist naturally with manual Canvas drawing.

---

# 1. Motivation

The previous rendering pipeline evolved around a hidden world render pass.

Internally it looked roughly like:

```text
renderBackground()

↓

_renderWorld()

↓

render()

↓

renderUI()
```

The separation existed because retained objects (Sprites, animations, etc.) were rendered automatically by the engine.

This created several problems.

## Hidden Layer

Users could not control where retained objects appeared because `_renderWorld()` was not part of the public API.

This often produced confusing situations:

```js
render(ctx) {
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, width, height);
}
```

A sprite started inside `onEnter()` would appear behind the background even though nothing in user code suggested that.

---

## `super.render()`

If a Scene wanted to draw both its own content and retained objects, it eventually led to the idea of:

```js
render(ctx) {
    super.render(ctx);

    // draw custom stuff
}
```

or

```js
render(ctx) {
    // draw custom stuff

    super.render(ctx);
}
```

The render order depended on where `super()` was called.

This leaks engine implementation details into user code.

A Scene should never become responsible for rendering the engine.

---

## Artificial Background Layer

To compensate, `renderBackground()` was introduced.

Instead of solving the architecture, it added another rendering stage.

Eventually the pipeline became:

```text
renderBackground()

↓

hidden world

↓

render()

↓

renderUI()
```

The API became more difficult to understand while still not solving the original problem.

---

# 2. Design Goals

The new pipeline follows several principles.

## Support Immediate Rendering

Users should always be free to write rendering code directly using the Canvas API.

```js
render(ctx) {
    ctx.fillRect(...);
    ctx.drawImage(...);
}
```

Nothing in the engine should force users into retained objects.

---

## Support Retained Rendering

Sprites, particles, tilemaps, trails and future renderables should render automatically.

Users should not manually render them every frame.

```js
sprite.animation.play("walk");

Particle.create(...).play();
```

No update or render calls should be required.

---

## No Hidden Responsibilities

A Scene should never render the World.

The Game owns the rendering pipeline.

---

## No `super.render()`

Rendering should never depend on inheritance.

---

## Predictable Ordering

Rendering order should always be obvious from the pipeline.

---

# 3. Final Rendering Pipeline

Every frame the engine performs exactly three rendering passes.

```text
Scene.render(ctx)

↓

World.render(ctx)

↓

Scene.renderUI(ctx)
```

The Game owns this pipeline.

Internally it behaves conceptually like:

```js
_renderFrame(ctx) {
    scene.render(ctx);

    world.render(ctx);

    scene.renderUI(ctx);
}
```

The Scene never invokes the World.

The World never invokes the Scene.

The Game orchestrates both.

---

# 4. Responsibilities

## Game

Responsible for:

* executing the rendering pipeline
* rendering retained objects
* sorting renderables
* camera rendering
* future render passes

The Game owns rendering.

---

## Scene

Responsible for immediate-mode rendering only.

```js
render(ctx) {
    ctx.fillRect(...);
}
```

A Scene contributes drawing commands.

It does not control the render pipeline.

---

## World

Responsible for retained rendering.

This includes:

* Sprites
* Particle Effects
* Tilemaps
* Trails
* Lights
* Future renderable objects

Users never call:

```js
world.render(ctx);
```

The engine handles it automatically.

---

## UI

Runs after retained rendering.

```js
renderUI(ctx) {
    ctx.fillText("Score", 20, 20);
}
```

UI always appears above the world.

---

# 5. Immediate vs Retained Rendering

Jygame intentionally supports both rendering styles.

Immediate rendering:

```js
render(ctx) {
    ctx.drawImage(...);
    ctx.strokeRect(...);
    ctx.fillText(...);
}
```

Retained rendering:

```js
sprite.animation.play("idle");

fire.play();
```

Both are first-class citizens.

Neither replaces the other.

---

# 6. Retained Objects

Retained objects register themselves with the World.

Examples include:

```text
Sprite
ParticleEffect
Tilemap
Trail
Light
```

Once created, the engine owns their rendering lifecycle.

Example:

```js
const player = new Sprite(...);

player.animation.play("walk");
```

The Sprite appears automatically during the World pass.

The user never writes:

```js
player.render(ctx);
```

Likewise:

```js
const fire = Particle.create(...);

fire.play();
```

No rendering calls are necessary.

---

# 7. Depth

Within the World pass, render order is determined by depth.

Every retained renderable exposes:

```js
renderable.depth
```

Example:

```js
grass.depth = -20;

shadow.depth = -10;

player.depth = 0;

smoke.depth = 5;

tree.depth = 10;
```

The renderer sorts renderables before drawing them.

This ordering applies universally.

Sprites, particles, tilemaps, trails and every future retained object behave consistently.

---

# 8. Why There Is No Public Layer System

Many engines expose both:

```text
Layer

↓

Depth
```

Jygame intentionally avoids exposing coarse render layers.

Instead, the engine owns the coarse rendering passes:

```text
Scene.render()

↓

World.render()

↓

Scene.renderUI()
```

Users only control ordering inside the retained world via:

```js
depth
```

This keeps the public API significantly smaller while remaining flexible.

If future engine features require additional internal render passes (lighting, post-processing, multiple cameras, etc.), they can be introduced without changing the public API.

---

# 9. No `super.render()`

Scenes never call:

```js
super.render(ctx);
```

This is a deliberate design decision.

Rendering is coordinated by the Game rather than inheritance.

A Scene simply draws what belongs in its immediate pass.

Example:

```js
class GameScene extends Scene {
    render(ctx) {
        ctx.fillStyle = "#222";
        ctx.fillRect(0, 0, width, height);
    }

    renderUI(ctx) {
        ctx.fillText("Health", 20, 20);
    }
}
```

No superclass rendering is required.

---

# 10. Philosophy

The rendering pipeline follows a simple ownership model.

```text
Game
│
├── Scene.render()
│
├── World.render()
│
└── Scene.renderUI()
```

Each component has one responsibility.

The Scene contributes immediate drawing.

The World renders retained objects.

The Game coordinates the pipeline.

This separation removes hidden behavior, eliminates inheritance-based rendering, and allows immediate-mode and retained-mode rendering to coexist naturally.

---

# 11. Final Design Decision

The rendering pipeline is defined as:

```text
Scene.render(ctx)

↓

World.render(ctx)

↓

Scene.renderUI(ctx)
```

Where:

* **Game** owns the render pipeline.
* **Scene** performs immediate world-space rendering.
* **World** automatically renders retained objects.
* **Scene.renderUI()** renders interface elements above the world.
* **Depth** determines ordering between retained renderables.
* **Layers are engine implementation details, not public API.**
* **Scenes never call `super.render()`.**

This design preserves the flexibility of immediate-mode rendering while providing the convenience and performance of retained rendering, without forcing users into a single programming style.
