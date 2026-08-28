import { EventType } from "./EventType.js";
import { KeyCode } from "./KeyCode.js";
import { resolveKeyboardIdentifier, resolveGamepadIdentifier, resolveMouseButton } from "./facade/KeyStrings.js";

/**
 * Does a normalized InputEvent match a semantic name as an action or raw identifier?
 * Uses the same priority as StringResolver: action (via bindings) first, then raw.
 */

function isKeyboardPress(e) {
  return e.type === EventType.KEY_DOWN && !e.data.repeat && e.device === "keyboard";
}

function keyBindingMatchesEvent(binding, e) {
  if (e.type !== EventType.KEY_DOWN || e.data.repeat) return false;
  if (e.device !== "keyboard") return false;
  if (binding.isLogical) return e.data.key === binding.key;
  const code = KeyCode.fromDOMCode(e.data.code);
  return code === binding.keyCode;
}
function chordMatchesEvent(binding, e) {
  if (e.type !== EventType.KEY_DOWN || e.data.repeat) return false;
  if (e.device !== "keyboard") return false;
  if (binding._ctrl && !e.data.ctrl) return false;
  if (binding._shift && !e.data.shift) return false;
  if (binding._alt && !e.data.alt) return false;
  if (binding._meta && !e.data.meta) return false;
  if (binding.isLogical) return e.data.key === binding.key;
  const code = KeyCode.fromDOMCode(e.data.code);
  return code === binding.keyCode;
}
function gamepadButtonMatchesEvent(binding, e) {
  if (e.type !== EventType.GAMEPAD_BUTTON_DOWN) return false;
  return e.data.button === binding.button && (e.data.gamepadIndex ?? 0) === binding.gamepadIndex;
}
function mouseButtonMatchesEvent(binding, e) {
  if (e.type !== EventType.POINTER_DOWN) return false;
  return e.data.button === binding.button;
}
function bindingMatchesEvent(binding, e) {
  const t = binding.type;
  if (t === "key") return keyBindingMatchesEvent(binding, e);
  if (t === "chord") return chordMatchesEvent(binding, e);
  if (t === "gamepadButton") return gamepadButtonMatchesEvent(binding, e);
  if (t === "mouseButton") return mouseButtonMatchesEvent(binding, e);
  if (t === "composite") {
    for (const sb of binding.subBindings) {
      if (bindingMatchesEvent(sb.binding, e)) return true;
    }
    return false;
  }
  return false;
}

function eventMatchesRawIdentifier(e, name) {
  const upper = name.toUpperCase();
  const kbResolved = resolveKeyboardIdentifier(name);
  if (kbResolved && kbResolved.kind === "physical") {
    if (!isKeyboardPress(e)) return false;
    const code = KeyCode.fromDOMCode(e.data.code);
    return code === kbResolved.keyCode;
  }
  const gpad = resolveGamepadIdentifier(upper);
  if (gpad) {
    if (gpad.kind === "button") {
      return e.type === EventType.GAMEPAD_BUTTON_DOWN && e.data.button === gpad.button && (e.data.gamepadIndex ?? 0) === gpad.gamepadIndex;
    }
    return false;
  }
  const mb = resolveMouseButton(upper);
  if (mb !== null) {
    return e.type === EventType.POINTER_DOWN && e.data.button === mb;
  }
  if (kbResolved) {
    if (!isKeyboardPress(e)) return false;
    return e.data.key === kbResolved.key;
  }
  return false;
}

export function doesEventMatchName(event, name, system) {
  if (!system || !name) return false;
  const stack = system.contextStack;
  if (stack) {
    const sorted = [...stack._contexts].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    for (const ctx of sorted) {
      const state = ctx.actionMap.getState(name);
      if (state) {
        const bindings = ctx.actionMap.getBindings(name);
        for (const b of bindings) {
          if (bindingMatchesEvent(b, event)) return true;
        }
        // Action exists but no binding matched this event → not a match for this name
        return false;
      }
    }
  }
  // No action → try raw
  return eventMatchesRawIdentifier(event, name);
}
