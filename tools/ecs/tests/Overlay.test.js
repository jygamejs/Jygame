import { describe, it } from "node:test";
import * as assert from "node:assert";
import {
  OverlayContext,
  Panel,
  PanelManager,
  OverlaySession,
  LayoutEngine,
  DarkTheme,
  LightTheme,
  SparklineRenderer,
  HistogramRenderer,
  FrameBarRenderer,
  TextRenderer,
  Checkbox,
  Slider,
  TreeView,
  SearchBox,
  TabBar,
  MetricRow,
  ProgressBar,
  SplitPane,
  Table,
  Dropdown,
  Toolbar,
  renderBadge,
  renderInspector,
  PerformancePanel,
  FrameGraphPanel,
  TimelinePanel,
  MetricBrowserPanel,
  MetricSearchIndex,
  EventViewerPanel,
  CaptureBrowserPanel,
  SettingsPanel,
} from "../../../debug/overlay/index.js";
import { MetricType } from "../../../debug/MetricType.js";
import { TimelineModel } from "../../../debug/overlay/timeline/TimelineModel.js";
import { TimelineRenderer } from "../../../debug/overlay/timeline/TimelineRenderer.js";
import { TimelineInteraction } from "../../../debug/overlay/timeline/TimelineInteraction.js";

function mockCtx() {
  const calls = [];
  const ctx = {
    _calls: calls,
    _fillStyle: "#000",
    _strokeStyle: "#000",
    _lineWidth: 1,
    _textAlign: "start",
    _textBaseline: "alphabetic",
    _font: "10px sans-serif",

    save() { calls.push(["save"]); },
    restore() { calls.push(["restore"]); },
    beginPath() { calls.push(["beginPath"]); },
    moveTo(x, y) { calls.push(["moveTo", x, y]); },
    lineTo(x, y) { calls.push(["lineTo", x, y]); },
    closePath() { calls.push(["closePath"]); },
    fill() { calls.push(["fill"]); },
    stroke() { calls.push(["stroke"]); },
    arc(x, y, r, sa, ea) { calls.push(["arc", x, y, r, sa, ea]); },
    quadraticCurveTo(cx, cy, ex, ey) { calls.push(["quadraticCurveTo", cx, cy, ex, ey]); },
    fillRect(x, y, w, h) { calls.push(["fillRect", x, y, w, h]); },
    fillText(t, x, y) { calls.push(["fillText", t, x, y]); },
    measureText(t) { return { width: t.length * 7 }; },
    strokeRect(x, y, w, h) { calls.push(["strokeRect", x, y, w, h]); },
    setLineDash(dash) { calls.push(["setLineDash", dash]); },

    get fillStyle() { return this._fillStyle; },
    set fillStyle(v) { this._fillStyle = v; calls.push(["set:fillStyle", v]); },
    get strokeStyle() { return this._strokeStyle; },
    set strokeStyle(v) { this._strokeStyle = v; calls.push(["set:strokeStyle", v]); },
    get lineWidth() { return this._lineWidth; },
    set lineWidth(v) { this._lineWidth = v; calls.push(["set:lineWidth", v]); },
    get textAlign() { return this._textAlign; },
    set textAlign(v) { this._textAlign = v; calls.push(["set:textAlign", v]); },
    get textBaseline() { return this._textBaseline; },
    set textBaseline(v) { this._textBaseline = v; calls.push(["set:textBaseline", v]); },
    get font() { return this._font; },
    set font(v) { this._font = v; calls.push(["set:font", v]); },
  };
  return ctx;
}

describe("OverlayContext", () => {
  it("creates with defaults", () => {
    const ctx = new OverlayContext();
    assert.strictEqual(ctx.history, null);
    assert.strictEqual(ctx.registry, null);
    assert.strictEqual(ctx.analysis, null);
    assert.strictEqual(ctx.config, null);
    assert.strictEqual(ctx.theme, null);
    assert.deepStrictEqual(ctx.captures, []);
  });

  it("stores injected references", () => {
    const data = { history: "h", registry: "r", analysis: "a", config: "c", theme: "t" };
    const ctx = new OverlayContext(data);
    assert.strictEqual(ctx.history, "h");
    assert.strictEqual(ctx.registry, "r");
    assert.strictEqual(ctx.analysis, "a");
    assert.strictEqual(ctx.config, "c");
    assert.strictEqual(ctx.theme, "t");
  });

  it("captures defaults to empty array", () => {
    const ctx = new OverlayContext({ history: 1 });
    assert.deepStrictEqual(ctx.captures, []);
  });

  it("captures accepts provided array", () => {
    const arr = ["a", "b"];
    const ctx = new OverlayContext({ captures: arr });
    assert.strictEqual(ctx.captures, arr);
  });

  it("service references are null initially", () => {
    const ctx = new OverlayContext();
    assert.strictEqual(ctx.layout, null);
    assert.strictEqual(ctx.input, null);
    assert.strictEqual(ctx.selection, null);
    assert.strictEqual(ctx.commands, null);
    assert.strictEqual(ctx.tooltips, null);
    assert.strictEqual(ctx.renderers, null);
    assert.strictEqual(ctx.animation, null);
  });
});

describe("Panel", () => {
  it("stores id, title, context", () => {
    const ctx = new OverlayContext();
    const p = new Panel("test", "Test Panel", ctx);
    assert.strictEqual(p.id, "test");
    assert.strictEqual(p.title, "Test Panel");
    assert.strictEqual(p.ctx, ctx);
  });

  it("applies default options", () => {
    const p = new Panel("id", "Title", new OverlayContext());
    assert.strictEqual(p.icon, null);
    assert.strictEqual(p.minWidth, 200);
    assert.strictEqual(p.minHeight, 100);
    assert.strictEqual(p.defaultWidth, 400);
    assert.strictEqual(p.defaultHeight, 300);
    assert.strictEqual(p.canCollapse, true);
    assert.strictEqual(p.canClose, true);
    assert.strictEqual(p.canFloat, true);
  });

  it("overrides options", () => {
    const p = new Panel("id", "Title", new OverlayContext(), {
      icon: "\u2605",
      minWidth: 100,
      minHeight: 50,
      defaultWidth: 300,
      defaultHeight: 200,
      canCollapse: false,
      canClose: false,
      canFloat: false,
    });
    assert.strictEqual(p.minWidth, 100);
    assert.strictEqual(p.minHeight, 50);
    assert.strictEqual(p.defaultWidth, 300);
    assert.strictEqual(p.defaultHeight, 200);
    assert.strictEqual(p.canCollapse, false);
    assert.strictEqual(p.canClose, false);
    assert.strictEqual(p.canFloat, false);
  });

  it("has default rect", () => {
    const p = new Panel("id", "Title", new OverlayContext());
    assert.deepStrictEqual(p.rect, { x: 0, y: 0, width: 400, height: 300 });
  });

  it("rect can be set", () => {
    const p = new Panel("id", "Title", new OverlayContext());
    p.rect = { x: 10, y: 20, width: 500, height: 400 };
    assert.deepStrictEqual(p.rect, { x: 10, y: 20, width: 500, height: 400 });
  });

  it("lifecycle hooks are no-ops by default", () => {
    const p = new Panel("id", "Title", new OverlayContext());
    assert.doesNotThrow(() => p.update({}));
    assert.doesNotThrow(() => p.render(null, null));
    assert.doesNotThrow(() => p.onShow());
    assert.doesNotThrow(() => p.onHide());
    assert.doesNotThrow(() => p.onDestroy());
    assert.doesNotThrow(() => p.onRegister());
  });
});

describe("PanelManager", () => {
  it("starts empty", () => {
    const pm = new PanelManager(new OverlayContext());
    assert.strictEqual(pm.count, 0);
    assert.strictEqual(pm.visibleCount, 0);
  });

  it("register adds a panel", () => {
    const pm = new PanelManager(new OverlayContext());
    const p = new Panel("test", "Test", new OverlayContext());
    pm.register(p);
    assert.strictEqual(pm.count, 1);
    assert.strictEqual(pm.get("test"), p);
  });

  it("register throws for non-Panel", () => {
    const pm = new PanelManager(new OverlayContext());
    assert.throws(() => pm.register({}), /Panel instance/);
  });

  it("register throws for duplicate id", () => {
    const pm = new PanelManager(new OverlayContext());
    pm.register(new Panel("dup", "A", new OverlayContext()));
    assert.throws(() => pm.register(new Panel("dup", "B", new OverlayContext())), /already registered/);
  });

  it("unregister removes panel", () => {
    const pm = new PanelManager(new OverlayContext());
    const p = new Panel("test", "Test", new OverlayContext());
    pm.register(p);
    pm.unregister("test");
    assert.strictEqual(pm.count, 0);
    assert.strictEqual(pm.get("test"), null);
  });

  it("unregister is idempotent", () => {
    const pm = new PanelManager(new OverlayContext());
    assert.doesNotThrow(() => pm.unregister("nonexistent"));
    assert.strictEqual(pm.count, 0);
  });

  it("show makes panel visible", () => {
    const pm = new PanelManager(new OverlayContext());
    pm.register(new Panel("p", "P", new OverlayContext()));
    const shown = pm.show("p");
    assert.strictEqual(shown, true);
    assert.strictEqual(pm.isVisible("p"), true);
    assert.strictEqual(pm.visibleCount, 1);
  });

  it("hide makes panel invisible", () => {
    const pm = new PanelManager(new OverlayContext());
    pm.register(new Panel("p", "P", new OverlayContext()));
    pm.show("p");
    const hidden = pm.hide("p");
    assert.strictEqual(hidden, true);
    assert.strictEqual(pm.isVisible("p"), false);
    assert.strictEqual(pm.visibleCount, 0);
  });

  it("show returns false if already visible", () => {
    const pm = new PanelManager(new OverlayContext());
    pm.register(new Panel("p", "P", new OverlayContext()));
    pm.show("p");
    assert.strictEqual(pm.show("p"), false);
  });

  it("hide returns false if already hidden", () => {
    const pm = new PanelManager(new OverlayContext());
    pm.register(new Panel("p", "P", new OverlayContext()));
    assert.strictEqual(pm.hide("p"), false);
  });

  it("toggle switches visibility", () => {
    const pm = new PanelManager(new OverlayContext());
    pm.register(new Panel("p", "P", new OverlayContext()));
    assert.strictEqual(pm.isVisible("p"), false);
    pm.toggle("p");
    assert.strictEqual(pm.isVisible("p"), true);
    pm.toggle("p");
    assert.strictEqual(pm.isVisible("p"), false);
  });

  it("showAll and hideAll", () => {
    const pm = new PanelManager(new OverlayContext());
    pm.register(new Panel("a", "A", new OverlayContext()));
    pm.register(new Panel("b", "B", new OverlayContext()));
    pm.showAll();
    assert.strictEqual(pm.visibleCount, 2);
    pm.hideAll();
    assert.strictEqual(pm.visibleCount, 0);
  });

  it("forEach iterates in registration order", () => {
    const pm = new PanelManager(new OverlayContext());
    const ids = [];
    pm.register(new Panel("b", "B", new OverlayContext()));
    pm.register(new Panel("a", "A", new OverlayContext()));
    pm.forEach((panel, id) => ids.push(id));
    assert.deepStrictEqual(ids, ["b", "a"]);
  });

  it("update calls update on visible panels only", () => {
    const pm = new PanelManager(new OverlayContext());
    const updated = [];
    class TestPanel extends Panel {
      update(data) { updated.push(this.id); }
    }
    pm.register(new TestPanel("a", "A", new OverlayContext()));
    pm.register(new TestPanel("b", "B", new OverlayContext()));
    pm.show("a");
    pm.update({ dt: 16 });
    assert.deepStrictEqual(updated, ["a"]);
  });

  it("unregister calls onDestroy", () => {
    const pm = new PanelManager(new OverlayContext());
    let destroyed = false;
    class DestroyPanel extends Panel {
      onDestroy() { destroyed = true; }
    }
    pm.register(new DestroyPanel("d", "D", new OverlayContext()));
    pm.unregister("d");
    assert.strictEqual(destroyed, true);
  });
});

describe("DarkTheme", () => {
  it("is frozen", () => {
    assert.ok(Object.isFrozen(DarkTheme));
  });

  it("has expected properties", () => {
    assert.strictEqual(typeof DarkTheme.background, "string");
    assert.strictEqual(DarkTheme.headerHeight, 28);
    assert.strictEqual(DarkTheme.tabHeight, 24);
  });

  it("has dark values", () => {
    assert.ok(DarkTheme.background.includes("20, 20, 30"));
    assert.strictEqual(DarkTheme.text, "#e0e0f0");
  });
});

describe("LightTheme", () => {
  it("is frozen", () => {
    assert.ok(Object.isFrozen(LightTheme));
  });

  it("has light values", () => {
    assert.ok(LightTheme.background.includes("240, 240, 245"));
    assert.strictEqual(LightTheme.text, "#222233");
  });

  it("differs from dark theme", () => {
    assert.notStrictEqual(DarkTheme.background, LightTheme.background);
  });
});

