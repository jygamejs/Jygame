# Jygame Image API Redesign

## Philosophy

Image is not an asset manager.

Image is not an animation system.

Image is not a sprite system.

Image is simply responsible for describing how images are loaded,
sliced and animated.

Everything else builds on top of that.

The Image API should be one of the easiest systems to learn in the entire framework.

When a new user opens the documentation, they should not have to learn about image loaders, animation packs, texture atlases, asset registries, frame descriptors, or sprite sheets. Those are implementation details and advanced concepts that can be discovered naturally over time.

The first thing a user should learn is simply:

```js
Image.load(...)
Image.animate(...)
new Sprite(...)
```

That is the entire mental model.

If a user remembers those three concepts, they should already be capable of building most games with Jygame.

The philosophy of the Image API is therefore:

- One thing to remember.
- Multiple workflows.
- Zero unnecessary concepts.
- Automatic behavior whenever possible.
- Manual control whenever desired.
- Advanced features should feel like extensions, not entirely new APIs.

The API should scale naturally from:

```js
Image.load("player.png");
```

note: Image.load("player.png"); and Image.load("/player.png"); is the same

all the way to:

```js
Image.animate({
    image: "atlas.png",
    json: "atlas.json",

    idle: { prefix: "player_idle_" },
    run:  { prefix: "player_run_" },
    attack: { prefix: "player_attack_" },
});
```

without ever requiring the user to learn another subsystem.

---

## Things You Don't Need To Learn

- Asset registries
- Frame descriptors
- Animation clips
- Texture atlases
- Sprite sheets
- Loading tasks
- Caching
- Decoding
- Internal animation systems
- ECS animation components

If you are making your first game, ignore all of these.

Learn these three things first:

```
Image.load()
Image.animate()
new Sprite()
```

---

## No Wrong Workflow

```js
await Image.animate(...);
```

is good.

```js
new Sprite(..., image);
```

is good.

```js
new Sprite(..., image, rect);
```

is good.

```js
ctx.drawImage(...);
```

is good.

```js
Image.load(...);
```

is good.

There is no "correct" workflow. The framework provides convenience APIs, not mandatory APIs.

That philosophy appears everywhere in Jygame:

- Input actions or raw keys.
- Audio definitions or raw audio instances.
- Sprite animations or manual frame rendering.
- ECS or object-oriented APIs.

Jygame encourages workflows rather than enforcing them.

---

## Design Goals

The Image API is designed around five major goals.

### Goal #1 — Extremely Easy to Remember

A beginner should not need to remember:

```
AnimationLoader  AnimationPack  TextureAtlas  SpriteSheetLoader
FrameLoader  AssetRegistry  AnimationRegistry  ImageLoader
```

Instead, they should only remember:

```js
Image.load()
Image.animate()
```

Everything else is implementation details.

If users forget how animations work, they should naturally think:

> "Images are handled by Image. I probably want Image.animate()."

This is similar to how the Input redesign works:

```js
Input.pressed()
Input.down()
Input.released()
```

There is no need to remember five different classes. The Image API follows the exact same philosophy.

### Goal #2 — Automatic Strategy Detection

Users should not have to think about loaders.

These two examples should feel equally natural:

```js
Image.animate({ image: "/player.png", sliceX: 8, sliceY: 1, run: { from: 0, to: 7 } });
```

```js
Image.animate({ path: "/assets/player", idle: 4, run: 8 });
```

Whether the implementation uses individual files, sprite sheets, texture atlases, JSON atlases, grid slicing, or manual regions should not matter to the user.

The shape of the configuration object determines the strategy automatically.

```js
Image.animate({ image: "/player.png", sliceX: 4, sliceY: 1, ... });
```

immediately tells Jygame: "This is a sprite sheet animation."

```js
Image.animate({ path: "/assets/player", ... });
```

clearly means: "This is an individual file convention."

The user should not care which internal loader is being used.

### Goal #3 — Progressive Discovery

The documentation should teach users things in this order:

```
Image.load()

↓

Image.animate()

↓

Sprite

↓

Sprite Sheets

↓

Texture Atlases

↓

Rect

↓

Advanced Workflows
```

A beginner should never feel overwhelmed. Someone making their first platformer should not be reading about TexturePacker, frame descriptors, asset registries, or ECS animation components.

The API reveals complexity only when users need it.

### Goal #4 — First-Class Manual Workflows

All of the following should feel equally supported:

```js
new Sprite(...);
new Sprite(..., image);
new Sprite(..., image, rect);
ctx.drawImage(...);
ctx.drawImage(..., crop);
```

Users should never feel forced into using the animation system. The framework encourages convenience, not enforce it.

### Goal #5 — Everything is Built on Images

```
Image

↓

Animation

↓

Sprite

↓

Rendering
```

