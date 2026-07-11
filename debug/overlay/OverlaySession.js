import { OverlayContext } from "./OverlayContext.js";
import { PanelManager } from "./PanelManager.js";
import { LayoutEngine } from "./LayoutEngine.js";
import { DarkTheme } from "./theme/DarkTheme.js";
import { SparklineRenderer } from "./renderers/SparklineRenderer.js";
import { HistogramRenderer } from "./renderers/HistogramRenderer.js";
import { FrameBarRenderer } from "./renderers/FrameBarRenderer.js";
import { TextRenderer } from "./renderers/TextRenderer.js";
import { InputRouter } from "./InputRouter.js";
import { SelectionManager } from "./SelectionManager.js";
import { CommandSystem } from "./CommandSystem.js";
import { TooltipManager } from "./TooltipManager.js";
import { AnimationSystem } from "./AnimationSystem.js";

export class OverlaySession {
  constructor({ history, registry, analysis, config, theme } = {}) {
    const resolvedTheme = theme || DarkTheme;
    this._ctx = new OverlayContext({ history, registry, analysis, config, theme: resolvedTheme });
    this._visible = false;
    this._panels = new PanelManager(this._ctx);
    this._layout = new LayoutEngine(resolvedTheme);
    this._ctx.layout = this._layout;

    this._selection = new SelectionManager();
    this._ctx.selection = this._selection;
    this._input = new InputRouter(this._ctx, this._panels, this._layout);
    this._ctx.input = this._input;
    this._tooltips = new TooltipManager(this._ctx);
    this._ctx.tooltips = this._tooltips;
    this._animation = new AnimationSystem();
    this._ctx.animation = this._animation;
    this._commands = new CommandSystem(this);
    this._ctx.commands = this._commands;

    this._textRenderer = new TextRenderer(resolvedTheme);
    this._sparklineRenderer = new SparklineRenderer();
    this._histogramRenderer = new HistogramRenderer();
    this._frameBarRenderer = new FrameBarRenderer();
    this._ctx.renderers = {
      text: this._textRenderer,
      sparkline: this._sparklineRenderer,
      histogram: this._histogramRenderer,
      frameBar: this._frameBarRenderer,
    };
  }

  get visible() {
    return this._visible;
  }

  get context() {
    return this._ctx;
  }

  get panels() {
    return this._panels;
  }

  get commands() { return this._commands; }
  get tooltips() { return this._tooltips; }
  get animation() { return this._animation; }

  update(dt) {
    if (!this._visible) return;
    this._animation.tick(dt);
    this._panels.update({ dt });
  }

  get layout() {
    return this._layout;
  }

  get input() {
    return this._input;
  }

  get selection() {
    return this._selection;
  }

  processInput(event) {
    if (!this._visible) return false;
    return this._input.process(event);
  }

  get renderers() {
    return this._ctx.renderers;
  }

  render(ctx, width, height) {
    if (!this._visible) return;
    this._layout.compute(width, height);
    ctx.save();
    this._panels.render(ctx);
    ctx.restore();
  }

  show() {
    if (this._visible) return;
    this._visible = true;
  }

  hide() {
    if (!this._visible) return;
    this._visible = false;
  }

  toggle() {
    if (this._visible) {
      this.hide();
    } else {
      this.show();
    }
  }

  destroy() {
    this._panels.hideAll();
    this._panels.forEach(panel => panel.onDestroy());
    this._visible = false;
  }
}
