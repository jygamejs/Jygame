import { Panel } from "../Panel.js";
import { DarkTheme } from "../theme/DarkTheme.js";
import { LightTheme } from "../theme/LightTheme.js";

const SETTING_DEFS = {
  fpsTarget: { min: 30, max: 240, step: 10, default: 60, label: "FPS Target" },
  refreshRate: { min: 1, max: 10, step: 1, default: 1, label: "Refresh Rate" },
  fontSize: { min: 8, max: 24, step: 1, default: 12, label: "Font Size" },
  opacity: { min: 0.1, max: 1.0, step: 0.05, default: 0.85, label: "Opacity" },
};

const SETTING_KEYS = ["fpsTarget", "refreshRate", "fontSize", "opacity"];

export class SettingsPanel extends Panel {
  constructor(context) {
    super("settings", "Settings", context, {
      icon: "\u2699",
      defaultWidth: 400,
      defaultHeight: 300,
      minWidth: 250,
      minHeight: 200,
    });
    this._clickRegions = [];
  }

  _getConfig() {
    return this.ctx.config || {};
  }

  _getSetting(key) {
    const def = SETTING_DEFS[key];
    return this._getConfig()[key] ?? def.default;
  }

  _setSetting(key, val) {
    if (!this.ctx.config) this.ctx.config = {};
    const def = SETTING_DEFS[key];
    this.ctx.config[key] = Math.max(def.min, Math.min(def.max, val));
    if (key === "opacity") {
      this.ctx.config[key] = Math.round(this.ctx.config[key] * 100) / 100;
    }
  }

  _adjustSetting(key, delta) {
    this._setSetting(key, this._getSetting(key) + delta);
  }

  _setTheme(mode) {
    if (!this.ctx.config) this.ctx.config = {};
    this.ctx.config.theme = mode;
    this.ctx.theme = mode === "light" ? LightTheme : DarkTheme;
    if (this.ctx.cache) this.ctx.cache.invalidateAll();
  }

  _resetLayout() {
    if (this.ctx.layout?.reset) this.ctx.layout.reset();
  }

  _resetAll() {
    for (const key of SETTING_KEYS) {
      this._setSetting(key, SETTING_DEFS[key].default);
    }
    this._setTheme("dark");
    this._resetLayout();
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
    const rowH = 24;
    const fs = theme.fontSize;
    let rowY = y + pad + 4;

    // Theme row
    this._drawThemeRow(ctx, x, rowY, w, theme, tr, pad, sp, rowH);
    rowY += rowH + sp;

    // Number setting rows
    for (const key of SETTING_KEYS) {
      this._drawNumberRow(ctx, x, rowY, w, theme, tr, pad, rowH, key);
      rowY += rowH + sp;
    }

    // Reset buttons
    this._drawResetRow(ctx, x, rowY, w, theme, tr, pad, sp, rowH);
  }

  _drawThemeRow(ctx, x, y, w, theme, tr, pad, sp, rowH) {
    const btnW = 55;
    const btnH = 20;
    const btnY = y + (rowH - btnH) / 2;
    const rightEdge = x + w - pad;
    const darkX = rightEdge - btnW * 2 - sp - 4;
    const lightX = darkX + btnW + sp;
    const isDark = (this._getConfig().theme || "dark") === "dark";

    ctx.fillStyle = isDark ? theme.accent : theme.background;
    ctx.fillRect(darkX, btnY, btnW, btnH);
    if (tr) {
      tr.render(ctx, "Dark", darkX + btnW / 2, btnY + btnH / 2, {
        size: theme.fontSize, color: isDark ? theme.textAccent : theme.text, align: "center", baseline: "middle",
      });
    }
    this._clickRegions.push({ x: darkX, y: btnY, w: btnW, h: btnH, handler: () => this._setTheme("dark") });

    ctx.fillStyle = isDark ? theme.background : theme.accent;
    ctx.fillRect(lightX, btnY, btnW, btnH);
    if (tr) {
      tr.render(ctx, "Light", lightX + btnW / 2, btnY + btnH / 2, {
        size: theme.fontSize, color: isDark ? theme.text : theme.textAccent, align: "center", baseline: "middle",
      });
    }
    this._clickRegions.push({ x: lightX, y: btnY, w: btnW, h: btnH, handler: () => this._setTheme("light") });

    if (tr) {
      tr.render(ctx, "Theme", x + pad, y + rowH / 2, {
        size: theme.fontSize, color: theme.text, baseline: "middle",
      });
    }
  }

  _drawNumberRow(ctx, x, y, w, theme, tr, pad, rowH, key) {
    const def = SETTING_DEFS[key];
    const value = this._getSetting(key);
    const display = key === "opacity" ? value.toFixed(2) : String(Math.round(value));
    const btnSize = 20;
    const btnY = y + (rowH - btnSize) / 2;
    const rightEdge = x + w - pad;
    const incX = rightEdge - btnSize;
    const decX = incX - 56;

    // Decrement button
    ctx.fillStyle = theme.background;
    ctx.fillRect(decX, btnY, btnSize, btnSize);
    if (tr) {
      tr.render(ctx, "\u2212", decX + btnSize / 2, btnY + btnSize / 2, {
        size: theme.fontSize, color: theme.text, align: "center", baseline: "middle",
      });
    }
    this._clickRegions.push({
      x: decX, y: btnY, w: btnSize, h: btnSize,
      handler: () => this._adjustSetting(key, -def.step),
    });

    // Value
    if (tr) {
      tr.render(ctx, display, decX + 28, y + rowH / 2, {
        size: theme.fontSize, color: theme.textAccent, align: "center", baseline: "middle",
      });
    }

    // Increment button
    ctx.fillStyle = theme.background;
    ctx.fillRect(incX, btnY, btnSize, btnSize);
    if (tr) {
      tr.render(ctx, "+", incX + btnSize / 2, btnY + btnSize / 2, {
        size: theme.fontSize, color: theme.text, align: "center", baseline: "middle",
      });
    }
    this._clickRegions.push({
      x: incX, y: btnY, w: btnSize, h: btnSize,
      handler: () => this._adjustSetting(key, def.step),
    });

    // Label
    if (tr) {
      tr.render(ctx, def.label, x + pad, y + rowH / 2, {
        size: theme.fontSize, color: theme.text, baseline: "middle",
      });
    }
  }

  _drawResetRow(ctx, x, y, w, theme, tr, pad, sp, rowH) {
    const btnW = 90;
    const btnH = 22;
    const btnY = y + (rowH - btnH) / 2;
    const center = x + w / 2;

    const layoutX = center - sp / 2 - btnW;
    const allX = center + sp / 2;

    ctx.fillStyle = theme.background;
    ctx.fillRect(layoutX, btnY, btnW, btnH);
    if (tr) {
      tr.render(ctx, "Reset Layout", layoutX + btnW / 2, btnY + btnH / 2, {
        size: theme.fontSize, color: theme.text, align: "center", baseline: "middle",
      });
    }
    this._clickRegions.push({
      x: layoutX, y: btnY, w: btnW, h: btnH,
      handler: () => this._resetLayout(),
    });

    ctx.fillStyle = theme.background;
    ctx.fillRect(allX, btnY, btnW, btnH);
    if (tr) {
      tr.render(ctx, "Reset All", allX + btnW / 2, btnY + btnH / 2, {
        size: theme.fontSize, color: theme.text, align: "center", baseline: "middle",
      });
    }
    this._clickRegions.push({
      x: allX, y: btnY, w: btnW, h: btnH,
      handler: () => this._resetAll(),
    });
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
