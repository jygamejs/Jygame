import { KeyCode } from "../KeyCode.js";
import { MouseButton } from "../MouseButton.js";
import { GestureType } from "../GestureType.js";
import { GamepadButton } from "../GamepadButton.js";
import { GamepadAxis } from "../GamepadAxis.js";

const STRING_TO_KEYCODE = new Map();
const STRING_TO_MOUSE = new Map();
const STRING_TO_GESTURE = new Map();
const STRING_TO_GAMEPAD_BUTTON = new Map();
const STRING_TO_GAMEPAD_STICK = new Map();
const STRING_TO_GAMEPAD_AXIS = new Map();

function addKey(str, code) {
  const upper = str.toUpperCase();
  STRING_TO_KEYCODE.set(upper, code);
}

function addMouse(str, btn) {
  const upper = str.toUpperCase();
  STRING_TO_MOUSE.set(upper, btn);
}

addKey("A", KeyCode.KEY_A);
addKey("B", KeyCode.KEY_B);
addKey("C", KeyCode.KEY_C);
addKey("D", KeyCode.KEY_D);
addKey("E", KeyCode.KEY_E);
addKey("F", KeyCode.KEY_F);
addKey("G", KeyCode.KEY_G);
addKey("H", KeyCode.KEY_H);
addKey("I", KeyCode.KEY_I);
addKey("J", KeyCode.KEY_J);
addKey("K", KeyCode.KEY_K);
addKey("L", KeyCode.KEY_L);
addKey("M", KeyCode.KEY_M);
addKey("N", KeyCode.KEY_N);
addKey("O", KeyCode.KEY_O);
addKey("P", KeyCode.KEY_P);
addKey("Q", KeyCode.KEY_Q);
addKey("R", KeyCode.KEY_R);
addKey("S", KeyCode.KEY_S);
addKey("T", KeyCode.KEY_T);
addKey("U", KeyCode.KEY_U);
addKey("V", KeyCode.KEY_V);
addKey("W", KeyCode.KEY_W);
addKey("X", KeyCode.KEY_X);
addKey("Y", KeyCode.KEY_Y);
addKey("Z", KeyCode.KEY_Z);

addKey("0", KeyCode.DIGIT_0);
addKey("1", KeyCode.DIGIT_1);
addKey("2", KeyCode.DIGIT_2);
addKey("3", KeyCode.DIGIT_3);
addKey("4", KeyCode.DIGIT_4);
addKey("5", KeyCode.DIGIT_5);
addKey("6", KeyCode.DIGIT_6);
addKey("7", KeyCode.DIGIT_7);
addKey("8", KeyCode.DIGIT_8);
addKey("9", KeyCode.DIGIT_9);

addKey("SPACE", KeyCode.SPACE);
addKey("ENTER", KeyCode.ENTER);
addKey("ESCAPE", KeyCode.ESCAPE);
addKey("TAB", KeyCode.TAB);
addKey("BACKSPACE", KeyCode.BACKSPACE);
addKey("DELETE", KeyCode.DELETE);

addKey("SHIFT", KeyCode.SHIFT_LEFT);
addKey("CTRL", KeyCode.CTRL_LEFT);
addKey("ALT", KeyCode.ALT_LEFT);
addKey("META", KeyCode.META_LEFT);

addKey("UP", KeyCode.ARROW_UP);
addKey("UP_ARROW", KeyCode.ARROW_UP);
addKey("ARROW_UP", KeyCode.ARROW_UP);
addKey("DOWN", KeyCode.ARROW_DOWN);
addKey("DOWN_ARROW", KeyCode.ARROW_DOWN);
addKey("ARROW_DOWN", KeyCode.ARROW_DOWN);
addKey("LEFT", KeyCode.ARROW_LEFT);
addKey("LEFT_ARROW", KeyCode.ARROW_LEFT);
addKey("ARROW_LEFT", KeyCode.ARROW_LEFT);
addKey("RIGHT", KeyCode.ARROW_RIGHT);
addKey("RIGHT_ARROW", KeyCode.ARROW_RIGHT);
addKey("ARROW_RIGHT", KeyCode.ARROW_RIGHT);

addKey("HOME", KeyCode.HOME);
addKey("END", KeyCode.END);
addKey("PAGE_UP", KeyCode.PAGE_UP);
addKey("PAGE_DOWN", KeyCode.PAGE_DOWN);

addKey("F1", KeyCode.F1);
addKey("F2", KeyCode.F2);
addKey("F3", KeyCode.F3);
addKey("F4", KeyCode.F4);
addKey("F5", KeyCode.F5);
addKey("F6", KeyCode.F6);
addKey("F7", KeyCode.F7);
addKey("F8", KeyCode.F8);
addKey("F9", KeyCode.F9);
addKey("F10", KeyCode.F10);
addKey("F11", KeyCode.F11);
addKey("F12", KeyCode.F12);

