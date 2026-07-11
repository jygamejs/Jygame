import { Panel } from "../Panel.js";
import { DarkTheme } from "../theme/DarkTheme.js";
import { MetricType } from "../../MetricType.js";

export class PerformancePanel extends Panel {
  constructor(context) {
    super("performance", "Performance", context, {
      icon: "\u26A1",
      defaultWidth: 500,
      defaultHeight: 350,
      minWidth: 320,
      minHeight: 200,
    });
    this._data = null;
  }

  update(data) {
    const analysis = this.ctx.analysis;
    const registry = this.ctx.registry;
    const history = this.ctx.history;

    if (!analysis || !registry || !history) {
      this._data = null;
      return;
    }

    const fpsTarget = this.ctx.config?.fpsTarget || 60;
    const budget = fpsTarget > 0 ? 1000 / fpsTarget : 16.67;
    const fps = analysis.latest("frame.fps");
    const frameTime = analysis.latest("frame.total");
    const budgetPct = budget > 0 ? Math.round((frameTime / budget) * 100) : 0;

    const subsystems = [];
    registry.forEach(desc => {
      if (desc.type !== MetricType.TIMER) return;
      if (desc.name === "frame.total" || desc.name === "frame.fps" || !desc.name.startsWith("frame.")) return;
      const val = analysis.latest(desc.name);
      subsystems.push({
        name: desc.name,
        displayName: desc.displayName,
        value: val,
        pct: frameTime > 0 ? Math.round((val / frameTime) * 100) : 0,
        color: desc.color || "#88ccff",
      });
    });
    subsystems.sort((a, b) => b.value - a.value);

    const sumChildren = subsystems.reduce((s, sub) => s + sub.value, 0);
    if (frameTime > sumChildren + 0.01) {
      subsystems.push({
        name: "overhead",
        displayName: "Overhead",
        value: frameTime - sumChildren,
        pct: Math.round(((frameTime - sumChildren) / frameTime) * 100),
        color: "#8888aa",
      });
    }

    const offenders = [];
    registry.forEach(desc => {
      if (desc.type !== MetricType.TIMER) return;
      if (desc.name === "frame.total" || desc.name === "frame.fps") return;
      const avg = analysis.average(desc.name, 60);
      if (avg > 0.01) {
        offenders.push({
          name: desc.name,
          displayName: desc.displayName,
          avg: avg,
          max: analysis.max(desc.name, 300),
          color: desc.color || "#88ccff",
          values: this._recentValues(history, registry, desc.name, desc.type, 60),
        });
      }
    });
    offenders.sort((a, b) => b.avg - a.avg);

    this._data = {
      fps: Math.round(fps * 10) / 10,
      frameTime: Math.round(frameTime * 100) / 100,
      budgetPct: Math.min(budgetPct, 999),
      fpsTarget,
      budget: Math.round(budget * 100) / 100,
      subsystems: subsystems.slice(0, 10),
      offenders: offenders.slice(0, 8),
    };
  }

  _recentValues(history, registry, metricName, type, count) {
    const desc = registry.find(metricName);
    if (!desc) return [];
    const id = desc.id;
    const values = [];
    let taken = 0;
    for (const snap of history.frames()) {
      if (taken >= count) break;
      let val = 0;
      if (type === MetricType.TIMER) val = snap.timerTotal(id);
      else if (type === MetricType.GAUGE) val = snap.gauge(id);
      else if (type === MetricType.COUNTER) val = snap.counter(id);
      values.push(val);
      taken++;
    }
    return values;
  }

  render(ctx, rect) {
    if (!rect) return;
    const theme = this.ctx.theme || DarkTheme;
    const { x, y, width: w, height: h } = rect;
    const data = this._data;
    const tr = this.ctx.renderers?.text;
    const sr = this.ctx.renderers?.sparkline;
    const fbr = this.ctx.renderers?.frameBar;

    ctx.fillStyle = theme.panelBg;
    ctx.fillRect(x, y, w, h);

    if (!data) {
      if (tr) {
        tr.render(ctx, "No data", x + theme.padding, y + theme.padding, { color: theme.textDim });
      }
      return;
    }

    const pad = theme.padding;
    const sp = theme.spacing;
    const fontSize = theme.fontSize;

    let cursorY = y + pad;

    this._drawHeader(ctx, x + pad, cursorY, w - pad * 2, theme, data);
    cursorY += 64 + sp;

    this._drawSectionLabel(ctx, x + pad, cursorY, theme, "Subsystem Breakdown", tr);
    cursorY += fontSize * 1.5 + sp;
    cursorY = this._drawSubsystems(ctx, x + pad, cursorY, w - pad * 2, h, y, theme, data, tr, fbr);
    cursorY += sp;

    this._drawSectionLabel(ctx, x + pad, cursorY, theme, "Top Offenders", tr);
    cursorY += fontSize * 1.5 + sp;
    this._drawOffenders(ctx, x + pad, cursorY, w - pad * 2, h, y, theme, data, tr, sr);
  }

  _drawSectionLabel(ctx, x, y, theme, label, tr) {
    if (!tr) return;
    tr.render(ctx, label, x, y, {
      font: theme.fontFamilyUi,
      size: theme.fontSize,
      color: theme.textAccent,
    });
  }

