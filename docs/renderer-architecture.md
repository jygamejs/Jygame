# Renderer Architecture Redesign

## Status

**Proposed**

---

# 1. Motivation

Jygame's rendering pipeline currently assumes a Canvas2D renderer.

Although the engine exposes concepts such as:

* World
* Camera
* View
* RenderQueue
* Renderable
* Sprite
* Trail
* ParticleEffect

they ultimately render by issuing Canvas2D drawing commands.

This makes rendering an implementation detail that has leaked into engine architecture.

As a consequence:

* GPU rendering cannot be integrated cleanly.
* Rendering code becomes coupled to Canvas APIs.
* New rendering backends require modifying engine systems.
* The renderer is not replaceable.

The goal of this redesign is to separate **what** the engine wants to render from **how** it is rendered.

---

# 2. Design Goals

The renderer architecture should satisfy the following principles.

## Backend Independence

The engine should never depend directly on:

* Canvas2D
* WebGL
* WebGPU

Instead, the engine communicates through a Renderer abstraction.

---

## Single Active Renderer

A Game owns exactly one renderer.

The renderer is selected during Game construction and remains active for the lifetime of the Game.

Rendering backends are never stacked.

They never render simultaneously.

They never compete for ownership of the frame.

---

## World Independence

The World should not know how rendering is implemented.

The World owns renderables.

The Renderer owns rendering.

---

## Renderable Independence

Sprites, Trails, Particles, Tilemaps and future renderables should never contain backend-specific code.

A Sprite should never know whether it is rendered through:

* Canvas2D
* WebGL
* WebGPU

---

## GPU-first Future

The architecture should allow future GPU renderers without requiring changes to:

* Sprite
* ParticleEffect
* Trail
* Tilemap
* Camera
* World

---

## Internal Abstraction

The renderer architecture is entirely internal.

Users do not write rendering commands.

Canvas2D remains available whenever users want immediate-mode drawing.

---

# 3. Current Problems

Today the pipeline is approximately:

```
Game

↓

Scene.render(ctx)

↓

World.render(ctx)

↓

RenderQueue.execute(ctx)

↓

ctx.drawImage(...)
```

Every retained object eventually depends on Canvas2D.

This creates a direct dependency:

```
Sprite
↓

Canvas
```

instead of

```
Sprite

↓

Renderer

↓

Canvas
```

---

# 4. Proposed Architecture

The renderer becomes a core engine subsystem.

```
Game
 │
 ▼
Renderer
 │
 ▼
World
 │
 ▼
Renderables
```

The renderer owns the entire rendering process.

The World simply owns renderables.

---

# 5. Renderer Responsibilities

The Renderer is responsible for:

* beginning a frame
* clearing the frame
* rendering the World
* sorting renderables
* batching draw calls
* camera transforms
* viewport handling
* backend-specific resources
* finishing the frame
* resizing
* resource destruction

Everything related to drawing belongs to the Renderer.

---

# 6. World Responsibilities

The World is responsible for:

* storing renderables
* registering renderables
* unregistering renderables
* exposing renderables to the Renderer

The World does not render itself.

The World does not know Canvas2D.

The World does not know WebGL.

The World does not know WebGPU.

---

# 7. Renderables

A renderable is anything that can appear inside the World.

Examples include:

* Sprite
* ParticleEffect
* Trail
* Tilemap
* Text
* future custom renderables

All renderables participate in the same rendering pipeline.

Every renderable exposes:

* visibility
* depth
* transform

The renderer decides how they are drawn.

---

# 8. Renderer Selection

A renderer is selected exactly once.

```
new Game({
    renderer: "auto"
})
```

The resolver performs:

```
WebGPU supported?

↓

Yes

↓

WebGpuRenderer

↓

No

↓

WebGL2 supported?

↓

Yes

↓

WebGLRenderer

↓

No

↓

CanvasRenderer
```

The renderer remains fixed for the lifetime of the Game.

---

# 9. Renderer Implementations

The renderer abstraction has multiple implementations.

```
Renderer

├── CanvasRenderer

├── WebGLRenderer

└── WebGpuRenderer
```

These implementations are siblings.

They do not inherit from one another.

They simply implement the same contract.

---

# 10. Immediate vs Retained Rendering

Jygame intentionally supports both rendering styles.

## Immediate Mode

Immediate rendering occurs inside:

```js
render(ctx)
```

The Scene receives a Canvas2D context.

Users may call any Canvas drawing APIs directly.

Examples:

```
fillRect

stroke

drawImage

arc

fillText
```

This API remains unchanged.

Immediate rendering is a convenience layer for custom drawing.

---

## Retained Mode

Retained rendering consists of objects registered into the World.

Examples:

```
Sprite

ParticleEffect

Trail
```

These objects are automatically rendered by the Renderer.

Users never call:

```
render()

update()
```

on retained objects.

---

The renderer executes:

```
Scene.render(ctx)

↓

Renderer.render(world)

↓

Scene.renderUI()
```

---

# 11. Separation of Concerns

The architecture separates responsibilities cleanly.

## Scene

Responsible for:

* immediate drawing
* gameplay code

---

## World

Responsible for:

* retained objects

---

## Renderer

Responsible for:

* drawing retained objects

---

## Renderables

Responsible for:

* describing their visual state

---

# 12. Backend Philosophy

Backends are implementation details.

Users normally write:

```js
new Game({
    renderer: "auto"
})
```

Advanced users may explicitly request:

```js
renderer: "canvas"
```

or

```js
renderer: "webgl"
```

or

```js
renderer: "webgpu"
```

The remainder of the engine behaves identically.

---

# 13. Future Compatibility

Because the engine communicates through the Renderer abstraction:

Adding a new backend should not require modifications to:

* Sprite
* Trail
* ParticleEffect
* Tilemap
* Camera
* Scene
* World

Only a new Renderer implementation should be required.

---

# 14. Non-Goals

This redesign intentionally does **not**:

* replace Canvas2D
* invent a new drawing API
* remove immediate rendering
* expose renderer internals
* expose GPU APIs

Canvas2D remains the immediate-mode drawing API.

The Renderer abstraction exists solely to organize the engine internally.

---

# 15. Final Design Decision

The Renderer becomes a first-class engine subsystem.

The engine no longer renders directly through Canvas2D.

Instead, it renders through a Renderer abstraction selected when the Game is created.

Canvas2D, WebGL and WebGPU become interchangeable backend implementations of the same renderer contract.

Users continue to use Canvas2D directly for immediate-mode drawing inside `Scene.render(ctx)`, while retained objects such as Sprites, ParticleEffects and Trails are rendered automatically by the active Renderer.

This architecture makes rendering backend-independent, simplifies future GPU integration, preserves Jygame's immediate-mode workflow, and establishes a stable foundation for all future rendering features.