addKey("BACKTICK", KeyCode.BACKQUOTE);
addKey("MINUS", KeyCode.MINUS);
addKey("EQUAL", KeyCode.EQUAL);
addKey("SEMICOLON", KeyCode.SEMICOLON);
addKey("QUOTE", KeyCode.QUOTE);
addKey("COMMA", KeyCode.COMMA);
addKey("PERIOD", KeyCode.PERIOD);
addKey("SLASH", KeyCode.SLASH);
addKey("BACKSLASH", KeyCode.BACKSLASH);
addKey("BRACKET_LEFT", KeyCode.BRACKET_LEFT);
addKey("BRACKET_RIGHT", KeyCode.BRACKET_RIGHT);

// The printable punctuation characters themselves, so a binding can be written
// the way it reads (`debug: ","`) rather than only by its long name
// ("COMMA"). addKey() uppercases, which leaves these characters unchanged.
addKey("`", KeyCode.BACKQUOTE);
addKey(" ", KeyCode.SPACE);
addKey("-", KeyCode.MINUS);
addKey("=", KeyCode.EQUAL);
addKey(";", KeyCode.SEMICOLON);
addKey("'", KeyCode.QUOTE);
addKey(",", KeyCode.COMMA);
addKey(".", KeyCode.PERIOD);
addKey("/", KeyCode.SLASH);
addKey("\\", KeyCode.BACKSLASH);
addKey("[", KeyCode.BRACKET_LEFT);
addKey("]", KeyCode.BRACKET_RIGHT);

addMouse("LEFT_MOUSE", MouseButton.LEFT);
addMouse("MOUSE_LEFT", MouseButton.LEFT);
addMouse("RIGHT_MOUSE", MouseButton.RIGHT);
addMouse("MOUSE_RIGHT", MouseButton.RIGHT);
addMouse("MIDDLE_MOUSE", MouseButton.MIDDLE);
addMouse("MOUSE_MIDDLE", MouseButton.MIDDLE);
addMouse("MOUSE_BACK", MouseButton.BACK);
addMouse("MOUSE_FORWARD", MouseButton.FORWARD);

function addGesture(str, type, options = {}) {
  STRING_TO_GESTURE.set(str.toUpperCase(), { type, options });
}
addGesture("TAP", GestureType.TAP);
addGesture("DOUBLE_TAP", GestureType.DOUBLE_TAP);
addGesture("LONG_PRESS", GestureType.LONG_PRESS);
addGesture("DRAG", GestureType.DRAG);
addGesture("SWIPE", GestureType.SWIPE);
addGesture("SWIPE_LEFT", GestureType.SWIPE, { direction: "left" });
addGesture("SWIPE_RIGHT", GestureType.SWIPE, { direction: "right" });
addGesture("SWIPE_UP", GestureType.SWIPE, { direction: "up" });
addGesture("SWIPE_DOWN", GestureType.SWIPE, { direction: "down" });
addGesture("PINCH", GestureType.PINCH);
addGesture("ROTATE", GestureType.ROTATE);
addGesture("PAN", GestureType.PAN);

// ─── Gamepad ───────────────────────────────────────────────────────────────
// Buttons default to gamepad index 0. The "PAD_*" names are primary; every
// one is also accepted with a "GAMEPAD_*" prefix (PAD_A ↔ GAMEPAD_A).

function addPadButton(str, button, gamepadIndex = 0) {
  STRING_TO_GAMEPAD_BUTTON.set(str.toUpperCase(), { button, gamepadIndex });
}

addPadButton("PAD_A", GamepadButton.A);
addPadButton("PAD_B", GamepadButton.B);
addPadButton("PAD_X", GamepadButton.X);
addPadButton("PAD_Y", GamepadButton.Y);
addPadButton("PAD_LB", GamepadButton.LB);
addPadButton("PAD_RB", GamepadButton.RB);
addPadButton("PAD_LT", GamepadButton.LT);
addPadButton("PAD_RT", GamepadButton.RT);
addPadButton("PAD_BACK", GamepadButton.BACK);
addPadButton("PAD_START", GamepadButton.START);
addPadButton("PAD_GUIDE", GamepadButton.GUIDE);
addPadButton("PAD_LSB", GamepadButton.LSB);
addPadButton("PAD_RSB", GamepadButton.RSB);
addPadButton("PAD_DPAD_UP", GamepadButton.DPAD_UP);
addPadButton("PAD_DPAD_DOWN", GamepadButton.DPAD_DOWN);
addPadButton("PAD_DPAD_LEFT", GamepadButton.DPAD_LEFT);
addPadButton("PAD_DPAD_RIGHT", GamepadButton.DPAD_RIGHT);

