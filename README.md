# jygame

A lightweight 2D game framework for the browser.

```js
import { Game, Scene, Sprite, Input } from "jygame";

class MyScene extends Scene {
  constructor() {
    super();
    this.player = new Sprite(100, 100, 32, 32);
    this.player.style.fill = "#ff6600";
  }

  update(dt) {
    this.player.velocity.x = 0;
    this.player.velocity.y = 0;
    if (Input.isDown("RIGHT")) this.player.velocity.x = 200;
    if (Input.isDown("LEFT")) this.player.velocity.x = -200;
    if (Input.isDown("UP")) this.player.velocity.y = -200;
    if (Input.isDown("DOWN")) this.player.velocity.y = 200;
    this.player.update(dt);
  }

  render(ctx) {
    this.player.render(ctx);
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

| Import | Description |
|---|---|
| `Game` | Main game loop with fixed timestep, canvas setup, UI layer, and scene management |
| `Scene` | Lifecycle hooks (`enter`, `exit`, `pause`, `resume`, `update`, `interpolate`, `render`, `renderUI`) plus auto-cleaned event helpers (`on`, `onSwipe`, `onTap`, `cleanup`) |
| `Sprite` | Entity with `Transform`, `Collider`, `Velocity`, `Renderable`, and `Visibility` components. Exposes `x`, `y`, `width`, `height`, `angle`, `scale`, `velocity`, `image`, `style` shorthands. |
| `Group` | Entity container with batch render via `RenderSystem`. Iterable (`for...of`). Collision queries delegate to `CollisionSystem`. Optional `SpatialHash` acceleration. |
| `Transform` | Position (`x`, `y`), rotation, and scale — the single source of truth for world position |
| `Collider` | AABB dimensions (`width`, `height`) with static collision helpers (`checkAABB`, `checkRect`, `containsPoint`) |
| `Renderable` | Image or shape style with cached `Path2D` for circle/ellipse/rect |
| `Vec2` | 2D vector with add, sub, scale, dot, normalize, rotate, lerp |
| `Rect` | AABB rectangle utility with collision, containment, overlap, and anchor helpers |
| `Clock` | Fixed-timestep accumulator for deterministic updates |
| `Timer` | Countdown timer with optional looping |
| `Input` | Keyboard (`isDown`, `justPressed`, `justReleased`) and touch (swipe/tap) input handling |
| `SpatialHash` | Spatial partitioning for broad-phase collision acceleration |
| `State` | Observable state container with subscribe/unsubscribe |
| `Storage` | `localStorage` wrapper with JSON serialization |
| `Color`, `Colors` | Color class with parsing, manipulation, and a palette of named colors |
| `ImageLoader` | Image preloading with in-memory cache |
| `FontLoader` | FontFace loading for custom web fonts |
| `LoadingTask` | Async loading tracker for preload progress |
| `Pool` | Object pool for allocation-free reuse |
| `MovementSystem` | Batch movement logic — operates on `velocity` + `transform` pairs |
| `RenderSystem` | Batch rendering with viewport culling, rotation, and scale |
| `movementSystem` | Shared singleton instance of `MovementSystem` |
| `renderSystem` | Shared singleton instance of `RenderSystem` |
| `CollisionSystem` | Collision queries, broad-phase selection, and `SpatialHash` lifecycle |
| `collisionSystem` | Shared singleton instance of `CollisionSystem` |

## Architecture

Entities are composed from lightweight components:

```
Sprite
├── Transform      (position, rotation, scale)
├── Collider       (width, height)
├── Velocity       (Vec2)
├── Renderable     (image, style)
└── Visibility     (boolean)
```

Behavior lives in stateless systems:

```
MovementSystem    →  updates Transform from Velocity
RenderSystem      →  draws Renderable at Transform with viewport culling
CollisionSystem   →  collision queries with SpatialHash broad-phase
```

`Group.render(ctx, viewport)` delegates to `RenderSystem`.
Collision queries (`collideRect`, `collidePoint`, `collideGroup`,
`collideSprite`) are thin wrappers that delegate to `CollisionSystem`.

`Group` no longer owns an `update()` method. Systems execute at the scene
level — `Group` is a pure container with iteration (`for...of`, `forEach`,
`filter`, `map`) and membership management (`add`, `remove`, `clear`, `has`).

`CollisionSystem` owns the full `SpatialHash` lifecycle:

- **`collisionSystem.beginFrame()`** rebuilds every registered `SpatialHash`
  once. Call once per frame after all movement is done.
- **`collisionSystem.removeGroup(group)`** unregisters a group when it is
  no longer needed (e.g., `Scene.exit()`).
- `SpatialHash` is rebuilt every frame — no stale state, no dirty flags.
  Rebuilding a dynamic spatial hash once per frame is standard practice.

The internal sweep is safe with no groups registered (no-op).

Typical per-frame usage:

```javascript
movementSystem.update(enemies, dt);        // batch movement

collisionSystem.beginFrame();              // rebuild all spatial hashes

collisionSystem.collidePoint(enemies, mouse);
collisionSystem.collideRect(enemies, explosion);
collisionSystem.collideSprite(enemies, player);
```

→ 1 rebuild (across all groups), N lookups.

`CollisionSystem` is designed to support future broad-phase strategies.
Swapping `SpatialHash` for `SweepAndPrune` or another strategy happens in
one place — the system, not in each group or query method.

## License

GNU General Public License v3.0