Animations are images. Sprite sheets are images. Texture atlases are images. Frame regions are images. Sprites simply render images.

Keeping this hierarchy simple makes the API significantly easier to understand. Users should never feel like animations belong to a completely different subsystem.

---

## High-Level API Overview

The entire Image API revolves around two methods:

```js
Image.load()
```

and

```js
Image.animate()
```

Everything else builds on top of them.

---

## Image.load()

`Image.load()` is the foundation of the entire image system.

Every image that exists inside a Jygame project originates from this API, whether it is a simple PNG file, a sprite sheet, a texture atlas, a UI asset, a particle texture, an animation source image, or a dynamically loaded image.

The API is intentionally designed to solve 90% of use cases while remaining extremely easy to remember.

If users want an image, they should instinctively reach for `Image.load()`.

### Single Image

The most basic use case:

```js
const image = await Image.load("/player.png");
```

This loads the image, decodes it, and returns an `HTMLImageElement`. The image behaves exactly like a normal HTML image element:

```js
ctx.drawImage(image);

new Sprite(0, 0, image);
```

```js
// with options
const image = await Image.load("/player.png", { decode: false });
```

### Anonymous Loading

Sometimes users simply want an image object without a global name:

```js
const image = await Image.load("/player.png");
```

This workflow is particularly useful for procedural systems, runtime generated sprites, utility classes, temporary assets, and manual rendering. Not every image needs to live inside the global registry.

### Named Assets

Named assets are the recommended approach for most projects:

```js
await Image.load("player", "/player.png");
```

Later:

```js
new Sprite(0, 0, "player");
```

The advantages are significant: cleaner constructors, easier refactoring, shared assets, automatic caching, better organization, and consistent asset pipelines.

For larger projects, named assets quickly become preferable over passing image objects around manually.

### Batch Loading

Loading multiple images at once:

```js
await Image.load({
    player: "/player.png",
    enemy: "/enemy.png",
    background: "/background.png",
});
```

This is effectively syntactic sugar for parallel loading. The object syntax is significantly more readable for larger projects.

### Progress Tracking

`Image.load()` returns a `LoadingTask` whenever batch loading is performed:

```js
const task = Image.load({
    player: "/player.png",
    enemy: "/enemy.png",
    boss: "/boss.png",
});

task.onProgress((loaded, total) => {
    console.log(`${loaded}/${total}`);
});

const result = await task;
```

This API is intentionally shared across other asset systems:

```js
Audio.load(...)
Font.load(...)
Image.load(...)
```

should all behave consistently.

### Image Retrieval

```js
Image.get("player");   // → HTMLImageElement
Image.has("player");   // → boolean
Image.remove("player");
Image.clear();
```

### Automatic Caching

All loaded images are cached automatically. Loading the same image twice should never trigger two network requests.

```js
await Image.load("player", "/player.png");
await Image.load("player", "/player.png"); // returns cached
```

This behavior should be entirely transparent to users.

---

## Image.animate()

`Image.animate()` is the high-level entry point for loading animated sprites.

Instead of learning four separate loader classes for individual files, sprite sheets, texture atlases, and JSON atlases, users learn one method. The shape of the configuration object determines the loading strategy automatically.

### Individual Files

```js
const animations = await Image.animate({
    path: "/assets/player",

    idle: 4,
    run: 8,
    jump: 2,
});
```

This loads individual frame files from:

```
/assets/player/idle/idle_01.png
/assets/player/idle/idle_02.png
...
/assets/player/run/run_01.png
...
/assets/player/jump/jump_01.png
...
```

The returned object can be attached directly:

```js
player.animation.addAll(animations);
player.animation.play("idle");
```

Entry formats:

| Shape | Meaning |
|-------|---------|
| `idle: 4` | 4 frames numbered 1–4 |
| `run: { frames: 8 }` | 8 frames numbered 1–8 |
| `run: { from: 1, to: 8 }` | Range syntax |
| `run: { frames: 8, prefix: "run_", suffix: "_a" }` | Custom prefix/suffix |

### Named Animation

Use `name` to register the animations globally, so `new Sprite(..., "player")` automatically gets the animations attached:

```js
await Image.animate({
    name: "player",

    path: "/assets/player",

    idle: 4,
    run: 8,
    jump: 2,
});
```

Then:

```js
const player = new Sprite(100, 100, "player");
player.animation.play("run");
```

The `name` is optional. Without it, the animations are returned as a plain object for manual attachment.

### Sprite Sheets

```js
await Image.animate({
    name: "player",

    image: "/player.png",

    sliceX: 8,
    sliceY: 1,

    run: {
        from: 0,
        to: 7,
    },
});
```

This tells Jygame:

