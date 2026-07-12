export class ActionEvaluator {
  evaluate(entries, deviceRegistry) {
    for (const entry of entries) {
      let bestStrength = 0;
      let bestVector = null;

      for (const binding of entry.bindings) {
        let raw = binding.evaluate(deviceRegistry);

        for (const proc of binding.processors) {
          raw = proc.process(raw, deviceRegistry);
        }

        if (raw > bestStrength) {
          bestStrength = raw;
          if (typeof binding.vector !== "undefined" && binding.vector) {
            bestVector = binding.vector;
          }
        }
      }

      if (entry.state) {
        entry.state._update(bestStrength, bestVector);
      }
    }
  }
}
