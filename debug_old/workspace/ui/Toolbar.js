export class Toolbar {
  constructor() {
    this._actions = [];
    this._actionCbs = [];
    this._fps = 0;
    this._frame = 0;
    this._connected = false;
    this._paused = false;
    this._theme = "dark";
  }

  get fps() { return this._fps; }
  get frame() { return this._frame; }
  get connected() { return this._connected; }
  get paused() { return this._paused; }
  get theme() { return this._theme; }

  setFps(v) { this._fps = v; }
  setFrame(v) { this._frame = v; }
  setConnected(v) { this._connected = v; }
  setPaused(v) { this._paused = v; }
  setTheme(v) { this._theme = v; }

  registerAction(action) {
    this._actions.push(action);
  }

  getActions() {
    return this._actions;
  }

  trigger(id) {
    const action = this._actions.find(a => a.id === id);
    if (!action || !action.handler) return;
    action.handler();
    this._actionCbs.forEach(cb => cb(id));
  }

  onAction(cb) {
    this._actionCbs.push(cb);
  }
}