- The image is a sprite sheet.
- It has 8 columns and 1 row.
- Each cell is automatically calculated from the image dimensions divided by the grid.
- The run animation uses frames 0 through 7.

Configuration options:

| Property | Description |
|----------|-------------|
| `image` | Path or HTMLImageElement |
| `sliceX` | Number of columns in the grid |
| `sliceY` | Number of rows in the grid |
| `margin` | Pixels of blank margin around the sheet |
| `spacing` | Pixels between frames |
| `columns` | Override frame count per row (advanced) |

### Automatic Frame Size Detection

When `sliceX` and `sliceY` are provided, the frame width and height are calculated automatically:

```
frameWidth  = imageWidth  / sliceX
frameHeight = imageHeight / sliceY
```

Users never need to manually specify `frameWidth` or `frameHeight` for standard sprite sheets. Manual overrides remain available for advanced use cases.

### Texture Atlases

```js
await Image.animate({
    name: "player",

    image: "/player.png",

    json: "/player.json",

    idle: { prefix: "idle_" },
    run:  { prefix: "run_" },
});
```

Supports both TexturePacker JSON Hash and JSON Array formats. Frames are matched by prefix and sorted naturally by trailing number.

### Manual Regions

```js
await Image.animate({
    name: "ui",

    image: "/ui.png",

    button: {
        frames: [
            [0, 0, 32, 32],
            [32, 0, 32, 32],
            [64, 0, 32, 32],
        ],
    },

    icon: {
        frames: [
            { x: 0, y: 32, width: 16, height: 16 },
        ],
    },
});
```

### Grid Region in an Atlas

```js
await Image.animate({
    name: "explosion",

    image: "/effects.png",

    explosion: {
        x: 0,
        y: 128,
        width: 256,
        height: 64,
        frameWidth: 64,
        frames: 4,
    },
});
```

Without `frameWidth`/`frameHeight`, the region is divided evenly horizontally.

### Per-Animation Options

Each animation entry supports:

| Property | Default | Description |
|----------|---------|-------------|
| `fps` | `defaults.fps ?? 8` | Frames per second |
| `loop` | `defaults.loop ?? true` | Loop mode |
| `pingPong` | `false` | Play forward then reversed |
| `crop` | `null` | Inset crop `{ left, top, right, bottom }` |

These can also be set globally via `defaults`:

```js
await Image.animate({
    path: "/assets/player",
    defaults: { fps: 12, loop: true, padding: 2 },

    idle: 4,      // inherits fps=12, loop=true, padding=2
    run:  { frames: 8, fps: 15 },  // overrides fps locally
});
```

---

## Automatic Strategy Detection Summary

| Config Shape | Detected Strategy |
|---|---|
| `{ path: "...", name?: ..., anims... }` | Individual file convention |
| `{ image: "...", sliceX: N, sliceY: N, ... }` | Sprite sheet (grid) |
| `{ image: "...", json: "...", ... }` | JSON atlas (TexturePacker) |
| `{ image: "...", anim: { frames: [[x,y,w,h], ...] } }` | Manual regions |
| `{ image: "...", anim: { x, y, width, height, frames } }` | Grid region in atlas |

The user never writes:

```js
AnimationPack.fromAtlas()
AnimationPack.fromSpriteSheet()
AnimationPack.fromJSONAtlas()
```

because those concepts are internal implementation details.

---

## Sprite Integration

The Sprite API should remain extremely flexible.

The following constructors should all be valid.

By name:

```js
const player = new Sprite(100, 100, "player");
player.animation.play("run");
```

Image object:

```js
const player = new Sprite(100, 100, image);
```

Image and region:

```js
const player = new Sprite(100, 100, image, rect);
```

Position only:

```js
const player = new Sprite(100, 100);  // no image yet
```

Size and image:

```js
const player = new Sprite(100, 100, 32, 32, image);
```

Nothing else should be required.

---

## Image vs Rect

Should I use `Image.animate()` or `Rect`?

Use `Image.animate()` if:

- You are loading character animations.
- You are using sprite sheets.
- You are using texture atlases.
- You don't care about manual slicing.

Use `Rect` if:

- You are manually drawing regions.
- You are making rendering utilities.
- You are implementing custom systems.
- You prefer low-level control.

---

## Rect API

Rect describes a rectangular region of an image.

```js
const rect = new Rect(0, 0, 32, 32);
```

```js
const rect = new Rect({
    x: 0, y: 0,
    width: 32, height: 32,
});
```

Rect is useful for:

- Defining a single frame region.
- Creating a spritesheet grid manually.
- Implementing custom rendering.
- Working directly with canvas drawImage.

When a Sprite is created with an image and a Rect, the sprite renders only that region of the image:

```js
const frame = new Rect(32, 0, 32, 32);
const sprite = new Sprite(100, 100, image, frame);
```