describe("LayoutEngine", () => {
  it("starts with null root", () => {
    const eng = new LayoutEngine(DarkTheme);
    assert.strictEqual(eng.root, null);
  });

  it("setRoot accepts a leaf node", () => {
    const eng = new LayoutEngine(DarkTheme);
    eng.setRoot({ type: "leaf", panelId: "p1" });
    assert.strictEqual(eng.root.type, "leaf");
  });

  it("compute assigns full area to leaf", () => {
    const eng = new LayoutEngine(DarkTheme);
    eng.setRoot({ type: "leaf", panelId: "p1" });
    eng.compute(800, 600);
    assert.deepStrictEqual(eng.getPanelRect("p1"), { x: 0, y: 0, width: 800, height: 600 });
  });

  it("split horizontal divides width by ratio", () => {
    const eng = new LayoutEngine(DarkTheme);
    eng.setRoot({ type: "split", direction: "horizontal", ratio: 0.4, children: [
      { type: "leaf", panelId: "l" }, { type: "leaf", panelId: "r" },
    ]});
    eng.compute(1000, 500);
    const l = eng.getPanelRect("l");
    const r = eng.getPanelRect("r");
    assert.ok(l.width > 0 && r.width > 0);
  });

  it("split vertical divides height by ratio", () => {
    const eng = new LayoutEngine(DarkTheme);
    eng.setRoot({ type: "split", direction: "vertical", ratio: 0.7, children: [
      { type: "leaf", panelId: "t" }, { type: "leaf", panelId: "b" },
    ]});
    eng.compute(800, 600);
    const t = eng.getPanelRect("t");
    const b = eng.getPanelRect("b");
    assert.strictEqual(b.y, t.height + 2);
  });

  it("tab group allocates tab bar space", () => {
    const eng = new LayoutEngine(DarkTheme);
    eng.setRoot({ type: "tab", panels: ["a", "b"], activeTab: 0 });
    eng.compute(800, 600);
    const rect = eng.getPanelRect("a");
    assert.strictEqual(rect.y, DarkTheme.tabHeight);
    assert.strictEqual(rect.height, 600 - DarkTheme.tabHeight);
  });

  it("resize updates ratio", () => {
    const eng = new LayoutEngine(DarkTheme);
    eng.setRoot({ type: "split", direction: "horizontal", ratio: 0.5, children: [
      { type: "leaf", panelId: "a" }, { type: "leaf", panelId: "b" },
    ]});
    eng.resize(eng.root._layoutId, 0.3);
    assert.strictEqual(eng.root.ratio, 0.3);
  });

  it("hitTest returns panel at coordinates", () => {
    const eng = new LayoutEngine(DarkTheme);
    eng.setRoot({ type: "leaf", panelId: "p1" });
    eng.compute(800, 600);
    assert.deepStrictEqual(eng.hitTest(100, 100), { type: "panel", panelId: "p1" });
  });

  it("serialize round-trips", () => {
    const eng = new LayoutEngine(DarkTheme);
    eng.setRoot({ type: "split", direction: "vertical", ratio: 0.5, children: [
      { type: "tab", panels: ["a", "b"], activeTab: 1 },
      { type: "leaf", panelId: "c" },
    ]});
    const json = eng.serialize();
    assert.strictEqual(json.root.children[0].panels[1], "b");
  });

  it("restore rebuilds tree", () => {
    const eng = new LayoutEngine(DarkTheme);
    eng.restore({ version: 1, root: { type: "leaf", panelId: "x" }, floating: [] });
    eng.compute(500, 300);
    assert.ok(eng.getPanelRect("x"));
  });

  it("createDefaultLayout builds standard tree", () => {
    const eng = new LayoutEngine(DarkTheme);
    eng.createDefaultLayout(["performance", "framegraph", "timeline", "events"]);
    assert.strictEqual(eng.root.children.length, 2);
  });
});

describe("SparklineRenderer", () => {
  it("draws line for values", () => {
    const r = new SparklineRenderer();
    const ctx = mockCtx();
    r.render(ctx, 0, 0, 100, 50, [10, 20], { color: "#f00", fill: false });
    const names = ctx._calls.map(c => c[0]);
    assert.ok(names.includes("beginPath"));
    assert.ok(names.includes("moveTo"));
    assert.ok(names.includes("lineTo"));
    assert.ok(names.includes("stroke"));
  });

  it("draws fill when fill=true", () => {
    const r = new SparklineRenderer();
    const ctx = mockCtx();
    r.render(ctx, 0, 0, 100, 50, [10, 20, 30], { fill: true });
    assert.ok(ctx._calls.some(c => c[0] === "closePath"));
    assert.ok(ctx._calls.some(c => c[0] === "fill"));
  });

  it("does nothing for empty/single", () => {
    const r = new SparklineRenderer();
    assert.strictEqual(r.render(mockCtx(), 0, 0, 100, 50, [], {}), undefined);
    assert.strictEqual(r.render(mockCtx(), 0, 0, 100, 50, [42], {}), undefined);
  });
});

describe("HistogramRenderer", () => {
  it("draws bars for values", () => {
    const r = new HistogramRenderer();
    const ctx = mockCtx();
    r.render(ctx, 0, 0, 200, 100, [1, 2, 3, 4, 5]);
    const rects = ctx._calls.filter(c => c[0] === "fillRect");
    assert.ok(rects.length > 0);
    assert.ok(rects.length <= 20);
  });

  it("does nothing for empty", () => {
    const r = new HistogramRenderer();
    const ctx = mockCtx();
    r.render(ctx, 0, 0, 200, 100, []);
    assert.strictEqual(ctx._calls.length, 0);
  });
});

describe("FrameBarRenderer", () => {
  it("draws label and bar", () => {
    const r = new FrameBarRenderer();
    const ctx = mockCtx();
    r.render(ctx, 0, 0, 400, 20, { duration: 5, total: 20, color: "#f00", label: "test" });
    assert.ok(ctx._calls.some(c => c[0] === "fillText" && c[1] === "test"));
    assert.ok(ctx._calls.some(c => c[0] === "fillRect"));
  });

  it("handles zero total", () => {
    const r = new FrameBarRenderer();
    assert.doesNotThrow(() => r.render(mockCtx(), 0, 0, 400, 20, { duration: 5, total: 0 }));
  });
});

describe("TextRenderer", () => {
  it("measures and caches text", () => {
    const r = new TextRenderer(DarkTheme);
    const ctx = mockCtx();
    const m1 = r.measure(ctx, "hello");
    assert.ok(m1.width > 0);
    const m2 = r.measure(ctx, "hello");
    assert.strictEqual(m1.width, m2.width);
  });

  it("renders via fillText", () => {
    const r = new TextRenderer(DarkTheme);
    const ctx = mockCtx();
    r.render(ctx, "test", 10, 20);
    assert.ok(ctx._calls.some(c => c[0] === "fillText" && c[1] === "test"));
  });

  it("clearCache works", () => {
    const r = new TextRenderer(DarkTheme);
    const ctx = mockCtx();
    r.measure(ctx, "a");
    assert.ok(r.cacheSize > 0);
    r.clearCache();
    assert.strictEqual(r.cacheSize, 0);
  });
});

describe("Checkbox", () => {
  it("renders unchecked by default", () => {
    const cb = new Checkbox({ label: "test" });
    const ctx = mockCtx();
    cb.render(ctx, 0, 0, 100, 24, DarkTheme);
    assert.ok(ctx._calls.some(c => c[0] === "strokeRect"));
  });

  it("renders checked state", () => {
    const cb = new Checkbox({ label: "x", checked: true });
    const ctx = mockCtx();
    cb.render(ctx, 0, 0, 100, 24, DarkTheme);
    assert.ok(ctx._calls.some(c => c[0] === "fillRect"));
  });

  it("click toggles checked", () => {
    let toggled = false;
    const cb = new Checkbox({ label: "x", onChange: v => { toggled = v; } });
    cb._bounds = { x: 0, y: 0, width: 100, height: 24 };
    assert.strictEqual(cb.checked, false);
    cb.onInput({ type: "click", x: 10, y: 12 }, null);
    assert.strictEqual(cb.checked, true);
    assert.strictEqual(toggled, true);
  });

  it("click outside bounds does nothing", () => {
    const cb = new Checkbox({ label: "x" });
    cb._bounds = { x: 0, y: 0, width: 100, height: 24 };
    const result = cb.onInput({ type: "click", x: 200, y: 200 }, null);
    assert.strictEqual(result, false);
  });

  it("measure returns expected size", () => {
    const cb = new Checkbox({ label: "x" });
    const m = cb.measure(DarkTheme, 200);
    assert.strictEqual(m.height, 24);
    assert.strictEqual(m.width, 200);
  });
});

describe("Slider", () => {
  it("renders with default value", () => {
    const s = new Slider({ label: "vol" });
    const ctx = mockCtx();
    s.render(ctx, 0, 0, 200, 28, DarkTheme);
    assert.ok(ctx._calls.some(c => c[0] === "fillRect"));
  });

  it("mousedown starts drag", () => {
    const s = new Slider({ label: "x" });
    s._bounds = { x: 0, y: 0, width: 200, height: 28 };
    const result = s.onInput({ type: "mousedown", x: 150, y: 14 }, null);
    assert.strictEqual(result, true);
    assert.strictEqual(s._dragging, true);
  });

  it("mousemove during drag updates value", () => {
    let changed = false;
    const s = new Slider({ label: "x", min: 0, max: 100, onChange: v => { changed = true; } });
    s._bounds = { x: 0, y: 0, width: 200, height: 28 };
    s._dragging = true;
    const result = s.onInput({ type: "mousemove", x: 150, y: 14 }, null);
    assert.strictEqual(result, true);
    assert.ok(s.value > 0);
    assert.ok(changed);
  });

  it("measure returns expected size", () => {
    const s = new Slider({ label: "x" });
    const m = s.measure(DarkTheme, 300);
    assert.strictEqual(m.height, 28);
  });
});

describe("ProgressBar", () => {
  it("renders at green below warnAt", () => {
    const p = new ProgressBar({ value: 30, max: 100, warnAt: 0.6, critAt: 0.9 });
    const ctx = mockCtx();
    p.render(ctx, 0, 0, 300, 22, DarkTheme);
    const fills = ctx._calls.filter(c => c[0] === "fillRect");
    assert.ok(fills.length >= 2);
  });

  it("renders at warn threshold", () => {
    const p = new ProgressBar({ value: 85, max: 100, warnAt: 0.6, critAt: 0.9 });
    const ctx = mockCtx();
    p.render(ctx, 0, 0, 300, 22, DarkTheme);
  });

  it("renders at crit threshold", () => {
    const p = new ProgressBar({ value: 95, max: 100, warnAt: 0.6, critAt: 0.9 });
    const ctx = mockCtx();
    p.render(ctx, 0, 0, 300, 22, DarkTheme);
  });
});

describe("TabBar", () => {
  it("renders tabs", () => {
    const t = new TabBar({ tabs: ["A", "B", "C"], activeTab: 0 });
    const ctx = mockCtx();
    t.render(ctx, 0, 0, 300, 24, DarkTheme);
    assert.ok(ctx._calls.some(c => c[0] === "fillText"));
  });

  it("click switches tab", () => {
    let switched = -1;
    const t = new TabBar({ tabs: ["X", "Y"], activeTab: 0, onSwitch: i => { switched = i; } });
    t._tabRects = [
      { x: 0, y: 0, width: 75, height: 24 },
      { x: 75, y: 0, width: 75, height: 24 },
    ];
    t.onInput({ type: "click", x: 100, y: 12 }, null);
    assert.strictEqual(switched, 1);
    assert.strictEqual(t.activeTab, 1);
  });
});

describe("SearchBox", () => {
  it("renders with placeholder", () => {
    const s = new SearchBox({ placeholder: "find..." });
    const ctx = mockCtx();
    s.render(ctx, 0, 0, 200, 28, DarkTheme);
    const texts = ctx._calls.filter(c => c[0] === "fillText");
    assert.ok(texts.length >= 1);
  });

  it("renders with query", () => {
    const s = new SearchBox({ query: "test" });
    const ctx = mockCtx();
    s.render(ctx, 0, 0, 200, 28, DarkTheme);
  });

  it("focus on click", () => {
    const s = new SearchBox({});
    s._bounds = { x: 0, y: 0, width: 200, height: 28 };
    s.onInput({ type: "click", x: 10, y: 14 }, null);
    assert.strictEqual(s.focused, true);
  });

  it("blur on escape", () => {
    const s = new SearchBox({});
    s._bounds = { x: 0, y: 0, width: 200, height: 28 };
    s.focus();
    s.onInput({ type: "keydown", key: "Escape" }, null);
    assert.strictEqual(s.focused, false);
  });

  it("keydown appends to query", () => {
    const s = new SearchBox({});
    s._bounds = { x: 0, y: 0, width: 200, height: 28 };
    s.focus();
    s.onInput({ type: "keydown", key: "a" }, null);
    assert.strictEqual(s.query, "a");
  });

  it("backspace removes char", () => {
    const s = new SearchBox({ query: "abc" });
    s._bounds = { x: 0, y: 0, width: 200, height: 28 };
    s.focus();
    s.onInput({ type: "keydown", key: "Backspace" }, null);
    assert.strictEqual(s.query, "ab");
  });

  it("measure returns expected size", () => {
    const s = new SearchBox({});
    const m = s.measure(DarkTheme, 300);
    assert.strictEqual(m.height, 28);
  });
});

