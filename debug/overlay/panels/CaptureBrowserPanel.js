import { Panel } from "../Panel.js";
import { DarkTheme } from "../theme/DarkTheme.js";

export class CaptureBrowserPanel extends Panel {
  constructor(context) {
    super("captures", "Capture Browser", context, {
      icon: "\u29C9",
      defaultWidth: 600,
      defaultHeight: 400,
      minWidth: 300,
      minHeight: 200,
    });
    this._selectedIndex = -1;
    this._clickRegions = [];
  }

  update(data) {
    const len = (this.ctx.captures || []).length;
    if (len === 0) {
      this._selectedIndex = -1;
    } else if (this._selectedIndex >= len) {
      this._selectedIndex = len - 1;
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
    const captures = this.ctx.captures || [];

    if (!captures.length) {
      if (tr) {
        tr.render(ctx, "No captures", x + pad, y + pad, { color: theme.textDim });
      }
      return;
    }

    // Split panel: list top portion, preview bottom portion
    const listH = Math.max(Math.round(h * 0.45), 80);
    const actionH = 28;

    this._drawCaptureList(ctx, x, y, w, listH, captures, theme, tr, pad, sp);
    this._drawActionBar(ctx, x, y + listH, w, actionH, theme, tr, pad, sp);

    if (this._selectedIndex >= 0 && this._selectedIndex < captures.length) {
      const previewY = y + listH + actionH + sp;
      const previewH = h - (listH + actionH + sp) - pad;
      if (previewH > 30) {
        this._drawPreview(ctx, x, previewY, w, previewH, captures[this._selectedIndex], theme, tr, pad);
      }
    }
  }

  _drawCaptureList(ctx, x, y, w, maxH, captures, theme, tr, pad, sp) {
    const rowH = 22;
    const headerH = 18;
    const fs = theme.fontSizeSmall || theme.fontSize - 1;
    const panelBottom = y + maxH - pad;
    let rowY = y + pad;

    // Header
    ctx.fillStyle = theme.background;
    ctx.fillRect(x + pad, rowY, w - pad * 2, headerH);
    if (tr) {
      tr.render(ctx, "Capture", x + pad + 6, rowY + headerH / 2, {
        size: fs, color: theme.textDim, baseline: "middle",
      });
      const frameLabel = "Frames";
      const fm = tr.measure(ctx, frameLabel, { size: fs });
      tr.render(ctx, frameLabel, x + w - pad - fm.width - 80, rowY + headerH / 2, {
        size: fs, color: theme.textDim, baseline: "middle",
      });
      tr.render(ctx, "Trigger", x + w - pad - 60, rowY + headerH / 2, {
        size: fs, color: theme.textDim, baseline: "middle",
      });
    }
    rowY += headerH;

    for (let i = 0; i < captures.length; i++) {
      if (rowY + rowH > panelBottom) break;
      const cap = captures[i];
      const selected = i === this._selectedIndex;

      ctx.fillStyle = selected ? theme.accent : (i % 2 === 0 ? theme.panelBg : theme.background);
      ctx.fillRect(x + pad, rowY, w - pad * 2, rowH);

      if (tr) {
        const time = new Date(cap.timestamp).toLocaleTimeString();
        const name = `${cap.name} (${time})`;
        tr.render(ctx, name, x + pad + 6, rowY + rowH / 2, {
          size: fs, color: selected ? theme.textAccent : theme.text, baseline: "middle",
        });

        const frameStr = String(cap.snapshots.length);
        const frameM = tr.measure(ctx, frameStr, { size: fs });
        tr.render(ctx, frameStr, x + w - pad - frameM.width - 80, rowY + rowH / 2, {
          size: fs, color: selected ? theme.textAccent : theme.text, baseline: "middle",
        });

        const triggerLabel = cap.triggerName || cap.name;
        tr.render(ctx, triggerLabel, x + w - pad - 56, rowY + rowH / 2, {
          size: fs, color: selected ? theme.textAccent : theme.textDim, baseline: "middle",
        });
      }

      this._clickRegions.push({
        x: x + pad, y: rowY, w: w - pad * 2, h: rowH,
        handler: () => { this._selectedIndex = i; },
      });

      rowY += rowH;
    }
  }

  _drawActionBar(ctx, x, y, w, h, theme, tr, pad, sp) {
    const buttons = ["Preview", "Export", "Delete"];
    const btnCount = buttons.length;
    const totalSp = sp * (btnCount - 1);
    const btnW = Math.max((240 - totalSp) / btnCount, 60);
    const barX = x + pad;

    for (let i = 0; i < btnCount; i++) {
      const bx = barX + i * (btnW + sp);
      const hasSelection = this._selectedIndex >= 0;
      ctx.fillStyle = hasSelection ? theme.accent : theme.background;
      ctx.fillRect(bx, y, btnW, h);

      if (tr) {
        tr.render(ctx, buttons[i], bx + btnW / 2, y + h / 2, {
          size: theme.fontSize,
          color: hasSelection ? theme.textAccent : theme.textDim,
          align: "center",
          baseline: "middle",
        });
      }

      this._clickRegions.push({
        x: bx, y, w: btnW, h,
        handler: () => {
          if (this._selectedIndex < 0) return;
          if (i === 1) this._exportCapture();
          else if (i === 2) this._deleteCapture();
        },
      });
    }
  }

  _drawPreview(ctx, x, y, w, h, capture, theme, tr, pad) {
    const snapshots = capture.snapshots;
    if (snapshots.length < 2) return;

    const desc = capture.metrics?.find?.("frame.total");
    const id = desc?.id;
    if (id == null) return;

    const values = snapshots.map(s => s.timerTotal(id));
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const range = maxVal - minVal || 1;

    const graphX = x + pad + 4;
    const graphY = y + 2;
    const graphW = Math.max(w - pad * 2 - 8, 20);
    const graphH = Math.max(h - 22, 10);

    const triggerIdx = Math.min(capture.preFrames, snapshots.length - 1);

    // Grid lines
    ctx.strokeStyle = theme.border;
    ctx.lineWidth = 0.5;
    const steps = this._niceSteps(minVal, maxVal, 3);
    for (const step of steps) {
      const sy = graphY + graphH - ((step - minVal) / range) * graphH;
      ctx.beginPath();
      ctx.moveTo(graphX, sy);
      ctx.lineTo(graphX + graphW, sy);
      ctx.stroke();
      if (tr) {
        tr.render(ctx, step.toFixed(1), graphX - 2, sy, {
          size: theme.fontSizeSmall || 9, color: theme.textDim, align: "right", baseline: "middle",
        });
      }
    }

    // Data line
    const stepX = graphW / (values.length - 1);
    ctx.beginPath();
    for (let i = 0; i < values.length; i++) {
      const px = graphX + i * stepX;
      const py = graphY + graphH - ((values[i] - minVal) / range) * graphH;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = theme.accent || "#88ccff";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Trigger line
    const tx = graphX + triggerIdx * stepX;
    if (ctx.setLineDash) ctx.setLineDash([3, 3]);
    ctx.strokeStyle = "#ff4444";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tx, graphY);
    ctx.lineTo(tx, graphY + graphH);
    ctx.stroke();
    if (ctx.setLineDash) ctx.setLineDash([]);

    // Labels
    if (tr) {
      const labelY = graphY + graphH + 2;
      tr.render(ctx, `pre: ${capture.preFrames}`, graphX, labelY, {
        size: theme.fontSizeSmall || 9, color: theme.textDim,
      });
      tr.render(ctx, "trigger", tx, labelY, {
        size: theme.fontSizeSmall || 9, color: "#ff4444", align: "center",
      });
      tr.render(ctx, `post: ${capture.postFrames}`, graphX + graphW, labelY, {
        size: theme.fontSizeSmall || 9, color: theme.textDim, align: "right",
      });
    }
  }

  _niceSteps(min, max, count) {
    const range = max - min || 1;
    const roughStep = range / count;
    const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
    const normalized = roughStep / magnitude;
    let niceStep;
    if (normalized <= 1.5) niceStep = magnitude;
    else if (normalized <= 3.5) niceStep = 2 * magnitude;
    else if (normalized <= 7.5) niceStep = 5 * magnitude;
    else niceStep = 10 * magnitude;

    const start = Math.ceil(min / niceStep) * niceStep;
    const steps = [];
    for (let v = start; v <= max + niceStep * 0.001; v += niceStep) {
      steps.push(parseFloat(v.toFixed(6)));
    }
    return steps;
  }

  _exportCapture() {
    const cap = (this.ctx.captures || [])[this._selectedIndex];
    if (!cap) return;
    if (this.ctx.commands?.execute) {
      this.ctx.commands.execute("export:capture", cap);
    }
  }

  _deleteCapture() {
    const captures = this.ctx.captures;
    if (!captures || this._selectedIndex < 0 || this._selectedIndex >= captures.length) return;
    captures.splice(this._selectedIndex, 1);
    if (this._selectedIndex >= captures.length) {
      this._selectedIndex = captures.length - 1;
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
