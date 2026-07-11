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
} from "../../../debug/overlay/index.js";

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
