<p align="center">
  <img src="./logo.avif" alt="JyGame Logo" width="400">
</p>

<div align="center">

⭐ **If you like JyGame, consider giving it a star** ⭐

A lightweight, high-level 2D game framework for the browser.

</div>

# jygame

JyGame lets you build 2D games without wrestling with low-level plumbing. One `Game`, a few `Scene`s, and you’re playing.

```js
import { Game, Scene, Sprite, Input } from "jygame";

class PlayScene extends Scene {
  // Declare what the player can do — the engine handles the rest
  input = {
    jump: "Space",
    move: ["wasd", "arrowkeys"],
  };

  onEnter() {
    this.player = new Sprite(400, 300, 32, 32);
    this.player.style.fill = "#22c55e";
  }

  update(dt) {
    // One-shot vs held — no manual key tracking
    if (Input.pressed("jump")) {
      this.player.velocity.y = -400;
    }

    // Normalized 2D vector, diagonals handled for you
    const dir = Input.axis("move");
    this.player.velocity.x = dir.x * 200;
    this.player.velocity.y += 800 * dt; // gravity
  }
}

const game = new Game({
  parent: document.body,
  width: 800,
  height: 600,
});

game.run(new PlayScene());
```

No `ActionKind`, no `CompositeBinding`, no manual canvas resizing — just `Input.pressed`, `Input.axis`, and `Sprite.velocity`.

## Install

```sh
npm install jygame
```

```js
import { Game, Scene, Sprite, Input, Particle, Audio, Text } from "jygame";
```

## Quick start

**1. Create a game**

```js
const game = new Game({
  parent: document.body, // or "#game-root"
  width: 800,
  height: 600,
  // scaleToFit: true, // auto-fit to window
  // debug: true,      // press ` to see the overlay
});
```

**2. Write a scene**

Scenes own everything: world, camera, input, and lifecycle. The engine mounts, updates, renders, and unmounts them for you.

```js
class MenuScene extends Scene {
  onEnter() {
    // Runs once the scene is mounted — spawn sprites, load assets
    this.title = new Text(400, 200, "MyFont", "Press Space");
  }

  update(dt) {
    if (Input.pressed("Space")) {
      this.switchScene(new PlayScene());
    }
  }

  // Optional: render behind or above the world
  // render(ctx) { /* canvas behind sprites */ }
  // renderUI(ctx) { /* canvas above sprites */ }
  // renderDOM() { return `<div>Score: ${score}</div>` }
}
```

Stack them naturally: `game.pushScene(new PauseScene())` freezes the scene below, `game.popScene()` resumes it.

**3. Input — one facade for everything**

```js
// Keyboard / mouse — by action or raw key
if (Input.pressed("jump")) { /* ... */ }
if (Input.down("KeyW")) { /* ... */ }
if (Input.pointer.pressed) {
  this.shootAt(Input.pointer.worldX, Input.pointer.worldY);
}

// Gamepad — same API
if (Input.pressed("PAD_A")) { this.jump(); }
const dir = Input.axis("PAD_LEFT_STICK");

// Gestures — tap, swipe, pinch, etc.
this.onTap(() => this.startGame());
Input.bind("fire", "tap");
```

Bind once in the scene, query anywhere:

```js
input = {
  move: { up: "KeyW", down: "KeyS", left: "KeyA", right: "KeyD" },
  fire: "LEFT_MOUSE",
};
```

**4. Sprites, text, and particles**

```js
// Sprite — a live image in the world
const hero = new Sprite(100, 100, "hero.png");
hero.velocity.x = 120;
hero.scale = 2;

// Text — world-space, follows camera
const label = new Text(400, 50, "MyFont", "Hello JyGame");

// Particles — one line, auto-managed
import { Particle, ConeShape, CircleParticleVisual } from "jygame";

const smoke = Particle.create({
  shape: new ConeShape({ radius: 4, angle: Math.PI/3 }),
  visual: new CircleParticleVisual(),
  lifetime: [1, 2],
  rate: 40,
});
smoke.play();
smoke.follow(player); // follow the player
```

All retained objects update, interpolate, and draw themselves — no manual `ctx.drawImage` loop.

## Why JyGame?

- **Scenes done right** — `onEnter` / `update` / `render` / `onExit`, plus `push`/`pop`/`switch` with `blocksUpdateBelow`. Pause menus are two lines.
- **Input that scales** — actions, chords (`{key:"S", ctrl:true}`), vector movement (`wasd` + `arrowkeys` + `PAD_LEFT_STICK` on one `move` action), mouse/touch/gamepad/gestures behind one facade.
- **Rendering without the grind** — `Sprite`, `Text`, and `Particle` are retained; `render(ctx)` is only for custom background/foreground. No entity-component boilerplate in game code.
- **Particles, audio, and text included** — GPU-accelerated particles with shapes + modifiers, spatial audio (`Audio.play("shot", {x,y})`), bitmap/native fonts with the same `Text` API.
- **Fast, built to grow** — archetype-based ECS under the hood, fixed-timestep loop with interpolation, `SpatialHash` for collisions, no per-frame allocations where it matters.

You stay in high-level game code. The ECS is there when you need it, invisible when you don't.

## Documentation

Full API reference and guides: **[jygame-documentation.vercel.app](https://jygame-documentation.vercel.app/)**

- `Game` — canvas, loop, scene stack
- `Scene` — lifecycle, input bindings, world
- `Sprite` / `Group` — images, animation, collision
- `Input` — keyboard, mouse, gamepad, gestures
- `Particle` — shapes, visuals, modifiers
- `Text` / `Font` — world-space text
- `Audio` — one-shots, music, spatial

## License

GPL-3.0
