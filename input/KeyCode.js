const codes = {
  // Letters A–Z (0–25)
  KEY_A: 0, KEY_B: 1, KEY_C: 2, KEY_D: 3, KEY_E: 4,
  KEY_F: 5, KEY_G: 6, KEY_H: 7, KEY_I: 8, KEY_J: 9,
  KEY_K: 10, KEY_L: 11, KEY_M: 12, KEY_N: 13, KEY_O: 14,
  KEY_P: 15, KEY_Q: 16, KEY_R: 17, KEY_S: 18, KEY_T: 19,
  KEY_U: 20, KEY_V: 21, KEY_W: 22, KEY_X: 23, KEY_Y: 24, KEY_Z: 25,

  // Digits 0–9 (26–35)
  DIGIT_0: 26, DIGIT_1: 27, DIGIT_2: 28, DIGIT_3: 29, DIGIT_4: 30,
  DIGIT_5: 31, DIGIT_6: 32, DIGIT_7: 33, DIGIT_8: 34, DIGIT_9: 35,

  // Modifiers (36–43)
  SHIFT_LEFT: 36, SHIFT_RIGHT: 37,
  CTRL_LEFT: 38, CTRL_RIGHT: 39,
  ALT_LEFT: 40, ALT_RIGHT: 41,
  META_LEFT: 42, META_RIGHT: 43,

  // Whitespace and editing (44–54)
  SPACE: 44, ENTER: 45, ESCAPE: 46, TAB: 47,
  BACKSPACE: 48, DELETE: 49,
  CAPS_LOCK: 50, NUM_LOCK: 51, SCROLL_LOCK: 52,
  PRINT_SCREEN: 53, PAUSE: 54,

  // Navigation (55–62)
  ARROW_UP: 55, ARROW_DOWN: 56, ARROW_LEFT: 57, ARROW_RIGHT: 58,
  HOME: 59, END: 60, PAGE_UP: 61, PAGE_DOWN: 62,

  // Function keys F1–F12 (63–74)
  F1: 63, F2: 64, F3: 65, F4: 66, F5: 67, F6: 68,
  F7: 69, F8: 70, F9: 71, F10: 72, F11: 73, F12: 74,

  // Symbols (75–86)
  MINUS: 75, EQUAL: 76,
  BRACKET_LEFT: 77, BRACKET_RIGHT: 78,
  SEMICOLON: 79, QUOTE: 80, BACKQUOTE: 81,
  BACKSLASH: 82, COMMA: 83, PERIOD: 84, SLASH: 85,
  INTL_BACKSLASH: 86,

  // Numpad (87–102)
  NUMPAD_0: 87, NUMPAD_1: 88, NUMPAD_2: 89, NUMPAD_3: 90, NUMPAD_4: 91,
  NUMPAD_5: 92, NUMPAD_6: 93, NUMPAD_7: 94, NUMPAD_8: 95, NUMPAD_9: 96,
  NUMPAD_ADD: 97, NUMPAD_SUBTRACT: 98,
  NUMPAD_MULTIPLY: 99, NUMPAD_DIVIDE: 100,
  NUMPAD_ENTER: 101, NUMPAD_DECIMAL: 102,

  // Other (103–114)
  CONTEXT_MENU: 103, INSERT: 104, HELP: 105, META: 106,
  HYPHEN: 107,
  VOLUME_UP: 108, VOLUME_DOWN: 109, VOLUME_MUTE: 110,
  MEDIA_PLAY_PAUSE: 111, MEDIA_STOP: 112,
  MEDIA_NEXT: 113, MEDIA_PREV: 114,

  KEY_COUNT: 115,
};

const NAME_TO_CODE = {};
for (const key of Object.keys(codes)) {
  if (key === "KEY_COUNT") continue;
  NAME_TO_CODE[key] = codes[key];
}

