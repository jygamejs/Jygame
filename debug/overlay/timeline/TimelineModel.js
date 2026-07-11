import { MetricType } from "../../MetricType.js";

export class TimelineModel {
  constructor(context) {
    this.ctx = context;
    this._tree = [];
    this._expanded = new Set();
    this._selectedFrameIndex = -1;
  }

  build(snapshot) {
    const metrics = [];
    this.ctx.registry.forEach(desc => {
      if (desc.type !== MetricType.TIMER) return;
      metrics.push({
        id: desc.id,
        name: desc.name,
        displayName: desc.displayName,
        color: desc.color,
        value: snapshot.timerTotal(desc.id),
        parentId: this._findParent(desc.name),
      });
    });
    this._tree = this._buildTree(metrics);
  }

  _findParent(name) {
    let best = null;
    let bestLen = 0;
    this.ctx.registry.forEach(desc => {
      if (desc.type !== MetricType.TIMER || desc.name === name) return;
      if (name.startsWith(desc.name + ".") && desc.name.length > bestLen) {
        best = desc;
        bestLen = desc.name.length;
      }
    });
    return best ? best.id : null;
  }

  _buildTree(metrics) {
    const nodeMap = new Map();
    const roots = [];

    for (const m of metrics) {
      nodeMap.set(m.id, { ...m, children: [], depth: 0 });
    }

    for (const node of nodeMap.values()) {
      if (node.parentId != null && nodeMap.has(node.parentId)) {
        nodeMap.get(node.parentId).children.push(node);
      } else {
        roots.push(node);
      }
    }

    const sortFn = (a, b) => b.value - a.value;
    for (const node of nodeMap.values()) {
      node.children.sort(sortFn);
    }
    roots.sort(sortFn);

    const totalIdx = roots.findIndex(n => n.name === "frame.total");
    if (totalIdx > 0) {
      const total = roots.splice(totalIdx, 1)[0];
      roots.unshift(total);
    }
    if (roots.length > 0) this._expanded.add(roots[0].id);

    this._assignDepth(roots, 0);
    return roots;
  }

  _assignDepth(nodes, depth) {
    for (const node of nodes) {
      node.depth = depth;
      this._assignDepth(node.children, depth + 1);
    }
  }

  get tree() { return this._tree; }

  isExpanded(id) { return this._expanded.has(id); }

  toggleExpanded(id) {
    if (this._expanded.has(id)) {
      this._expanded.delete(id);
    } else {
      this._expanded.add(id);
    }
  }

  collapseAll() { this._expanded.clear(); }

  set frameIndex(index) {
    this._selectedFrameIndex = index;
    const snapshot = this.ctx.history.at(index);
    if (snapshot) this.build(snapshot);
  }

  get frameIndex() { return this._selectedFrameIndex; }
}
