# ECS Resource Map

Resources are singleton objects injected into the ECS World, accessible by systems. They replace global singletons and module-level state.

## Global Singletons → ECS Resources

### Camera (`camera/Camera.js`)
| Detail | Value |
|---|---|
| **Current pattern** | `Camera.main` static singleton |
| **ECS category** | Resource (per-World) |
| **Type** | Mutable state |
| **Ownership** | World |
| **Migrate priority** | P0 (RenderSystem dependency) |

**Migration:** Register `Camera` instance as a resource. Systems read it via `ctx.resources.Camera`. Future: support multiple cameras (one per scene/World).

---

### InputContext / Input (`input/Input.js`, `input/InputContext.js`)
| Detail | Value |
|---|---|
| **Current pattern** | `Input` facade with module-level keyboard handler, `game.input` on Scene |
| **ECS category** | Resource (per-World or per-Scene) |
| **Type** | Mutable state + event stream |
| **Ownership** | Scene → World |
| **Migrate priority** | P0 (user-facing API) |

**Migration:** `InputContext` becomes a resource. Systems read `InputContext.keys`, `InputContext.justPressed`, etc. The `Input` facade routes events to the active scene's InputContext.

---

### AudioManager (`audio/`)
| Detail | Value |
|---|---|
| **Current pattern** | `new AudioManager()` in Game, passed to Scene |
| **ECS category** | Resource (per-Application) |
| **Type** | Service + mutable state |
| **Ownership** | Application (Game) |
| **Migrate priority** | P1 |

**Migration:** AudioManager instance registered as a resource. Systems call `audio.playSound("key")` through the resource. Audio backend selection stays as-is.

---

### Clock (`time/Clock.js`)
| Detail | Value |
|---|---|
| **Current pattern** | `Game._clock` (private), `game.clock` (public) |
| **ECS category** | Resource (per-World) |
| **Type** | Service |
| **Ownership** | Game → World |
| **Migrate priority** | P0 (dt source) |

**Migration:** No change — `dt` is already passed to system `update(ctx, dt)`. Clock stays as a Game-owned resource for non-ECS use (Scene lifecycle, particles).

---

### Timer (`time/Timer.js`)
| Detail | Value |
|---|---|
| **Current pattern** | Standalone `Timer` injected into Scene |
| **ECS category** | Resource + Component |
| **Type** | Service |
| **Ownership** | Scene or entity |
| **Migrate priority** | P2 |

**Migration:** Two paths: (1) keep as plain resource for game-scope timers, (2) create `TimerComponent` + `TimerSystem` for entity-scope timers. Both coexist.

---

### State (`state/State.js`)
| Detail | Value |
|---|---|
| **Current pattern** | Module-level observable state store |
| **ECS category** | Resource (per-Application) |
| **Type** | Service |
| **Ownership** | Application |
| **Migrate priority** | P1 |

**Migration:** No change. Systems can `watch()` state but shouldn't directly couple — use component data instead.

---

### Storage (`storage/Storage.js`)
| Detail | Value |
|---|---|
| **Current pattern** | Module-level `localStorage` wrapper |
| **ECS category** | Resource (per-Application) |
| **Type** | Service |
| **Ownership** | Application |
| **Migrate priority** | P2 |

**Migration:** No change. Stateless utility service.

---

### SpatialHash (`collision/SpatialHash.js`)
| Detail | Value |
|---|---|
| **Current pattern** | Created per `_groupName` in CollisionSystem |
| **ECS category** | Resource (per-World, per-group) |
| **Type** | Mutable state |
| **Ownership** | World (map of group → SpatialHash) |
| **Migrate priority** | P0 (CollisionSystem dependency) |

**Migration:** SpatialHash instances registered as resources keyed by group name. CollisionSystem queries entity bounds and inserts into the hash.

---

### Pool / ActivePool (`memory/`)
| Detail | Value |
|---|---|
| **Current pattern** | Generic utilities, not singletons |
| **ECS category** | Not a resource |
| **Type** | Utility |
| **Ownership** | N/A |
| **Migrate priority** | — |

**Migration:** No change. Used internally by ECS core, particle engine, audio. No resource registration needed.

---

## Summary Table

| Resource | Origin | Scope | ECS Type | Migrate | Priority |
|---|---|---|---|---|---|
| `Camera` | Global singleton | World | Mutable | P0 | High |
| `InputContext` | Scene | World | Mutable | P0 | High |
| `Clock` | Game | World | Service | P0 | High |
| `SpatialHash` | CollisionSystem | World | Mutable | P0 | High |
| `AudioManager` | Game | Application | Service | P1 | Medium |
| `State` | Module | Application | Service | P1 | Medium |
| `Timer` | Module | Scene | Service | P2 | Low |
| `Storage` | Module | Application | Service | P2 | Low |
| `Pool` / `ActivePool` | Module | N/A | Utility | — | None |

## Resource Registration API

```js
const world = new World();
world.resources.set("Camera", new Camera());
world.resources.set("InputContext", inputContext);
world.resources.set("SpatialHash:default", new SpatialHash(64));
```

Systems access resources via `SystemContext`:
```js
update(ctx, dt) {
  const camera = ctx.resources.Camera;
  const input = ctx.resources.InputContext;
}
```

The `ctx.resources` object is populated by the `SystemScheduler` from the `World` resource registry before each `update()` call.
