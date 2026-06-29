# ECS Component Map

## Existing Legacy Components

### Transform (`components/Transform.js`)
| Field | Type | Default | ECS Name | Notes |
|---|---|---|---|---|
| `x` | f32 | 0 | `Transform.x` | World position (center) |
| `y` | f32 | 0 | `Transform.y` | |
| `rotation` | f32 | 0 | `Transform.rotation` | Radians |
| `scale` | Vec2 | (1,1) | `Transform.scaleX`, `Transform.scaleY` | Split into two f32 fields |

**ECS Schema:**
```js
{ x: "f32", y: "f32", rotation: "f32", scaleX: "f32", scaleY: "f32" }
```

**Migration:** Direct port. `Vec2` is replaced by two scalar fields for SoA compatibility.

---

### Collider (`components/Collider.js`)
| Field | Type | Default | ECS Name | Notes |
|---|---|---|---|---|
| `width` | f32 | 0 | `Collider.width` | Full width |
| `height` | f32 | 0 | `Collider.height` | Full height |

**ECS Schema:**
```js
{ width: "f32", height: "f32" }
```

**Migration:** Direct port. Static methods (`checkAABB`, `checkRect`, etc.) move to `CollisionSystem`.

---

### Renderable (`components/Renderable.js`)
| Field | Type | Default | ECS Name | Notes |
|---|---|---|---|---|
| `image` | any (CanvasImageSource) | null | `Renderable.image` | Drawable |
| `style.fill` | string | "#ffffff" | `Renderable.fillColor` | CSS color |
| `style.shape` | string | "rect" | `Renderable.shape` | "rect"\|"circle"\|"ellipse" |

**ECS Schema:**
```js
{ image: "any", fillColor: "string", shape: "string" }
```

**Migration:** `style` object flattened; `draw()` method moves to `RenderSystem._drawEntity`. `Path2D` cache stays in render system.

---

### Animation (`components/Animation.js`)
| Field | Type | Default | ECS Name | Notes |
|---|---|---|---|---|
| `current` | string | null | `Animation.currentClip` | Current clip name |
| `frame` | u32 | 0 | `Animation.frameIndex` | Current frame |
| `elapsed` | f32 | 0 | `Animation.elapsed` | Seconds since last frame advance |
| `playing` | bool | false | `Animation.isPlaying` | Playback flag |
| `animations` | Map | (empty) | — | **Becomes Asset, not component** |

**ECS Schema:**
```js
{ currentClip: "string", frameIndex: "u32", elapsed: "f32", isPlaying: "u8" }
```

**Migration:** Clip definitions (`{fps, frames[], loop}`) move to a shared `AnimationClip` asset registry. Completion callback (`_callback`) removed; use ECS events instead. `play`/`pause`/`stop` methods move to `AnimationSystem`.

---

### Velocity (currently `Sprite.velocity`, not a component)
| Field | Type | Default | ECS Name | Notes |
|---|---|---|---|---|
| `x` | f32 | 0 | `Velocity.x` | |
| `y` | f32 | 0 | `Velocity.y` | |

**ECS Schema:**
```js
{ x: "f32", y: "f32" }
```

**Migration:** Promote from plain property to first-class component.

---

### Visible (currently `Sprite.visible`, not a component)
| Field | Type | Default | ECS Name | Notes |
|---|---|---|---|---|
| `visible` | bool | true | `Visible.value` | |

**ECS Schema:**
```js
{ value: "u8" }
```

**Migration:** Promote from plain property to first-class component.

---

## New Components (ECS-specific)

### Tag Components (zero fields)
- `EnemyTag`
- `PlayerTag`
- `ProjectileTag`

These replace duck-typing (`entity.isEnemy`) and group-based filtering.

---

## Particle Components (future ECS integration)

The particle engine's per-particle fields (`Particle.js`) would decompose into:

| ECS Component | Fields | Used by |
|---|---|---|
| `ParticleLifetime` | `life: f32, maxLife: f32` | ParticleSystem |
| `ParticleAppearance` | `size: f32, alpha: f32, r: u8, g: u8, b: u8, texture: any` | ParticleRenderer |
| `ParticleMotion` | `vx: f32, vy: f32, ax: f32, ay: f32, rotationSpeed: f32` | ParticleSystem |
| `ParticleCollision` | `collides: u8, radius: f32, restitution: f32, layer: string` | CollisionSystem |

**Decision:** Individual particles should **NOT** become ECS entities. The particle engine's SoA storage is already optimal for thousands of particles. ECS integration is at the emitter/effect level only.

---

## Audio Components (future ECS integration)

| ECS Component | Fields | Notes |
|---|---|---|
| `AudioSource` | `soundKey: string, volume: f32, spatial: u8, x: f32, y: f32` | Entity-owned audio |
| `AudioListener` | `x: f32, y: f32` | Singleton entity component |

Audio remains manager-driven; these components enable entity-to-sound binding.

---

## Component Ownership Summary

| Component | Migrate? | Priority | Difficulty |
|---|---|---|---|
| Transform | Direct port | P0 | Easy |
| Collider | Direct port + system refactor | P0 | Easy |
| Renderable | Flatten + draw() extraction | P0 | Medium |
| Animation | State split from assets | P0 | Medium |
| Velocity | Promote from property | P0 | Easy |
| Visible | Promote from property | P0 | Easy |
| Particle fields | Keep SoA; don't ECS-ify | — | N/A |
| AudioSource | New; entity-to-sound bridge | P1 | Medium |
| AudioListener | New; singleton | P1 | Easy |
| TimerComponent | Extract from Timer utility | P2 | Easy |
| TrailComponent | Extract from Trail class | P2 | Medium |