describe("TreeView", () => {
  it("renders nodes", () => {
    const t = new TreeView({ nodes: [
      { id: "a", label: "A" },
      { id: "b", label: "B", children: [{ id: "c", label: "C" }] },
    ]});
    const ctx = mockCtx();
    t.render(ctx, 0, 0, 200, 100, DarkTheme);
    assert.ok(ctx._calls.some(c => c[0] === "fillText"));
  });

  it("click toggles expand", () => {
    const t = new TreeView({ nodes: [
      { id: "a", label: "A", children: [{ id: "b", label: "B" }] },
    ]});
    t.render(mockCtx(), 0, 0, 200, 100, DarkTheme);
    assert.ok(!t.expanded.has("a"));
    t.onInput({ type: "click", x: 10, y: 10 }, null);
    assert.ok(t.expanded.has("a"));
  });

  it("measure counts visible", () => {
    const t = new TreeView({ nodes: [
      { id: "a", label: "A", children: [{ id: "b", label: "B" }] },
    ]});
    let m = t.measure(DarkTheme, 200);
    assert.strictEqual(m.height, 20);
    t.expanded.add("a");
    m = t.measure(DarkTheme, 200);
    assert.strictEqual(m.height, 40);
  });
});

describe("MetricRow", () => {
  it("renders name and value", () => {
    const mr = new MetricRow({ name: "FPS", value: 60, unit: "fps" });
    const ctx = mockCtx();
    mr.render(ctx, 0, 0, 300, 22, DarkTheme, null);
    assert.ok(ctx._calls.some(c => c[0] === "fillText" && c[1] === "FPS"));
  });

  it("renders sparkline with renderer", () => {
    const mr = new MetricRow({ name: "f", value: 10, sparklineData: [1, 2, 3] });
    const ctx = mockCtx();
    const renderers = { sparkline: new SparklineRenderer() };
    mr.render(ctx, 0, 0, 300, 22, DarkTheme, renderers);
    assert.ok(ctx._calls.some(c => c[0] === "lineTo" || c[0] === "moveTo"));
  });

  it("click triggers callback", () => {
    let clicked = false;
    const mr = new MetricRow({ name: "x", onClick: () => { clicked = true; } });
    mr._bounds = { x: 0, y: 0, width: 300, height: 22 };
    mr.onInput({ type: "click", x: 10, y: 11 }, null);
    assert.strictEqual(clicked, true);
  });
});

describe("Table", () => {
  it("renders headers and rows", () => {
    const t = new Table({
      columns: ["Name", "Value"],
      rows: [["a", "1"], ["b", "2"]],
    });
    const ctx = mockCtx();
    t.render(ctx, 0, 0, 200, 100, DarkTheme);
    assert.ok(ctx._calls.some(c => c[0] === "fillText"));
  });

  it("click header triggers sort", () => {
    let sortArgs = null;
    const t = new Table({
      columns: ["A", "B"],
      rows: [],
      onSort: (col, asc) => { sortArgs = [col, asc]; },
    });
    t._headerRects = [{ x: 0, y: 0, width: 50, height: 24 }];
    t.onInput({ type: "click", x: 10, y: 10 }, null);
    assert.deepStrictEqual(sortArgs, [0, true]);
  });
});

describe("Dropdown", () => {
  it("renders selected option", () => {
    const d = new Dropdown({ options: ["a", "b", "c"], selected: 0 });
    const ctx = mockCtx();
    d.render(ctx, 0, 0, 150, 24, DarkTheme);
    assert.ok(ctx._calls.some(c => c[0] === "fillText" && c[1] === "a"));
  });

  it("click opens list", () => {
    const d = new Dropdown({ options: ["x", "y"] });
    d._bounds = { x: 0, y: 0, width: 150, height: 24 };
    d.onInput({ type: "click", x: 10, y: 12 }, null);
    assert.strictEqual(d._open, true);
  });
});

describe("Toolbar", () => {
  it("renders buttons", () => {
    const t = new Toolbar({ buttons: [{ icon: "P" }, { icon: "T" }] });
    const ctx = mockCtx();
    t.render(ctx, 0, 0, 60, 28, DarkTheme);
    assert.ok(ctx._calls.some(c => c[0] === "fillText"));
  });

  it("click triggers action", () => {
    let action = null;
    const t = new Toolbar({ buttons: [{ action: "export" }], onAction: a => { action = a; } });
    t._buttonRects = [{ x: 2, y: 2, width: 24, height: 24 }];
    t.onInput({ type: "click", x: 10, y: 10 }, null);
    assert.strictEqual(action, "export");
  });
});

describe("SplitPane", () => {
  it("renders divider", () => {
    const s = new SplitPane({ direction: "horizontal" });
    const ctx = mockCtx();
    s.render(ctx, 0, 0, 400, 300, DarkTheme);
    assert.ok(ctx._calls.some(c => c[0] === "fillRect"));
  });

  it("mousedown on divider starts drag", () => {
    const s = new SplitPane({ direction: "horizontal" });
    s._bounds = { x: 0, y: 0, width: 400, height: 300 };
    s._dividerRect = { x: 196, y: 0, width: 4, height: 300 };
    s._dividerHover = true;
    const result = s.onInput({ type: "mousedown", x: 198, y: 10 }, null);
    assert.strictEqual(result, true);
    assert.strictEqual(s._dragging, true);
  });

  it("mousemove during drag updates ratio", () => {
    const s = new SplitPane({ direction: "horizontal" });
    s._bounds = { x: 0, y: 0, width: 400, height: 300 };
    s._dragging = true;
    s.onInput({ type: "mousemove", x: 300, y: 10 }, null);
    assert.ok(s.ratio > 0.5);
  });
});

describe("Badge", () => {
  it("renders status badge", () => {
    const ctx = mockCtx();
    renderBadge(ctx, 0, 0, 40, 16, { status: "ok", text: "OK" }, DarkTheme);
    assert.ok(ctx._calls.some(c => c[0] === "fill"));

    const ctx2 = mockCtx();
    renderBadge(ctx2, 0, 0, 40, 16, { status: "error", text: "ERR" }, DarkTheme);
    assert.ok(ctx2._calls.some(c => c[0] === "fill"));
  });

  it("defaults to info when status unknown", () => {
    const ctx = mockCtx();
    renderBadge(ctx, 0, 0, 40, 16, { text: "?" }, DarkTheme);
    assert.ok(ctx._calls.some(c => c[0] === "fill"));
  });
});

describe("Inspector", () => {
  it("renders key-value entries", () => {
    const ctx = mockCtx();
    renderInspector(ctx, 0, 0, 200, 100, {
      entries: [
        { key: "Name", value: "Test" },
        { key: "Value", value: 42, color: "#ff0" },
      ],
    }, DarkTheme);
    const texts = ctx._calls.filter(c => c[0] === "fillText");
    assert.ok(texts.some(c => c[1] === "Name"));
    assert.ok(texts.some(c => c[1] === "Test"));
    assert.ok(texts.some(c => c[1] === "42"));
  });
});

function perfMockRegistry() {
  const descriptors = [
    { id: 0, name: "frame.fps", displayName: "FPS", type: MetricType.TIMER, color: "#88ccff" },
    { id: 1, name: "frame.total", displayName: "Frame Total", type: MetricType.TIMER, color: "#ff8888" },
    { id: 2, name: "frame.render", displayName: "Render", type: MetricType.TIMER, color: "#88ff88" },
    { id: 3, name: "frame.physics", displayName: "Physics", type: MetricType.TIMER, color: "#88ffff" },
    { id: 4, name: "ecs.update", displayName: "ECS Update", type: MetricType.TIMER, color: "#ff88ff" },
  ];
  const nameMap = new Map(descriptors.map(d => [d.name, d]));
  return {
    forEach(fn) { descriptors.forEach(fn); },
    find(name) { return nameMap.get(name) || null; },
    get(id) { return descriptors[id] || null; },
    count: descriptors.length,
  };
}

function perfMockAnalysis() {
  const values = {
    "frame.fps": 58.3,
    "frame.total": 16.7,
    "frame.render": 8.2,
    "frame.physics": 3.4,
    "ecs.update": 4.2,
  };
  const averages = {
    "frame.render": 7.8,
    "frame.physics": 3.2,
    "ecs.update": 4.0,
  };
  const maxes = {
    "frame.render": 15.0,
    "frame.physics": 6.0,
    "ecs.update": 8.0,
  };
  return {
    latest(name) { return values[name] ?? 0; },
    average(name, window) { return averages[name] ?? values[name] ?? 0; },
    max(name, window) { return maxes[name] ?? values[name] ?? 0; },
  };
}

function perfMockHistory() {
  const snapshots = [];
  for (let i = 0; i < 60; i++) {
    const base = [0, 16.5, 8.0, 3.3, 4.1];
    snapshots.push({
      timerTotal(id) { return (base[id] || 0) + (i % 5) * 0.1; },
    });
  }
  return {
    count: snapshots.length,
    frames: function*() { yield* snapshots; },
  };
}

function perfMockRenderers() {
  const text = new TextRenderer(DarkTheme);
  const sparkline = new SparklineRenderer();
  const frameBar = new FrameBarRenderer();
  return { text, sparkline, frameBar, histogram: null };
}

function makePerfContext(overrides = {}) {
  return new OverlayContext({
    history: perfMockHistory(),
    registry: perfMockRegistry(),
    analysis: perfMockAnalysis(),
    config: { fpsTarget: 60 },
    theme: DarkTheme,
    renderers: perfMockRenderers(),
    ...overrides,
  });
}

