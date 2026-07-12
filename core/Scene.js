import { Input } from "../input/Input.js";
import { Scene as EcsScene } from "../ecs/scene/Scene.js";
import { DefaultWorldBuilder } from "../ecs/bootstrap/DefaultWorldBuilder.js";
import { CanvasContext } from "../ecs/render/CanvasContext.js";
import { Camera } from "../camera/Camera.js";
import { Sprite } from "../display/Sprite.js";
import { InputContext } from "../input/actions/InputContext.js";
import { ActionMap } from "../input/actions/ActionMap.js";

export class Scene extends EcsScene {
  constructor() {
    super();
    this.dom = null;
    this.root = document.createElement("div");
    this.root.style.position = "absolute";
    this.root.style.inset = "0";
    this._cleanups = [];
    this._entered = false;
    this._exited = false;
    this._game = null;
    this.blocksUpdateBelow = true;
    this.blocksRenderBelow = false;
    this._prevDefaultWorld = null;
    this._inputContext = null;
    this._actionMap = new ActionMap();
    this._inputPriority = 0;
  }

  _createWorld() {
    return DefaultWorldBuilder.createDefault();
  }

  on(target, event, handler) {
    target.addEventListener(event, handler);
    this._cleanups.push(() => target.removeEventListener(event, handler));
  }

  onSwipe(cb) {
    this._cleanups.push(Input.onSwipe(cb));
  }

  onTap(cb) {
    this._cleanups.push(Input.onTap(cb));
  }

  cleanup(fn) {
    this._cleanups.push(fn);
  }

  enter() {
    if (this._entered) {
      throw new Error("Scene.enter() called more than once");
    }
    this._entered = true;

    this.world;

    if (!this._created) {
      this.onCreate();
      this._created = true;
    }

    if (this._game) {
      this._world.setResource(CanvasContext, this._game.ctx);

      const cam = new Camera(0, 0, this._game.width, this._game.height);
      this._world.setResource(Camera, cam);

      if (this._game.inputSystem && this._game.inputSystem.coordinateSystem) {
        this._game.inputSystem.coordinateSystem.camera = cam;
      }

      if (this._game.inputSystem && this._game.inputSystem.contextStack) {
        this._inputContext = new InputContext(
          this.constructor.name,
          this._actionMap,
          { priority: this._inputPriority },
        );
        this._game.inputSystem.contextStack.push(this._inputContext);
      }
    }

    this._prevDefaultWorld = Sprite._defaultWorld;
    Sprite._defaultWorld = this._world;

    this.onEnter();
  }

  exit() {
    if (this._exited) {
      throw new Error("Scene.exit() called more than once");
    }
    this._exited = true;

    this.onExit();

    for (const fn of this._cleanups) {
      try { fn(); } catch (err) { console.error(err); }
    }
    this._cleanups = [];

    if (this._game && this._game.inputSystem && this._game.inputSystem.contextStack) {
      if (this._inputContext) {
        this._game.inputSystem.contextStack.pop(this._inputContext.name);
        this._inputContext = null;
      }
    }

    if (Sprite._defaultWorld === this._world) {
      Sprite._defaultWorld = this._prevDefaultWorld;
    }

    if (this._world) {
      this._world.clearSystems();
      this._world.clearResources();
      this._world = null;
    }
  }

  pause() {}
  resume() {}
  update(dt) {}
  interpolate(alpha) {}
  render(ctx) {}
  renderUI() {}

  pushScene(scene) {
    if (this._game) this._game.pushScene(scene);
  }

  popScene() {
    if (this._game) this._game.popScene();
  }

  replaceScene(scene) {
    if (this._game) this._game.replaceScene(scene);
  }

  switchScene(scene) {
    if (this._game) this._game.switchScene(scene);
  }

  transitionTo(scene) {
    this.switchScene(scene);
  }
}