function addPadStick(str, side, gamepadIndex = 0) {
  STRING_TO_GAMEPAD_STICK.set(str.toUpperCase(), { side, gamepadIndex });
}

addPadStick("PAD_LEFT_STICK", "left");
addPadStick("PAD_RIGHT_STICK", "right");

function addPadAxis(str, axis, gamepadIndex = 0) {
  STRING_TO_GAMEPAD_AXIS.set(str.toUpperCase(), { axis, gamepadIndex });
}

addPadAxis("PAD_LEFT_X", GamepadAxis.LEFT_X);
addPadAxis("PAD_LEFT_Y", GamepadAxis.LEFT_Y);
addPadAxis("PAD_RIGHT_X", GamepadAxis.RIGHT_X);
addPadAxis("PAD_RIGHT_Y", GamepadAxis.RIGHT_Y);

// GAMEPAD_* aliases for every PAD_* name. Iterate over a snapshot: adding
// entries to a Map while iterating it runs away (new keys are visited too).
for (const [str, info] of [...STRING_TO_GAMEPAD_BUTTON]) {
  STRING_TO_GAMEPAD_BUTTON.set("GAMEPAD_" + str.slice(4), info);
}
for (const [str, info] of [...STRING_TO_GAMEPAD_STICK]) {
  STRING_TO_GAMEPAD_STICK.set("GAMEPAD_" + str.slice(4), info);
}
for (const [str, info] of [...STRING_TO_GAMEPAD_AXIS]) {
  STRING_TO_GAMEPAD_AXIS.set("GAMEPAD_" + str.slice(4), info);
}

// Resolves a gamepad identifier to { kind, button|side|axis, gamepadIndex }.
export function resolveGamepadIdentifier(str) {
  if (!str) return null;
  const upper = str.toUpperCase();
  const btn = STRING_TO_GAMEPAD_BUTTON.get(upper);
  if (btn) return { kind: "button", ...btn };
  const stick = STRING_TO_GAMEPAD_STICK.get(upper);
  if (stick) return { kind: "stick", ...stick };
  const axis = STRING_TO_GAMEPAD_AXIS.get(upper);
  if (axis) return { kind: "axis", ...axis };
  return null;
}

export function resolveKeyCode(str) {
  if (!str) return null;
  return STRING_TO_KEYCODE.get(str.toUpperCase()) ?? null;
}

// The single keyboard-identifier resolver shared by Input.pressed / down /
// released / value. An identifier resolves to a physical key (compared
// against KeyboardEvent.code) when it is a recognised physical code, and to a
// logical key (compared against KeyboardEvent.key) otherwise.
//
// Returns { kind: "physical", keyCode } or { kind: "logical", key }, or null
// for an empty identifier. The logical branch deliberately keeps the caller's
// exact casing — KeyboardEvent.key is case-sensitive ("m" vs "M").
export function resolveKeyboardIdentifier(str) {
  if (!str) return null;

  const keyCode = KeyCode.resolveDOMCode(str);
  if (keyCode >= 0) {
    return { kind: "physical", keyCode };
  }

  // Legacy physical aliases that are not themselves KeyboardEvent.code values
  // ("UP", "ARROW_UP", "PAGE_UP", "BACKTICK", "SHIFT", ...) stay physical so
  // existing identifiers keep working. Single printable characters ("M", "W",
  // ";", "1", ...) are NOT physical aliases: they are the key values a
  // keyboard produces, so they resolve logically. This is what fixes the
  // AZERTY "M" problem without a naive startsWith("Key") check.
  const upper = str.toUpperCase();
  const alias = STRING_TO_KEYCODE.get(upper);
  if (alias !== undefined && upper.length !== 1) {
    return { kind: "physical", keyCode: alias };
  }

  return { kind: "logical", key: str };
}

export function resolveMouseButton(str) {
  if (!str) return null;
  return STRING_TO_MOUSE.get(str.toUpperCase()) ?? null;
}

export function resolveGesture(str) {
  if (!str) return null;
  return STRING_TO_GESTURE.get(str.toUpperCase()) ?? null;
}

export function isKeyName(str) {
  if (!str) return false;
  return STRING_TO_KEYCODE.has(str.toUpperCase()) || STRING_TO_MOUSE.has(str.toUpperCase());
}

export function isGestureName(str) {
  if (!str) return false;
  return STRING_TO_GESTURE.has(str.toUpperCase());
}
