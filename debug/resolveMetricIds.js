export function resolveMetricIds(diag, map) {
  const ids = {};
  for (const key in map) {
    const entry = map[key];
    if (typeof entry === "string") {
      const m = diag.metrics.find(entry);
      ids[key] = m ? m.id : -1;
    } else {
      ids[key] = diag.registerDynamicMetric(entry);
    }
  }
  return ids;
}
