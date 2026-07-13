export function resolveMetricIds(diag, map, options = {}) {
  const ids = {};
  const descriptors = {};
  for (const key in map) {
    const entry = map[key];
    if (typeof entry === "string") {
      const m = diag.metrics.find(entry);
      ids[key] = m ? m.id : -1;
      descriptors[key] = m || null;
    } else {
      const id = diag.registerDynamicMetric(entry);
      const desc = diag.metrics.get(id);
      ids[key] = id;
      descriptors[key] = desc || null;
    }
  }
  if (options.descriptors) {
    return { ids, descriptors };
  }
  return ids;
}
