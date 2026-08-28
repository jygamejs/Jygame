<p align="center">
  <img src="./logo.avif" alt="JyGame Logo" width="400">
</p>

# 🎮 Jygame

**A batteries-included 2D game engine for JavaScript — no wiring, no boilerplate, just play.**

Jygame gives you a small set of global facades — `Game`, `Scene`, `Sprite`, `Input`, `Audio`, `Particle`, `Font`, `Text` — that cover everything a 2D game needs, from pixel-perfect sprite animation to spatial audio, GPU particle effects, and gamepad support. Import what you need, and start building. There's nothing to instantiate, nothing to configure before you're productive.

```js
import { Game, Scene, Sprite, Image, Input } from "jygame";

class MyScene extends Scene {
  input = { move: ["wasd", "arrowkeys"] };

  async onEnter() {
    await Image.animate({ name: "hero", path: "assets/hero", idle: 4, run: 6 });
    this.player = new Sprite(400, 300, "hero");
  }

  update(dt) {
    const move = Input.axis("move");
    this.player.velocity.x = move.x * 200;
    this.player.animation.play(move.x !== 0 ? "run" : "idle");
  }
}

new Game({ width: 800, height: 600 }).run(new MyScene());
```

That's a fully animated, input-driven character. No engine setup, no manual render loop, no asset manager to wire up.

---

## Why Jygame?

- **Zero-friction facades.** `Input`, `Audio`, `Image`, `Font` — every subsystem is a global you import and use immediately. No constructors, no dependency injection, no "which instance owns this."
- **Promises, not callbacks.** Loading a sprite sheet, a sound, or a font is one `await` away. Batch-load a whole level's assets and track progress with a single `LoadingTask`.
- **Scales from prototype to production.** Start with `renderer: "canvas"` and ship on Canvas 2D — or flip to `renderer: "auto"` and Jygame will pick **WebGPU → WebGL → Canvas**, automatically, with zero changes to your game code.
- **Fixed-timestep by default.** Deterministic updates, smooth interpolated rendering, and a tunable catch-up strategy for real-world lag — so your physics never depends on frame rate.

---

## ✨ Feature Highlights

### 🕹️ One `Input` facade for everything with buttons
Keyboard, mouse, touch, gamepad, and gestures — all queried the exact same way:

```js
Input.pressed("jump");          // an action, a key, or a gamepad button — same call
Input.axis("move");             // WASD, arrow keys, and the left stick, unified
Input.gestures.on("pinch", (e) => camera.zoom *= e.scale);
```

Bind once in a scene's declarative `input` block, and mix keyboards, gamepads, and touch without writing a single `if (event.key === ...)`.

### 🥊 Input sequences & combos
Ordered inputs give raw history meaning — `input` names physical inputs, `combo` names their order:

```js
class FightingScene extends Scene {
  input = { punch: "KeyJ", down: "KeyS", right: "KeyD" };
  combo = { hadoken: ["down","right","punch"] }; // or { hadoken: { sequence: [...], within:300, consume:true } }
  update(){ if (Input.sequence("hadoken")) this.player.hadoken(); }
}
Input.sequence(["KeyW","KeyD","Space"]); // raw
Input.sequence(["down","right","punch"], {within:300, consume:true});
Input.sequence("hadoken", {within:300}); // combo name resolves via active context priority
```

`within` is per-step max gap using `performance.now()` timestamps; history is bounded and never mutated by `consume` (per-matcher `WeakSet`), so overlapping `["A","B"]` and `["B","A"]` can both be true.

### 🖱️ Mouse, pointer, cursor and pointer lock
Mouse-specific controls live under `Input.mouse` — unified pointer stays under `Input.pointer`:

```js
Input.mouse.x; Input.mouse.y; Input.mouse.worldX; // screen → viewport → world via CoordinateSystem
Input.mouse.deltaX; Input.mouse.deltaY;             // movement since last tick; relative while pointer-locked
Input.mouse.wheel; Input.mouse.wheelX;              // aliases: Input.wheel / Input.wheelX remain

if (Input.mouse.left.pressed) this.select(Input.mouse.worldX, Input.mouse.worldY);
if (Input.mouse.right.down) this.aim();
Input.mouse.isDown("left"); Input.mouse.button("middle").pressed;

Input.mouse.cursor.visible = false;                 // hides browser cursor without touching DOM
Input.mouse.cursor.style = "crosshair";             // any CSS cursor keyword
Input.mouse.cursor.setImage("assets/cursor.png", {x:4, y:4}); // CSS url() with hotspot, or engine-render deferred

if (Input.mouse.left.pressed) await Input.mouse.pointerLock.lock(); // promise<boolean>, user-gesture required
if (Input.mouse.pointerLock.isLocked) camera.rotate(Input.mouse.deltaX);
Input.mouse.pointerLock.unlock();
```

