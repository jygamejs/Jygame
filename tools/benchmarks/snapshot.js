import * as fs from "node:fs";
import * as path from "node:path";

const SNAPSHOTS_DIR = path.resolve(import.meta.dirname, "snapshots");

export function saveSnapshot(results, name) {
  fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
  const snapshot = {
    meta: {
      name,
      date: new Date().toISOString(),
      node: process.version,
      platform: process.platform,
    },
    results,
  };
  const filePath = path.join(SNAPSHOTS_DIR, `${name}.json`);
  fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), "utf-8");
  return filePath;
}

export function loadSnapshot(name) {
  const filePath = name.endsWith(".json")
    ? name
    : path.join(SNAPSHOTS_DIR, `${name}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Snapshot not found: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

export function listSnapshots() {
  fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
  const entries = fs.readdirSync(SNAPSHOTS_DIR).filter(f => f.endsWith(".json"));
  return entries.map(f => {
    try {
      const snap = JSON.parse(fs.readFileSync(path.join(SNAPSHOTS_DIR, f), "utf-8"));
      return { file: f, name: snap.meta.name, date: snap.meta.date, node: snap.meta.node, results: snap.results.length };
    } catch {
      return { file: f, name: f.replace(".json", ""), date: "?", node: "?", results: 0 };
    }
  });
}

export function compareResults(current, baseline, thresholdPct = 10) {
  const baselineMap = new Map();
  for (const r of baseline.results) {
    baselineMap.set(key(r), r);
  }

  const diffs = [];

  for (const cur of current) {
    const k = key(cur);
    const base = baselineMap.get(k);
    if (!base) {
      diffs.push({ key: k, status: "NEW", current: cur, baseline: null });
      continue;
    }
    baselineMap.delete(k);

    const avgDelta = pctDiff(cur.avg_ms, base.avg_ms);
    const p95Delta = pctDiff(cur.p95_ms, base.p95_ms);
    const p99Delta = pctDiff(cur.p99_ms, base.p99_ms);
    const nsDelta = pctDiff(cur.ns_per_op, base.ns_per_op);

    const regression =
      avgDelta > thresholdPct ||
      p95Delta > thresholdPct ||
      p99Delta > thresholdPct;

    const improvement = avgDelta < -thresholdPct;

    diffs.push({
      key: k,
      status: regression ? "REGRESSION" : improvement ? "IMPROVEMENT" : "OK",
      current: cur,
      baseline: base,
      avgDelta,
      p95Delta,
      p99Delta,
      nsDelta,
    });
  }

  for (const [k, base] of baselineMap) {
    diffs.push({ key: k, status: "REMOVED", current: null, baseline: base });
  }

  diffs.sort((a, b) => a.key.localeCompare(b.key));
  return diffs;
}

export function printComparison(diffs, thresholdPct = 10) {
  let regressions = 0;
  let improvements = 0;
  let ok = 0;
  let removed = 0;
  let added = 0;

  for (const d of diffs) {
    if (d.status === "REGRESSION") regressions++;
    else if (d.status === "IMPROVEMENT") improvements++;
    else if (d.status === "OK") ok++;
    else if (d.status === "REMOVED") removed++;
    else if (d.status === "NEW") added++;
  }

  const total = diffs.length;

  if (regressions > 0) {
    console.log(`\n  ⚠  ${regressions}/${total} benchmarks REGRESSED (>${thresholdPct}% slower)\n`);
    for (const d of diffs) {
      if (d.status !== "REGRESSION") continue;
      printDiff(d);
    }
  }

  if (improvements > 0) {
    console.log(`\n  ✓  ${improvements}/${total} benchmarks IMPROVED (>${thresholdPct}% faster)\n`);
    for (const d of diffs) {
      if (d.status !== "IMPROVEMENT") continue;
      printDiff(d);
    }
  }

  if (removed > 0) {
    console.log(`\n  -  ${removed} benchmark(s) no longer present\n`);
    for (const d of diffs) {
      if (d.status !== "REMOVED") continue;
      console.log(`    ${d.key}: was ${fmtMs(d.baseline.avg_ms)} avg`);
    }
  }

  if (added > 0) {
    console.log(`\n  +  ${added} new benchmark(s)\n`);
    for (const d of diffs) {
      if (d.status !== "NEW") continue;
      console.log(`    ${d.key}: ${fmtMs(d.current.avg_ms)} avg`);
    }
  }

  if (regressions === 0 && improvements === 0 && removed === 0 && added === 0) {
    console.log(`\n  All ${ok} benchmarks within ±${thresholdPct}% of baseline.`);
  } else {
    console.log(`\n  ${ok} benchmark(s) unchanged (within ±${thresholdPct}%).`);
  }

  return { regressions, improvements, ok, removed, added, total };
}

function printDiff(d) {
  const c = d.current;
  const b = d.baseline;
  const dir = d.status === "REGRESSION" ? "↑" : "↓";
  console.log(`    ${d.key}`);
  console.log(`      avg: ${fmtMs(b.avg_ms)} → ${fmtMs(c.avg_ms)}  (${dir}${fmtPct(Math.abs(d.avgDelta))})`);
  console.log(`      p95: ${fmtMs(b.p95_ms)} → ${fmtMs(c.p95_ms)}  (${dir}${fmtPct(Math.abs(d.p95Delta))})`);
  console.log(`      p99: ${fmtMs(b.p99_ms)} → ${fmtMs(c.p99_ms)}  (${dir}${fmtPct(Math.abs(d.p99Delta))})`);
  console.log(`      ns : ${fmtNum(b.ns_per_op)} → ${fmtNum(c.ns_per_op)}  (${dir}${fmtPct(Math.abs(d.nsDelta))})`);
  console.log("");
}

function key(r) {
  const src = r.source ? `${r.source} > ` : "";
  const ec = r.entityCount ? ` (n=${r.entityCount})` : "";
  return `${src}${r.name.trim()}${ec}`;
}

function pctDiff(current, baseline) {
  if (baseline === 0) return current === 0 ? 0 : 100;
  return ((current - baseline) / baseline) * 100;
}

function fmtMs(ms) {
  if (ms < 0.01) return `${(ms * 1000).toFixed(1)} µs`;
  if (ms < 10) return `${ms.toFixed(2)} ms`;
  return `${ms.toFixed(0)} ms`;
}

function fmtPct(pct) {
  return `${pct.toFixed(1)}%`;
}

function fmtNum(n) {
  if (n < 1000) return n.toFixed(0);
  if (n < 1e6) return `${(n / 1e3).toFixed(1)}k`;
  return `${(n / 1e6).toFixed(1)}M`;
}