describe("PerformancePanel", () => {
  it("construction defaults", () => {
    const ctx = new OverlayContext();
    const panel = new PerformancePanel(ctx);
    assert.strictEqual(panel.id, "performance");
    assert.strictEqual(panel.title, "Performance");
    assert.strictEqual(panel.ctx, ctx);
    assert.strictEqual(panel.defaultWidth, 500);
    assert.strictEqual(panel.defaultHeight, 350);
    assert.strictEqual(panel.minWidth, 320);
    assert.strictEqual(panel.minHeight, 200);
  });

  it("update with null sources sets _data null", () => {
    const ctx = new OverlayContext();
    const panel = new PerformancePanel(ctx);
    panel.update({ dt: 16 });
    assert.strictEqual(panel._data, null);
  });

  it("update with partial sources sets _data null", () => {
    const ctx = new OverlayContext({ analysis: { latest() { return 0; } } });
    const panel = new PerformancePanel(ctx);
    panel.update({ dt: 16 });
    assert.strictEqual(panel._data, null);
  });

  it("update computes header values", () => {
    const ctx = makePerfContext();
    const panel = new PerformancePanel(ctx);
    panel.update({ dt: 16 });
    const d = panel._data;
    assert.ok(d !== null);
    assert.strictEqual(d.fps, 58.3);
    assert.strictEqual(d.frameTime, 16.7);
    assert.ok(d.budgetPct > 0);
    assert.strictEqual(d.fpsTarget, 60);
    assert.strictEqual(d.budget, 16.67);
  });

  it("update computes subsystem breakdown", () => {
    const ctx = makePerfContext();
    const panel = new PerformancePanel(ctx);
    panel.update({ dt: 16 });
    const subs = panel._data.subsystems;
    assert.ok(subs.length >= 2);
    assert.ok(subs.some(s => s.displayName === "Render"));
    assert.ok(subs.some(s => s.displayName === "Physics"));
    assert.strictEqual(subs[0].displayName, "Render");
    assert.strictEqual(subs[0].value, 8.2);
    assert.strictEqual(subs[0].pct, Math.round((8.2 / 16.7) * 100));
  });

  it("update adds overhead when sum < frame total", () => {
    const ctx = makePerfContext();
    const panel = new PerformancePanel(ctx);
    panel.update({ dt: 16 });
    const subs = panel._data.subsystems;
    const overhead = subs.find(s => s.displayName === "Overhead");
    assert.ok(overhead !== undefined);
    assert.ok(overhead.value > 0);
    assert.ok(overhead.pct > 0);
  });

  it("update computes top offenders sorted by avg", () => {
    const ctx = makePerfContext();
    const panel = new PerformancePanel(ctx);
    panel.update({ dt: 16 });
    const offs = panel._data.offenders;
    assert.ok(offs.length >= 2);
    assert.strictEqual(offs[0].displayName, "Render");
    assert.strictEqual(offs[0].avg, 7.8);
    assert.strictEqual(offs[0].max, 15.0);
    if (offs.length >= 2) {
      assert.strictEqual(offs[1].displayName, "ECS Update");
      assert.strictEqual(offs[1].avg, 4.0);
    }
  });

  it("update fills offender sparkline values", () => {
    const ctx = makePerfContext();
    const panel = new PerformancePanel(ctx);
    panel.update({ dt: 16 });
    for (const off of panel._data.offenders) {
      assert.ok(Array.isArray(off.values));
      assert.ok(off.values.length > 0);
    }
  });

  it("render with null data draws no-data indicator", () => {
    const ctx = new OverlayContext({ theme: DarkTheme, renderers: perfMockRenderers() });
    const panel = new PerformancePanel(ctx);
    const canvas = mockCtx();
    panel.render(canvas, { x: 0, y: 0, width: 500, height: 350 });
    const texts = canvas._calls.filter(c => c[0] === "fillText");
    assert.ok(texts.some(c => c[1] === "No data"));
  });

  it("render with data draws header cards", () => {
    const ctx = makePerfContext();
    const panel = new PerformancePanel(ctx);
    panel.update({ dt: 16 });
    const canvas = mockCtx();
    panel.render(canvas, { x: 0, y: 0, width: 500, height: 350 });
    const texts = canvas._calls.filter(c => c[0] === "fillText").map(c => c[1]);
    assert.ok(texts.includes("FPS"));
    assert.ok(texts.includes("58.3"));
    assert.ok(texts.includes("Frame"));
    assert.ok(texts.includes("16.7ms"));
    assert.ok(texts.includes("Budget"));
    assert.ok(texts.includes("100%"));
  });

  it("render draws section labels", () => {
    const ctx = makePerfContext();
    const panel = new PerformancePanel(ctx);
    panel.update({ dt: 16 });
    const canvas = mockCtx();
    panel.render(canvas, { x: 0, y: 0, width: 500, height: 350 });
    const texts = canvas._calls.filter(c => c[0] === "fillText").map(c => c[1]);
    assert.ok(texts.includes("Subsystem Breakdown"));
    assert.ok(texts.includes("Top Offenders"));
  });

  it("render draws subsystem rows", () => {
    const ctx = makePerfContext();
    const panel = new PerformancePanel(ctx);
    panel.update({ dt: 16 });
    const canvas = mockCtx();
    panel.render(canvas, { x: 0, y: 0, width: 500, height: 350 });
    const texts = canvas._calls.filter(c => c[0] === "fillText").map(c => c[1]);
    assert.ok(texts.includes("Render"));
    assert.ok(texts.includes("8.2ms"));
    assert.ok(texts.includes("Physics"));
    assert.ok(texts.includes("3.4ms"));
  });

  it("render clips subsystem and offender rows beyond panel height", () => {
    const ctx = makePerfContext();
    const panel = new PerformancePanel(ctx);
    panel.update({ dt: 16 });
    const canvas = mockCtx();
    panel.render(canvas, { x: 0, y: 0, width: 500, height: 50 });
    const texts = canvas._calls.filter(c => c[0] === "fillText").map(c => c[1]);
    assert.ok(!texts.includes("8.2ms"), "subsystem rows should be clipped");
    assert.ok(!texts.includes("7.8ms"), "offender rows should be clipped");
  });

  it("render handles missing renderers gracefully", () => {
    const ctx = new OverlayContext({
      history: perfMockHistory(),
      registry: perfMockRegistry(),
      analysis: perfMockAnalysis(),
      theme: DarkTheme,
    });
    const panel = new PerformancePanel(ctx);
    panel.update({ dt: 16 });
    const canvas = mockCtx();
    assert.doesNotThrow(() => panel.render(canvas, { x: 0, y: 0, width: 500, height: 350 }));
  });

  it("status color for fps uses reversed logic", () => {
    const ctx = makePerfContext();
    const panel = new PerformancePanel(ctx);
    assert.strictEqual(panel._statusColor(58, 30, 20, DarkTheme, true), DarkTheme.fpsGood);
    assert.strictEqual(panel._statusColor(25, 30, 20, DarkTheme, true), DarkTheme.fpsWarn);
    assert.strictEqual(panel._statusColor(15, 30, 20, DarkTheme, true), DarkTheme.fpsBad);
  });

  it("status color for frame time uses normal logic", () => {
    const ctx = makePerfContext();
    const panel = new PerformancePanel(ctx);
    assert.strictEqual(panel._statusColor(5, 16, 20, DarkTheme), DarkTheme.fpsGood);
    assert.strictEqual(panel._statusColor(18, 16, 20, DarkTheme), DarkTheme.fpsWarn);
    assert.strictEqual(panel._statusColor(25, 16, 20, DarkTheme), DarkTheme.fpsBad);
  });

  it("budget card shows fill bar", () => {
    const ctx = makePerfContext();
    const panel = new PerformancePanel(ctx);
    panel.update({ dt: 16 });
    const canvas = mockCtx();
    panel.render(canvas, { x: 0, y: 0, width: 500, height: 350 });
    const fillRects = canvas._calls.filter(c => c[0] === "fillRect");
    const budgetFill = fillRects.find(c => c[1] > 300 && c[4] === 3);
    assert.ok(budgetFill !== undefined);
  });
});

describe("FrameGraphPanel", () => {
  it("construction defaults", () => {
    const panel = new FrameGraphPanel(new OverlayContext());
    assert.strictEqual(panel.id, "framegraph");
    assert.strictEqual(panel.title, "Frame Graph");
    assert.strictEqual(panel.defaultWidth, 600);
    assert.strictEqual(panel.defaultHeight, 200);
    assert.strictEqual(panel.minWidth, 200);
    assert.strictEqual(panel.minHeight, 100);
  });

  it("update with null sources sets _data null", () => {
    const panel = new FrameGraphPanel(new OverlayContext());
    panel.update({});
    assert.strictEqual(panel._data, null);
  });

  it("update with valid data populates metrics", () => {
    const ctx = makePerfContext();
    const panel = new FrameGraphPanel(ctx);
    panel.update({});
    const d = panel._data;
    assert.ok(d !== null);
    assert.ok(d.metrics.length >= 2);
    assert.ok(d.metrics.some(m => m.name === "frame.total"));
    assert.ok(d.metrics.some(m => m.name === "frame.render"));
    assert.ok(d.frameCount > 0);
    assert.ok(d.yMin >= 0);
    assert.ok(d.yMax > d.yMin);
  });

  it("update excludes frame.fps", () => {
    const ctx = makePerfContext();
    const panel = new FrameGraphPanel(ctx);
    panel.update({});
    const names = panel._data.metrics.map(m => m.name);
    assert.ok(!names.includes("frame.fps"));
  });

  it("update handles empty history", () => {
    const ctx = new OverlayContext({
      history: { count: 0, frames: function*() { yield* []; } },
      registry: perfMockRegistry(),
      analysis: perfMockAnalysis(),
    });
    const panel = new FrameGraphPanel(ctx);
    panel.update({});
    assert.strictEqual(panel._data, null);
  });

  it("toggleMetric shows/hides a metric", () => {
    const ctx = makePerfContext();
    const panel = new FrameGraphPanel(ctx);
    panel.update({});
    const name = panel._data.metrics[0].name;
    assert.ok(panel.isMetricVisible(name));
    panel.toggleMetric(name);
    assert.ok(!panel.isMetricVisible(name));
    panel.toggleMetric(name);
    assert.ok(panel.isMetricVisible(name));
  });

  it("render with null data draws no-data", () => {
    const ctx = new OverlayContext({ theme: DarkTheme, renderers: perfMockRenderers() });
    const panel = new FrameGraphPanel(ctx);
    const canvas = mockCtx();
    panel.render(canvas, { x: 0, y: 0, width: 600, height: 200 });
    const texts = canvas._calls.filter(c => c[0] === "fillText").map(c => c[1]);
    assert.ok(texts.includes("No data"));
  });

  it("render with data draws metric lines", () => {
    const ctx = makePerfContext();
    const panel = new FrameGraphPanel(ctx);
    panel.update({});
    const canvas = mockCtx();
    panel.render(canvas, { x: 0, y: 0, width: 600, height: 200 });
    const moveTos = canvas._calls.filter(c => c[0] === "moveTo");
    assert.ok(moveTos.length >= 2);
    const lineTos = canvas._calls.filter(c => c[0] === "lineTo");
    assert.ok(lineTos.length > 0);
  });

  it("render draws grid lines", () => {
    const ctx = makePerfContext();
    const panel = new FrameGraphPanel(ctx);
    panel.update({});
    const canvas = mockCtx();
    panel.render(canvas, { x: 0, y: 0, width: 600, height: 200 });
    const strokeCalls = canvas._calls.filter(c => c[0] === "stroke");
    assert.ok(strokeCalls.length > 1);
  });

  it("render draws current frame marker", () => {
    const ctx = makePerfContext();
    const panel = new FrameGraphPanel(ctx);
    panel.update({});
    const canvas = mockCtx();
    panel.render(canvas, { x: 0, y: 0, width: 600, height: 200 });
    const dashCalls = canvas._calls.filter(c => c[0] === "setLineDash");
    assert.ok(dashCalls.length >= 2);
  });

  it("render draws legend with metric names", () => {
    const ctx = makePerfContext();
    const panel = new FrameGraphPanel(ctx);
    panel.update({});
    const canvas = mockCtx();
    panel.render(canvas, { x: 0, y: 0, width: 600, height: 200 });
    const texts = canvas._calls.filter(c => c[0] === "fillText").map(c => c[1]);
    assert.ok(texts.includes("Frame Total"));
    assert.ok(texts.includes("Render"));
  });

  it("render with all metrics hidden draws only grid and marker", () => {
    const ctx = makePerfContext();
    const panel = new FrameGraphPanel(ctx);
    panel.update({});
    // Hide all metrics (toggle each one that's currently visible)
    for (const m of panel._data.metrics) {
      panel.toggleMetric(m.name);
    }
    panel.update({});
    const canvas = mockCtx();
    assert.doesNotThrow(() => panel.render(canvas, { x: 0, y: 0, width: 600, height: 200 }));
    const strokeCalls = canvas._calls.filter(c => c[0] === "stroke");
    assert.ok(strokeCalls.length > 0, "grid + marker produce strokes");
    const setLineWidthCalls = canvas._calls.filter(c => c[0] === "set:lineWidth").map(c => c[1]);
    assert.ok(!setLineWidthCalls.includes(2), "frame.total line (width 2) should not be drawn: " + JSON.stringify(setLineWidthCalls));
  });

  it("niceYSteps produces logical intervals", () => {
    const panel = new FrameGraphPanel(new OverlayContext());
    const steps = panel._niceYSteps(0, 16.7, 5);
    assert.ok(steps.length >= 3);
    assert.strictEqual(steps[0], 0);
    for (let i = 1; i < steps.length; i++) {
      const diff = steps[i] - steps[i - 1];
      assert.ok(diff > 0);
      assert.ok(diff <= 10);
    }
  });

  it("niceYSteps handles zero range", () => {
    const panel = new FrameGraphPanel(new OverlayContext());
    const steps = panel._niceYSteps(10, 10, 5);
    assert.ok(steps.length >= 1);
  });

  it("render handles missing renderers gracefully", () => {
    const ctx = new OverlayContext({
      history: perfMockHistory(),
      registry: perfMockRegistry(),
      analysis: perfMockAnalysis(),
      theme: DarkTheme,
    });
    const panel = new FrameGraphPanel(ctx);
    panel.update({});
    const canvas = mockCtx();
    assert.doesNotThrow(() => panel.render(canvas, { x: 0, y: 0, width: 600, height: 200 }));
  });
});

function timelineMockHistory(count = 60) {
  const snapshots = Array.from({ length: count }, (_, i) => ({
    timerTotal(id) {
      const base = [0, 16.5, 8.0, 3.3, 4.2];
      return (base[id] || 0) + (i % 5) * 0.1;
    },
  }));
  return {
    count: snapshots.length,
    frames: function*() { yield* snapshots; },
    at(idx) { return snapshots[idx] || null; },
  };
}

function deepMockRegistry() {
  const descriptors = [
    { id: 0, name: "frame.total", displayName: "Frame Total", type: MetricType.TIMER, color: "#ff8888" },
    { id: 1, name: "frame.total.buffer", displayName: "Buffer", type: MetricType.TIMER, color: "#88ff88" },
    { id: 2, name: "frame.total.render", displayName: "Render Sub", type: MetricType.TIMER, color: "#8888ff" },
    { id: 3, name: "ecs", displayName: "ECS", type: MetricType.TIMER, color: "#ffff88" },
    { id: 4, name: "ecs.update", displayName: "ECS Update", type: MetricType.TIMER, color: "#ff88ff" },
  ];
  const nameMap = new Map(descriptors.map(d => [d.name, d]));
  return {
    forEach(fn) { descriptors.forEach(fn); },
    find(name) { return nameMap.get(name) || null; },
    get(id) { return descriptors[id] || null; },
    count: descriptors.length,
  };
}