  _drawHeader(ctx, x, y, w, theme, data) {
    const tr = this.ctx.renderers?.text;
    if (!tr) return;
    const sp = theme.spacing;
    const cardW = (w - sp * 2) / 3;
    const cardH = 56;

    const fpsColor = this._statusColor(data.fps, 30, 20, theme, true);
    this._drawCard(ctx, x, y, cardW, cardH, theme, "FPS", String(data.fps), null, fpsColor);

    const frameTarget = data.budget;
    const frameColor = this._statusColor(data.frameTime, frameTarget, frameTarget * 1.25, theme);
    this._drawCard(ctx, x + cardW + sp, y, cardW, cardH, theme, "Frame", `${data.frameTime}ms`, null, frameColor);

    const budgetColor = this._statusColor(data.budgetPct, 80, 100, theme);
    this._drawCard(ctx, x + (cardW + sp) * 2, y, cardW, cardH, theme, "Budget", `${data.budgetPct}%`, data.budgetPct / 100, budgetColor);
  }

  _drawCard(ctx, x, y, w, h, theme, label, value, fillRatio, statusColor) {
    const tr = this.ctx.renderers?.text;
    ctx.fillStyle = theme.background;
    ctx.fillRect(x, y, w, h);

    ctx.fillStyle = statusColor;
    ctx.fillRect(x + 2, y + 4, 3, h - 8);

    if (tr) {
      tr.render(ctx, label, x + 10, y + 6, {
        size: theme.fontSize - 1,
        color: theme.textDim,
      });
      tr.render(ctx, value, x + 10, y + 22, {
        size: theme.fontSize + 2,
        color: theme.textAccent,
      });
    }

    if (fillRatio != null) {
      ctx.fillStyle = statusColor + "40";
      ctx.fillRect(x + 4, y + h - 6, Math.min(fillRatio, 1) * (w - 8), 3);
    }
  }

  _statusColor(value, warnAt, critAt, theme, reversed = false) {
    if (reversed) {
      if (value <= critAt) return theme.fpsBad;
      if (value <= warnAt) return theme.fpsWarn;
      return theme.fpsGood;
    }
    if (value >= critAt) return theme.fpsBad;
    if (value >= warnAt) return theme.fpsWarn;
    return theme.fpsGood;
  }

  _drawSubsystems(ctx, x, cursorY, w, panelH, panelY, theme, data, tr, fbr) {
    if (!data.subsystems.length) {
      if (tr) {
        tr.render(ctx, "No subsystem data", x + theme.spacing, cursorY, {
          size: theme.fontSize,
          color: theme.textDim,
        });
        cursorY += theme.fontSize * 1.5;
      }
      return cursorY;
    }

    const rowH = 18;
    const labelX = x;
    const valRight = x + 160;
    const pctRight = x + 200;
    const barX = x + 220;
    const barW = Math.max(w - 220 - 10, 20);

    for (const sub of data.subsystems) {
      if (cursorY + rowH > panelY + panelH - theme.padding) break;

      if (tr) {
        tr.render(ctx, sub.displayName, labelX, cursorY, {
          size: theme.fontSize,
          color: theme.text,
        });
        const valStr = `${sub.value.toFixed(1)}ms`;
        const valM = tr.measure(ctx, valStr, { size: theme.fontSize });
        tr.render(ctx, valStr, valRight - valM.width, cursorY, {
          size: theme.fontSize,
          color: theme.textDim,
        });
        tr.render(ctx, `${sub.pct}%`, pctRight, cursorY, {
          size: theme.fontSize,
          color: theme.textDim,
        });
      }

      if (fbr) {
        fbr.render(ctx, barX, cursorY, barW, rowH, {
          duration: sub.value,
          total: data.frameTime || 1,
          color: sub.color,
          label: "",
        }, theme);
      }

      cursorY += rowH;
    }
    return cursorY;
  }

  _drawOffenders(ctx, x, cursorY, w, panelH, panelY, theme, data, tr, sr) {
    if (!data.offenders.length) {
      if (tr) {
        tr.render(ctx, "No offender data", x + theme.spacing, cursorY, {
          size: theme.fontSize,
          color: theme.textDim,
        });
      }
      return;
    }

    const rowH = 20;
    const sparkW = Math.min(80, Math.max(40, w - 330));
    const labelX = x;
    const avgX = x + 140;
    const maxX = x + 230;
    const sparkX = x + 310;

    for (const off of data.offenders) {
      if (cursorY + rowH > panelY + panelH - theme.padding) break;

      if (tr) {
        tr.render(ctx, off.displayName, labelX, cursorY, {
          size: theme.fontSize,
          color: theme.text,
        });
        const avgStr = `avg ${off.avg.toFixed(1)}ms`;
        tr.render(ctx, avgStr, avgX, cursorY, {
          size: theme.fontSize,
          color: theme.textDim,
        });
        const maxStr = `max ${off.max.toFixed(1)}ms`;
        tr.render(ctx, maxStr, maxX, cursorY, {
          size: theme.fontSize,
          color: theme.textDim,
        });
      }

      if (sr && off.values && off.values.length >= 2) {
        sr.render(ctx, sparkX, cursorY, sparkW, rowH, off.values, {
          color: off.color,
          lineWidth: 1.2,
        });
      }

      cursorY += rowH;
    }
  }
}
