# Performance Report — 2026-06-30

All 1961 tests pass, 0 failures. Suite duration: 3462ms.

## Slowest Individual Tests

### Critical (>200ms)

| Test | Time | Suite | Likely Cause |
|---|---|---|---|
| `handles 10000 entities` | **358ms** | CollisionSystem | SpatialHash insert + collision pairs O(n²) at 10k density |
| `stress test with 500 entities` | **266ms** | TrailSystem | 500 trail buffers × 500 trail points = 250k draw ops |
| `large iteration` | **221ms** | MovementSystem | Iterating 10k+ entities through ArchetypeSystem table scans |

### Slow (50–100ms)

| Test | Time | Suite | Likely Cause |
|---|---|---|---|
| `handles 1000 entities` | **86ms** | CollisionSystem | Collision pair checks + SpatialHash rebuild per frame |
| `processes 1000 entities` | **63ms** | MovementSystem | Table iteration + component access for 1k entities |
| `handles 1000 entities` | **54ms** | MovementSystem | (same as above) |
| `processes 1000 entities across multiple archetypes` | **53ms** | MovementSystem | Multi-archetype iteration overhead |
| `high-frequency update produces consistent results` | **50ms** | TrailSystem | Trail buffer append + draw at high dt resolution |
| `multiple frames keep buffer within bounds` | **50ms** | TrailSystem | (same as above, boundary variant) |

### Noticeable (20–50ms)

| Test | Time | Suite |
|---|---|---|
| `1000 entities with repeated updates` | **47ms** | MovementSystem |
| `buffer does not grow beyond maxPoints across frames` | **34ms** | TrailSystem |
| `processes 1000 entities with diverse velocities` | **32ms** | MovementSystem |
| `handles 100 entities` | **26ms** | CollisionSystem |
| `iterates 1000 entities in one archetype` | **23ms** | QueryView |
| `processes 100 entities` | **22ms** | MovementSystem |
| `handles hundreds of entities` | **21ms** | World stress |
| `create many sprites` | **19ms** | Sprite Construction |

## Observations

- **SpatialHash scales quadratically** under collision stress — 358ms for 10k entities vs 86ms for 1k (4× entities, ~4× time). Likely bottleneck is pair generation, not the index itself.
- **TrailSystem rendering dominates** at 266ms for 500 entities. The stress test likely issues 250k+ stroke/fill calls (500 trails × up to 500 points each).
- **MovementSystem** is purely arithmetic (multiply-adds) — 63ms for 1k entities suggests ArchetypeSystem iteration overhead (column lookups, table dispatch), not the math itself.
- **Hundreds of sub-1ms tests** confirm the core ECS primitives (EntityManager, Table, ComponentRegistry, QueryEngine) are extremely fast.

## Next-Step Profiling Suggestions

1. **TrailSystem `stress test with 500 entities` (266ms)** — isolate draw-call cost vs buffer-manipulation cost. Batch draws or cull offscreen trails.
2. **CollisionSystem `handles 10000 entities` (358ms)** — profile pair generation vs SpatialHash queries. Pre-filter by cell or use SAP sweep.
3. **MovementSystem `large iteration` (221ms)** — measure ArchetypeSystem iteration overhead: column lookup dispatch vs raw arithmetic.
