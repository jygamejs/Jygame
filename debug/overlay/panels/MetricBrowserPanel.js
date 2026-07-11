import { Panel } from "../Panel.js";
import { DarkTheme } from "../theme/DarkTheme.js";
import { MetricType } from "../../MetricType.js";
import { MetricUnit } from "../../MetricUnit.js";
import { MetricCategory } from "../../MetricCategory.js";
import { MetricSearchIndex } from "../metrics/MetricSearchIndex.js";

const UNIT_SYMBOLS = {
  [MetricUnit.MILLISECONDS]: "ms",
  [MetricUnit.COUNT]: "",
  [MetricUnit.BYTES]: "B",
  [MetricUnit.MEGABYTES]: "MB",
  [MetricUnit.PERCENT]: "%",
  [MetricUnit.FPS]: "fps",
};

const TYPE_LABELS = ["All", "Timer", "Counter", "Gauge"];
const TYPE_VALUES = [null, MetricType.TIMER, MetricType.COUNTER, MetricType.GAUGE];

const CATEGORY_LABELS = {};
for (const [k, v] of Object.entries(MetricCategory)) {
  CATEGORY_LABELS[v] = k;
}

export class MetricBrowserPanel extends Panel {
  constructor(context) {
    super("metrics", "Metric Browser", context, {
      icon: "\u2630",
      defaultWidth: 450,
      defaultHeight: 400,
      minWidth: 250,
      minHeight: 200,
    });
    this._searchIndex = new MetricSearchIndex(context.registry || { forEach() {} });
    this._query = "";
    this._typeFilter = null;
    this._categoryFilters = [];
    this._collapsedGroups = new Set();
    this._groups = [];
    this._availableCategories = [];
    this._categoryCounts = new Map();
    this._clickRegions = [];
  }

  setQuery(q) { this._query = q; }

  setTypeFilter(t) { this._typeFilter = t; }

  toggleCategory(c) {
    const idx = this._categoryFilters.indexOf(c);
    if (idx >= 0) this._categoryFilters.splice(idx, 1);
    else this._categoryFilters.push(c);
  }

  toggleGroup(name) {
    if (this._collapsedGroups.has(name)) this._collapsedGroups.delete(name);
    else this._collapsedGroups.add(name);
  }

  update(data) {
    const registry = this.ctx.registry;
    const analysis = this.ctx.analysis;
    if (!registry) {
      this._groups = [];
      this._availableCategories = [];
      this._categoryCounts = new Map();
      return;
    }

    this._searchIndex.rebuild(registry);

    const catCounts = new Map();
    registry.forEach(desc => {
      const c = desc.category;
      catCounts.set(c, (catCounts.get(c) || 0) + 1);
    });
    this._availableCategories = [...catCounts.keys()].sort((a, b) => a - b);
    this._categoryCounts = catCounts;

    const filtered = this._searchIndex.search(this._query, {
      type: this._typeFilter,
      categories: this._categoryFilters.length ? this._categoryFilters : undefined,
    });
    const filteredNames = new Set(filtered.map(e => e.name));

    const groupMap = new Map();
    registry.forEach(desc => {
      if (!filteredNames.has(desc.name)) return;
      const dot = desc.name.indexOf(".");
      const groupName = dot > 0 ? desc.name.slice(0, dot) : "__ungrouped__";
      if (!groupMap.has(groupName)) groupMap.set(groupName, []);
      groupMap.get(groupName).push({
        name: desc.name,
        displayName: desc.displayName,
        type: desc.type,
        color: desc.color || "#88ccff",
        unit: desc.unit,
        category: desc.category,
        value: analysis ? analysis.latest(desc.name) : 0,
      });
    });

    this._groups = [];
    for (const [name, metrics] of groupMap) {
      metrics.sort((a, b) => a.name.localeCompare(b.name));
      this._groups.push({
        name,
        expanded: !this._collapsedGroups.has(name),
        metrics,
      });
    }
    this._groups.sort((a, b) => {
      if (a.name === "__ungrouped__") return 1;
      if (b.name === "__ungrouped__") return -1;
      return a.name.localeCompare(b.name);
    });
  }

  render(ctx, rect) {
    if (!rect) return;
    const theme = this.ctx.theme || DarkTheme;
    const { x, y, width: w, height: h } = rect;
    const tr = this.ctx.renderers?.text;

    ctx.fillStyle = theme.panelBg;
    ctx.fillRect(x, y, w, h);

    if (!this.ctx.registry) {
      if (tr) {
        tr.render(ctx, "No metrics registered", x + theme.padding, y + theme.padding, { color: theme.textDim });
      }
      return;
    }

    this._clickRegions = [];

    const pad = theme.padding;
    const sp = theme.spacing;

    let cursorY = y + pad;

    cursorY = this._drawSearchBar(ctx, x, cursorY, w, theme, tr, pad);
    cursorY = this._drawTypeFilters(ctx, x, cursorY, w, theme, tr, pad, sp);
    if (this._availableCategories.length) {
      cursorY = this._drawCategoryFilters(ctx, x, cursorY, w, theme, tr, pad, sp);
    }

    this._drawTree(ctx, x, cursorY, w, h, theme, tr, pad, sp);
  }