const DOM_TO_KEY_CODE = {
  "KeyA": codes.KEY_A, "KeyB": codes.KEY_B,
  "KeyC": codes.KEY_C, "KeyD": codes.KEY_D,
  "KeyE": codes.KEY_E, "KeyF": codes.KEY_F,
  "KeyG": codes.KEY_G, "KeyH": codes.KEY_H,
  "KeyI": codes.KEY_I, "KeyJ": codes.KEY_J,
  "KeyK": codes.KEY_K, "KeyL": codes.KEY_L,
  "KeyM": codes.KEY_M, "KeyN": codes.KEY_N,
  "KeyO": codes.KEY_O, "KeyP": codes.KEY_P,
  "KeyQ": codes.KEY_Q, "KeyR": codes.KEY_R,
  "KeyS": codes.KEY_S, "KeyT": codes.KEY_T,
  "KeyU": codes.KEY_U, "KeyV": codes.KEY_V,
  "KeyW": codes.KEY_W, "KeyX": codes.KEY_X,
  "KeyY": codes.KEY_Y, "KeyZ": codes.KEY_Z,

  "Digit0": codes.DIGIT_0, "Digit1": codes.DIGIT_1,
  "Digit2": codes.DIGIT_2, "Digit3": codes.DIGIT_3,
  "Digit4": codes.DIGIT_4, "Digit5": codes.DIGIT_5,
  "Digit6": codes.DIGIT_6, "Digit7": codes.DIGIT_7,
  "Digit8": codes.DIGIT_8, "Digit9": codes.DIGIT_9,

  "ShiftLeft": codes.SHIFT_LEFT, "ShiftRight": codes.SHIFT_RIGHT,
  "ControlLeft": codes.CTRL_LEFT, "ControlRight": codes.CTRL_RIGHT,
  "AltLeft": codes.ALT_LEFT, "AltRight": codes.ALT_RIGHT,
  "MetaLeft": codes.META_LEFT, "MetaRight": codes.META_RIGHT,

  "Space": codes.SPACE, "Enter": codes.ENTER,
  "Escape": codes.ESCAPE, "Tab": codes.TAB,
  "Backspace": codes.BACKSPACE, "Delete": codes.DELETE,
  "CapsLock": codes.CAPS_LOCK, "NumLock": codes.NUM_LOCK,
  "ScrollLock": codes.SCROLL_LOCK,
  "PrintScreen": codes.PRINT_SCREEN, "Pause": codes.PAUSE,

  "ArrowUp": codes.ARROW_UP, "ArrowDown": codes.ARROW_DOWN,
  "ArrowLeft": codes.ARROW_LEFT, "ArrowRight": codes.ARROW_RIGHT,
  "Home": codes.HOME, "End": codes.END,
  "PageUp": codes.PAGE_UP, "PageDown": codes.PAGE_DOWN,

  "F1": codes.F1, "F2": codes.F2, "F3": codes.F3,
  "F4": codes.F4, "F5": codes.F5, "F6": codes.F6,
  "F7": codes.F7, "F8": codes.F8, "F9": codes.F9,
  "F10": codes.F10, "F11": codes.F11, "F12": codes.F12,

  "Minus": codes.MINUS, "Equal": codes.EQUAL,
  "BracketLeft": codes.BRACKET_LEFT, "BracketRight": codes.BRACKET_RIGHT,
  "Semicolon": codes.SEMICOLON, "Quote": codes.QUOTE,
  "Backquote": codes.BACKQUOTE, "Backslash": codes.BACKSLASH,
  "Comma": codes.COMMA, "Period": codes.PERIOD,
  "Slash": codes.SLASH, "IntlBackslash": codes.INTL_BACKSLASH,

  "Numpad0": codes.NUMPAD_0, "Numpad1": codes.NUMPAD_1,
  "Numpad2": codes.NUMPAD_2, "Numpad3": codes.NUMPAD_3,
  "Numpad4": codes.NUMPAD_4, "Numpad5": codes.NUMPAD_5,
  "Numpad6": codes.NUMPAD_6, "Numpad7": codes.NUMPAD_7,
  "Numpad8": codes.NUMPAD_8, "Numpad9": codes.NUMPAD_9,
  "NumpadAdd": codes.NUMPAD_ADD, "NumpadSubtract": codes.NUMPAD_SUBTRACT,
  "NumpadMultiply": codes.NUMPAD_MULTIPLY, "NumpadDivide": codes.NUMPAD_DIVIDE,
  "NumpadEnter": codes.NUMPAD_ENTER, "NumpadDecimal": codes.NUMPAD_DECIMAL,

  "ContextMenu": codes.CONTEXT_MENU, "Insert": codes.INSERT,
  "Help": codes.HELP,
};

codes.fromDOMCode = function (domCode) {
  return DOM_TO_KEY_CODE[domCode] ?? -1;
};

codes.fromName = function (name) {
  return NAME_TO_CODE[name] ?? -1;
};

codes.nameOf = function (code) {
  for (const name of Object.keys(NAME_TO_CODE)) {
    if (NAME_TO_CODE[name] === code) return name;
  }
  return null;
};

export const KeyCode = Object.freeze(codes);
