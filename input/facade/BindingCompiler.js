import { ActionKind } from "../ActionKind.js";
import { ActionMap } from "../actions/ActionMap.js";
import { KeyBinding } from "../actions/KeyBinding.js";
import { MouseButtonBinding } from "../actions/MouseButtonBinding.js";
import { GestureBinding } from "../actions/GestureBinding.js";
import { ChordBinding } from "../actions/ChordBinding.js";
import { CompositeBinding } from "../actions/CompositeBinding.js";
import { GamepadButtonBinding } from "../actions/GamepadButtonBinding.js";
import { GamepadAxisBinding } from "../actions/GamepadAxisBinding.js";
import { GamepadStickBinding } from "../actions/GamepadStickBinding.js";
import { GamepadButton } from "../GamepadButton.js";
import { GestureType } from "../GestureType.js";
import { resolveKeyboardIdentifier, resolveGamepadIdentifier, resolveMouseButton, resolveGesture } from "./KeyStrings.js";

export class BindingCompiler {
  constructor() {
    this._warnedNames = new Set();
  }

  compile(bindings) {
    const map = new ActionMap();
    if (!bindings) return map;

    for (const [name, binding] of Object.entries(bindings)) {
      this._compileOne(map, name, binding);
    }

    return map;
  }

  // Actions are resolved before raw device/gesture identifiers, so a name
  // like "PAD_A" or "tap" silently shadows the built-in identifier it
  // collides with. That's a deliberate rule (action-first), but it should not
  // be a silent surprise — warn once per name. A multi-character name that
  // only resolves as a logical key ("jump") is not a collision; a single
  // character ("m") is, because that is a real logical-key query.
  _warnReservedName(name) {
    if (!name || this._warnedNames.has(name)) return;
    const upper = name.toUpperCase();
    const kb = resolveKeyboardIdentifier(name);
    const reserved = (kb && kb.kind === "physical")
      || resolveGamepadIdentifier(upper)
      || resolveMouseButton(upper)
      || resolveGesture(upper)
      || (kb && kb.kind === "logical" && name.length === 1);
    if (!reserved) return;
    this._warnedNames.add(name);
    if (typeof console !== "undefined") {
      console.warn(
        `[jygame] the action "${name}" shadows the built-in input identifier "${name}". ` +
        "Actions are checked before raw device/gesture names, so queries for " +
        `"${name}" will return this action — rename it to avoid the collision.`,
      );
    }
  }

  _compileOne(map, name, binding) {
    this._warnReservedName(name);
    if (typeof binding === "string") {
      if (this._isMovementPattern(binding)) {
        this._compileVector(map, name, this._expandMovementPattern(binding));
        return;
      }
      this._compileString(map, name, binding);
      return;
    }

    if (Array.isArray(binding)) {
      const patterns = binding.filter(
        item => typeof item === "string" && this._isMovementPattern(item)
      );
      if (patterns.length > 0) {
        const merged = this._mergeMovementPatterns(
          patterns.map(p => this._expandMovementPattern(p))
        );
        this._compileVector(map, name, merged);
        return;
      }

      let first = true;
      for (const item of binding) {
        if (typeof item === "string") {
          if (first) {
            this._compileString(map, name, item);
            first = false;
          } else {
            this._compileString(map, name, item, true);
          }
        }
      }
      return;
    }

    if (typeof binding === "object" && binding !== null) {
      if (binding.up || binding.down || binding.left || binding.right) {
        this._compileVector(map, name, binding);
        return;
      }

      if (binding.key) {
        this._compileChord(map, name, binding);
        return;
      }
    }
  }

  _isMovementPattern(str) {
    const u = str.toUpperCase().replace(/[^A-Z]/g, "");
    return u === "WASD" || u === "ARROWKEYS" || u === "ARROWS"
      || u === "PADSTICK" || u === "PADSTICKS"
      || u === "PADD" || u === "PADDPAD" || u === "DPAD"
      || u === "PAD" || u === "PADMOVE";
  }

  _expandMovementPattern(str) {
    const u = str.toUpperCase().replace(/[^A-Z]/g, "");
    // WASD expands to physical codes so the shorthand keeps its
    // layout-independent meaning, exactly as before.
    if (u === "WASD") return { up: "KeyW", down: "KeyS", left: "KeyA", right: "KeyD" };
    if (u === "ARROWKEYS" || u === "ARROWS") return { up: "UP", down: "DOWN", left: "LEFT", right: "RIGHT" };
    // Gamepad: "padstick" is the left stick, "padd" is the d-pad, "pad" is
    // both. Combined with `["padstick", "padd"]`, mirroring wasd/arrowkeys.
    if (u === "PADSTICK" || u === "PADSTICKS") return { stick: "left" };
    if (u === "PADD" || u === "PADDPAD" || u === "DPAD") {
      return {
        up: "PAD_DPAD_UP",
        down: "PAD_DPAD_DOWN",
        left: "PAD_DPAD_LEFT",
        right: "PAD_DPAD_RIGHT",
      };
    }
    if (u === "PAD" || u === "PADMOVE") {
      return {
        stick: "left",
        up: "PAD_DPAD_UP",
        down: "PAD_DPAD_DOWN",
        left: "PAD_DPAD_LEFT",
        right: "PAD_DPAD_RIGHT",
      };
    }
    return null;
  }

  _mergeMovementPatterns(patterns) {
    const result = {};
    for (const p of patterns) {
      if (p.stick && !result.stick) result.stick = p.stick;
      for (const dir of ["up", "down", "left", "right"]) {
        if (p[dir]) {
          if (!result[dir]) result[dir] = [];
          result[dir] = result[dir].concat(p[dir]);
        }
      }
    }
    for (const dir of ["up", "down", "left", "right"]) {
      if (Array.isArray(result[dir]) && result[dir].length === 1) {
        result[dir] = result[dir][0];
      }
    }
    return result;
  }

