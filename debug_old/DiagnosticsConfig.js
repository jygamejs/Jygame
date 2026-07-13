const _ALL_GROUPS_MASK = (1 << 10) - 1;

export class DiagnosticsConfig {
  constructor(options = {}) {
    this.enabled = options.enabled ?? true;
    this.historySize = options.historySize ?? 300;
    this.autoReset = options.autoReset ?? true;
    this.samplingRate = options.samplingRate ?? 1;
    this._enabledGroups = _ALL_GROUPS_MASK;
    this._allGroupsEnabled = true;
  }

  enableGroup(category) {
    if (category < 10) {
      this._enabledGroups |= (1 << category);
      this._allGroupsEnabled = this._enabledGroups === _ALL_GROUPS_MASK;
    }
  }

  disableGroup(category) {
    if (category < 10) {
      this._enabledGroups &= ~(1 << category);
      this._allGroupsEnabled = false;
    }
  }

  disableAll() {
    this._enabledGroups = 0;
    this._allGroupsEnabled = false;
  }

  enableAll() {
    this._enabledGroups = _ALL_GROUPS_MASK;
    this._allGroupsEnabled = true;
  }

  isGroupEnabled(category) {
    if (category >= 10) return true;
    return (this._enabledGroups & (1 << category)) !== 0;
  }

  get allGroupsEnabled() {
    return this._allGroupsEnabled;
  }

  isCategoryEnabled(category) {
    if (this._allGroupsEnabled) return true;
    if (category >= 10) return true;
    return (this._enabledGroups & (1 << category)) !== 0;
  }
}
