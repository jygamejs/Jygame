import { Game } from "./Game.js";
import { Scene } from "./Scene.js";
import { Sprite } from "../display/Sprite.js";
import { Group } from "../display/Group.js";
import { Trail } from "../display/Trail.js";
import { Camera } from "../view/Camera.js";
import { View } from "../view/View.js";
import { Viewport } from "../view/Viewport.js";
import { Image } from "../loaders/Image.js";
import { Audio } from "../loaders/Audio.js";
import { Font } from "../loaders/Font.js";
import { Input } from "../input/Input.js";
import { Particle } from "../display/Particle.js";
import { ParticleSystem } from "../particles/ParticleSystem.js";
import { ParticleEmitter } from "../particles/ParticleEmitter.js";
import { ParticleEffect } from "../particles/ParticleEffect.js";
import { RectangleShape } from "../shapes/RectangleShape.js";
import { CircleShape } from "../shapes/CircleShape.js";
import { RingShape } from "../shapes/RingShape.js";
import { LineShape } from "../shapes/LineShape.js";
import { ConeShape } from "../shapes/ConeShape.js";
import { PolygonShape } from "../shapes/PolygonShape.js";
import { PathShape } from "../shapes/PathShape.js";
import { SplineShape } from "../shapes/SplineShape.js";
import { FadeModifier } from "../modifiers/FadeModifier.js";
import { ScaleModifier } from "../modifiers/ScaleModifier.js";
import { VelocityModifier } from "../modifiers/VelocityModifier.js";
import { ColorModifier } from "../modifiers/ColorModifier.js";
import { RotationModifier } from "../modifiers/RotationModifier.js";
import { AnimationModifier } from "../modifiers/AnimationModifier.js";
import { AnimatedSpriteModifier } from "../modifiers/AnimatedSpriteModifier.js";
import { WindModifier } from "../modifiers/WindModifier.js";
import { TurbulenceModifier } from "../modifiers/TurbulenceModifier.js";
import { ForceModifier } from "../modifiers/ForceModifier.js";
import { AttractionModifier } from "../modifiers/AttractionModifier.js";
import { OrbitModifier } from "../modifiers/OrbitModifier.js";
import { SpawnModifier } from "../modifiers/SpawnModifier.js";
import { TrailModifier } from "../modifiers/TrailModifier.js";
import { CollisionModifier } from "../modifiers/CollisionModifier.js";
import { Color, Colors } from "../color/Colors.js";
import { Palettes } from "../color/Palettes.js";
import { Vec2 } from "../math/Vec2.js";
import { Rect } from "../geometry/Rect.js";
import { Timer } from "../time/Timer.js";
import { State } from "../state/State.js";

// The curated public surface exposed as globals after `jy(options)`.
// This is intentionally a subset of the full module API: the classes a
// game actually builds with. Lower-level pieces (ECS internals, input
// devices, debug tooling, renderers) remain importable from "jygame".
const API = {
  // Engine
  Game,
  Scene,

  // Rendering
  Sprite,
  Group,
  Trail,
  Camera,
  View,
  Viewport,

  // Assets
  Image,
  Audio,
  Font,

  // Input
  Input,

  // Particles
  Particle,
  ParticleSystem,
  ParticleEmitter,
  ParticleEffect,

  // Emitter shapes
  RectangleShape,
  CircleShape,
  RingShape,
  LineShape,
  ConeShape,
  PolygonShape,
  PathShape,
  SplineShape,

  // Particle modifiers
  FadeModifier,
  ScaleModifier,
  VelocityModifier,
  ColorModifier,
  RotationModifier,
  AnimationModifier,
  AnimatedSpriteModifier,
  WindModifier,
  TurbulenceModifier,
  ForceModifier,
  AttractionModifier,
  OrbitModifier,
  SpawnModifier,
  TrailModifier,
  CollisionModifier,

  // Math
  Vec2,
  Rect,
  Color,
  Colors,
  Palettes,

  // Utilities
  Timer,
  State,
};

export function installGlobals(api = API, target = globalThis) {
  const installed = [];
  for (const [name, value] of Object.entries(api)) {
    const had = Object.prototype.hasOwnProperty.call(target, name);
    const prev = target[name];
    target[name] = value;
    installed.push({ name, had, prev });
  }
  return installed;
}

export function uninstallGlobals(installed, target = globalThis) {
  for (let i = installed.length - 1; i >= 0; i--) {
    const { name, had, prev } = installed[i];
    if (had) {
      target[name] = prev;
    } else {
      delete target[name];
    }
  }
}

let defaultRuntime = null;

export class Runtime {
  constructor(options = {}) {
    this.options = options;
    this.globals = options.globals !== false;
    this.game = null;
    this._installedGlobals = null;
  }

  init() {
    const { globals, ...gameOptions } = this.options;
    this.game = new Game(gameOptions);
    if (this.globals) {
      this._installedGlobals = installGlobals(API);
    }
    return this;
  }

  get scene() {
    return this.game ? this.game.scene : null;
  }

  run(scene) {
    this._requireGame().run(scene);
  }

  pushScene(scene) {
    this._requireGame().pushScene(scene);
  }

  popScene() {
    this._requireGame().popScene();
  }

  replaceScene(scene) {
    this._requireGame().replaceScene(scene);
  }

  switchScene(scene) {
    this._requireGame().switchScene(scene);
  }

  peekScene() {
    return this._requireGame().peekScene();
  }

  resize(width, height) {
    this._requireGame().resize(width, height);
  }

  pause() {
    this._requireGame().pause();
  }

  resume() {
    this._requireGame().resume();
  }

  togglePause() {
    this._requireGame().togglePause();
  }

  destroy() {
    if (this.game) {
      this.game.destroy();
      this.game = null;
    }
    if (this.globals && this._installedGlobals) {
      uninstallGlobals(this._installedGlobals);
      this._installedGlobals = null;
    }
    if (defaultRuntime === this) defaultRuntime = null;
  }

  _requireGame() {
    if (!this.game) {
      throw new Error("Runtime has been destroyed. Call jy() again to create a new runtime.");
    }
    return this.game;
  }
}

export function jy(options = {}) {
  const opts = { ...options };
  if (opts.globals === undefined) opts.globals = true;

  if (defaultRuntime) defaultRuntime.destroy();
  defaultRuntime = new Runtime(opts).init();
  return defaultRuntime;
}

jy.createRuntime = function createRuntime(options = {}) {
  const opts = { ...options };
  if (opts.globals === undefined) opts.globals = false;
  return new Runtime(opts).init();
};

Object.defineProperty(jy, "game", {
  get() {
    return defaultRuntime ? defaultRuntime.game : null;
  },
  enumerable: true,
  configurable: true,
});

Object.defineProperty(jy, "runtime", {
  get() {
    return defaultRuntime;
  },
  enumerable: true,
  configurable: true,
});

const DELEGATED = [
  "run",
  "pushScene",
  "popScene",
  "replaceScene",
  "switchScene",
  "peekScene",
  "resize",
  "pause",
  "resume",
  "togglePause",
  "destroy",
];

for (const name of DELEGATED) {
  jy[name] = function (...args) {
    const runtime = defaultRuntime;
    if (!runtime) {
      throw new Error(
        `jy.${name}(): the jygame runtime is not initialized. Call jy(options) first.`,
      );
    }
    return runtime[name](...args);
  };
}

export default jy;
