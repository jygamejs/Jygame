import { View } from "../View.js";
import { DarkTheme } from "../theme/DarkTheme.js";
import { MetricType } from "../../MetricType.js";

export class FrameGraphView extends View {
  static metadata = { title: "Frame Graph", icon: "\u26A1" };
  constructor(contextProvider) {
    super(contextProvider);
    this._data = null;
    this._visibleMetrics = new Set();
    this._initialized = false;
  }

  update(dt) {
    const analysis = this.ctx.analysis;
    const registry = this.ctx.registry;
    const history = this.ctx.history;

    if (!analysis || !registry || !history || !history.count) {
      this._data = null;
      return;
    }

    const metricDescs = [];
    registry.forEach(desc => {
      if (desc.type !== MetricType.TIMER) return;
      if (desc.name === "frame.fps") return;
      metricDescs.push(desc);
    });
    metricDescs.sort((a, b) => {
      if (a.name === "frame.total") return -1;
      if (b.name === "frame.total") return 1;
      return a.displayName.localeCompare(b.displayName);
    });

    const frameCount = Math.min(history.count, 300);

    if (!this._initialized) {
      for (const desc of metricDescs) {
        this._visibleMetrics.add(desc.name);
      }
      this._initialized = true;
    }

    const metrics = [];
    let yMin = Infinity;
    let yMax = -Infinity;

    for (const desc of metricDescs) {
      const values = [];
      let taken = 0;
      for (const snap of history.frames()) {
        if (taken >= frameCount) break;
        values.push(snap.timerTotal(desc.id));
        taken++;
      }
      if (values.length < 2) continue;

      const visible = this._visibleMetrics.has(desc.name);
      if (visible) {
        const localMin = Math.min(...values);
        const localMax = Math.max(...values);
        if (localMin < yMin) yMin = localMin;
        if (localMax > yMax) yMax = localMax;
      }

      metrics.push({
        name: desc.name,
        displayName: desc.displayName,
        color: desc.color || "#88ccff",
        values,
        visible,
      });
    }

    if (metrics.length === 0) {
      this._data = null;
      return;
    }

    if (!isFinite(yMin) || !isFinite(yMax)) {
      yMin = 0;
      yMax = 16.67;
    }

    const padding = yMax > yMin ? (yMax - yMin) * 0.1 : Math.max(yMax * 0.1, 1);
    const graphYMin = Math.max(0, yMin - padding);
    const graphYMax = yMax + padding;

    this._data = { metrics, yMin: graphYMin, yMax: graphYMax, frameCount };
  }

  toggleMetric(name) {
    if (this._visibleMetrics.has(name)) {
      this._visibleMetrics.delete(name);
    } else {
      this._visibleMetrics.add(name);
    }
  }

  isMetricVisible(name) {
    return this._visibleMetrics.has(name);
  }

  render(ctx, rect) {
    if (!rect) return;
    const theme = this.ctx.theme || DarkTheme;
    const { x, y, width: w, height: h } = rect;
    const data = this._data;
    const tr = this.ctx.renderers?.text;

    ctx.fillStyle = theme.panelBg;
    ctx.fillRect(x, y, w, h);

    if (!data) {
      if (tr) {
        tr.render(ctx, "No data", x + theme.padding, y + theme.padding, { color: theme.textDim });
      }
      return;
    }

    const pad = theme.padding;
    const legendH = 20;
    const graphAreaH = h - pad * 2 - legendH;
    const yAxisW = 40;
    const graphX = x + pad + 5;
    const graphY = y + pad;
    const graphW = Math.max(w - pad * 2 - yAxisW - 10, 20);
    const graphH = Math.max(graphAreaH, 10);
    const yRange = data.yMax - data.yMin || 1;

    this._drawGrid(ctx, graphX, graphY, graphW, graphH, data, theme, tr, yAxisW, yRange);

    this._drawCurrentFrame(ctx, graphX, graphY, graphW, graphH, data, theme);

    this._drawLines(ctx, graphX, graphY, graphW, graphH, data, yRange);

    this._drawLegend(ctx, x, y, w, h, theme, data, tr, pad, legendH);
  }

  _drawGrid(ctx, gx, gy, gw, gh, data, theme, tr, yAxisW, yRange) {
    const steps = this._niceYSteps(data.yMin, data.yMax, 5);
    ctx.strokeStyle = theme.border;
    ctx.lineWidth = 0.5;

    for (const step of steps) {
      const sy = gy + gh - ((step - data.yMin) / yRange) * gh;
      ctx.beginPath();
      ctx.moveTo(gx, sy);
      ctx.lineTo(gx + gw, sy);
      ctx.stroke();

      if (tr) {
        tr.render(ctx, step.toFixed(1), gx + gw + 4, sy - 5, {
          size: this.ctx.theme?.fontSizeSmall || 10,
          color: theme.textDim,
          baseline: "middle",
        });
      }
    }
  }

  _drawCurrentFrame(ctx, gx, gy, gw, gh, data, theme) {
    if (data.frameCount < 2) return;
    const stepX = gw / (data.frameCount - 1);
    const currentX = gx + gw - stepX;

    if (ctx.setLineDash) ctx.setLineDash([3, 3]);
    ctx.strokeStyle = theme.textDim;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(currentX, gy);
    ctx.lineTo(currentX, gy + gh);
    ctx.stroke();
    if (ctx.setLineDash) ctx.setLineDash([]);
  }

  _drawLines(ctx, gx, gy, gw, gh, data, yRange) {
    if (data.frameCount < 2) return;
    const stepX = gw / (data.frameCount - 1);

    for (const metric of data.metrics) {
      if (!metric.visible || metric.values.length < 2) continue;
      const vals = metric.values;
      const lw = metric.name === "frame.total" ? 2 : 1;

      ctx.beginPath();
      for (let i = 0; i < vals.length; i++) {
        const px = gx + i * stepX;
        const py = gy + gh - ((vals[i] - data.yMin) / yRange) * gh;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = metric.color;
      ctx.lineWidth = lw;
      ctx.stroke();
    }
  }

  _drawLegend(ctx, px, py, pw, ph, theme, data, tr, pad, legendH) {
    const legendY = py + ph - legendH;
    let legendX = px + pad;

    for (const metric of data.metrics) {
      const dotSize = 8;
      const isVis = metric.visible;

      ctx.fillStyle = isVis ? metric.color : theme.textDim;
      ctx.fillRect(legendX, legendY + (legendH - dotSize) / 2, dotSize, dotSize);

      if (tr) {
        const label = metric.displayName;
        tr.render(ctx, label, legendX + dotSize + 4, legendY + (legendH - 10) / 2, {
          size: theme.fontSizeSmall,
          color: isVis ? theme.text : theme.textDim,
          baseline: "middle",
        });
        const m = tr.measure(ctx, label, { size: theme.fontSizeSmall });
        legendX += dotSize + 4 + m.width + theme.spacing * 2;
      } else {
        legendX += dotSize + 4 + 80;
      }

      if (legendX > px + pw - pad) break;
    }
  }

  _niceYSteps(min, max, count) {
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
}
