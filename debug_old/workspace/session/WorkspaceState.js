export class WorkspaceState {
  constructor() {
    this._activePanelId = null;
    this._activeWorldId = null;
    this._tabOrder = [];
    this._pinnedTabs = new Set();
    this._closedTabs = new Set();
    this._toolbarPrefs = {
      paused: false,
      theme: "dark",
    };
  }

  get activePanelId() {
    return this._activePanelId;
  }

  set activePanelId(id) {
    this._activePanelId = id;
  }

  get activeWorldId() {
    return this._activeWorldId;
  }

  set activeWorldId(id) {
    this._activeWorldId = id;
  }

  get paused() {
    return this._toolbarPrefs.paused;
  }

  set paused(v) {
    this._toolbarPrefs.paused = v;
  }

  get theme() {
    return this._toolbarPrefs.theme;
  }

  set theme(v) {
    this._toolbarPrefs.theme = v;
  }

  get tabOrder() {
    return [...this._tabOrder];
  }

  set tabOrder(order) {
    this._tabOrder = [...order];
  }

  isPinned(id) {
    return this._pinnedTabs.has(id);
  }

  isClosed(id) {
    return this._closedTabs.has(id);
  }

  markClosed(id) {
    this._closedTabs.add(id);
  }

  markOpen(id) {
    this._closedTabs.delete(id);
  }

  serialize() {
    return {
      activePanelId: this._activePanelId,
      activeWorldId: this._activeWorldId,
      tabOrder: [...this._tabOrder],
      pinnedTabs: [...this._pinnedTabs],
      closedTabs: [...this._closedTabs],
      toolbarPrefs: { ...this._toolbarPrefs },
    };
  }

  deserialize(data) {
    if (!data) return;
    this._activePanelId = data.activePanelId || null;
    this._activeWorldId = data.activeWorldId || null;
    this._tabOrder = data.tabOrder || [];
    this._pinnedTabs = new Set(data.pinnedTabs || []);
    this._closedTabs = new Set(data.closedTabs || []);
    if (data.toolbarPrefs) {
      this._toolbarPrefs = { ...this._toolbarPrefs, ...data.toolbarPrefs };
    }
  }
}
