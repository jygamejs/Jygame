import { Panel } from "../Panel.js";
import { DarkTheme } from "../theme/DarkTheme.js";

const SEVERITY_COLORS = {
  error: "#ff4444",
  warn: "#ffaa00",
  info: "#4488ff",
};

const SEVERITY_LABELS = ["All", "Error", "Warn", "Info"];
const SEVERITY_VALUES = ["all", "error", "warn", "info"];

export class EventViewerPanel extends Panel {
  static metadata = { id: "events", title: "Events", icon: "\u25CB", group: "Analysis", pinned: false, searchable: true };
  constructor(context) {
    super("events", "Event Viewer", context, {
      icon: "\u25CB",
      defaultWidth: 500,
      defaultHeight: 300,
      minWidth: 250,
      minHeight: 150,
    });
    this._events = [];
    this._categories = [];
    this._activeCategories = new Set();
    this._severityFilter = "all";
    this._searchQuery = "";
    this._clickRegions = [];
  }

  _deriveSeverity(ev) {
    const text = (ev.category + " " + ev.name).toLowerCase();
    if (text.includes("error") || text.includes("critical") || text.includes("fail")) return "error";
    if (text.includes("warn")) return "warn";
    return "info";
  }

  _enrichEvent(ev) {
    return {
      frame: ev.frame,
      timestamp: ev.timestamp,
      category: ev.category,
      name: ev.name,
      metadata: ev.metadata,
      severity: this._deriveSeverity(ev),
    };
  }

  clear() {
    this._events = [];
    this._categories = [];
    this._activeCategories = new Set();
  }

  toggleCategory(cat) {
    if (this._activeCategories.has(cat)) this._activeCategories.delete(cat);
    else this._activeCategories.add(cat);
  }

  setSeverityFilter(val) { this._severityFilter = val; }
  setSearchQuery(q) { this._searchQuery = q; }

  activateSearch() {
    this._searchActive = true;
    if (this.ctx.input && typeof this.ctx.input.setTextTarget === "function") {
      this.ctx.input.setTextTarget(this);
    }
  }

  deactivateSearch() {
    this._searchActive = false;
  }

  appendQuery(char) {
    this._searchQuery += char;
    this.setSearchQuery(this._searchQuery);
  }

  backspaceQuery() {
    this._searchQuery = this._searchQuery.slice(0, -1);
    this.setSearchQuery(this._searchQuery);
  }

  update(data) {
    const history = this.ctx.history;
    if (!history || !history.count) {
      if (!this._events.length) return;
      return;
    }

    const collected = [];
    let frameLimit = 300;

    for (const snap of history.frames()) {
      if (frameLimit <= 0) break;
      frameLimit--;
      for (const ev of snap.events) {
        collected.push(this._enrichEvent(ev));
      }
    }

    collected.reverse();
    this._events = collected;

    const cats = new Set();
    for (const ev of this._events) cats.add(ev.category);
    this._categories = [...cats].sort();

    for (const c of this._categories) {
      if (!this._activeCategories.has(c)) this._activeCategories.add(c);
    }
  }

  render(ctx, rect) {
    if (!rect) return;
    const theme = this.ctx.theme || DarkTheme;
    const { x, y, width: w, height: h } = rect;
    const tr = this.ctx.renderers?.text;

    ctx.fillStyle = theme.panelBg;
    ctx.fillRect(x, y, w, h);

    this._clickRegions = [];

    const pad = theme.padding;
    const sp = theme.spacing;

    let cursorY = y + pad;

    // Search bar + Clear
    cursorY = this._drawControls(ctx, x, cursorY, w, theme, tr, pad);

    // Category filters
    if (this._categories.length) {
      cursorY = this._drawCategoryFilters(ctx, x, cursorY, w, theme, tr, pad, sp);
    }

    // Severity filters
    cursorY = this._drawSeverityFilters(ctx, x, cursorY, w, theme, tr, pad, sp);

    // Table header
    cursorY = this._drawTableHeader(ctx, x, cursorY, w, theme, tr, pad);

    // Event rows
    this._drawEventRows(ctx, x, cursorY, w, h, theme, tr, pad);
  }

