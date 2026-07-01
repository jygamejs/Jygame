# Jygame Benchmark Suite

Standalone performance benchmarking framework for Jygame's ECS engine.

## Quick Start

```bash
# Run all benchmarks (1000 entities max, 20 iterations, 5 warmup)
node --expose-gc tools/benchmarks/run-all.js

# Run with custom settings
node --expose-gc tools/benchmarks/run-all.js \
  --iterations=50 \
  --warmup=10 \
  --max-entities=10000

# Run a single benchmark
node --expose-gc tools/benchmarks/run-all.js --movement
node --expose-gc tools/benchmarks/run-all.js --collision
node --expose-gc tools/benchmarks/run-all.js --render
node --expose-gc tools/benchmarks/run-all.js --trail
node --expose-gc tools/benchmarks/run-all.js --world
node --expose-gc tools/benchmarks/run-all.js --query
node --expose-gc tools/benchmarks/run-all.js --memory
node --expose-gc tools/benchmarks/run-all.js --allocation
```

## Design

### Independence

Benchmarks are **not** part of the unit test suite. They live under `tools/benchmarks/`
and are run explicitly via `node tools/benchmarks/run-all.js`. They never import or
interfere with production runtime code.

### Zero dependencies

No third-party benchmark libraries. The runner uses only Node.js built-in APIs:
`performance.now()` for timing, `process.memoryUsage()` for heap measurement.

### Determinism

- Fixed seed (42) for pseudo-random entity generation ensures reproducibility.
- Warmup iterations eliminate JIT compilation and cold-start bias.
- Configurable iteration count reduces noise via averaging.

## Warmup

The first N iterations (default 5) are executed but not timed. This allows the
JavaScript JIT compiler to optimize hot paths before measurements begin. Warmup
iterations are always discarded from statistical results.

## Metrics

Each benchmark reports:

| Metric | Description |
|--------|-------------|
| Average | Mean time per iteration (ms) |
| Min | Fastest iteration (ms) |
| Max | Slowest iteration (ms) |
| StdDev | Standard deviation (ms) — high values indicate noisy measurement |
| ops/sec | Operations per second (inverse of avg ms) |
| ns/op | Nanoseconds per operation |
| entities/sec | Throughput in entities processed per second (when applicable) |
| ns/entity | Nanoseconds per entity processed (when applicable) |

## Avoiding noisy measurements

- Close other applications during benchmark runs.
- Run with `--expose-gc` for memory benchmarks to force garbage collection.
- Use higher iteration counts (`--iterations=100`) for more stable averages.
- Watch StdDev — values above 20-30% of the mean suggest external noise.
- Run multiple times and compare across runs.

## Benchmark categories

| Category | File | What it measures |
|----------|------|-----------------|
| Movement | `movement.js` | MovementSystem update: typed array iteration and arithmetic |
| Collision | `collision.js` | SpatialHash insert + queryRect/queryCircle/queryAABB/queryPoint/raycast (measured independently) |
| Render | `render.js` | RenderSystem command generation (push only) + RenderQueue.execute() with a mocked canvas |
| Trail | `trail.js` | TrailSystem point generation + rendering (measured independently) |
| World | `world.js` | Entity lifecycle: create/destroy/addComponent/removeComponent/getComponent/setComponent/addMany/removeMany/clone/clear/archetype migration |
| Query | `query.js` | QueryEngine compilation, query execution (getTables), and QueryView iteration (forEach, entities(), rows()) across 1 and 2 archetypes |
| Memory | `memory.js` | Heap delta per entity for a 4-component entity (Transform+Velocity+Collider+Visible) |
| Allocation | `allocation.js` | Verification that hot paths produce zero new properties/objects over repeated frames |

## Adding a new benchmark

1. Create a file `tools/benchmarks/mybench.js`.
2. Export a `run(config)` function.
3. Use `benchmark(name, fn, options)` from `./runner.js`.
4. Use helpers from `./helpers.js` to create worlds, populate entities, etc.
5. Add `"mybench"` to the `benchmarks` array in `run-all.js` or add a CLI flag.

Example:

```js
import { benchmark, printResult, divider } from "./runner.js";

export function run(config) {
  divider("My Benchmark");
  const r = benchmark("my test", () => {
    // code to measure
  }, { iterations: config.iterations, warmup: config.warmup });
  printResult(r);
}
```

## File reference

| File | Purpose |
|------|---------|
| `runner.js` | Core benchmark runner: warmup, timing loop, statistics, output formatting |
| `helpers.js` | Shared setup: `createWorld()`, `populateEntities()`, `createCanvasMock()`, `addSystem()`, etc. |
| `movement.js` | Movement benchmark |
| `collision.js` | Collision/SpatialHash benchmark |
| `render.js` | RenderSystem/RenderQueue benchmark |
| `trail.js` | TrailSystem benchmark |
| `world.js` | World entity lifecycle benchmark |
| `query.js` | Query engine and view benchmark |
| `memory.js` | Memory usage benchmark |
| `allocation.js` | Allocation verification |
| `run-all.js` | Entry point — runs selected benchmarks with global config |
