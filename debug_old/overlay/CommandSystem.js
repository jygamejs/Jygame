export class CommandSystem {
  constructor(session) {
    this._session = session;
    this._commands = new Map();
    this._shortcuts = new Map();
    this._listeners = new Map();

    this.register("overlay:toggle", () => session.toggle(), "`");
    this.register("panel:performance:toggle", () => this._togglePanel("performance"), "1");
    this.register("panel:timeline:toggle", () => this._togglePanel("timeline"), "2");
    this.register("panel:framegraph:toggle", () => this._togglePanel("framegraph"), "3");
    this.register("panel:metrics:toggle", () => this._togglePanel("metrics"), "4");
    this.register("panel:settings:toggle", () => this._togglePanel("settings"), "5");
    this.register("layout:reset", () => session.layout?.setRoot?.(), null);
    this.register("export:capture", (capture) => {}, null);
  }

  _togglePanel(id) {
    if (this._session.panels) this._session.panels.toggle(id);
  }

  register(name, fn, defaultShortcut) {
    this._commands.set(name, { fn, defaultShortcut });
    if (defaultShortcut != null) {
      this._shortcuts.set(defaultShortcut, name);
    }
  }

  execute(name, ...args) {
    const cmd = this._commands.get(name);
    if (!cmd) return false;
    cmd.fn(...args);
    this._emit(name, ...args);
    return true;
  }

  bindShortcut(key, commandName) {
    this._shortcuts.set(key, commandName);
  }

  resolveShortcut(key) {
    return this._shortcuts.get(key) || null;
  }

  hasCommand(name) {
    return this._commands.has(name);
  }

  on(name, fn) {
    if (!this._listeners.has(name)) this._listeners.set(name, []);
    this._listeners.get(name).push(fn);
    return () => {
      const arr = this._listeners.get(name);
      if (arr) {
        const idx = arr.indexOf(fn);
        if (idx >= 0) arr.splice(idx, 1);
      }
    };
  }

  _emit(name, ...args) {
    const arr = this._listeners.get(name);
    if (arr) arr.slice().forEach(cb => cb(...args));
  }
}