  _drawControls(ctx, x, y, w, theme, tr, pad) {
    const barH = 26;
    const barX = x + pad;
    const barW = w - pad * 2;

    ctx.fillStyle = theme.background;
    ctx.fillRect(barX, y, barW, barH);

    if (tr) {
      const displayText = this._searchQuery || "";
      tr.render(ctx, displayText || "Search events...", barX + 6, y + barH / 2, {
        size: theme.fontSize,
        color: displayText ? theme.text : theme.textDim,
        baseline: "middle",
      });

      if (this._searchActive) {
        const cursorX = barX + 8 + (tr.measure ? tr.measure(ctx, displayText, { size: theme.fontSize }).width : 0);
        ctx.fillStyle = theme.text;
        ctx.fillRect(cursorX, y + 4, 1, barH - 8);
      }

      // Clear button
      const clearLabel = "Clear";
      const clearM = tr.measure(ctx, clearLabel, { size: theme.fontSize });
      const clearX = barX + barW - clearM.width - 6;
      tr.render(ctx, clearLabel, clearX, y + barH / 2, {
        size: theme.fontSize, color: theme.textAccent, baseline: "middle",
      });
      this._clickRegions.push({
        x: clearX - 4, y, w: clearM.width + 12, h: barH,
        handler: () => this.clear(),
      });
    }

    this._clickRegions.push({
      x: barX, y, w: barW, h: barH,
      handler: () => this.activateSearch(),
    });

    return y + barH + 4;
  }

