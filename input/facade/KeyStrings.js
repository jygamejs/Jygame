import { KeyCode } from "../KeyCode.js";
import { MouseButton } from "../MouseButton.js";
import { GestureType } from "../GestureType.js";

const STRING_TO_KEYCODE = new Map();
const STRING_TO_MOUSE = new Map();
const STRING_TO_GESTURE = new Map();

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

addKey("UP_ARROW", KeyCode.ARROW_UP);
addKey("ARROW_UP", KeyCode.ARROW_UP);
addKey("DOWN_ARROW", KeyCode.ARROW_DOWN);
addKey("ARROW_DOWN", KeyCode.ARROW_DOWN);
addKey("LEFT_ARROW", KeyCode.ARROW_LEFT);
addKey("ARROW_LEFT", KeyCode.ARROW_LEFT);
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

export function resolveKeyCode(str) {
  if (!str) return null;
  return STRING_TO_KEYCODE.get(str.toUpperCase()) ?? null;
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
