import { ActionKind } from "../ActionKind.js";
import { ActionMap } from "../actions/ActionMap.js";
import { KeyBinding } from "../actions/KeyBinding.js";
import { MouseButtonBinding } from "../actions/MouseButtonBinding.js";
import { GestureBinding } from "../actions/GestureBinding.js";
import { ChordBinding } from "../actions/ChordBinding.js";
import { CompositeBinding } from "../actions/CompositeBinding.js";
import { GestureType } from "../GestureType.js";
import { resolveKeyCode, resolveMouseButton, resolveGesture } from "./KeyStrings.js";

export class BindingCompiler {
  compile(bindings) {
    const map = new ActionMap();
    if (!bindings) return map;

    for (const [name, binding] of Object.entries(bindings)) {
      this._compileOne(map, name, binding);
    }

    return map;
  }

  _compileOne(map, name, binding) {
    if (typeof binding === "string") {
      this._compileString(map, name, binding);
      return;
    }

    if (Array.isArray(binding)) {
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

  _compileVector(map, name, binding) {
    const subs = [];
    if (binding.up)    subs.push({ binding: new KeyBinding(resolveKeyCode(binding.up)),    vector: [0, -1] });
    if (binding.down)  subs.push({ binding: new KeyBinding(resolveKeyCode(binding.down)),  vector: [0, 1] });
    if (binding.left)  subs.push({ binding: new KeyBinding(resolveKeyCode(binding.left)),  vector: [-1, 0] });
    if (binding.right) subs.push({ binding: new KeyBinding(resolveKeyCode(binding.right)), vector: [1, 0] });
    const composite = new CompositeBinding(ActionKind.VECTOR2, subs);
    map.bind(name, composite, ActionKind.VECTOR2);
  }

  _compileChord(map, name, binding) {
    const keyCode = resolveKeyCode(binding.key);
    if (keyCode === null) return;
    const chord = new ChordBinding(keyCode, {
      ctrl: !!binding.ctrl,
      shift: !!binding.shift,
      alt: !!binding.alt,
      meta: !!binding.meta,
    });
    map.bind(name, chord, ActionKind.DIGITAL);
  }

  _compileString(map, name, str, add = false) {
    const upper = str.toUpperCase();

    const gestureInfo = resolveGesture(upper);
    if (gestureInfo) {
      this._compileGesture(map, name, gestureInfo.type, gestureInfo.options, add);
      return;
    }

    const kc = resolveKeyCode(upper);
    if (kc !== null) {
      const kb = new KeyBinding(kc);
      if (add) { map.addBinding(name, kb); }
      else { map.bind(name, kb, ActionKind.DIGITAL); }
      return;
    }

    const mb = resolveMouseButton(upper);
    if (mb !== null) {
      const mbBinding = new MouseButtonBinding(mb);
      if (add) { map.addBinding(name, mbBinding); }
      else { map.bind(name, mbBinding, ActionKind.DIGITAL); }
      return;
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
    const upper = binding.toUpperCase();
    if (resolveGesture(upper)) {
      const info = resolveGesture(upper);
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
