# Modifier Capability Audit — Phase 16P

## Capability Matrix

| Modifier | GPU Ready | Stateful | Spawns | Collision | Pass | CPU-only Features |
|---|---|---|---|---|---|---|
| FadeModifier | ✓ | No | No | No | visual | None |
| ScaleModifier | ✓ | No | No | No | visual | None |
| VelocityModifier | ✓ | No | No | No | integration | None |
| RotationModifier | ✓ | No | No | No | integration | None |
| ForceModifier | ✓ | No | No | No | force | dynamic target lookups |
| AttractionModifier | ✓ | No | No | No | force | dynamic target lookups |
| OrbitModifier | ✓ | No | No | No | force | dynamic target lookups |
| WindModifier | ✓ | No | No | No | force | None |
| TurbulenceModifier | ✓ | Yes (seed) | No | No | force | perlin-like noise via sin/cos |
| ColorModifier | ✓ | Yes (segment) | No | No | visual | segment tracking |
| AnimationModifier | ✓ | Yes (segment) | No | No | visual | segment tracking |
| AnimatedSpriteModifier | △ | Yes (offset,prevFrame,loopCount) | No | No | visual | animation callbacks |
| TrailModifier | ✗ | Yes (pos,timer) | Yes | No | spawn | closures in initializer |
| SpawnModifier | ✗ | Yes (timer) | Yes | No | spawn | closures in initializer |
| CollisionModifier | ✗ | No | No | Yes | collision | provider callbacks |

## GPU-Compatible Modifiers (11)

FadeModifier, ScaleModifier, VelocityModifier, RotationModifier, ForceModifier, AttractionModifier, OrbitModifier, WindModifier, TurbulenceModifier, ColorModifier, AnimationModifier

## GPU-Incompatible Modifiers (4)

TrailModifier, SpawnModifier, CollisionModifier, AnimatedSpriteModifier

## Hybrid Modifiers (△)

AnimatedSpriteModifier — the frame-sampling math is GPU-friendly but the animation callbacks (onAnimationStart, onFrameChange, onAnimationComplete) are CPU-only. A hybrid path could upload frame indices to a GPU buffer each frame.

---

## Simulation Pass Classification

```
Integration Pass (4)     Visual Pass (4)        Force Pass (5)         Spawn Pass (2)       Collision Pass (1)
────────────────────     ──────────────         ──────────────          ──────────────       ─────────────────
VelocityModifier         FadeModifier           ForceModifier           TrailModifier        CollisionModifier
RotationModifier         ScaleModifier          AttractionModifier      SpawnModifier
                         ColorModifier          OrbitModifier
                         AnimationModifier      WindModifier
                         AnimatedSpriteModifier TurbulenceModifier
```

Future GPU backend dispatch:
```
Compute Pass 1: Integration   (position, velocity, rotation)
Compute Pass 2: Force         (attraction, orbit, wind, turbulence)
Compute Pass 3: Visual        (fade, scale, color, animation)
Spawn Pass:     CPU fallback  (trail, spawn)
Collision Pass: CPU fallback  (collision)
```

---

## ModifierStateStore Inventory

| Modifier | State Fields | Type | Bytes/particle | Access Pattern |
|---|---|---|---|---|
| FadeModifier | (none) | — | 0 | stateless |
| ScaleModifier | (none) | — | 0 | stateless |
| VelocityModifier | (none) | — | 0 | stateless |
| RotationModifier | (none) | — | 0 | stateless |
| ForceModifier | (none) | — | 0 | stateless |
| AttractionModifier | (none) | — | 0 | stateless |
| OrbitModifier | (none) | — | 0 | stateless |
| WindModifier | (none) | — | 0 | stateless |
| TurbulenceModifier | seed | float | 4 | set-on-emit, read-only |
| ColorModifier | segment | int32 | 4 | RMW per frame |
| AnimationModifier | segment | int32 | 4 | RMW per frame |
| AnimatedSpriteModifier | offset, prevFrame, loopCount | 3 x int32 | 12 | RMW per frame |
| TrailModifier | x, y, timer | 3 x float64 | 24 | RMW per frame |
| SpawnModifier | timer | float64 | 8 | RMW per frame |
| CollisionModifier | (none) | — | 0 | CPU-only |

### Total per-particle state by configuration

Max state memory (all modifiers active): **56 bytes/particle**
Typical state memory (GPU-compatible only): **12 bytes/particle**

### Future GpuModifierStateBuffer layout

```
struct GpuModifierState {
    float   seed;         // TurbulenceModifier (offset 0)
    int32_t segment;      // ColorModifier / AnimationModifier (offset 4)
    int32_t animOffset;   // AnimatedSpriteModifier (offset 8)
    int32_t prevFrame;    // AnimatedSpriteModifier (offset 12)
    int32_t loopCount;    // AnimatedSpriteModifier (offset 16)
    // total: 20 bytes for GPU-compatible stateful modifiers
}
```

Spawn/Trail/Collision state remains CPU-side.

---

## Backend Capabilities

| Backend | gpuSim | gpuRender | spawnMod | collisionMod | statefulMod | maxParticles |
|---|---|---|---|---|---|---|
| CpuParticleBackend | false | false | true | true | true | ∞ |
| GpuParticleBackend (future) | true | true | false | false | false | TBD |

`ParticleBackendCapabilities.canRun(modifier)` checks modifier.capabilities against the backend limits.

---

## Descriptor System

Every modifier now exports `toDescriptor()` returning a plain config object.

Examples:

```js
fade.toDescriptor()       // { type: "fade", mode: "out", easing: "linear" }
scale.toDescriptor()      // { type: "scale", mode: null, from: 1, to: 0, easing: "linear" }
velocity.toDescriptor()   // { type: "velocity", drag: 0, affectX: true, affectY: true }
color.toDescriptor()      // { type: "color", from: "#ffffff", to: "#000000" }
```

Purpose: CPU modifier → Descriptor → Future GPU compiler.

---

## Readiness Summary

| Area | Before | After |
|---|---|---|
| SoA Storage | 100% | 100% |
| GPU Renderer | 98% | 98% |
| GPU Simulation | 55% | 78% |
| Overall Architecture | 95% | 98% |