function timelineMockSnapshot() {
  const values = [16.7, 8.2, 3.4, 0, 4.2];
  return {
    timerTotal(id) { return values[id] || 0; },
  };
}

function makeTimelineCtx(overrides = {}) {
  return new OverlayContext({
    history: timelineMockHistory(),
    registry: perfMockRegistry(),
    theme: DarkTheme,
    renderers: perfMockRenderers(),
    ...overrides,
  });
}

describe("TimelineModel", () => {
  it("build creates flat tree when no nesting", () => {
    const ctx = makeTimelineCtx();
    const model = new TimelineModel(ctx);
    model.build(timelineMockSnapshot());
    assert.ok(model.tree.length >= 2);
    assert.strictEqual(model.tree[0].name, "frame.total");
  });

  it("build sorts by value descending", () => {
    const ctx = makeTimelineCtx({ registry: deepMockRegistry() });
    const model = new TimelineModel(ctx);
    model.build(timelineMockSnapshot());
    for (let i = 1; i < model.tree.length; i++) {
      assert.ok(model.tree[i - 1].value >= model.tree[i].value);
    }
  });

  it("findParent returns correct parent for nested names", () => {
    const ctx = makeTimelineCtx({ registry: deepMockRegistry() });
    const model = new TimelineModel(ctx);
    assert.strictEqual(model._findParent("frame.total.buffer"), 0);
    assert.strictEqual(model._findParent("frame.total.render"), 0);
    assert.strictEqual(model._findParent("ecs.update"), 3);
  });

  it("findParent returns null for names without parent", () => {
    const ctx = makeTimelineCtx({ registry: deepMockRegistry() });
    const model = new TimelineModel(ctx);
    assert.strictEqual(model._findParent("frame.total"), null);
    assert.strictEqual(model._findParent("ecs"), null);
  });

  it("build creates hierarchy with nested metrics", () => {
    const ctx = makeTimelineCtx({ registry: deepMockRegistry() });
    const model = new TimelineModel(ctx);
    model.build(timelineMockSnapshot());
    const total = model.tree.find(n => n.name === "frame.total");
    assert.ok(total);
    assert.strictEqual(total.children.length, 2);
    assert.ok(total.children.some(c => c.name === "frame.total.buffer"));
    assert.ok(total.children.some(c => c.name === "frame.total.render"));
  });

  it("isExpanded returns true for roots by default", () => {
    const ctx = makeTimelineCtx();
    const model = new TimelineModel(ctx);
    model.build(timelineMockSnapshot());
    assert.ok(model.isExpanded(model.tree[0].id));
  });

  it("toggleExpanded adds/removes from set", () => {
    const ctx = makeTimelineCtx();
    const model = new TimelineModel(ctx);
    model.build(timelineMockSnapshot());
    const id = model.tree[0].id;
    assert.ok(model.isExpanded(id));
    model.toggleExpanded(id);
    assert.ok(!model.isExpanded(id));
    model.toggleExpanded(id);
    assert.ok(model.isExpanded(id));
  });

  it("collapseAll clears", () => {
    const ctx = makeTimelineCtx();
    const model = new TimelineModel(ctx);
    model.build(timelineMockSnapshot());
    model.collapseAll();
    assert.strictEqual(model.isExpanded(model.tree[0].id), false);
  });

  it("frameIndex setter builds from snapshot", () => {
    const ctx = makeTimelineCtx({ history: timelineMockHistory() });
    const model = new TimelineModel(ctx);
    model.frameIndex = 10;
    assert.strictEqual(model.frameIndex, 10);
    assert.ok(model.tree.length > 0);
  });
});

describe("TimelineRenderer", () => {
  it("render draws frame header", () => {
    const ctx = makeTimelineCtx();
    const model = new TimelineModel(ctx);
    model.build(timelineMockSnapshot());
    const interaction = new TimelineInteraction(ctx, model);
    const renderer = new TimelineRenderer(ctx, interaction);
    const canvas = mockCtx();
    renderer.render(canvas, { x: 0, y: 0, width: 700, height: 300 }, model);
    const texts = canvas._calls.filter(c => c[0] === "fillText").map(c => c[1]);
    assert.ok(texts.some(t => t.startsWith("Frame")));
  });

  it("render draws rows for each root node", () => {
    const ctx = makeTimelineCtx();
    const model = new TimelineModel(ctx);
    model.build(timelineMockSnapshot());
    const interaction = new TimelineInteraction(ctx, model);
    const renderer = new TimelineRenderer(ctx, interaction);
    const canvas = mockCtx();
    renderer.render(canvas, { x: 0, y: 0, width: 700, height: 300 }, model);
    const texts = canvas._calls.filter(c => c[0] === "fillText").map(c => c[1]);
    for (const node of model.tree) {
      assert.ok(texts.includes(node.displayName), `row for ${node.displayName}`);
    }
  });

  it("render respects visible bounds", () => {
    const ctx = makeTimelineCtx();
    const model = new TimelineModel(ctx);
    model.build(timelineMockSnapshot());
    const interaction = new TimelineInteraction(ctx, model);
    const renderer = new TimelineRenderer(ctx, interaction);
    const canvas = mockCtx();
    renderer.render(canvas, { x: 0, y: 0, width: 700, height: 10 }, model);
    const strokeCalls = canvas._calls.filter(c => c[0] === "stroke");
    assert.strictEqual(strokeCalls.length, 0);
  });

  it("walkVisible yields flat nodes when none expanded", () => {
    const ctx = makeTimelineCtx({ registry: deepMockRegistry() });
    const model = new TimelineModel(ctx);
    model.build(timelineMockSnapshot());
    model.collapseAll();
    const interaction = new TimelineInteraction(ctx, model);
    const renderer = new TimelineRenderer(ctx, interaction);
    const results = [...renderer._walkVisible(model.tree, model)];
    const rootNames = results.filter(r => r.depth === 0);
    assert.ok(rootNames.length > 0);
    assert.strictEqual(rootNames.every(r => r.depth === 0), true);
  });

  it("walkVisible yields children when parent expanded", () => {
    const ctx = makeTimelineCtx({ registry: deepMockRegistry() });
    const model = new TimelineModel(ctx);
    model.build(timelineMockSnapshot());
    const interaction = new TimelineInteraction(ctx, model);
    const renderer = new TimelineRenderer(ctx, interaction);
    const results = [...renderer._walkVisible(model.tree, model)];
    const children = results.filter(r => r.depth === 1);
    assert.ok(children.length > 0);
  });
});

describe("TimelineInteraction", () => {
  it("trackRow records positions", () => {
    const ctx = makeTimelineCtx();
    const model = new TimelineModel(ctx);
    const interaction = new TimelineInteraction(ctx, model);
    interaction.trackRow(0, 20, 18);
    interaction.trackRow(1, 40, 18);
    assert.strictEqual(interaction._rowRects.length, 2);
  });

  it("reset clears row rects", () => {
    const ctx = makeTimelineCtx();
    const model = new TimelineModel(ctx);
    const interaction = new TimelineInteraction(ctx, model);
    interaction.trackRow(0, 20, 18);
    interaction.reset();
    assert.strictEqual(interaction._rowRects.length, 0);
  });

  it("onInput click on row with children toggles expand", () => {
    const ctx = makeTimelineCtx({ registry: deepMockRegistry() });
    const model = new TimelineModel(ctx);
    model.build(timelineMockSnapshot());
    const interaction = new TimelineInteraction(ctx, model);
    const total = model.tree.find(n => n.name === "frame.total");
    assert.ok(model.isExpanded(total.id));
    interaction.trackRow(total.id, 20, 18);
    const handled = interaction.onInput({ type: "click", x: 0, y: 30 });
    assert.ok(handled);
    assert.ok(!model.isExpanded(total.id));
  });

  it("onInput click on row without children returns false", () => {
    const ctx = makeTimelineCtx({ registry: deepMockRegistry() });
    const model = new TimelineModel(ctx);
    model.build(timelineMockSnapshot());
    const interaction = new TimelineInteraction(ctx, model);
    interaction.trackRow(999, 20, 18);
    const handled = interaction.onInput({ type: "click", x: 0, y: 30 });
    assert.strictEqual(handled, false);
  });

  it("onInput keydown arrow navigates frames", () => {
    const ctx = makeTimelineCtx({ history: timelineMockHistory() });
    const model = new TimelineModel(ctx);
    model.frameIndex = 30;
    const interaction = new TimelineInteraction(ctx, model);
    let handled = interaction.onInput({ type: "keydown", key: "ArrowLeft" });
    assert.ok(handled);
    assert.strictEqual(model.frameIndex, 29);
    handled = interaction.onInput({ type: "keydown", key: "ArrowRight" });
    assert.ok(handled);
    assert.strictEqual(model.frameIndex, 30);
  });

  it("onInput arrow left at frame 0 does nothing", () => {
    const ctx = makeTimelineCtx({ history: timelineMockHistory() });
    const model = new TimelineModel(ctx);
    model.frameIndex = 0;
    const interaction = new TimelineInteraction(ctx, model);
    const handled = interaction.onInput({ type: "keydown", key: "ArrowLeft" });
    assert.strictEqual(handled, true);
    assert.strictEqual(model.frameIndex, 0);
  });
});

describe("TimelinePanel", () => {
  it("construction defaults", () => {
    const panel = new TimelinePanel(new OverlayContext());
    assert.strictEqual(panel.id, "timeline");
    assert.strictEqual(panel.title, "Timeline");
    assert.strictEqual(panel.defaultWidth, 700);
    assert.strictEqual(panel.defaultHeight, 300);
  });

  it("update builds model from latest frame", () => {
    const ctx = makeTimelineCtx({ history: timelineMockHistory() });
    const panel = new TimelinePanel(ctx);
    panel.update({});
    assert.ok(panel._model.frameIndex >= 0);
    assert.ok(panel._model.tree.length > 0);
  });

  it("update with no history does nothing", () => {
    const ctx = new OverlayContext();
    const panel = new TimelinePanel(ctx);
    assert.doesNotThrow(() => panel.update({}));
  });

  it("render draws panel background and timeline", () => {
    const ctx = makeTimelineCtx({ history: timelineMockHistory() });
    const panel = new TimelinePanel(ctx);
    panel.update({});
    const canvas = mockCtx();
    panel.render(canvas, { x: 0, y: 0, width: 700, height: 300 });
    const fillRects = canvas._calls.filter(c => c[0] === "fillRect");
    assert.ok(fillRects.length > 0);
    const texts = canvas._calls.filter(c => c[0] === "fillText").map(c => c[1]);
    assert.ok(texts.some(t => t.startsWith("Frame")));
  });

  it("render without rect is no-op", () => {
    const ctx = makeTimelineCtx();
    const panel = new TimelinePanel(ctx);
    const canvas = mockCtx();
    assert.doesNotThrow(() => panel.render(canvas, null));
  });

  it("handleInput delegates to interaction", () => {
    const ctx = makeTimelineCtx();
    const panel = new TimelinePanel(ctx);
    const result = panel.handleInput({ type: "keydown", key: "ArrowLeft" });
    assert.strictEqual(result, true);
    const unhandled = panel.handleInput({ type: "click", x: 0, y: 0 });
    assert.strictEqual(unhandled, false);
  });
});

describe("OverlaySession", () => {
  it("starts hidden", () => {
    const s = new OverlaySession();
    assert.strictEqual(s.visible, false);
  });

  it("creates all subsystems", () => {
    const s = new OverlaySession();
    assert.ok(s.context instanceof OverlayContext);
    assert.ok(s.panels instanceof PanelManager);
    assert.ok(s.layout instanceof LayoutEngine);
    assert.ok(s.renderers.text instanceof TextRenderer);
    assert.ok(s.renderers.sparkline instanceof SparklineRenderer);
    assert.ok(s.renderers.histogram instanceof HistogramRenderer);
    assert.ok(s.renderers.frameBar instanceof FrameBarRenderer);
  });

  it("show/hide/toggle work", () => {
    const s = new OverlaySession();
    s.show(); assert.ok(s.visible);
    s.hide(); assert.ok(!s.visible);
    s.toggle(); assert.ok(s.visible);
    s.toggle(); assert.ok(!s.visible);
  });

  it("render when hidden is no-op", () => {
    const s = new OverlaySession();
    s.render(mockCtx(), 800, 600);
  });

  it("destroy cleans up", () => {
    const s = new OverlaySession();
    s.show();
    s.panels.register(new Panel("p", "P", s.context));
    s.panels.show("p");
    s.destroy();
    assert.strictEqual(s.visible, false);
    assert.strictEqual(s.panels.visibleCount, 0);
  });
});