### 🎞️ Sprite sheets, atlases, and folders — animated in one call
Whether your art is a folder of numbered PNGs, a packed TexturePacker atlas, or a hand-cut sprite sheet, `Image.animate()` turns it into ready-to-play clips:

```js
await Image.animate({
  name: "hero",
  image: "characters.png",
  frameWidth: 32, frameHeight: 32, columns: 23,
  walk: { row: 1, from: 0, to: 3 },
  jump: { row: 1, from: 4, to: 7, markers: { airborne: 2 } },
});
```

Then drive it with a controller that actually understands game logic — persistent states, one-shot actions, queued combos, and **marker-driven playback** for pausing an animation mid-flight until gameplay says "go":

```js
player.animation.play("walk");                 // persistent, safe to call every frame
player.animation.playOnce("attack");            // plays once, resumes normal after
player.animation.playUntil("jump", "airborne"); // pause exactly at takeoff
```

### 💥 A real particle system, CPU or GPU
Cinematic effects with shapes, modifiers, and forces — not a toy emitter:

```js
Particle.create({
  rate: 40,
  shape: new ConeShape({ angle: Math.PI / 3, speed: [60, 120] }),
  modifiers: [new ScaleModifier({ from: 1, to: 0 }), new FadeModifier({ mode: "out" })],
  backend: "gpu", // simulate thousands of particles off the main thread
});
```

Bursts, continuous emission, following a moving target, completion callbacks — it's all built in.

### 🔊 Audio that scales from a UI click to a full soundscape
One-shots, looping music with fades and crossfades, mixer groups, a spatial listener, and a DSP effect chain (reverb, delay, filters, compression):

```js
const music = await Audio.music("theme.ogg");
music.fadeIn(2);

Audio.play("explosion", { x: 400, y: 300 });   // spatial — quieter as the listener moves away
Audio.group("sfx").effects.add(new ReverbEffect({ decay: 1.5 }));
```

### 🔤 Text that lives in your world, not your canvas
Bitmap fonts *and* native `.ttf`/`.otf` fonts, drawn as retained scene objects that sort, scale, and animate alongside your sprites:

```js
const label = new Text(400, 30, font, "SCORE 0", { align: "center", color: "#ffe600" });
label.value = `SCORE ${score}`;  // cheap — only re-renders when it actually changes
```

### 🎬 Scenes that compose like a stack
Menus, pause overlays, HUDs, and levels are just `Scene` subclasses pushed onto a stack — with automatic freezing of what's underneath, transparent overlays, and clean async setup:

```js
class PauseMenu extends Scene {
  blocksUpdateBelow = true;   // gameplay freezes automatically
  blocksRenderBelow = false;  // ...but stays visible behind the menu
}

game.pushScene(new PauseMenu());
```

---

## Quick Start

```bash
npm install jygame
```

```js
import { Game, Scene } from "jygame";

class MyScene extends Scene {
  onEnter() {
    // set up your world
  }
  update(dt) {
    // your game logic, at a fixed timestep
  }
}

const game = new Game({ width: 1280, height: 720, renderer: "auto" });
game.run(new MyScene());
```

That's the whole setup. Everything else — assets, input, audio, particles, UI — is one import away.

---

## What's Inside

| System | What you get |
|---|---|
| **Game** | Fixed-timestep loop, scene stack, auto backend selection (WebGPU/WebGL/Canvas), debug overlay |
| **Scene** | Lifecycle hooks, async setup, layered rendering (canvas + retained + DOM), input scoping |
| **Sprite** | Images, atlases, solid shapes, colliders, groups, spatial queries |
| **Input** | Keyboard, mouse, touch, gamepad, gestures — one query API for all of them |
| **Image** | Loading, caching, sprite-sheet & folder animation, atlas building |
| **Audio** | One-shots, music, groups, spatial sound, a full DSP effect chain |
| **Particle** | Shapes, modifiers, forces, CPU/GPU backends, target-following |
| **Font / Text** | Bitmap and native fonts, retained world-space text objects |

---

## Get Building

Jygame is designed so the distance between "I have an idea" and "it's on screen" is as short as possible. Pull in the facades you need, lean on sensible defaults, and reach for the deeper options only when your game actually needs them.

**Ready to make something?** Install Jygame and open your first `Scene`.

---

## Documentation

Full API reference, guides, and examples: **[jygame-documentation.vercel.app](https://jygame-documentation.vercel.app/)**

---

## License

GNU General Public License v3.0 — see [LICENSE](LICENSE) for details.
