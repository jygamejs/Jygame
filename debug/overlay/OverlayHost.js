import { ViewRegistry, ViewContext, CommandSystem, SelectionManager, PersistenceManager, TooltipManager, AnimationSystem } from "../core/index.js";
import { DarkTheme, LightTheme } from "../core/theme/index.js";
import { PerformanceView, FrameGraphView, TimelineView, MetricBrowserView, EventViewerView, CaptureBrowserView, SettingsView } from "../core/views/index.js";
import { OverlayLayout } from "./OverlayLayout.js";

export class OverlayHost {
  constructor(game) {
    this._game = game;
    this._visible = false;
    this._cachedContext = null;

    const storage = {
      getItem: (k) => localStorage?.getItem(k),
      setItem: (k, v) => localStorage?.setItem(k, v),
      removeItem: (k) => localStorage?.removeItem(k),
    };

    this._commands = new CommandSystem();
    this._commands.on("afterExecute", () => this._requestRender());

    this._selection = new SelectionManager();
    this._animation = new AnimationSystem();
    this._animation.on("changed", () => this._requestRender());

    this._persistence = new PersistenceManager(storage, "jygame:overlay:");
    this._tooltips = new TooltipManager();
    this._tooltips.on("visibilityChanged", () => this._requestRender());

    this._viewRegistry = new ViewRegistry();
    this._viewRegistry.register("performance", PerformanceView);
    this._viewRegistry.register("framegraph", FrameGraphView);
    this._viewRegistry.register("timeline", TimelineView);
    this._viewRegistry.register("metrics", MetricBrowserView);
    this._viewRegistry.register("events", EventViewerView);
    this._viewRegistry.register("captures", CaptureBrowserView);
    this._viewRegistry.register("settings", SettingsView);

    this._contextProvider = () => this._currentContext();
    this._views = new Map();
    this._activeViews = new Set(["performance", "framegraph", "timeline", "events"]);

    this._layout = new OverlayLayout(DarkTheme);
    this._renderRequested = false;

    this._commands.register("overlay:toggle", () => this.toggle(), "`");
    this._commands.register("view:performance:toggle", () => this._toggleView("performance"), "1");
    this._commands.register("view:framegraph:toggle", () => this._toggleView("framegraph"), "2");
    this._commands.register("view:timeline:toggle", () => this._toggleView("timeline"), "3");
    this._commands.register("view:metrics:toggle", () => this._toggleView("metrics"), "4");
    this._commands.register("view:events:toggle", () => this._toggleView("events"), "5");

    const savedLayout = this._persistence.load("layout");
    if (savedLayout) this._layout.restore(savedLayout);

    if (game.inputSystem) {
      game.inputSystem.addInputConsumer((event) => this._processInput(event));
    }
  }

  get visible() { return this._visible; }
  get commands() { return this._commands; }
  get selection() { return this._selection; }
  get context() { return this._currentContext(); }

  show() {
    if (this._visible) return;
    this._visible = true;
    const diag = this._game._getDiag?.();
    if (diag) {
      this._cachedContext = new ViewContext({
        history: diag.history,
        registry: diag.registry,
        analysis: diag.analysis,
        theme: this._theme || DarkTheme,
        selection: this._selection,
      });
    }
    this._activeViews.forEach(id => this._getView(id)?.onActivate());
    this._requestRender();
  }

  hide() {
    if (!this._visible) return;
    this._visible = false;
    this._activeViews.forEach(id => this._getView(id)?.onDeactivate());
  }

  toggle() {
    if (this._visible) this.hide();
    else this.show();
  }

  _currentContext() {
    if (this._cachedContext) return this._cachedContext;
    const diag = this._game._getDiag?.();
    this._cachedContext = new ViewContext({
      history: diag?.history ?? null,
      registry: diag?.registry ?? null,
      analysis: diag?.analysis ?? null,
      theme: this._theme || DarkTheme,
      selection: this._selection,
      config: this._persistence.load("settings") ?? {},
    });
    return this._cachedContext;
  }

  _getView(id) {
    if (!this._views.has(id)) {
      const ViewClass = this._viewRegistry.get(id);
      if (!ViewClass) return null;
      this._views.set(id, new ViewClass(this._contextProvider));
    }
    return this._views.get(id);
  }

  _toggleView(id) {
    if (this._activeViews.has(id)) {
      this._getView(id)?.onDeactivate();
      this._activeViews.delete(id);
    } else {
      this._activeViews.add(id);
      this._getView(id)?.onActivate();
    }
    this._requestRender();
  }

  _processInput(event) {
    if (!this._visible) return false;
    if (event.type === "keydown" || event.type === "KEY_DOWN") {
      const key = event.data?.key ?? event.key;
      const cmdName = this._commands.resolveShortcut(key);
      if (cmdName) return this._commands.execute(cmdName);
    }
    for (const id of this._activeViews) {
      const view = this._getView(id);
      if (!view) continue;
      const rect = this._layout?.getViewRect(id);
      if (rect && view.handleInput(event, rect)) return true;
    }
    return false;
  }

  _requestRender() {
    this._renderRequested = true;
  }

  update(dt) {
    if (!this._visible) return;
    this._cachedContext = null;
    this._animation.tick(dt);
    for (const id of this._activeViews) {
      this._getView(id)?.update(dt);
    }
  }

  render(ctx, width, height) {
    if (!this._visible) return;
    this._cachedContext = null;
    this._renderRequested = false;
    this._layout.compute(width, height);
    ctx.save();
    for (const id of this._activeViews) {
      const view = this._getView(id);
      if (!view) continue;
      const rect = this._layout.getViewRect(id);
      if (rect) {
        view.rect = rect;
        view.render(ctx, rect);
      }
    }
    ctx.restore();
  }

  destroy() {
    this.hide();
    this._views.forEach(view => view.dispose());
    this._views.clear();
    this._activeViews.clear();
  }
}