function browserMockRegistry() {
  const descriptors = [
    { id: 0, name: "frame.total", displayName: "Frame Total", type: MetricType.TIMER, category: 0, unit: 0, color: "#ff8888" },
    { id: 1, name: "frame.render", displayName: "Render", type: MetricType.TIMER, category: 0, unit: 0, color: "#88ff88" },
    { id: 2, name: "ecs.world.entities", displayName: "Entities", type: MetricType.COUNTER, category: 1, unit: 1 },
    { id: 3, name: "ecs.update", displayName: "ECS Update", type: MetricType.TIMER, category: 1, unit: 0, color: "#ffff88" },
    { id: 4, name: "render.draw.calls", displayName: "Draw Calls", type: MetricType.COUNTER, category: 2, unit: 1 },
    { id: 5, name: "fps", displayName: "FPS", type: MetricType.GAUGE, category: 0, unit: 5 },
  ];
  const nameMap = new Map(descriptors.map(d => [d.name, d]));
  return {
    forEach(fn) { descriptors.forEach(fn); },
    find(name) { return nameMap.get(name) || null; },
    count: descriptors.length,
  };
}

function browserMockAnalysis() {
  return {
    latest(name) {
      const map = {
        "frame.total": 16.7,
        "frame.render": 8.2,
        "ecs.world.entities": 1024,
        "ecs.update": 4.2,
        "render.draw.calls": 512,
        "fps": 59.8,
      };
      return map[name] || 0;
    },
  };
}

function browserMockRenderers() {
  return {
    text: {
      render(ctx, text, x, y, opts) { ctx.fillText(text, x, y); },
      measure(ctx, text, opts) { return { width: text.length * 7 }; },
    },
  };
}

function makeBrowserCtx(overrides = {}) {
  return new OverlayContext({
    registry: browserMockRegistry(),
    analysis: browserMockAnalysis(),
    theme: DarkTheme,
    renderers: browserMockRenderers(),
    ...overrides,
  });
}

describe("MetricSearchIndex", () => {
  it("rebuild indexes registry entries", () => {
    const reg = { forEach(fn) { fn({ id: 0, name: "a.b", displayName: "A B", type: MetricType.TIMER, category: 0 }); }, count: 1 };
    const idx = new MetricSearchIndex(reg);
    assert.strictEqual(idx._entries.length, 1);
    assert.strictEqual(idx._entries[0].name, "a.b");
    assert.strictEqual(idx._entries[0].normalizedName, "a.b");
    assert.strictEqual(idx._entries[0].type, MetricType.TIMER);
  });

  it("search with empty query returns all", () => {
    const idx = new MetricSearchIndex(browserMockRegistry());
    assert.strictEqual(idx.search("").length, 6);
  });

  it("search with null query returns all", () => {
    const idx = new MetricSearchIndex(browserMockRegistry());
    assert.strictEqual(idx.search(null).length, 6);
  });

  it("search filters by exact name", () => {
    const idx = new MetricSearchIndex(browserMockRegistry());
    assert.strictEqual(idx.search("frame.total").length, 1);
  });

  it("search by prefix matches multiple", () => {
    const idx = new MetricSearchIndex(browserMockRegistry());
    const results = idx.search("frame");
    assert.ok(results.length >= 2);
    assert.ok(results.every(e => e.name.startsWith("frame")));
  });

  it("search by contains substring", () => {
    const idx = new MetricSearchIndex(browserMockRegistry());
    const results = idx.search("total");
    assert.strictEqual(results.length, 1);
  });

  it("search by regex", () => {
    const idx = new MetricSearchIndex(browserMockRegistry());
    const results = idx.search("/ecs");
    assert.ok(results.length >= 2);
  });

  it("search by invalid regex returns empty", () => {
    const idx = new MetricSearchIndex(browserMockRegistry());
    const results = idx.search("/[invalid");
    assert.strictEqual(results.length, 0);
  });

  it("search with type filter returns only matching type", () => {
    const idx = new MetricSearchIndex(browserMockRegistry());
    const timers = idx.search("", { type: MetricType.TIMER });
    assert.ok(timers.every(e => e.type === MetricType.TIMER));
  });

  it("search with category filter returns only matching category", () => {
    const idx = new MetricSearchIndex(browserMockRegistry());
    const ecsOnly = idx.search("", { categories: [1] });
    assert.ok(ecsOnly.every(e => e.category === 1));
  });

  it("search combines query and type filter", () => {
    const idx = new MetricSearchIndex(browserMockRegistry());
    const results = idx.search("frame", { type: MetricType.TIMER });
    assert.ok(results.every(e => e.name.startsWith("frame") && e.type === MetricType.TIMER));
  });

  it("search with group filter returns empty for non-matching group", () => {
    const idx = new MetricSearchIndex(browserMockRegistry());
    const results = idx.search("", { group: "nonexistent" });
    assert.strictEqual(results.length, 0);
  });

  it("rebuild reindexes with new registry", () => {
    const idx = new MetricSearchIndex(browserMockRegistry());
    assert.strictEqual(idx._entries.length, 6);
    const smallReg = { forEach(fn) { fn({ id: 0, name: "test", displayName: "Test", type: MetricType.TIMER, category: 0 }); }, count: 1 };
    idx.rebuild(smallReg);
    assert.strictEqual(idx._entries.length, 1);
    assert.strictEqual(idx._entries[0].name, "test");
  });
});

describe("MetricBrowserPanel", () => {
  it("construction defaults", () => {
    const panel = new MetricBrowserPanel(new OverlayContext());
    assert.strictEqual(panel.id, "metrics");
    assert.strictEqual(panel.title, "Metric Browser");
    assert.strictEqual(panel.defaultWidth, 450);
    assert.strictEqual(panel.defaultHeight, 400);
  });

  it("update without registry clears groups", () => {
    const panel = new MetricBrowserPanel(new OverlayContext());
    panel.update({});
    assert.strictEqual(panel._groups.length, 0);
    assert.strictEqual(panel._availableCategories.length, 0);
  });

  it("update builds groups from registry", () => {
    const ctx = makeBrowserCtx();
    const panel = new MetricBrowserPanel(ctx);
    panel.update({});
    assert.ok(panel._groups.length >= 2);
    const frame = panel._groups.find(g => g.name === "frame");
    assert.ok(frame);
    assert.ok(frame.metrics.length >= 2);
    assert.ok(frame.metrics.some(m => m.name === "frame.total"));
  });

  it("update sorts groups alphabetically with ungrouped last", () => {
    const ctx = makeBrowserCtx();
    const panel = new MetricBrowserPanel(ctx);
    panel.update({});
    for (let i = 1; i < panel._groups.length; i++) {
      const prev = panel._groups[i - 1].name;
      const curr = panel._groups[i].name;
      if (prev === "__ungrouped__") assert.fail("ungrouped before " + curr);
      if (curr === "__ungrouped__") continue;
      assert.ok(prev.localeCompare(curr) <= 0, `${prev} should be before ${curr}`);
    }
  });

  it("setQuery filters displayed metrics", () => {
    const ctx = makeBrowserCtx();
    const panel = new MetricBrowserPanel(ctx);
    panel.setQuery("ecs");
    panel.update({});
    assert.ok(panel._groups.length >= 1);
    const names = panel._groups.flatMap(g => g.metrics.map(m => m.name));
    assert.ok(names.every(n => n.includes("ecs")), "all names should contain ecs");
  });

  it("setTypeFilter filters by metric type", () => {
    const ctx = makeBrowserCtx();
    const panel = new MetricBrowserPanel(ctx);
    panel.setTypeFilter(MetricType.COUNTER);
    panel.update({});
    const names = panel._groups.flatMap(g => g.metrics.map(m => m.name));
    for (const n of names) {
      const desc = browserMockRegistry().find(n);
      assert.strictEqual(desc.type, MetricType.COUNTER, `${n} should be COUNTER`);
    }
  });

  it("toggleCategory adds then removes category filter", () => {
    const ctx = new OverlayContext({ registry: browserMockRegistry() });
    const panel = new MetricBrowserPanel(ctx);
    assert.strictEqual(panel._categoryFilters.length, 0);
    panel.toggleCategory(0);
    assert.strictEqual(panel._categoryFilters.length, 1);
    assert.strictEqual(panel._categoryFilters[0], 0);
    panel.toggleCategory(0);
    assert.strictEqual(panel._categoryFilters.length, 0);
  });

  it("toggleGroup collapses then expands", () => {
    const ctx = new OverlayContext({ registry: browserMockRegistry() });
    const panel = new MetricBrowserPanel(ctx);
    assert.ok(!panel._collapsedGroups.has("frame"));
    panel.toggleGroup("frame");
    assert.ok(panel._collapsedGroups.has("frame"));
    panel.toggleGroup("frame");
    assert.ok(!panel._collapsedGroups.has("frame"));
  });

  it("render without registry draws no-metrics message", () => {
    const panel = new MetricBrowserPanel(new OverlayContext({
      theme: DarkTheme,
      renderers: { text: { render(ctx, t, x, y) { ctx.fillText(t, x, y); }, measure() { return { width: 10 }; } } },
    }));
    const canvas = mockCtx();
    panel.render(canvas, { x: 0, y: 0, width: 450, height: 400 });
    const texts = canvas._calls.filter(c => c[0] === "fillText").map(c => c[1]);
    assert.ok(texts.includes("No metrics registered"));
  });

  it("render without rect is no-op", () => {
    const panel = new MetricBrowserPanel(new OverlayContext());
    const canvas = mockCtx();
    assert.doesNotThrow(() => panel.render(canvas, null));
  });

  it("render with data draws metric names and values", () => {
    const ctx = makeBrowserCtx();
    const panel = new MetricBrowserPanel(ctx);
    panel.update({});
    const canvas = mockCtx();
    panel.render(canvas, { x: 0, y: 0, width: 450, height: 400 });
    const texts = canvas._calls.filter(c => c[0] === "fillText").map(c => c[1]);
    assert.ok(texts.some(t => t.includes("Frame Total")), "should draw Frame Total");
    assert.ok(texts.some(t => t.includes("ECS Update")), "should draw ECS Update");
  });

  it("render populates click regions", () => {
    const ctx = makeBrowserCtx();
    const panel = new MetricBrowserPanel(ctx);
    panel.update({});
    const canvas = mockCtx();
    panel.render(canvas, { x: 0, y: 0, width: 450, height: 400 });
    assert.ok(panel._clickRegions.length >= 6, `expected >=6 regions, got ${panel._clickRegions.length}`);
  });

  it("render with setQuery shows filtered results", () => {
    const ctx = makeBrowserCtx();
    const panel = new MetricBrowserPanel(ctx);
    panel.setQuery("ecs");
    panel.update({});
    const canvas = mockCtx();
    panel.render(canvas, { x: 0, y: 0, width: 450, height: 400 });
    const texts = canvas._calls.filter(c => c[0] === "fillText").map(c => c[1]);
    assert.ok(texts.some(t => t.includes("ECS Update")), "should show ECS Update");
    assert.ok(!texts.some(t => t.includes("Frame Total")), "should not show Frame Total");
  });

  it("handleInput on type filter region updates filter", () => {
    const panel = new MetricBrowserPanel(new OverlayContext());
    panel._clickRegions = [{ x: 10, y: 40, w: 100, h: 22, handler: () => { panel._typeFilter = MetricType.TIMER; } }];
    const handled = panel.handleInput({ type: "click", x: 50, y: 50 });
    assert.strictEqual(handled, true);
    assert.strictEqual(panel._typeFilter, MetricType.TIMER);
  });

  it("handleInput outside regions returns false", () => {
    const panel = new MetricBrowserPanel(new OverlayContext());
    panel._clickRegions = [{ x: 10, y: 40, w: 100, h: 22, handler: () => {} }];
    const handled = panel.handleInput({ type: "click", x: 200, y: 200 });
    assert.strictEqual(handled, false);
  });

  it("handleInput ignores non-click events", () => {
    const panel = new MetricBrowserPanel(new OverlayContext());
    const handled = panel.handleInput({ type: "keydown", key: "Enter" });
    assert.strictEqual(handled, false);
  });

  it("_valueString formats timer with ms", () => {
    const ctx = makeBrowserCtx();
    const panel = new MetricBrowserPanel(ctx);
    const str = panel._valueString({ value: 16.7, type: MetricType.TIMER, unit: 0 });
    assert.strictEqual(str, "16.7 ms");
  });

  it("_valueString formats counter without unit", () => {
    const ctx = makeBrowserCtx();
    const panel = new MetricBrowserPanel(ctx);
    const str = panel._valueString({ value: 1024, type: MetricType.COUNTER, unit: null });
    assert.strictEqual(str, "1024");
  });

  it("_valueString formats gauge without unit", () => {
    const ctx = makeBrowserCtx();
    const panel = new MetricBrowserPanel(ctx);
    const str = panel._valueString({ value: 59.8, type: MetricType.GAUGE, unit: null });
    assert.strictEqual(str, "59.80");
  });
});