  _compileVector(map, name, binding) {
    const subs = [];
    if (binding.stick) {
      subs.push({
        binding: new GamepadStickBinding(binding.stick === "right" ? "right" : "left", 0),
      });
    }
    const dirs = [
      { key: "up",    vec: [0, -1] },
      { key: "down",  vec: [0, 1] },
      { key: "left",  vec: [-1, 0] },
      { key: "right", vec: [1, 0] },
    ];
    for (const { key, vec } of dirs) {
      const val = binding[key];
      if (!val) continue;
      const items = Array.isArray(val) ? val : [val];
      for (const item of items) {
        if (typeof item !== "string") continue;
        const gpad = resolveGamepadIdentifier(item.toUpperCase());
        if (gpad) {
          if (gpad.kind === "button") {
            subs.push({ binding: new GamepadButtonBinding(gpad.button, gpad.gamepadIndex), vector: vec });
          }
          continue;
        }
        const resolved = resolveKeyboardIdentifier(item);
        if (resolved && resolved.kind === "physical") {
          subs.push({ binding: new KeyBinding(resolved.keyCode), vector: vec });
        } else if (resolved && resolved.kind === "logical") {
          subs.push({ binding: new KeyBinding(null, resolved.key), vector: vec });
        }
      }
    }
    const composite = new CompositeBinding(ActionKind.VECTOR2, subs);
    map.bind(name, composite, ActionKind.VECTOR2);
  }

  _compileChord(map, name, binding) {
    const resolved = resolveKeyboardIdentifier(binding.key);
    if (!resolved) return;
    const options = {
      ctrl: !!binding.ctrl,
      shift: !!binding.shift,
      alt: !!binding.alt,
      meta: !!binding.meta,
    };
    if (resolved.kind === "physical") {
      map.bind(name, new ChordBinding(resolved.keyCode, options), ActionKind.DIGITAL);
    } else {
      map.bind(name, new ChordBinding(null, options, resolved.key), ActionKind.DIGITAL);
    }
  }

  _compileString(map, name, str, add = false) {
    const upper = str.toUpperCase();

    const gestureInfo = resolveGesture(upper);
    if (gestureInfo) {
      this._compileGesture(map, name, gestureInfo.type, gestureInfo.options, add);
      return;
    }

    const resolved = resolveKeyboardIdentifier(str);
    if (resolved && resolved.kind === "physical") {
      const kb = new KeyBinding(resolved.keyCode);
      if (add) { map.addBinding(name, kb); }
      else { map.bind(name, kb, ActionKind.DIGITAL); }
      return;
    }

    const gpad = resolveGamepadIdentifier(upper);
    if (gpad) {
      let binding = null;
      let kind = ActionKind.DIGITAL;
      if (gpad.kind === "button") {
        binding = new GamepadButtonBinding(gpad.button, gpad.gamepadIndex);
        if (GamepadButton.isTrigger(gpad.button)) kind = ActionKind.ANALOG;
      } else if (gpad.kind === "axis") {
        binding = new GamepadAxisBinding(gpad.axis, gpad.gamepadIndex);
        kind = ActionKind.ANALOG;
      } else if (gpad.kind === "stick") {
        binding = new GamepadStickBinding(gpad.side, gpad.gamepadIndex);
        kind = ActionKind.VECTOR2;
      }
      if (binding) {
        if (add) { map.addBinding(name, binding); }
        else { map.bind(name, binding, kind); }
        return;
      }
    }

    const mb = resolveMouseButton(upper);
    if (mb !== null) {
      const mbBinding = new MouseButtonBinding(mb);
      if (add) { map.addBinding(name, mbBinding); }
      else { map.bind(name, mbBinding, ActionKind.DIGITAL); }
      return;
    }

    if (resolved && resolved.kind === "logical") {
      const kb = new KeyBinding(null, resolved.key);
      if (add) { map.addBinding(name, kb); }
      else { map.bind(name, kb, ActionKind.DIGITAL); }
    }
  }

  _compileGesture(map, name, gestureType, options, add = false) {
    const gb = new GestureBinding(gestureType, options);
    let kind = ActionKind.DIGITAL;
    if (gestureType === GestureType.PINCH) kind = ActionKind.ANALOG;
    if (gestureType === GestureType.PAN || gestureType === GestureType.DRAG) kind = ActionKind.VECTOR2;
    if (add) { map.addBinding(name, gb); }
    else { map.bind(name, gb, kind); }
  }
}

export function inferActionKind(binding) {
  if (typeof binding === "string") {
    const u = binding.toUpperCase().replace(/[^A-Z]/g, "");
    if (u === "WASD" || u === "ARROWKEYS" || u === "ARROWS"
      || u === "PADSTICK" || u === "PADSTICKS"
      || u === "PADD" || u === "PADDPAD" || u === "DPAD"
      || u === "PAD" || u === "PADMOVE") return ActionKind.VECTOR2;
    if (resolveGesture(binding.toUpperCase())) {
      const info = resolveGesture(binding.toUpperCase());
      if (info.type === GestureType.PINCH) return ActionKind.ANALOG;
      if (info.type === GestureType.PAN || info.type === GestureType.DRAG) return ActionKind.VECTOR2;
    }
    return ActionKind.DIGITAL;
  }
  if (Array.isArray(binding)) return ActionKind.DIGITAL;
  if (binding && typeof binding === "object") {
    if (binding.up || binding.down || binding.left || binding.right) {
      return ActionKind.VECTOR2;
    }
    if (binding.key) return ActionKind.DIGITAL;
  }
  return ActionKind.DIGITAL;
}
