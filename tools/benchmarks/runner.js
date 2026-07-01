import { performance } from "node:perf_hooks";
import * as fs from "node:fs";
import * as path from "node:path";

const DEFAULTS = {
  iterations: 100,
  warmup: 20,
};

const CSV_HEADER = "name,iterations,warmup,avg_ms,min_ms,max_ms,stddev_ms,p50_ms,p95_ms,p99_ms,ops_per_sec,ns_per_op,variance_flag\n";

let _csvRows = [];
let _csvPath = null;
let _results = [];
let _collecting = false;
let _benchmarkSource = null;

export function setCsvExport(filePath) {
  _csvPath = filePath;
  _csvRows = [CSV_HEADER];
}

export function writeCsv() {
  if (!_csvPath || _csvRows.length <= 1) return;
  fs.writeFileSync(_csvPath, _csvRows.join(""), "utf-8");
}

export function startCollecting() {
  _results = [];
  _collecting = true;
  _benchmarkSource = null;
}

export function stopCollecting() {
  _collecting = false;
  return _results;
}

export function getResults() {
  return _results;
}

export function clearResults() {
  _results = [];
}

export function setBenchmarkSource(source) {
  _benchmarkSource = source;
}

export function benchmark(name, fn, options = {}) {
  const { iterations, warmup, entityCount } = { ...DEFAULTS, ...options };

  for (let i = 0; i < warmup; i++) {
    fn();
  }

  const times = new Float64Array(iterations);
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    times[i] = performance.now() - start;
  }

  const avg = average(times);
  const stddev = stdDev(times, avg);
  const sorted = sortAsc(times);
  const p50 = percentile(sorted, 50);
  const p95 = percentile(sorted, 95);
  const p99 = percentile(sorted, 99);
  const varianceRatio = stddev / (avg || 1);
  const highVariance = varianceRatio > 1.0;

  const result = {
    name,
    iterations,
    warmup,
    avg,
    min: min(times),
    max: max(times),
    stddev,
    p50,
    p95,
    p99,
    opsPerSec: 1000 / avg,
    nsPerOp: avg * 1e6,
    varianceRatio,
    highVariance,
    _raw: times,
  };

  if (_csvPath) {
    const flag = highVariance ? "HIGH" : "OK";
    _csvRows.push(
      `${escapeCsv(name)},${iterations},${warmup},${avg.toFixed(4)},${result.min.toFixed(4)},${result.max.toFixed(4)},${stddev.toFixed(4)},${p50.toFixed(4)},${p95.toFixed(4)},${p99.toFixed(4)},${result.opsPerSec.toFixed(2)},${result.nsPerOp.toFixed(0)},${flag}\n`
    );
  }

  if (_collecting) {
    _results.push({
      source: _benchmarkSource,
      name,
      entityCount: entityCount ?? null,
      iterations,
      warmup,
      avg_ms: avg,
      min_ms: result.min,
      max_ms: result.max,
      stddev_ms: stddev,
      p50_ms: p50,
      p95_ms: p95,
      p99_ms: p99,
      ops_per_sec: result.opsPerSec,
      ns_per_op: result.nsPerOp,
      variance_ratio: varianceRatio,
      high_variance: highVariance,
    });
  }

  return result;
}

export function formatResult(r, { entityCount } = {}) {
  const lines = [];
  if (r.highVariance) lines.push(`  ⚠ HIGH VARIANCE (ratio=${r.varianceRatio.toFixed(2)})`);
  if (r.name) lines.push(r.name);
  if (entityCount !== undefined) lines.push(`  Entities: ${entityCount.toLocaleString()}`);
  lines.push(`  Iterations: ${r.iterations}`);
  lines.push(`  Warmup: ${r.warmup}`);
  lines.push("");
  lines.push(`  Average: ${r.avg.toFixed(2)} ms`);
  lines.push(`  Min: ${r.min.toFixed(2)} ms`);
  lines.push(`  Max: ${r.max.toFixed(2)} ms`);
  lines.push(`  StdDev: ${r.stddev.toFixed(2)} ms`);
  lines.push(`  P50: ${r.p50.toFixed(2)} ms`);
  lines.push(`  P95: ${r.p95.toFixed(2)} ms`);
  lines.push(`  P99: ${r.p99.toFixed(2)} ms`);
  lines.push("");
  lines.push(`  ${Math.round(r.opsPerSec).toLocaleString()} ops/sec`);
  lines.push(`  ${Math.round(r.nsPerOp).toLocaleString()} ns/op`);
  if (entityCount !== undefined) {
    const entitiesPerSec = (entityCount * 1000) / r.avg;
    const nsPerEntity = (r.avg * 1e6) / entityCount;
    lines.push(`  ${Math.round(entitiesPerSec).toLocaleString()} entities/sec`);
    lines.push(`  ${Math.round(nsPerEntity).toLocaleString()} ns/entity`);
  }
  return lines.join("\n");
}

export function printResult(r, { entityCount } = {}) {
  console.log(formatResult(r, { entityCount }));
  console.log("");
}

export function divider(title) {
  const line = "=".repeat(title ? 0 : 50);
  if (title) {
    console.log("");
    console.log(line);
    console.log(title);
    console.log(line);
    console.log("");
  } else {
    console.log(line);
    console.log("");
  }
}

function sortAsc(arr) {
  const copy = new Float64Array(arr);
  copy.sort();
  return copy;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

function average(arr) {
  let sum = 0;
  for (let i = 0; i < arr.length; i++) sum += arr[i];
  return sum / arr.length;
}

function min(arr) {
  let m = arr[0];
  for (let i = 1; i < arr.length; i++) if (arr[i] < m) m = arr[i];
  return m;
}

function max(arr) {
  let m = arr[0];
  for (let i = 1; i < arr.length; i++) if (arr[i] > m) m = arr[i];
  return m;
}

function stdDev(arr, mean) {
  let sumSq = 0;
  for (let i = 0; i < arr.length; i++) {
    const d = arr[i] - mean;
    sumSq += d * d;
  }
  return Math.sqrt(sumSq / arr.length);
}

function escapeCsv(v) {
  if (v.includes(",") || v.includes('"') || v.includes("\n")) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}
