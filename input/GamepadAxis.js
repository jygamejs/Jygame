// Axis indices for the Web Gamepad API's standard mapping. Sticks report
// -1..1 on both axes; the API's ordering is [leftX, leftY, rightX, rightY].
const axes = {
  LEFT_X: 0,
  LEFT_Y: 1,
  RIGHT_X: 2,
  RIGHT_Y: 3,

  AXIS_COUNT: 4,
};

export const GamepadAxis = Object.freeze(axes);
