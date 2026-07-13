import { ViewRegistry, ViewContext, CommandSystem, SelectionManager } from "../core/index.js";
import { DarkTheme } from "../core/theme/index.js";
import { PerformanceView, FrameGraphView, MetricBrowserView, EventViewerView } from "../core/views/index.js";
import { WorkspaceSnapshotStore } from "./WorkspaceSnapshotStore.js";
import { BrowserBackend } from "../../input/BrowserBackend.js";

export class WorkspaceHost {
  constructor(canvas, backend) {
    this._canvas = canvas;
    this._ctx2d = canvas.getContext("2d");
    this._backend = backend;
    this._store = new WorkspaceSnapshotStore();
    this._cachedContext = null;

    this._selection = new SelectionManager();
    this._commands = new CommandSystem();

    this._viewRegistry = new ViewRegistry();
    this._viewRegistry.register("performance", PerformanceView);
    this._viewRegistry.register("framegraph", FrameGraphView);
    this._viewRegistry.register("metrics", MetricBrowserView);
    this._viewRegistry.register("events", EventViewerView);

    this._contextProvider = () => this._currentContext();
    this._views = new Map();
    this._activeViewId = "performance";
    this._getView("performance")?.onActivate();

    this._backend.onMessage((msg) => {
      if (msg?.type === "snapshot" && msg.payload) {
        this._store.ingest(msg.payload);
        this._render();
      }
    });

    this._inputBackend = new BrowserBackend(canvas);
    this._inputBackend.start();
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

  _currentContext() {
    if (this._cachedContext) return this._cachedContext;
    this._cachedContext = new ViewContext({
      history: this._store.history,
      registry: this._store.registry,
      analysis: this._store.analysis,
      theme: DarkTheme,
      selection: this._selection,
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

  _render() {
    this._cachedContext = null;
    const w = this._canvas.width;
    const h = this._canvas.height;
    this._ctx2d.clearRect(0, 0, w, h);
    const view = this._getView(this._activeViewId);
    if (view) {
      view.render(this._ctx2d, { x: 0, y: 0, width: w, height: h });
    }
  }

  destroy() {
    this._views.forEach(view => view.dispose());
    this._views.clear();
    this._inputBackend?.stop();
    this._backend?.close();
  }
}
