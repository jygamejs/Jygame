// Standard button indices for the Web Gamepad API's "standard" mapping
// (https://w3c.github.io/gamepad/#remapping). Browsers expose these positions
// as gamepad.buttons[], so the indices are stable across layouts and brands.
const buttons = {
  // Face buttons
  A: 0, B: 1, X: 2, Y: 3,

  // Shoulders and triggers
  LB: 4, RB: 5,
  LT: 6, RT: 7,

  // Center cluster
  BACK: 8, START: 9, GUIDE: 10,

  // Stick press
  LSB: 11, RSB: 12,

  // D-pad
  DPAD_UP: 13, DPAD_DOWN: 14, DPAD_LEFT: 15, DPAD_RIGHT: 16,

  BUTTON_COUNT: 17,
};

// Triggers are analog buttons (LT/RT): their value ranges 0..1, and a game
// usually wants that analog strength rather than a plain on/off.
const TRIGGERS = Object.freeze(new Set([buttons.LT, buttons.RT]));

buttons.isTrigger = function (button) {
  return TRIGGERS.has(button);
};

export const GamepadButton = Object.freeze(buttons);
