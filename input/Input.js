import { InputContext } from "./InputContext.js";
import { StringResolver } from "./facade/StringResolver.js";
import { PointerFacade } from "./facade/PointerFacade.js";
import { TouchFacade } from "./facade/TouchFacade.js";
import { Mouse } from "./Mouse.js";

export { InputContext };

let _default = new InputContext();
let _system = null;
let _resolver = null;
let _pointerFacade = null;
let _touchFacade = null;

let _deprecated = {};

function deprecate(method, replacement) {
  if (!_deprecated[method]) {
    _deprecated[method] = true;
    console.warn(`Input.${method}() is deprecated. Use ${replacement} instead.`);
  }
}

function getResolver() {
  if (!_resolver) _resolver = new StringResolver(_system);
  return _resolver;
}

function getPointer() {
  if (!_pointerFacade) _pointerFacade = new PointerFacade(_system);
  return _pointerFacade;
}

function getTouch() {
  if (!_touchFacade) _touchFacade = new TouchFacade(_system);
  return _touchFacade;
}

export const Input = {
  buffer: [],

  setDefault(ctx) {
    _default = ctx;
    this.buffer = ctx.buffer;
  },

  getDefault() {
    return _default;
  },

  setSystem(system) {
    _system = system;
    _resolver = new StringResolver(system);
    _pointerFacade = new PointerFacade(system);
    _touchFacade = new TouchFacade(system);
  },

  get raw() {
    return _system ? {
      devices: _system.devices,
      contextStack: _system.contextStack,
      events: _system.events,
      backend: _system.backend,
      coordinateSystem: _system.coordinateSystem,
    } : null;
  },

  down(name) {
    const r = getResolver();
    return r.down(name);
  },

  pressed(name) {
    const r = getResolver();
    return r.pressed(name);
  },

  released(name) {
    const r = getResolver();
    return r.released(name);
  },

  value(name) {
    const r = getResolver();
    return r.value(name);
  },

  axis(name) {
    const r = getResolver();
    return r.axis(name);
  },

  bind(name, binding) {
    const r = getResolver();
    r.bind(name, binding);
  },

  unbind(name) {
    const r = getResolver();
    r.unbind(name);
  },

  addBinding(name, binding) {
    const r = getResolver();
    r.addBinding(name, binding);
  },

  removeBinding(name, binding) {
    const r = getResolver();
    r.removeBinding(name, binding);
  },

  buffer(name, ms) {
    const r = getResolver();
    r.buffer(name, ms);
  },

  bindings() {
    const r = getResolver();
    return r.bindings();
  },

  get pointer() {
    return getPointer();
  },

  get touch() {
    return getTouch();
  },

  get wheel() {
    const mouse = _system ? _system.devices.get(Mouse) : null;
    return mouse ? mouse.wheel : 0;
  },

  get wheelX() {
    const mouse = _system ? _system.devices.get(Mouse) : null;
    return mouse ? mouse.wheelHorizontal : 0;
  },

  get x() {
    deprecate("x", "Input.pointer.x");
    return getPointer().x;
  },

  get y() {
    deprecate("y", "Input.pointer.y");
    return getPointer().y;
  },

  get isPointerDown() {
    deprecate("isPointerDown", "Input.pointer.down");
    return getPointer().down;
  },

  get pointerCount() {
    deprecate("pointerCount", "Input.touch.count");
    return _default.pointerCount;
  },

  init(target) {
    deprecate("init", "the Game constructor");
    _default.init(target);
    this.buffer = _default.buffer;
  },

  destroy() {
    _default.destroy();
  },

  updateFrame() {
    _default.updateFrame();
  },

  clearJustPressed() {
    _default.clearJustPressed();
  },

  mapKey(rawKey, alias) {
    deprecate("mapKey", "Input.bind()");
    _default.mapKey(rawKey, alias);
  },

  unmapKey(rawKey) {
    deprecate("unmapKey", "Input.bind()");
    _default.unmapKey(rawKey);
  },

  setKeyMap(map) {
    deprecate("setKeyMap", "Input.bind()");
    _default.setKeyMap(map);
  },

  resetKeyMap() {
    deprecate("resetKeyMap", "Input.bind()");
    _default.resetKeyMap();
  },

  getKeyMap() {
    deprecate("getKeyMap", "Input.bindings()");
    return _default.getKeyMap();
  },

  isDown(key) {
    deprecate("isDown", "Input.down()");
    return _default.isDown(key);
  },

  justPressed(key) {
    deprecate("justPressed", "Input.pressed()");
    return _default.justPressed(key);
  },

  justReleased(key) {
    deprecate("justReleased", "Input.released()");
    return _default.justReleased(key);
  },

  consumeBuffer() {
    return _default.consumeBuffer();
  },

  peekBuffer() {
    return _default.peekBuffer();
  },

  getPointer(id) {
    deprecate("getPointer", "Input.pointer");
    return _default.getPointer(id);
  },

  getPointers() {
    deprecate("getPointers", "Input.touch.contacts");
    return _default.getPointers();
  },

  forEachPointer(fn) {
    deprecate("forEachPointer", "Input.touch.contacts");
    _default.forEachPointer(fn);
  },

  onSwipe(cb) {
    return _default.onSwipe(cb);
  },

  onTap(cb) {
    return _default.onTap(cb);
  },

  removeSwipe(cb) {
    _default.removeSwipe(cb);
  },

  removeTap(cb) {
    _default.removeTap(cb);
  },
};
