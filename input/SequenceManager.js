import { doesEventMatchName } from "./EventMatcher.js";
import { isMatcher } from "./Matcher.js";

export class SequenceManager {
  constructor(system) {
    this._system = system;
    // key -> { consumed: WeakSet<InputEvent> }
    this._states = new Map();
    // matcher instance -> id for key generation
    this._matcherIds = new WeakMap();
    this._nextMatcherId = 1;
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

  _matcherId(m) {
    let id = this._matcherIds.get(m);
    if (!id) {
      id = this._nextMatcherId++;
      this._matcherIds.set(m, id);
    }
    return id;
  }

  _sequenceKey(sequence) {
    // For sequences containing matchers, key must incorporate matcher identity
    return sequence.map(el => {
      if (isMatcher(el)) return `m:${this._matcherId(el)}`;
      return `s:${String(el)}`;
    }).join("|");
  }

  _enrichEvent(event) {
    const system = this._system;
    // Compute matching actions for this event under current context
    const actions = [];
    if (system && system.contextStack) {
      const sorted = [...system.contextStack._contexts].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
      const seen = new Set();
      for (const ctx of sorted) {
        for (const entry of ctx.actionMap.entries()) {
          if (seen.has(entry.name)) continue;
          seen.add(entry.name);
          if (doesEventMatchName(event, entry.name, system)) {
            actions.push(entry.name);
          }
        }
      }
    }
    const primary = actions[0] || null;
    // Build enriched view; keep original fields plus helpers
    const enriched = {
      type: event.type,
      device: event.device,
      timestamp: event.timestamp,
      data: event.data,
      action: primary,
      name: primary,
      actions,
      // helper to test arbitrary name against this historical event
      matches: (name) => doesEventMatchName(event, name, system),
      // reference to raw event
      _raw: event,
    };
    return enriched;
  }

  _matchesStep(event, step) {
    if (isMatcher(step)) {
      const enriched = this._enrichEvent(event);
      // predicate receives enriched event; allow error to propagate
      return !!step.predicate(enriched);
    }
    return doesEventMatchName(event, step, this._system);
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
      // Validate elements: string or matcher (before history check so invalid throws even when empty)
      for (const el of seqOrName) {
        if (typeof el !== "string" && !isMatcher(el)) {
          throw new TypeError("sequence elements must be strings or Input.match() matchers");
        }
      }
      sequence = seqOrName;
      key = `seq:${this._sequenceKey(sequence)}`;
    } else {
      return false;
    }

    const history = system.historySnapshot; // already Object.freeze array
    if (!history || history.length === 0) return false;

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
    const sortedHistory = [...history].sort((a, b) => a.timestamp - b.timestamp);
    const n = sortedHistory.length;
    const m = sequence.length;

    const dfs = (seqIdx, histIdx, lastTime, matched) => {
      if (seqIdx === m) return matched;
      for (let i = histIdx; i < n; i++) {
        const e = sortedHistory[i];
        if (consumedSet && consumedSet.has(e)) continue;
        const step = sequence[seqIdx];
        let ok = false;
        if (isMatcher(step)) {
          const enriched = this._enrichEvent(e);
          ok = !!step.predicate(enriched);
        } else {
          ok = doesEventMatchName(e, step, system);
        }
        if (!ok) continue;
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
