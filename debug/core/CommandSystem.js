export class CommandSystem {
  constructor() {
    this._commands = new Map();
    this._shortcuts = new Map();
    this._listeners = new Map();
  }

  register(name, fn, shortcut) {
    if (this._commands.has(name)) {
      throw new Error(`Command "${name}" is already registered`);
    }
    this._commands.set(name, { fn, shortcut });
    if (shortcut != null) {
      this._shortcuts.set(shortcut, name);
    }
  }

  execute(name, ...args) {
    const cmd = this._commands.get(name);
    if (!cmd) return false;
    cmd.fn(...args);
    this._emit("afterExecute", { name });
    return true;
  }

  resolveShortcut(key) {
    return this._shortcuts.get(key) ?? null;
  }

  bindShortcut(key, commandName) {
    this._shortcuts.set(key, commandName);
  }

  hasCommand(name) {
    return this._commands.has(name);
  }

  on(event, fn) {
    if (!this._listeners.has(event)) this._listeners.set(event, []);
    this._listeners.get(event).push(fn);
    return () => this.off(event, fn);
  }

  off(event, fn) {
    const arr = this._listeners.get(event);
    if (!arr) return;
    const idx = arr.indexOf(fn);
    if (idx >= 0) arr.splice(idx, 1);
  }

  _emit(event, data) {
    const arr = this._listeners.get(event);
    if (arr) arr.slice().forEach(cb => cb(data));
  }
}
