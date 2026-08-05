import { System } from "../core/System.js";
import { Transform } from "../components/Transform.js";

export class SavePrevPositionSystem extends System {
  static query = { all: [Transform] };
  static priority = -10;

  update(ctx, dt) {
    const tid = this._compiled.componentIds.get(Transform);
    if (tid === undefined) return;

    const tables = ctx.tables();
    for (let i = 0; i < tables.length; i++) {
      const table = tables[i];
      const count = table.count;
      if (count === 0) continue;

      const x = table.getColumn(tid, "x");
      const y = table.getColumn(tid, "y");
      const prevX = table.getColumn(tid, "_prevX");
      const prevY = table.getColumn(tid, "_prevY");
      const valid = table.getColumn(tid, "_interpValid");
      if (!x || !y || !prevX || !prevY) continue;

      for (let r = 0; r < count; r++) {
        prevX[r] = x[r];
        prevY[r] = y[r];
      }

      // Once prev holds a real position, the row is safe to interpolate.
      if (valid) valid.fill(1, 0, count);
    }
  }
}