  _drawSearchBar(ctx, x, y, w, theme, tr, pad) {
    const barH = 26;
    const barX = x + pad;
    const barW = w - pad * 2;

    ctx.fillStyle = theme.background;
    ctx.fillRect(barX, y, barW, barH);

    if (tr) {
      if (this._query) {
        tr.render(ctx, this._query, barX + 6, y + barH / 2, {
          size: theme.fontSize,
          color: theme.text,
          baseline: "middle",
        });
        const clearLabel = "\u00D7";
        const clearM = tr.measure(ctx, clearLabel, { size: theme.fontSize + 2 });
        const clearX = barX + barW - clearM.width - 6;
        tr.render(ctx, clearLabel, clearX, y + barH / 2, {
          size: theme.fontSize + 2,
          color: theme.textDim,
          baseline: "middle",
        });
        this._clickRegions.push({ x: clearX - 4, y, w: clearM.width + 12, h: barH, handler: () => { this._query = ""; } });
      } else {
        tr.render(ctx, "Search metrics...", barX + 6, y + barH / 2, {
          size: theme.fontSize,
          color: theme.textDim,
          baseline: "middle",
        });
      }
    }

    return y + barH + 4;
  }

  _drawTypeFilters(ctx, x, y, w, theme, tr, pad, sp) {
    const btnH = 22;
    const btnCount = TYPE_LABELS.length;
    const totalSp = sp * (btnCount - 1);
    const btnW = Math.max((w - pad * 2 - totalSp) / btnCount, 40);

    for (let i = 0; i < btnCount; i++) {
      const bx = x + pad + i * (btnW + sp);
      const selected = (i === 0 && this._typeFilter === null) ||
        (i > 0 && this._typeFilter === TYPE_VALUES[i]);

      ctx.fillStyle = selected ? theme.accent : theme.background;
      ctx.fillRect(bx, y, btnW, btnH);

      if (tr) {
        tr.render(ctx, TYPE_LABELS[i], bx + btnW / 2, y + btnH / 2, {
          size: theme.fontSize,
          color: selected ? theme.textAccent : theme.text,
          align: "center",
          baseline: "middle",
        });
      }

      this._clickRegions.push({
        x: bx, y, w: btnW, h: btnH,
        handler: () => { this._typeFilter = TYPE_VALUES[i]; },
      });
    }

    return y + btnH + 4;
  }

  _drawCategoryFilters(ctx, x, y, w, theme, tr, pad, sp) {
    const tagH = 20;
    let tagX = x + pad;

    for (const cat of this._availableCategories) {
      const label = CATEGORY_LABELS[cat] ?? `CAT_${cat}`;
      const count = this._categoryCounts.get(cat) || 0;
      const text = `${label}(${count})`;
      const m = tr ? tr.measure(ctx, text, { size: theme.fontSize - 1 }) : { width: 60 };
      const tagW = m.width + 10;
      const active = this._categoryFilters.includes(cat);

      ctx.fillStyle = active ? theme.accent : theme.background;
      ctx.fillRect(tagX, y, tagW, tagH);

      if (tr) {
        tr.render(ctx, text, tagX + 5, y + tagH / 2, {
          size: theme.fontSize - 1,
          color: active ? theme.textAccent : theme.text,
          baseline: "middle",
        });
      }

      this._clickRegions.push({
        x: tagX, y, w: tagW, h: tagH,
        handler: () => this.toggleCategory(cat),
      });

      tagX += tagW + 4;
      if (tagX > x + w - pad - 20) break;
    }

    return y + tagH + 4;
  }

  _drawTree(ctx, x, y, w, h, theme, tr, pad, sp) {
    const rowH = 18;
    const fs = theme.fontSize;
    const panelBottom = y + h - pad;
    let rowY = y + 2;

    for (const group of this._groups) {
      if (rowY + rowH > panelBottom) break;

      const arrow = group.expanded ? "\u25BE" : "\u25B8";
      const headerLabel = `${arrow} ${group.name} (${group.metrics.length})`;

      ctx.fillStyle = theme.background;
      ctx.fillRect(x + pad, rowY, w - pad * 2, rowH);

      if (tr) {
        tr.render(ctx, headerLabel, x + pad + 6, rowY + rowH / 2, {
          size: fs,
          color: theme.textAccent,
          baseline: "middle",
        });
      }

      this._clickRegions.push({
        x: x + pad, y: rowY, w: w - pad * 2, h: rowH,
        handler: () => this.toggleGroup(group.name),
      });

      rowY += rowH;

      if (group.expanded) {
        const indent = x + pad + 20;
        for (const metric of group.metrics) {
          if (rowY + rowH > panelBottom) break;

          if (tr) {
            tr.render(ctx, metric.displayName, indent, rowY + rowH / 2, {
              size: fs,
              color: theme.text,
              baseline: "middle",
            });

            const valStr = this._valueString(metric);
            const valM = tr.measure(ctx, valStr, { size: fs });
            tr.render(ctx, valStr, x + w - pad - 6 - valM.width, rowY + rowH / 2, {
              size: fs,
              color: theme.textDim,
              baseline: "middle",
            });
          }

          rowY += rowH;
        }
      }
    }

    if (!this._groups.length && tr) {
      tr.render(ctx, "No matching metrics", x + pad, y + 2, {
        size: fs,
        color: theme.textDim,
      });
    }
  }

  _valueString(metric) {
    const v = metric.value;
    if (metric.unit != null) {
      const sym = UNIT_SYMBOLS[metric.unit] ?? "";
      const num = metric.type === MetricType.COUNTER ? Math.round(v) : v.toFixed(1);
      return `${num} ${sym}`.trim();
    }
    if (metric.type === MetricType.COUNTER) return String(Math.round(v));
    if (metric.type === MetricType.GAUGE) return v.toFixed(2);
    return v.toFixed(1);
  }

  handleInput(event) {
    if (event.type !== "click" && event.type !== "pointerdown") return false;
    const ex = event.x;
    const ey = event.y;
    for (const region of this._clickRegions) {
      if (ex >= region.x && ex <= region.x + region.w &&
          ey >= region.y && ey <= region.y + region.h) {
        region.handler();
        return true;
      }
    }
    return false;
  }
}
