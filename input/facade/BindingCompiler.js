import { ActionKind } from "../ActionKind.js";
import { ActionMap } from "../actions/ActionMap.js";
import { KeyBinding } from "../actions/KeyBinding.js";
import { ChordBinding } from "../actions/ChordBinding.js";
import { CompositeBinding } from "../actions/CompositeBinding.js";
import { resolveKeyCode } from "./KeyStrings.js";

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
      const kb = new KeyBinding(resolveKeyCode(binding));
      map.bind(name, kb, ActionKind.DIGITAL);
      return;
    }

    if (Array.isArray(binding)) {
      let first = true;
      for (const item of binding) {
        if (typeof item === "string") {
          const kb = new KeyBinding(resolveKeyCode(item));
          if (first) {
            map.bind(name, kb, ActionKind.DIGITAL);
            first = false;
          } else {
            map.addBinding(name, kb);
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
}

export function inferActionKind(binding) {
  if (typeof binding === "string") return ActionKind.DIGITAL;
  if (Array.isArray(binding)) return ActionKind.DIGITAL;
  if (binding && typeof binding === "object") {
    if (binding.up || binding.down || binding.left || binding.right) {
      return ActionKind.VECTOR2;
    }
    if (binding.key) return ActionKind.DIGITAL;
  }
  return ActionKind.DIGITAL;
}
