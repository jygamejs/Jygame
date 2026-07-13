export class TabStrip {
  constructor() {
    this._tabs = [];
    this._activeId = null;
    this._switchCbs = [];
    this._closeCbs = [];
    this._reorderCbs = [];
  }

  buildTabs(panels) {
    const tabs = [];
    panels.forEach((panel) => {
      const meta = panel.constructor.metadata || {};
      tabs.push({
        id: meta.id || panel.id,
        title: meta.title || panel.title,
        icon: meta.icon || null,
        pinned: meta.pinned === true,
        searchable: meta.searchable !== false,
      });
    });
    this._tabs = tabs;
    return tabs;
  }

  getTabs() {
    return this._tabs;
  }

  getActive() {
    return this._activeId;
  }

  setActive(id) {
    if (this._activeId === id) return;
    this._activeId = id;
    this._switchCbs.forEach(cb => cb(id));
  }

  closeTab(id) {
    const tab = this._tabs.find(t => t.id === id);
    if (!tab || tab.pinned) return false;
    this._tabs = this._tabs.filter(t => t.id !== id);
    if (this._activeId === id) {
      this._activeId = this._tabs.length > 0 ? this._tabs[0].id : null;
    }
    this._closeCbs.forEach(cb => cb(id));
    return true;
  }

  reorder(fromIndex, toIndex) {
    if (fromIndex < 0 || fromIndex >= this._tabs.length) return false;
    if (toIndex < 0 || toIndex >= this._tabs.length) return false;
    const [tab] = this._tabs.splice(fromIndex, 1);
    this._tabs.splice(toIndex, 0, tab);
    this._reorderCbs.forEach(cb => cb(this._tabs.map(t => t.id)));
    return true;
  }

  onSwitch(cb) {
    this._switchCbs.push(cb);
  }

  onClose(cb) {
    this._closeCbs.push(cb);
  }

  onReorder(cb) {
    this._reorderCbs.push(cb);
  }
}
