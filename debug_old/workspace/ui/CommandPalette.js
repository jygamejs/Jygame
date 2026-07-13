export class CommandPalette {
  constructor(commandSystem) {
    this._commands = commandSystem;
    this._open = false;
    this._query = "";
    this._results = [];
    this._selectedIndex = -1;
  }

  get isOpen() { return this._open; }
  get query() { return this._query; }
  get results() { return this._results; }
  get selectedIndex() { return this._selectedIndex; }

  open() {
    this._open = true;
    this._query = "";
    this._results = this._search("");
    this._selectedIndex = this._results.length > 0 ? 0 : -1;
  }

  close() {
    this._open = false;
    this._query = "";
    this._results = [];
    this._selectedIndex = -1;
  }

  toggle() {
    if (this._open) this.close();
    else this.open();
  }

  updateQuery(query) {
    this._query = query;
    this._results = this._search(query);
    this._selectedIndex = this._results.length > 0 ? 0 : -1;
  }

  selectNext() {
    if (this._results.length === 0) return;
    this._selectedIndex = (this._selectedIndex + 1) % this._results.length;
  }

  selectPrev() {
    if (this._results.length === 0) return;
    this._selectedIndex = (this._selectedIndex - 1 + this._results.length) % this._results.length;
  }

  executeSelected() {
    if (this._selectedIndex < 0 || this._selectedIndex >= this._results.length) return false;
    const cmd = this._results[this._selectedIndex];
    this._commands.execute(cmd);
    this.close();
    return true;
  }

  _search(query) {
    const all = this._commands._commands;
    if (!all || all.size === 0) return [];
    const q = query.toLowerCase().trim();
    const names = [...all.keys()];
    if (!q) return names;
    return names.filter(name => {
      const lower = name.toLowerCase();
      return this._fuzzyMatch(q, lower);
    });
  }

  _fuzzyMatch(query, target) {
    let qi = 0;
    for (let ti = 0; ti < target.length && qi < query.length; ti++) {
      if (target[ti] === query[qi]) qi++;
    }
    return qi === query.length;
  }
}
