export class Device {
  get type() { return this.constructor; }

  // Opens a new sampling window: current state becomes previous, and any
  // per-window deltas reset. Devices that expose edge state (justPressed,
  // justDown, ...) must implement this so the edge collapses on demand.
  //
  // update() calls it implicitly, but the game loop also calls it after every
  // fixed tick. Input is sampled once per frame while a catch-up frame can run
  // several ticks, so without that a single click would read as justPressed in
  // every tick of the frame. Devices with no state of their own — those that
  // derive from another device — can leave it a no-op.
  snapshot() {}

  update(queue) {}
}
