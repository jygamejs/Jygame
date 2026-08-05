import { StringResolver } from "./facade/StringResolver.js";
import { PointerFacade } from "./facade/PointerFacade.js";
import { TouchFacade } from "./facade/TouchFacade.js";
import { GestureDispatcher } from "./GestureDispatcher.js";
import { GestureType } from "./GestureType.js";
import { Mouse } from "./Mouse.js";

// The single input facade. Everything here resolves through the InputSystem
// (devices, context stack, action maps).
//
// This used to be a hybrid: half of it delegated to a second, legacy
// InputContext that did its own DOM listening and key tracking in parallel
// with the modern system. Both ran every frame. That legacy half is gone —
// see input/actions/ for bindings and contexts.
let _system = null;
let _resolver = null;
let _pointerFacade = null;
let _touchFacade = null;
let _gestures = new GestureDispatcher(null);

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
  setSystem(system) {
    _system = system;
    _resolver = new StringResolver(system);
    _pointerFacade = new PointerFacade(system);
    _touchFacade = new TouchFacade(system);
    _gestures.setSystem(system);
  },

  getSystem() {
    return _system;
  },

  get raw() {
    return _system ? {
      devices: _system.devices,
      contextStack: _system.contextStack,
      events: _system.events,
      backend: _system.backend,
      coordinateSystem: _system.coordinateSystem,
      get actionMap() {
        const active = _system.contextStack?.active;
        return active ? active.actionMap : null;
      },
    } : null;
  },

  down(name) {
    return getResolver().down(name);
  },

  pressed(name) {
    return getResolver().pressed(name);
  },

  released(name) {
    return getResolver().released(name);
  },

  value(name) {
    return getResolver().value(name);
  },

  axis(name) {
    return getResolver().axis(name);
  },

  bind(name, binding) {
    getResolver().bind(name, binding);
  },

  unbind(name) {
    getResolver().unbind(name);
  },

  addBinding(name, binding) {
    getResolver().addBinding(name, binding);
  },

  removeBinding(name, binding) {
    getResolver().removeBinding(name, binding);
  },

  buffer(name, ms) {
    getResolver().buffer(name, ms);
  },

  bindings() {
    return getResolver().bindings();
  },

  get pointer() {
    return getPointer();
  },

  get touch() {
    return getTouch();
  },

  get gestures() {
    return _gestures;
  },

  // Callback sugar over the gesture recognizers. Both return an unsubscribe
  // function. For anything beyond tap and swipe, use Input.gestures.on(type)
  // or bind a GestureBinding through an ActionMap.
  onTap(cb) {
    return _gestures.on(GestureType.TAP, cb);
  },

  onSwipe(cb) {
    return _gestures.on(GestureType.SWIPE, cb);
  },

  removeTap(cb) {
    _gestures.off(GestureType.TAP, cb);
  },

  removeSwipe(cb) {
    _gestures.off(GestureType.SWIPE, cb);
  },

  get wheel() {
    const mouse = _system ? _system.devices.get(Mouse) : null;
    return mouse ? mouse.wheel : 0;
  },

  get wheelX() {
    const mouse = _system ? _system.devices.get(Mouse) : null;
    return mouse ? mouse.wheelHorizontal : 0;
  },
};
