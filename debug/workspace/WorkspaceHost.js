import { ViewRegistry, ViewContext, CommandSystem, SelectionManager, OffscreenCache } from "../core/index.js";
import { TextRenderer, SparklineRenderer, HistogramRenderer, FrameBarRenderer, TimelineRenderer } from "../core/renderers/index.js";
import { DarkTheme, LightTheme } from "../core/theme/index.js";
import { PerformanceView, FrameGraphView, TimelineView, MetricBrowserView, EventViewerView, CaptureBrowserView, SettingsView } from "../core/views/index.js";
import { WorkspaceSnapshotStore } from "./WorkspaceSnapshotStore.js";
import { CaptureResult } from "../CaptureResult.js";

const TAB_HEIGHT = 32;

export class WorkspaceHost {
  constructor(canvas, backend) {
    this._canvas = canvas;
    this._ctx2d = canvas.getContext("2d");
    this._backend = backend;
    this._store = new WorkspaceSnapshotStore();
    this._cachedContext = null;

    this._cache = new OffscreenCache();
    this._renderers = {
      text: new TextRenderer(),
      sparkline: new SparklineRenderer(),
      histogram: new HistogramRenderer(),
      frameBar: new FrameBarRenderer(),
      timeline: new TimelineRenderer(),
    };

    this._selection = new SelectionManager();
    this._commands = new CommandSystem();
    this._captures = [];

    this._commands.register("export:capture", (cap) => {
      const json = JSON.stringify(cap.toJSON(), null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `capture-${cap.timestamp}.json`;
      a.click();
      URL.revokeObjectURL(url);
      return true;
    });

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
    this._activeViewId = "performance";
    this._getView("performance")?.onActivate();
    this._tabRects = [];
    this._userConfig = {};

    this._backend.onMessage((msg) => {
      if (msg?.type === "snapshot" && msg.payload) {
        this._store.ingest(msg.payload);
        this._render();
      }
    });

    this._boundClick = this._onClick.bind(this);
    this._boundKeyDown = this._onKeyDown.bind(this);
    canvas.addEventListener("click", this._boundClick);
    document.addEventListener("keydown", this._boundKeyDown);
  }

  get selection() { return this._selection; }
  get commands() { return this._commands; }
  get store() { return this._store; }
  get activeViewId() { return this._activeViewId; }

  activateView(id) {
    if (id === this._activeViewId) return;
    this._getView(this._activeViewId)?.onDeactivate();
    this._activeViewId = id;
    this._getView(id)?.onActivate();
    this._render();
  }

  update(dt) {
    const view = this._getView(this._activeViewId);
    if (view) view.update(dt);
  }

  _currentContext() {
    if (this._cachedContext) return this._cachedContext;
    this._cachedContext = new ViewContext({
      history: this._store.history,
      registry: this._store.registry,
      analysis: this._store.analysis,
      theme: this._userConfig.theme === "light" ? LightTheme : DarkTheme,
      selection: this._selection,
      renderers: this._renderers,
      cache: this._cache,
      config: this._userConfig,
      captures: this._captures,
      commands: this._commands,
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

  _onClick(e) {
    const rect = this._canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (this._canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (this._canvas.height / rect.height);
    if (y <= TAB_HEIGHT) {
      for (const tab of this._tabRects) {
        if (x >= tab.x && x <= tab.x + tab.w) {
          this.activateView(tab.id);
          return;
        }
      }
      return;
    }
    const view = this._getView(this._activeViewId);
    if (view && view.handleInput) {
      view.handleInput(
        { type: "click", x, y, button: e.button },
        { x: 0, y: TAB_HEIGHT, width: this._canvas.width, height: this._canvas.height - TAB_HEIGHT }
      );
    }
  }

  _onKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === "i" || e.key === "I")) {
      e.preventDefault();
      e.stopPropagation();
      this._captureFromStore();
      return;
    }
    const view = this._getView(this._activeViewId);
    if (!view) return;
    if (e.key === "Escape" && view.handleInput) {
      view.handleInput(
        { type: "keydown", key: e.key },
        { x: 0, y: TAB_HEIGHT, width: this._canvas.width, height: this._canvas.height - TAB_HEIGHT }
      );
    }
    if (view.appendQuery && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      view.appendQuery(e.key);
    } else if (view.backspaceQuery && e.key === "Backspace") {
      view.backspaceQuery();
      e.preventDefault();
    }
  }

  _captureFromStore() {
    const snapshots = this._store._snapshots;
    if (snapshots.length === 0) return;
    const count = Math.min(snapshots.length, 65);
    const frames = [];
    for (let i = count - 1; i >= 0; i--) {
      const diag = snapshots[i].diagnostics;
      if (diag) frames.push(diag);
    }
    if (frames.length === 0) return;
    const capture = new CaptureResult({
      name: "manual",
      timestamp: performance.now(),
      preFrames: frames.length - 1,
      postFrames: 0,
      snapshots: frames,
      registry: this._store.registry,
    });
    this._captures.push(capture);
    this._render();
    if (typeof console !== "undefined") {
      console.log(`[jygame] capture #${this._captures.length} saved (${frames.length} frames)`);
    }
  }

  _render() {
    this._cachedContext = null;
    const theme = this._userConfig.theme === "light" ? LightTheme : DarkTheme;
    const ctx = this._ctx2d;
    const w = this._canvas.width;
    const h = this._canvas.height;

    ctx.fillStyle = theme.background;
    ctx.fillRect(0, 0, w, h);

    const tr = this._renderers.text;
    this._tabRects = [];

    const tabs = [];
    this._viewRegistry.forEach((ViewClass, id) => tabs.push({ id, ViewClass }));

    let cursorX = 0;
    for (const { id, ViewClass } of tabs) {
      const label = ViewClass?.metadata?.title || id;
      const isActive = id === this._activeViewId;
      const measured = tr ? tr.measure(ctx, label, { size: 13 }) : { width: label.length * 8 };
      const tabW = measured.width + 24;

      ctx.fillStyle = isActive ? theme.panelBg : theme.panelHeaderBg;
      ctx.fillRect(cursorX, 0, tabW, TAB_HEIGHT);

      if (tr) {
        tr.render(ctx, label, cursorX + 12, TAB_HEIGHT / 2, {
          size: 13,
          color: isActive ? theme.textAccent : theme.textDim,
          baseline: "middle",
          align: "left",
        });
      }

      this._tabRects.push({ id, x: cursorX, y: 0, w: tabW, h: TAB_HEIGHT });
      cursorX += tabW;
    }

    ctx.fillStyle = theme.border;
    ctx.fillRect(0, TAB_HEIGHT - 1, w, 1);

    const view = this._getView(this._activeViewId);
    if (view) {
      view.render(ctx, { x: 0, y: TAB_HEIGHT, width: w, height: h - TAB_HEIGHT });
    }
  }

  destroy() {
    this._views.forEach(view => view.dispose());
    this._views.clear();
    this._canvas.removeEventListener("click", this._boundClick);
    document.removeEventListener("keydown", this._boundKeyDown);
    this._backend?.close();
  }
}
