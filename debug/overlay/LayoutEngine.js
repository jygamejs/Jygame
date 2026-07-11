export class LayoutEngine {
  constructor(theme = {}) {
    this._theme = theme;
    this._root = null;
    this._panelRects = new Map();
    this._tabRects = new Map();
    this._splitNodes = new Map();
    this._splitDividers = [];
    this._splitRects = new Map();
    this._dragState = null;
    this._nextId = 1;
  }

  get root() {
    return this._root;
  }

  setRoot(node) {
    this._nextId = 1;
    this._splitNodes.clear();
    this._root = this._assignIds(node);
  }

  _assignIds(node) {
    if (node.type === "split") {
      node._layoutId = this._nextId++;
      this._splitNodes.set(node._layoutId, node);
      node.children = node.children.map(c => this._assignIds(c));
    } else if (node.type === "tab") {
      node._layoutId = this._nextId++;
    } else if (node.type === "leaf") {
      node._layoutId = this._nextId++;
    }
    return node;
  }

  compute(width, height) {
    this._panelRects.clear();
    this._tabRects.clear();
    this._splitDividers = [];
    this._splitRects.clear();
    if (!this._root || width <= 0 || height <= 0) return;
    this._computeNode(this._root, 0, 0, width, height);
  }

  _computeNode(node, x, y, width, height) {
    if (width <= 0 || height <= 0) return;
    switch (node.type) {
      case "split": return this._computeSplit(node, x, y, width, height);
      case "tab": return this._computeTab(node, x, y, width, height);
      case "leaf": return this._computeLeaf(node, x, y, width, height);
    }
  }

  _computeSplit(node, x, y, width, height) {
    const gap = 2;
    this._splitRects.set(node._layoutId, { x, y, w: width, h: height });
    if (node.direction === "horizontal") {
      const leftW = Math.floor(Math.max(0, (width - gap) * node.ratio));
      const rightW = Math.max(0, width - leftW - gap);
      this._splitDividers.push({
        x: x + leftW, y, w: gap, h: height,
        splitId: node._layoutId, dir: "h",
      });
      this._computeNode(node.children[0], x, y, leftW, height);
      this._computeNode(node.children[1], x + leftW + gap, y, rightW, height);
    } else {
      const topH = Math.floor(Math.max(0, (height - gap) * node.ratio));
      const bottomH = Math.max(0, height - topH - gap);
      this._splitDividers.push({
        x, y: y + topH, w: width, h: gap,
        splitId: node._layoutId, dir: "v",
      });
      this._computeNode(node.children[0], x, y, width, topH);
      this._computeNode(node.children[1], x, y + topH + gap, width, bottomH);
    }
  }

  _computeTab(node, x, y, width, height) {
    const tabH = this._theme.tabHeight || 24;
    const contentY = y + tabH;
    const contentH = Math.max(0, height - tabH);

    this._tabRects.set(node, { x, y, width, height: tabH });

    if (node.panels.length > 0) {
      const activeIdx = Math.min(node.activeTab ?? 0, node.panels.length - 1);
      const panelId = node.panels[activeIdx];
      this._panelRects.set(panelId, { x, y: contentY, width, height: contentH });
    }
  }

  _computeLeaf(node, x, y, width, height) {
    this._panelRects.set(node.panelId, { x, y, width, height });
  }

  getPanelRect(panelId) {
    return this._panelRects.get(panelId) || null;
  }

  getAllPanelRects() {
    return new Map(this._panelRects);
  }

  hitTest(x, y) {
    for (const [panelId, rect] of this._panelRects) {
      if (x >= rect.x && x < rect.x + rect.width &&
          y >= rect.y && y < rect.y + rect.height) {
        return { type: "panel", panelId };
      }
    }
    return null;
  }

  getSplitDividers() {
    return this._splitDividers;
  }

  onInput(event) {
    if (event.type === "pointerdown" || event.type === "mousedown") {
      for (const div of this._splitDividers) {
        if (event.x >= div.x && event.x <= div.x + div.w &&
            event.y >= div.y && event.y <= div.y + div.h) {
          const node = this._splitNodes.get(div.splitId);
          if (!node) return false;
          this._dragState = {
            splitId: div.splitId,
            startX: event.x,
            startY: event.y,
            startRatio: node.ratio,
          };
          return true;
        }
      }
    }

    if ((event.type === "pointermove" || event.type === "mousemove") && this._dragState) {
      const node = this._splitNodes.get(this._dragState.splitId);
      if (!node) return false;
      const rect = this._splitRects.get(this._dragState.splitId);
      if (!rect || rect.w <= 0 || rect.h <= 0) return false;
      const total = node.direction === "horizontal" ? rect.w : rect.h;
      const delta = node.direction === "horizontal"
        ? event.x - this._dragState.startX
        : event.y - this._dragState.startY;
      const newRatio = Math.max(0.1, Math.min(0.9, this._dragState.startRatio + delta / total));
      node.ratio = newRatio;
      return true;
    }

    if ((event.type === "pointerup" || event.type === "mouseup") && this._dragState) {
      this._dragState = null;
      return true;
    }

    return false;
  }

  resize(splitId, ratio) {
    const node = this._splitNodes.get(splitId);
    if (!node) return false;
    node.ratio = Math.max(0.1, Math.min(0.9, ratio));
    return true;
  }

  createDefaultLayout(panelIds) {
    const find = (id) => panelIds.includes(id) ? id : panelIds[0];

    const p = find("performance");
    const fg = find("framegraph");
    const tl = find("timeline");
    const ev = find("events");

    this._root = {
      type: "split",
      direction: "vertical",
      ratio: 0.65,
      children: [
        {
          type: "split",
          direction: "horizontal",
          ratio: 0.4,
          children: [
            { type: "tab", panels: [p], activeTab: 0 },
            { type: "tab", panels: [fg], activeTab: 0 },
          ],
        },
        {
          type: "split",
          direction: "horizontal",
          ratio: 0.5,
          children: [
            { type: "tab", panels: [tl], activeTab: 0 },
            { type: "tab", panels: [ev], activeTab: 0 },
          ],
        },
      ],
    };

    this._assignIds(this._root);
    return this;
  }

  serialize() {
    return {
      version: 1,
      root: this._serializeNode(this._root),
      floating: [],
    };
  }

  _serializeNode(node) {
    if (!node) return null;
    switch (node.type) {
      case "split":
        return {
          type: "split",
          direction: node.direction,
          ratio: node.ratio,
          children: node.children.map(c => this._serializeNode(c)),
        };
      case "tab":
        return { type: "tab", panels: [...node.panels], activeTab: node.activeTab ?? 0 };
      case "leaf":
        return { type: "leaf", panelId: node.panelId };
      default:
        return null;
    }
  }

  restore(json) {
    if (!json || !json.root) return false;
    const root = this._deserializeNode(json.root);
    if (!root) return false;
    this.setRoot(root);
    return true;
  }

  _deserializeNode(node) {
    if (!node) return null;
    if (node.type === "split") {
      return {
        type: "split",
        direction: node.direction === "vertical" ? "vertical" : "horizontal",
        ratio: typeof node.ratio === "number" ? Math.max(0, Math.min(1, node.ratio)) : 0.5,
        children: (node.children || []).map(c => this._deserializeNode(c)).filter(Boolean),
      };
    }
    if (node.type === "tab") {
      return {
        type: "tab",
        panels: Array.isArray(node.panels) ? [...node.panels] : [],
        activeTab: typeof node.activeTab === "number" ? node.activeTab : 0,
      };
    }
    if (node.type === "leaf") {
      return { type: "leaf", panelId: node.panelId };
    }
    return null;
  }
}