  _drawCategoryFilters(ctx, x, y, w, theme, tr, pad, sp) {
    const tagH = 20;
    let tagX = x + pad;

    for (const cat of this._categories) {
      const active = this._activeCategories.has(cat);
      const text = active ? cat : `[${cat}]`;
      const m = tr ? tr.measure(ctx, text, { size: theme.fontSize - 1 }) : { width: 60 };
      const tagW = m.width + 10;

      ctx.fillStyle = active ? theme.accent : theme.background;
      ctx.fillRect(tagX, y, tagW, tagH);

      if (tr) {
        tr.render(ctx, text, tagX + 5, y + tagH / 2, {
          size: theme.fontSize - 1,
          color: active ? theme.textAccent : theme.textDim,
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

  _drawSeverityFilters(ctx, x, y, w, theme, tr, pad, sp) {
    const btnH = 20;
    const btnCount = SEVERITY_LABELS.length;
    const totalSp = sp * (btnCount - 1);
    const btnW = Math.max((w - pad * 2 - totalSp) / btnCount, 40);

    for (let i = 0; i < btnCount; i++) {
      const bx = x + pad + i * (btnW + sp);
      const selected = SEVERITY_VALUES[i] === this._severityFilter;

      ctx.fillStyle = selected ? theme.accent : theme.background;
      ctx.fillRect(bx, y, btnW, btnH);

      if (i > 0) {
        const dotColor = i === 1 ? "#ff4444" : i === 2 ? "#ffaa00" : "#4488ff";
        ctx.fillStyle = dotColor;
        ctx.beginPath();
        ctx.arc(bx + 10, y + btnH / 2, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      if (tr) {
        tr.render(ctx, SEVERITY_LABELS[i], bx + (i > 0 ? 20 : btnW / 2), y + btnH / 2, {
          size: theme.fontSize,
          color: selected ? theme.textAccent : theme.text,
          align: i > 0 ? "start" : "center",
          baseline: "middle",
        });
      }

      this._clickRegions.push({
        x: bx, y, w: btnW, h: btnH,
        handler: () => { this._severityFilter = SEVERITY_VALUES[i]; },
      });
    }

    return y + btnH + 4;
  }

  _drawTableHeader(ctx, x, y, w, theme, tr, pad) {
    const rowH = 18;
    const fs = theme.fontSizeSmall || theme.fontSize - 1;

    ctx.fillStyle = theme.background;
    ctx.fillRect(x + pad, y, w - pad * 2, rowH);

    const timeX = x + pad + 4;
    const catX = timeX + 46;
    const eventX = catX + 68;
    const frameX = x + w - pad - 44;

    if (tr) {
      tr.render(ctx, "Time", timeX, y + rowH / 2, {
        size: fs, color: theme.textDim, baseline: "middle",
      });
      tr.render(ctx, "Category", catX, y + rowH / 2, {
        size: fs, color: theme.textDim, baseline: "middle",
      });
      tr.render(ctx, "Event", eventX, y + rowH / 2, {
        size: fs, color: theme.textDim, baseline: "middle",
      });
      tr.render(ctx, "Frame", frameX, y + rowH / 2, {
        size: fs, color: theme.textDim, baseline: "middle",
      });
    }

    return y + rowH;
  }

  _drawEventRows(ctx, x, y, w, h, theme, tr, pad) {
    const rowH = 16;
    const panelBottom = y + h - pad;
    let rowY = y;
    const fs = theme.fontSizeSmall || theme.fontSize - 1;

    const sp = 4;
    const timeX = x + pad + 4;
    const catX = timeX + 46;
    const eventX = catX + 68;
    const frameX = x + w - pad - 44;
    const eventMaxW = Math.max(frameX - eventX - sp, 20);

    const filtered = this._events.filter(ev => {
      if (this._severityFilter !== "all" && ev.severity !== this._severityFilter) return false;
      if (this._activeCategories.size && !this._activeCategories.has(ev.category)) return false;
      if (this._searchQuery) {
        const q = this._searchQuery.toLowerCase();
        if (!ev.name.toLowerCase().includes(q) && !ev.category.toLowerCase().includes(q)) return false;
      }
      return true;
    });

    for (const ev of filtered) {
      if (rowY + rowH > panelBottom) break;

      const color = SEVERITY_COLORS[ev.severity] || "#4488ff";
      const timeStr = (ev.timestamp / 1000).toFixed(3);

      if (tr) {
        const timeM = tr.measure(ctx, timeStr, { size: fs });
        tr.render(ctx, timeStr, timeX + 46 - timeM.width, rowY + rowH / 2, {
          size: fs, color: theme.textDim, baseline: "middle",
        });

        tr.render(ctx, ev.category, catX, rowY + rowH / 2, {
          size: fs, color, baseline: "middle",
        });

        let eventLabel = ev.name;
        if (tr.measure(ctx, eventLabel, { size: fs }).width > eventMaxW) {
          while (eventLabel.length > 2 && tr.measure(ctx, eventLabel + "\u2026", { size: fs }).width > eventMaxW) {
            eventLabel = eventLabel.slice(0, -1);
          }
          eventLabel += "\u2026";
        }
        tr.render(ctx, eventLabel, eventX, rowY + rowH / 2, {
          size: fs, color: theme.text, baseline: "middle",
        });

        const frameStr = String(ev.frame);
        const frameM = tr.measure(ctx, frameStr, { size: fs });
        tr.render(ctx, frameStr, x + w - pad - frameM.width, rowY + rowH / 2, {
          size: fs, color: theme.textDim, baseline: "middle",
        });

        // Metadata sub-row
        if (ev.metadata) {
          rowY += rowH;
          if (rowY + rowH > panelBottom) break;
          try {
            const metaStr = JSON.stringify(ev.metadata);
            const metaLabel = metaStr.length > 40 ? metaStr.slice(0, 39) + "\u2026" : metaStr;
            tr.render(ctx, metaLabel, eventX, rowY + rowH / 2, {
              size: fs, color: theme.textDim, baseline: "middle",
            });
          } catch {}
        }
      }

      rowY += rowH;
    }

    if (!filtered.length && tr) {
      tr.render(ctx, "No events", x + pad, y + 2, {
        size: theme.fontSize, color: theme.textDim,
      });
    }
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