function eventMockHistory() {
  const snapEvents = [
    { frame: 234, timestamp: 34, category: "scene", name: "Transition", metadata: { scene: "menu" } },
    { frame: 234, timestamp: 42, category: "asset", name: "Texture Loaded", metadata: { key: "player.png", size: "2.1MB" } },
    { frame: 254, timestamp: 1200, category: "warning", name: "frame.update over budget", metadata: null },
    { frame: 254, timestamp: 1201, category: "warning", name: "audio glitch", metadata: null },
    { frame: 260, timestamp: 1500, category: "capture", name: "Frame spike", metadata: { total: 42.3 } },
    { frame: 261, timestamp: 1600, category: "info", name: "Capture complete", metadata: null },
  ];
  return {
    count: 1,
    frames() {
      return (function*() { yield { events: snapEvents }; })();
    },
  };
}

function eventMockRenderers() {
  return {
    text: {
      render(ctx, text, x, y, opts) { ctx.fillText(text, x, y); },
      measure(ctx, text, opts) { return { width: text.length * 7 }; },
    },
  };
}

function makeEventCtx(overrides = {}) {
  return new OverlayContext({
    history: eventMockHistory(),
    theme: DarkTheme,
    renderers: eventMockRenderers(),
    ...overrides,
  });
}

describe("EventViewerPanel", () => {
  it("construction defaults", () => {
    const panel = new EventViewerPanel(new OverlayContext());
    assert.strictEqual(panel.id, "events");
    assert.strictEqual(panel.title, "Event Viewer");
    assert.strictEqual(panel.defaultWidth, 500);
    assert.strictEqual(panel.defaultHeight, 300);
  });

  it("update without history does nothing", () => {
    const panel = new EventViewerPanel(new OverlayContext());
    panel.update({});
    assert.strictEqual(panel._events.length, 0);
  });

  it("update collects events from history", () => {
    const ctx = makeEventCtx();
    const panel = new EventViewerPanel(ctx);
    panel.update({});
    assert.strictEqual(panel._events.length, 6);
    assert.strictEqual(panel._events[0].name, "Capture complete");
  });

  it("update auto-detects categories", () => {
    const ctx = makeEventCtx();
    const panel = new EventViewerPanel(ctx);
    panel.update({});
    assert.ok(panel._categories.includes("scene"));
    assert.ok(panel._categories.includes("asset"));
    assert.ok(panel._categories.includes("warning"));
    assert.ok(panel._categories.includes("capture"));
    assert.ok(panel._categories.includes("info"));
  });

  it("_deriveSeverity detects warn from category", () => {
    const panel = new EventViewerPanel(new OverlayContext());
    const ev = { category: "warning", name: "something" };
    assert.strictEqual(panel._deriveSeverity(ev), "warn");
  });

  it("_deriveSeverity detects error from name", () => {
    const panel = new EventViewerPanel(new OverlayContext());
    const ev = { category: "asset", name: "critical file not found" };
    assert.strictEqual(panel._deriveSeverity(ev), "error");
  });

  it("_deriveSeverity returns info for neutral terms", () => {
    const panel = new EventViewerPanel(new OverlayContext());
    const ev = { category: "scene", name: "Transition" };
    assert.strictEqual(panel._deriveSeverity(ev), "info");
  });

  it("toggleCategory adds and removes", () => {
    const ctx = makeEventCtx();
    const panel = new EventViewerPanel(ctx);
    panel.update({});
    assert.ok(panel._activeCategories.has("scene"));
    panel.toggleCategory("scene");
    assert.ok(!panel._activeCategories.has("scene"));
    panel.toggleCategory("scene");
    assert.ok(panel._activeCategories.has("scene"));
  });

  it("clear empties events and categories", () => {
    const ctx = makeEventCtx();
    const panel = new EventViewerPanel(ctx);
    panel.update({});
    assert.ok(panel._events.length > 0);
    panel.clear();
    assert.strictEqual(panel._events.length, 0);
    assert.strictEqual(panel._categories.length, 0);
  });

  it("setSeverityFilter updates filter", () => {
    const panel = new EventViewerPanel(new OverlayContext());
    assert.strictEqual(panel._severityFilter, "all");
    panel.setSeverityFilter("error");
    assert.strictEqual(panel._severityFilter, "error");
  });

  it("setSearchQuery filters rendered events", () => {
    const ctx = makeEventCtx();
    const panel = new EventViewerPanel(ctx);
    panel.update({});
    panel.setSearchQuery("audio");
    const filtered = panel._events.filter(ev => {
      const q = "audio";
      return ev.name.toLowerCase().includes(q) || ev.category.toLowerCase().includes(q);
    });
    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0].name, "audio glitch");
  });

  it("render without rect is no-op", () => {
    const panel = new EventViewerPanel(new OverlayContext());
    const canvas = mockCtx();
    assert.doesNotThrow(() => panel.render(canvas, null));
  });

  it("render with no history draws no-events message", () => {
    const panel = new EventViewerPanel(new OverlayContext({
      theme: DarkTheme,
      renderers: eventMockRenderers(),
    }));
    const canvas = mockCtx();
    panel.render(canvas, { x: 0, y: 0, width: 500, height: 300 });
    const texts = canvas._calls.filter(c => c[0] === "fillText").map(c => c[1]);
    assert.ok(texts.includes("No events"));
  });

  it("render with data draws event names", () => {
    const ctx = makeEventCtx();
    const panel = new EventViewerPanel(ctx);
    panel.update({});
    const canvas = mockCtx();
    panel.render(canvas, { x: 0, y: 0, width: 500, height: 300 });
    const texts = canvas._calls.filter(c => c[0] === "fillText").map(c => c[1]);
    assert.ok(texts.includes("Transition"), "should draw Transition");
    assert.ok(texts.includes("Texture Loaded"), "should draw Texture Loaded");
    assert.ok(texts.includes("Frame spike"), "should draw Frame spike");
  });

  it("render with category filter hides deselected category", () => {
    const ctx = makeEventCtx();
    const panel = new EventViewerPanel(ctx);
    panel.update({});
    panel.toggleCategory("scene");
    const canvas = mockCtx();
    panel.render(canvas, { x: 0, y: 0, width: 500, height: 300 });
    const texts = canvas._calls.filter(c => c[0] === "fillText").map(c => c[1]);
    assert.ok(!texts.includes("Transition"), "Transition should be hidden");
    assert.ok(texts.includes("Texture Loaded"), "other events should still show");
  });

  it("render with severity filter hides info events", () => {
    const ctx = makeEventCtx();
    const panel = new EventViewerPanel(ctx);
    panel.update({});
    panel.setSeverityFilter("error");
    const canvas = mockCtx();
    panel.render(canvas, { x: 0, y: 0, width: 500, height: 300 });
    const texts = canvas._calls.filter(c => c[0] === "fillText").map(c => c[1]);
    assert.ok(!texts.includes("Transition"), "info events filtered out");
  });

  it("handleInput on category region toggles filter", () => {
    const panel = new EventViewerPanel(new OverlayContext());
    panel._events = [{ category: "test", severity: "info" }];
    panel._categories = ["test"];
    panel._activeCategories = new Set(["test"]);
    panel._clickRegions = [{ x: 10, y: 40, w: 60, h: 20, handler: () => panel.toggleCategory("test") }];
    const handled = panel.handleInput({ type: "click", x: 30, y: 50 });
    assert.strictEqual(handled, true);
    assert.ok(!panel._activeCategories.has("test"));
  });

  it("handleInput on clear button clears events", () => {
    const panel = new EventViewerPanel(new OverlayContext());
    panel._events = [{ category: "test", name: "evt", severity: "info" }];
    panel._categories = ["test"];
    panel._activeCategories = new Set(["test"]);
    panel._clickRegions = [{ x: 100, y: 5, w: 40, h: 26, handler: () => panel.clear() }];
    panel.handleInput({ type: "click", x: 110, y: 15 });
    assert.strictEqual(panel._events.length, 0);
  });

  it("handleInput outside regions returns false", () => {
    const panel = new EventViewerPanel(new OverlayContext());
    panel._clickRegions = [{ x: 10, y: 10, w: 50, h: 20, handler: () => {} }];
    const handled = panel.handleInput({ type: "click", x: 200, y: 200 });
    assert.strictEqual(handled, false);
  });

  it("handleInput ignores non-click events", () => {
    const panel = new EventViewerPanel(new OverlayContext());
    const handled = panel.handleInput({ type: "keydown", key: "Enter" });
    assert.strictEqual(handled, false);
  });
});

function mockCaptureSnapshots(values) {
  return values.map(v => ({ timerTotal() { return v; } }));
}

function captureMockRenderers() {
  return {
    text: {
      render(ctx, text, x, y, opts) { ctx.fillText(text, x, y); },
      measure(ctx, text, opts) { return { width: text.length * 7 }; },
    },
  };
}

function makeCaptureCtx(captures) {
  return new OverlayContext({
    theme: DarkTheme,
    renderers: captureMockRenderers(),
    captures,
  });
}

