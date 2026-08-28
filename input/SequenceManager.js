import { doesEventMatchName } from "./EventMatcher.js";

export class SequenceManager {
  constructor(system) {
    this._system = system;
    // key -> { consumed: WeakSet<InputEvent> }
    this._states = new Map();
  }

  _attachSystem(system) {
    this._system = system;
  }

  clear() {
    this._states.clear();
  }

  _getState(key) {
    let st = this._states.get(key);
    if (!st) {
      st = { consumed: new WeakSet() };
      this._states.set(key, st);
    }
    return st;
  }

  _resolveCombo(name) {
    const system = this._system;
    if (!system || !system.contextStack) return null;
    const sorted = [...system.contextStack._contexts].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    for (const ctx of sorted) {
      if (!ctx.comboMap) continue;
      const def = ctx.comboMap.get(name);
      if (def) return { def, ctx };
    }
    return null;
  }

  /**
   * Check if a sequence is satisfied in history.
   * @param {string|string[]} seqOrName - combo name or direct array
   * @param {object} options - { within?: number, consume?: boolean }
   */
  sequence(seqOrName, options = {}) {
    const system = this._system;
    if (!system) return false;
    const history = system.historySnapshot; // already Object.freeze array
    if (!history || history.length === 0) return false;

    let sequence = null;
    let within = null;
    let consume = false;
    let key = null;

    if (typeof seqOrName === "string") {
      const resolved = this._resolveCombo(seqOrName);
      if (resolved) {
        sequence = resolved.def.sequence;
        within = resolved.def.within;
        consume = !!resolved.def.consume;
        key = `combo:${resolved.ctx.name}:${seqOrName}`;
      } else {
        // not a combo → single-step sequence of that name
        sequence = [seqOrName];
        key = `single:${seqOrName}`;
      }
    } else if (Array.isArray(seqOrName)) {
      if (seqOrName.length === 0) return false;
      sequence = seqOrName;
      key = `seq:${JSON.stringify(sequence)}`;
    } else {
      return false;
    }

    // per-call overrides
    if (options && typeof options.within === "number") {
      if (!Number.isFinite(options.within) || options.within < 0) throw new TypeError("within must be a finite number >= 0");
      within = options.within;
    }
    if (options && typeof options.consume === "boolean") {
      consume = options.consume;
    } else if (options && options.consume !== undefined) {
      if (typeof options.consume !== "boolean") throw new TypeError("consume must be boolean");
      consume = !!options.consume;
    }
    // If options.within explicitly undefined, keep combo's within

    const state = this._getState(key);
    const consumed = consume ? state.consumed : null;

    const matched = this._findMatch(sequence, history, within, consumed, system);
    if (matched) {
      if (consume) {
        for (const e of matched) consumed.add(e);
      }
      return true;
    }
    return false;
  }

  _findMatch(sequence, history, within, consumedSet, system) {
    // History may be tier-ordered; sort by timestamp to preserve monotonic order
    const sortedHistory = [...history].sort((a, b) => a.timestamp - b.timestamp);
    const n = sortedHistory.length;
    const m = sequence.length;

    const dfs = (seqIdx, histIdx, lastTime, matched) => {
      if (seqIdx === m) return matched;
      for (let i = histIdx; i < n; i++) {
        const e = sortedHistory[i];
        if (consumedSet && consumedSet.has(e)) continue;
        if (!doesEventMatchName(e, sequence[seqIdx], system)) continue;
        if (seqIdx > 0) {
          if (within != null && within !== undefined) {
            const gap = e.timestamp - lastTime;
            if (gap > within) {
              break;
            }
            if (gap < 0) continue;
          }
        }
        const res = dfs(seqIdx + 1, i + 1, e.timestamp, matched.concat([e]));
        if (res) return res;
      }
      return null;
    };

    return dfs(0, 0, 0, []);
  }
}