---

## What I Expect Myself to Write

If I had to guess what I will personally write in 90% of my projects, it would probably look very similar to this:

```js
await Image.load({
    player: "/assets/player.png",
    enemy: "/assets/enemy.png",
    background: "/assets/bg.png",
});

await Image.animate({
    name: "player",

    path: "/assets/player",

    idle: 4,
    run: 8,
});

const player = new Sprite(100, 100, "player");
player.animation.play("run");
```

The Image API is intentionally optimized around that workflow.

---

## Manual Workflows

Jygame supports both high-level and low-level approaches equally well.

High-level:

```js
await Image.animate({ name: "player", path: "/assets/player", idle: 4, run: 8 });

const player = new Sprite(0, 0, "player");
player.animation.play("idle");
```

Low-level:

```js
const image = await Image.load("/sheet.png");
const frame = new Rect(0, 0, 32, 32);
const sprite = new Sprite(0, 0, image, frame);
```

Very low-level:

```js
ctx.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
```

No workflow should feel like a second-class citizen.

---

## Advanced Workflows

### Manual sprite from loaded animation

```js
const anims = await Image.animate({
    path: "/assets/player",
    idle: 4,
    run: 8,
});

const player = new Sprite(100, 100, Image.get("player"));
player.animation.addAll(anims);
player.animation.play("run");
```

### Custom animation clip

```js
const clip = new AnimationClip({
    frames: [
        { sourceImage: img, sx: 0, sy: 0, sw: 32, sh: 32 },
        { sourceImage: img, sx: 32, sy: 0, sw: 32, sh: 32 },
    ],
    fps: 8,
    loop: true,
});

sprite.animation.add("walk", clip);
sprite.animation.play("walk");
```

### Direct asset registry access

```js
import { AssetRegistry } from "jygame";

const reg = world.getResource(AssetRegistry);
const id = reg.register({ sourceImage: img, sx: 0, sy: 0, sw: 32, sh: 32 });
sprite.renderable.image = id;
```

---

## Asset Organization Recommendations

The API never enforces a particular folder structure. Both of these work naturally:

```
assets/
    player.png
    enemy.png
    background.png
    ui/
        heart.png
    characters/
        wizard.png
        knight.png
```

```js
await Image.load({
    player: "/assets/player.png",
    knight: "/assets/characters/knight.png",
    fireball: "/assets/effects/fireball.png",
});
```

For animations, the individual file convention expects:

```
/assets/player/idle/idle_01.png
/assets/player/idle/idle_02.png
/assets/player/run/run_01.png
...
```

---

## Sharing Assets

Multiple sprites automatically share image resources:

```js
const player = new Sprite(0, 0, "slime");
const enemy = new Sprite(200, 0, "slime");
const boss = new Sprite(400, 0, "slime");
```

There should only ever be one loaded image. No duplication, no additional allocations, no unnecessary memory usage.

---

## Future Compatibility

The Image API should be flexible enough to support future features without changing its public interface.

Potential additions include:

- Asset bundles.
- Compressed textures.
- Runtime streaming.
- Lazy loading.
- Editor integration.
- Virtual file systems.
- CDN asset pipelines.
- Platform-specific optimizations.

The API should remain:

```js
Image.load(...)
Image.animate(...)
```

regardless of how sophisticated the underlying implementation becomes.

---

## Recommendation by Project Size

Small projects:

```js
await Image.load("player", "/player.png");
const player = new Sprite(0, 0, "player");
```

Medium projects:

```js
await Image.load({
    player: "...",
    enemy: "...",
    ui: "...",
    background: "...",
});
```

Large projects:

```js
const task = Image.load({
    player: "...",
    boss: "...",
    ui: "...",
    particles: "...",
    tiles: "...",
});

task.onProgress((loaded, total) => {
    updateLoadingBar(loaded / total);
});

await task;
```

The API scales naturally without introducing new concepts or loaders.

---

## What Users Should Remember

Most users should be able to learn the entire image system by remembering only the following:

```js
Image.load()
Image.animate()
new Sprite()
```

Everything else is optional.

The Image API should grow with the user's needs rather than requiring them to learn every concept upfront. That simplicity should remain one of the core design goals of Jygame's asset pipeline.

---

## Summary

```
Want an image?
↓
Image.load()

Want multiple images?
↓
Image.load({...})

Want progress?
↓
Use the returned LoadingTask

Want to use the image?
↓
new Sprite(...)

Want animations?
↓
Image.animate()

Want to animate?
↓
sprite.animation.play(...)
```

The API intentionally hides asset management, caching, decoding, strategy detection, and registry behavior behind a single, memorable entry point.

Users should spend their time building games rather than learning asset-loading terminology.