describe("CaptureBrowserPanel", () => {
  it("construction defaults", () => {
    const panel = new CaptureBrowserPanel(new OverlayContext());
    assert.strictEqual(panel.id, "captures");
    assert.strictEqual(panel.title, "Capture Browser");
    assert.strictEqual(panel.defaultWidth, 600);
    assert.strictEqual(panel.defaultHeight, 400);
  });

  it("update with empty captures does nothing", () => {
    const panel = new CaptureBrowserPanel(new OverlayContext({ captures: [] }));
    panel.update({});
    assert.strictEqual(panel._selectedIndex, -1);
  });

  it("update clamps selected index when captures shrink", () => {
    const captures = [
      { name: "c1", snapshots: [], timestamp: 1000, preFrames: 0, postFrames: 0 },
    ];
    const ctx = makeCaptureCtx(captures);
    const panel = new CaptureBrowserPanel(ctx);
    panel._selectedIndex = 0;
    captures.splice(0, 1);
    panel.update({});
    assert.strictEqual(panel._selectedIndex, -1);
  });

  it("render with no captures draws no-captures message", () => {
    const ctx = makeCaptureCtx([]);
    const panel = new CaptureBrowserPanel(ctx);
    const canvas = mockCtx();
    panel.render(canvas, { x: 0, y: 0, width: 600, height: 400 });
    const texts = canvas._calls.filter(c => c[0] === "fillText").map(c => c[1]);
    assert.ok(texts.includes("No captures"));
  });

  it("render without rect is no-op", () => {
    const panel = new CaptureBrowserPanel(new OverlayContext());
    const canvas = mockCtx();
    assert.doesNotThrow(() => panel.render(canvas, null));
  });

  it("render with captures draws capture names", () => {
    const captures = [
      { name: "Frame spike", snapshots: mockCaptureSnapshots([16, 20, 15]), timestamp: 1000, preFrames: 1, postFrames: 1, metrics: { find() { return { id: 0 }; } } },
      { name: "Update spike", snapshots: mockCaptureSnapshots([16, 20, 15]), timestamp: 2000, preFrames: 1, postFrames: 1, metrics: { find() { return { id: 0 }; } } },
    ];
    const ctx = makeCaptureCtx(captures);
    const panel = new CaptureBrowserPanel(ctx);
    const canvas = mockCtx();
    panel.render(canvas, { x: 0, y: 0, width: 600, height: 400 });
    const texts = canvas._calls.filter(c => c[0] === "fillText").map(c => c[1]);
    assert.ok(texts.some(t => t.includes("Frame spike")));
    assert.ok(texts.some(t => t.includes("Update spike")));
  });

  it("render with captures draws header labels", () => {
    const captures = [
      { name: "c1", snapshots: mockCaptureSnapshots([16]), timestamp: 1000, preFrames: 0, postFrames: 0, metrics: { find() { return { id: 0 }; } } },
    ];
    const ctx = makeCaptureCtx(captures);
    const panel = new CaptureBrowserPanel(ctx);
    const canvas = mockCtx();
    panel.render(canvas, { x: 0, y: 0, width: 600, height: 400 });
    const texts = canvas._calls.filter(c => c[0] === "fillText").map(c => c[1]);
    assert.ok(texts.includes("Capture"));
    assert.ok(texts.includes("Frames"));
    assert.ok(texts.includes("Trigger"));
  });

  it("render with selection draws action buttons", () => {
    const captures = [
      { name: "c1", snapshots: mockCaptureSnapshots([16, 20]), timestamp: 1000, preFrames: 1, postFrames: 1, metrics: { find() { return { id: 0 }; } } },
    ];
    const ctx = makeCaptureCtx(captures);
    const panel = new CaptureBrowserPanel(ctx);
    panel._selectedIndex = 0;
    const canvas = mockCtx();
    panel.render(canvas, { x: 0, y: 0, width: 600, height: 400 });
    const texts = canvas._calls.filter(c => c[0] === "fillText").map(c => c[1]);
    assert.ok(texts.includes("Preview"));
    assert.ok(texts.includes("Export"));
    assert.ok(texts.includes("Delete"));
  });

  it("click on capture row selects it", () => {
    const captures = [
      { name: "c1", snapshots: [], timestamp: 1000, preFrames: 0, postFrames: 0 },
      { name: "c2", snapshots: [], timestamp: 2000, preFrames: 0, postFrames: 0 },
    ];
    const ctx = makeCaptureCtx(captures);
    const panel = new CaptureBrowserPanel(ctx);
    panel.render(mockCtx(), { x: 0, y: 0, width: 600, height: 400 });
    // Click on first capture row
    const firstRow = panel._clickRegions.find(r => r.x > 0 && r.y > 0);
    assert.ok(firstRow);
    firstRow.handler();
    assert.strictEqual(panel._selectedIndex, 0);
  });

  it("delete removes capture from array", () => {
    const captures = [
      { name: "c1", snapshots: [], timestamp: 1000, preFrames: 0, postFrames: 0 },
    ];
    const ctx = makeCaptureCtx(captures);
    const panel = new CaptureBrowserPanel(ctx);
    panel._selectedIndex = 0;
    panel._deleteCapture();
    assert.strictEqual(captures.length, 0);
    assert.strictEqual(panel._selectedIndex, -1);
  });

  it("delete clamps selected index", () => {
    const captures = [
      { name: "c1", snapshots: [], timestamp: 1000, preFrames: 0, postFrames: 0 },
      { name: "c2", snapshots: [], timestamp: 2000, preFrames: 0, postFrames: 0 },
    ];
    const ctx = makeCaptureCtx(captures);
    const panel = new CaptureBrowserPanel(ctx);
    panel._selectedIndex = 1;
    captures.splice(1, 1);
    panel.update({});
    assert.strictEqual(panel._selectedIndex, 0);
  });

  it("export calls commands.execute when available", () => {
    const captures = [
      { name: "c1", snapshots: [], timestamp: 1000, preFrames: 0, postFrames: 0 },
    ];
    let executed = null;
    const ctx = new OverlayContext({ captures, theme: DarkTheme });
    ctx.commands = { execute(cmd, arg) { executed = { cmd, arg }; } };
    const panel = new CaptureBrowserPanel(ctx);
    panel._selectedIndex = 0;
    panel._exportCapture();
    assert.ok(executed);
    assert.strictEqual(executed.cmd, "export:capture");
    assert.strictEqual(executed.arg, captures[0]);
  });

  it("render with selected capture draws sparkline preview", () => {
    const captures = [
      {
        name: "Frame spike",
        timestamp: 1000,
        preFrames: 1,
        postFrames: 1,
        snapshots: mockCaptureSnapshots([10, 15, 20, 18, 12]),
        metrics: { find() { return { id: 0 }; } },
      },
    ];
    const ctx = makeCaptureCtx(captures);
    const panel = new CaptureBrowserPanel(ctx);
    panel._selectedIndex = 0;
    const canvas = mockCtx();
    panel.render(canvas, { x: 0, y: 0, width: 600, height: 400 });
    const moveTos = canvas._calls.filter(c => c[0] === "moveTo");
    const lineTos = canvas._calls.filter(c => c[0] === "lineTo");
    assert.ok(moveTos.length >= 1, "should have moveTo for sparkline");
    assert.ok(lineTos.length >= 2, "should have lineTo for sparkline");
  });

  it("render with selection draws preview labels", () => {
    const captures = [
      {
        name: "Frame spike",
        timestamp: 1000,
        preFrames: 2,
        postFrames: 2,
        snapshots: mockCaptureSnapshots([10, 15, 20, 18, 12]),
        metrics: { find() { return { id: 0 }; } },
      },
    ];
    const ctx = makeCaptureCtx(captures);
    const panel = new CaptureBrowserPanel(ctx);
    panel._selectedIndex = 0;
    const canvas = mockCtx();
    panel.render(canvas, { x: 0, y: 0, width: 600, height: 400 });
    const texts = canvas._calls.filter(c => c[0] === "fillText").map(c => c[1]);
    assert.ok(texts.some(t => t.startsWith("pre:")), "should show pre label");
    assert.ok(texts.some(t => t.startsWith("post:")), "should show post label");
    assert.ok(texts.some(t => t === "trigger"), "should show trigger label");
  });

  it("handleInput on capture row selects", () => {
    const captures = [
      { name: "c1", snapshots: [], timestamp: 1000, preFrames: 0, postFrames: 0 },
    ];
    const ctx = makeCaptureCtx(captures);
    const panel = new CaptureBrowserPanel(ctx);
    panel._clickRegions = [{ x: 10, y: 40, w: 580, h: 22, handler: () => { panel._selectedIndex = 0; } }];
    const handled = panel.handleInput({ type: "click", x: 50, y: 50 });
    assert.strictEqual(handled, true);
    assert.strictEqual(panel._selectedIndex, 0);
  });

  it("handleInput outside regions returns false", () => {
    const panel = new CaptureBrowserPanel(new OverlayContext());
    panel._clickRegions = [{ x: 10, y: 10, w: 50, h: 20, handler: () => {} }];
    const handled = panel.handleInput({ type: "click", x: 200, y: 200 });
    assert.strictEqual(handled, false);
  });

  it("handleInput ignores non-click events", () => {
    const panel = new CaptureBrowserPanel(new OverlayContext());
    const handled = panel.handleInput({ type: "keydown", key: "Enter" });
    assert.strictEqual(handled, false);
  });

  it("_niceSteps returns at least two steps", () => {
    const panel = new CaptureBrowserPanel(new OverlayContext());
    const steps = panel._niceSteps(10, 20, 3);
    assert.ok(steps.length >= 2);
    assert.ok(steps[0] >= 10);
    assert.ok(steps[steps.length - 1] <= 20);
  });
});

function makeSettingsCtx(configOverrides = {}) {
  const config = { theme: "dark", fpsTarget: 60, refreshRate: 1, fontSize: 12, opacity: 0.85, ...configOverrides };
  return new OverlayContext({ config, theme: DarkTheme, renderers: { text: { render(ctx, t, x, y, o) { ctx.fillText(t, x, y); }, measure(ctx, t, o) { return { width: t.length * 7 }; } } } });
}

describe("SettingsPanel", () => {
  it("construction defaults", () => {
    const panel = new SettingsPanel(new OverlayContext());
    assert.strictEqual(panel.id, "settings");
    assert.strictEqual(panel.title, "Settings");
    assert.strictEqual(panel.defaultWidth, 400);
    assert.strictEqual(panel.defaultHeight, 300);
  });

  it("render without rect is no-op", () => {
    const panel = new SettingsPanel(new OverlayContext());
    const canvas = mockCtx();
    assert.doesNotThrow(() => panel.render(canvas, null));
  });

  it("render with config draws setting labels", () => {
    const ctx = makeSettingsCtx();
    const panel = new SettingsPanel(ctx);
    const canvas = mockCtx();
    panel.render(canvas, { x: 0, y: 0, width: 400, height: 300 });
    const texts = canvas._calls.filter(c => c[0] === "fillText").map(c => c[1]);
    assert.ok(texts.includes("Theme"));
    assert.ok(texts.includes("FPS Target"));
    assert.ok(texts.includes("Refresh Rate"));
    assert.ok(texts.includes("Font Size"));
    assert.ok(texts.includes("Opacity"));
  });

  it("render with config draws current values", () => {
    const ctx = makeSettingsCtx();
    const panel = new SettingsPanel(ctx);
    const canvas = mockCtx();
    panel.render(canvas, { x: 0, y: 0, width: 400, height: 300 });
    const texts = canvas._calls.filter(c => c[0] === "fillText").map(c => c[1]);
    assert.ok(texts.includes("Dark"), "should show Dark theme selected");
    assert.ok(texts.includes("60"), "should show FPS target");
    assert.ok(texts.includes("1"), "should show refresh rate");
    assert.ok(texts.includes("12"), "should show font size");
    assert.ok(texts.includes("0.85"), "should show opacity");
  });

  it("render draws reset buttons", () => {
    const ctx = makeSettingsCtx();
    const panel = new SettingsPanel(ctx);
    const canvas = mockCtx();
    panel.render(canvas, { x: 0, y: 0, width: 400, height: 300 });
    const texts = canvas._calls.filter(c => c[0] === "fillText").map(c => c[1]);
    assert.ok(texts.includes("Reset Layout"));
    assert.ok(texts.includes("Reset All"));
  });

  it("_setTheme switches to light", () => {
    const ctx = makeSettingsCtx();
    const panel = new SettingsPanel(ctx);
    panel._setTheme("light");
    assert.strictEqual(ctx.config.theme, "light");
    assert.strictEqual(ctx.theme, LightTheme);
  });

  it("_setTheme switches to dark", () => {
    const ctx = makeSettingsCtx({ theme: "light" });
    const panel = new SettingsPanel(ctx);
    panel._setTheme("dark");
    assert.strictEqual(ctx.config.theme, "dark");
    assert.strictEqual(ctx.theme, DarkTheme);
  });

  it("_adjustSetting increments value", () => {
    const config = { fpsTarget: 60 };
    const ctx = new OverlayContext({ config, theme: DarkTheme });
    const panel = new SettingsPanel(ctx);
    panel._adjustSetting("fpsTarget", 10);
    assert.strictEqual(config.fpsTarget, 70);
  });

  it("_adjustSetting decrements value", () => {
    const config = { fpsTarget: 60 };
    const ctx = new OverlayContext({ config, theme: DarkTheme });
    const panel = new SettingsPanel(ctx);
    panel._adjustSetting("fpsTarget", -10);
    assert.strictEqual(config.fpsTarget, 50);
  });

  it("_adjustSetting clamps to min", () => {
    const config = { fpsTarget: 30 };
    const ctx = new OverlayContext({ config, theme: DarkTheme });
    const panel = new SettingsPanel(ctx);
    panel._adjustSetting("fpsTarget", -10);
    assert.strictEqual(config.fpsTarget, 30);
  });

  it("_adjustSetting clamps to max", () => {
    const config = { fpsTarget: 240 };
    const ctx = new OverlayContext({ config, theme: DarkTheme });
    const panel = new SettingsPanel(ctx);
    panel._adjustSetting("fpsTarget", 10);
    assert.strictEqual(config.fpsTarget, 240);
  });

  it("_adjustSetting handles opacity rounding", () => {
    const config = { opacity: 0.85 };
    const ctx = new OverlayContext({ config, theme: DarkTheme });
    const panel = new SettingsPanel(ctx);
    panel._adjustSetting("opacity", 0.05);
    assert.strictEqual(config.opacity, 0.90);
  });

  it("_resetAll restores defaults", () => {
    const config = { fpsTarget: 120, refreshRate: 5, fontSize: 14, opacity: 0.5, theme: "light" };
    const ctx = new OverlayContext({ config, theme: LightTheme });
    const panel = new SettingsPanel(ctx);
    panel._resetAll();
    assert.strictEqual(config.fpsTarget, 60);
    assert.strictEqual(config.refreshRate, 1);
    assert.strictEqual(config.fontSize, 12);
    assert.strictEqual(config.opacity, 0.85);
    assert.strictEqual(config.theme, "dark");
    assert.strictEqual(ctx.theme, DarkTheme);
  });

  it("_resetLayout calls layout.reset", () => {
    let called = false;
    const ctx = new OverlayContext({ config: {}, theme: DarkTheme });
    ctx.layout = { reset() { called = true; } };
    const panel = new SettingsPanel(ctx);
    panel._resetLayout();
    assert.strictEqual(called, true);
  });

  it("handleInput on theme button switches theme", () => {
    const config = { theme: "dark" };
    const ctx = new OverlayContext({ config, theme: DarkTheme });
    const panel = new SettingsPanel(ctx);
    panel._clickRegions = [{ x: 290, y: 20, w: 55, h: 20, handler: () => panel._setTheme("light") }];
    panel.handleInput({ type: "click", x: 300, y: 30 });
    assert.strictEqual(config.theme, "light");
  });

  it("handleInput on increment button adjusts value", () => {
    const config = { fpsTarget: 60 };
    const ctx = new OverlayContext({ config, theme: DarkTheme });
    const panel = new SettingsPanel(ctx);
    panel._clickRegions = [{ x: 350, y: 48, w: 20, h: 20, handler: () => panel._adjustSetting("fpsTarget", 10) }];
    panel.handleInput({ type: "click", x: 360, y: 58 });
    assert.strictEqual(config.fpsTarget, 70);
  });

  it("handleInput ignores non-click events", () => {
    const panel = new SettingsPanel(new OverlayContext());
    const handled = panel.handleInput({ type: "keydown", key: "Enter" });
    assert.strictEqual(handled, false);
  });
});
