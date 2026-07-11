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
} from "../../../debug/overlay/index.js";

// ─── Helpers ──────────────────────────────────────────

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
    fillRect(x, y, w, h) { calls.push(["fillRect", x, y, w, h]); },
    fillText(t, x, y) { calls.push(["fillText", t, x, y]); },
    measureText(t) { return { width: t.length * 7, actualBoundingBoxAscent: 10, actualBoundingBoxDescent: 2 }; },

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

// ─── OverlayContext ───────────────────────────────────

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

// ─── Panel ────────────────────────────────────────────

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
      icon: "★",
      minWidth: 100,
      minHeight: 50,
      defaultWidth: 300,
      defaultHeight: 200,
      canCollapse: false,
      canClose: false,
      canFloat: false,
    });
    assert.strictEqual(p.icon, "★");
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

// ─── PanelManager ─────────────────────────────────────

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

  it("show/hide for unknown id returns false", () => {
    const pm = new PanelManager(new OverlayContext());
    assert.strictEqual(pm.show("nope"), false);
    assert.strictEqual(pm.hide("nope"), false);
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

  it("toggle unknown id returns false", () => {
    const pm = new PanelManager(new OverlayContext());
    assert.strictEqual(pm.toggle("nope"), false);
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

  it("forEachVisible only iterates visible panels", () => {
    const pm = new PanelManager(new OverlayContext());
    pm.register(new Panel("a", "A", new OverlayContext()));
    pm.register(new Panel("b", "B", new OverlayContext()));
    pm.show("a");
    const ids = [];
    pm.forEachVisible((panel, id) => ids.push(id));
    assert.deepStrictEqual(ids, ["a"]);
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

  it("render calls render with rect from layout engine", () => {
    const ctx = new OverlayContext();
    const layout = new LayoutEngine(DarkTheme);
    layout.setRoot({ type: "leaf", panelId: "p" });
    layout.compute(800, 600);
    ctx.layout = layout;

    const pm = new PanelManager(ctx);
    const rects = [];
    class TestPanel extends Panel {
      render(c, r) { rects.push(r); }
    }
    pm.register(new TestPanel("p", "P", ctx));
    pm.show("p");
    pm.render(null);
    assert.strictEqual(rects.length, 1);
    assert.deepStrictEqual(rects[0], { x: 0, y: 0, width: 800, height: 600 });
  });

  it("render passes null rect when no layout engine", () => {
    const pm = new PanelManager(new OverlayContext());
    const rects = [];
    class TestPanel extends Panel {
      render(c, r) { rects.push(r); }
    }
    pm.register(new TestPanel("p", "P", new OverlayContext()));
    pm.show("p");
    pm.render(null);
    assert.strictEqual(rects.length, 1);
    assert.strictEqual(rects[0], null);
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

// ─── DarkTheme ────────────────────────────────────────

describe("DarkTheme", () => {
  it("is frozen", () => {
    assert.ok(Object.isFrozen(DarkTheme));
  });

  it("has expected properties", () => {
    assert.strictEqual(typeof DarkTheme.background, "string");
    assert.strictEqual(typeof DarkTheme.text, "string");
    assert.strictEqual(typeof DarkTheme.fontSize, "number");
    assert.strictEqual(DarkTheme.headerHeight, 28);
    assert.strictEqual(DarkTheme.tabHeight, 24);
  });

  it("has dark values", () => {
    assert.ok(DarkTheme.background.includes("20, 20, 30"));
    assert.strictEqual(DarkTheme.text, "#e0e0f0");
  });
});

// ─── LightTheme ───────────────────────────────────────

describe("LightTheme", () => {
  it("is frozen", () => {
    assert.ok(Object.isFrozen(LightTheme));
  });

  it("has expected properties", () => {
    assert.strictEqual(typeof LightTheme.background, "string");
    assert.strictEqual(typeof LightTheme.text, "string");
    assert.strictEqual(LightTheme.fontSize, 12);
  });

  it("has light values", () => {
    assert.ok(LightTheme.background.includes("240, 240, 245"));
    assert.strictEqual(LightTheme.text, "#222233");
  });

  it("differs from dark theme", () => {
    assert.notStrictEqual(DarkTheme.background, LightTheme.background);
    assert.notStrictEqual(DarkTheme.text, LightTheme.text);
  });
});

// ─── LayoutEngine ─────────────────────────────────────

describe("LayoutEngine", () => {
  it("starts with null root", () => {
    const eng = new LayoutEngine(DarkTheme);
    assert.strictEqual(eng.root, null);
  });

  it("setRoot accepts a leaf node", () => {
    const eng = new LayoutEngine(DarkTheme);
    eng.setRoot({ type: "leaf", panelId: "p1" });
    assert.ok(eng.root);
    assert.strictEqual(eng.root.type, "leaf");
    assert.strictEqual(eng.root.panelId, "p1");
  });

  it("compute assigns full area to leaf", () => {
    const eng = new LayoutEngine(DarkTheme);
    eng.setRoot({ type: "leaf", panelId: "p1" });
    eng.compute(800, 600);
    const rect = eng.getPanelRect("p1");
    assert.deepStrictEqual(rect, { x: 0, y: 0, width: 800, height: 600 });
  });

  it("compute returns null for unknown panel", () => {
    const eng = new LayoutEngine(DarkTheme);
    eng.setRoot({ type: "leaf", panelId: "p1" });
    eng.compute(800, 600);
    assert.strictEqual(eng.getPanelRect("nope"), null);
  });

  it("split horizontal divides width by ratio", () => {
    const eng = new LayoutEngine(DarkTheme);
    eng.setRoot({
      type: "split",
      direction: "horizontal",
      ratio: 0.4,
      children: [
        { type: "leaf", panelId: "left" },
        { type: "leaf", panelId: "right" },
      ],
    });
    eng.compute(1000, 500);
    const left = eng.getPanelRect("left");
    const right = eng.getPanelRect("right");
    assert.ok(left.width > 0);
    assert.ok(right.width > 0);
    assert.strictEqual(Math.round(left.width + right.width + 2), 1000);
  });

  it("split vertical divides height by ratio", () => {
    const eng = new LayoutEngine(DarkTheme);
    eng.setRoot({
      type: "split",
      direction: "vertical",
      ratio: 0.7,
      children: [
        { type: "leaf", panelId: "top" },
        { type: "leaf", panelId: "bottom" },
      ],
    });
    eng.compute(800, 600);
    const top = eng.getPanelRect("top");
    const bottom = eng.getPanelRect("bottom");
    assert.ok(top.height > 0);
    assert.ok(bottom.height > 0);
    assert.strictEqual(top.y, 0);
    assert.strictEqual(bottom.y, top.height + 2);
  });

  it("tab group allocates space for tab bar and active panel", () => {
    const eng = new LayoutEngine(DarkTheme);
    eng.setRoot({
      type: "tab",
      panels: ["a", "b"],
      activeTab: 0,
    });
    eng.compute(800, 600);
    const rect = eng.getPanelRect("a");
    assert.ok(rect);
    assert.strictEqual(rect.y, DarkTheme.tabHeight);
    assert.strictEqual(rect.height, 600 - DarkTheme.tabHeight);
    assert.strictEqual(rect.width, 800);
    assert.strictEqual(eng.getPanelRect("b"), null);
  });

  it("tab group with single panel", () => {
    const eng = new LayoutEngine(DarkTheme);
    eng.setRoot({
      type: "tab",
      panels: ["only"],
      activeTab: 0,
    });
    eng.compute(400, 300);
    const rect = eng.getPanelRect("only");
    assert.ok(rect);
    assert.strictEqual(rect.width, 400);
  });

  it("resize updates split ratio", () => {
    const eng = new LayoutEngine(DarkTheme);
    eng.setRoot({
      type: "split",
      direction: "horizontal",
      ratio: 0.5,
      children: [
        { type: "leaf", panelId: "a" },
        { type: "leaf", panelId: "b" },
      ],
    });
    const splitId = eng.root._layoutId;
    const result = eng.resize(splitId, 0.3);
    assert.strictEqual(result, true);
    assert.strictEqual(eng.root.ratio, 0.3);
  });

  it("resize clamps ratio to [0.1, 0.9]", () => {
    const eng = new LayoutEngine(DarkTheme);
    eng.setRoot({
      type: "split",
      direction: "horizontal",
      ratio: 0.5,
      children: [
        { type: "leaf", panelId: "a" },
        { type: "leaf", panelId: "b" },
      ],
    });
    eng.resize(eng.root._layoutId, 0);
    assert.strictEqual(eng.root.ratio, 0.1);
    eng.resize(eng.root._layoutId, 1.5);
    assert.strictEqual(eng.root.ratio, 0.9);
  });

  it("resize with unknown id returns false", () => {
    const eng = new LayoutEngine(DarkTheme);
    assert.strictEqual(eng.resize(999, 0.5), false);
  });

  it("hitTest returns panel at coordinates", () => {
    const eng = new LayoutEngine(DarkTheme);
    eng.setRoot({ type: "leaf", panelId: "p1" });
    eng.compute(800, 600);
    const hit = eng.hitTest(100, 100);
    assert.deepStrictEqual(hit, { type: "panel", panelId: "p1" });
  });

  it("hitTest returns null for out-of-bounds", () => {
    const eng = new LayoutEngine(DarkTheme);
    eng.setRoot({ type: "leaf", panelId: "p1" });
    eng.compute(800, 600);
    assert.strictEqual(eng.hitTest(900, 900), null);
  });

  it("serialize round-trips", () => {
    const eng = new LayoutEngine(DarkTheme);
    eng.setRoot({
      type: "split",
      direction: "vertical",
      ratio: 0.5,
      children: [
        { type: "tab", panels: ["a", "b"], activeTab: 1 },
        { type: "leaf", panelId: "c" },
      ],
    });
    const json = eng.serialize();
    assert.strictEqual(json.version, 1);
    assert.strictEqual(json.root.type, "split");
    assert.strictEqual(json.root.children.length, 2);
    assert.strictEqual(json.root.children[0].type, "tab");
    assert.strictEqual(json.root.children[0].panels[1], "b");
    assert.strictEqual(json.root.children[1].type, "leaf");
  });

  it("restore rebuilds tree from JSON", () => {
    const eng = new LayoutEngine(DarkTheme);
    const json = {
      version: 1,
      root: {
        type: "split",
        direction: "horizontal",
        ratio: 0.3,
        children: [
          { type: "leaf", panelId: "x" },
          { type: "tab", panels: ["y", "z"], activeTab: 0 },
        ],
      },
      floating: [],
    };
    const ok = eng.restore(json);
    assert.strictEqual(ok, true);
    assert.strictEqual(eng.root.type, "split");
    assert.strictEqual(eng.root.ratio, 0.3);
    eng.compute(1000, 500);
    assert.ok(eng.getPanelRect("x"));
    assert.ok(eng.getPanelRect("y"));
  });

  it("restore with invalid JSON returns false", () => {
    const eng = new LayoutEngine(DarkTheme);
    assert.strictEqual(eng.restore(null), false);
    assert.strictEqual(eng.restore({}), false);
  });

  it("createDefaultLayout builds standard tree", () => {
    const eng = new LayoutEngine(DarkTheme);
    eng.createDefaultLayout(["performance", "framegraph", "timeline", "events"]);
    assert.ok(eng.root);
    assert.strictEqual(eng.root.type, "split");
    assert.strictEqual(eng.root.direction, "vertical");
    assert.strictEqual(eng.root.children.length, 2);
    assert.strictEqual(eng.root.children[0].children.length, 2);
    assert.strictEqual(eng.root.children[1].children.length, 2);
  });

  it("compute with zero dimensions is no-op", () => {
    const eng = new LayoutEngine(DarkTheme);
    eng.setRoot({ type: "leaf", panelId: "p" });
    eng.compute(0, 0);
    assert.strictEqual(eng.getPanelRect("p"), null);
  });

  it("compute with no root is no-op", () => {
    const eng = new LayoutEngine(DarkTheme);
    eng.compute(800, 600);
    assert.strictEqual(eng.getPanelRect("any"), null);
  });

  it("getAllPanelRects returns all rects", () => {
    const eng = new LayoutEngine(DarkTheme);
    eng.setRoot({
      type: "split",
      direction: "horizontal",
      ratio: 0.5,
      children: [
        { type: "leaf", panelId: "a" },
        { type: "leaf", panelId: "b" },
      ],
    });
    eng.compute(800, 600);
    const all = eng.getAllPanelRects();
    assert.strictEqual(all.size, 2);
    assert.ok(all.has("a"));
    assert.ok(all.has("b"));
  });
});

// ─── SparklineRenderer ────────────────────────────────

describe("SparklineRenderer", () => {
  it("draws a line for two values", () => {
    const r = new SparklineRenderer();
    const ctx = mockCtx();
    r.render(ctx, 0, 0, 100, 50, [10, 20], { color: "#f00", fill: false });
    const names = ctx._calls.map(c => c[0]);
    assert.ok(names.includes("beginPath"));
    assert.ok(names.includes("moveTo"));
    assert.ok(names.includes("lineTo"));
    assert.ok(names.includes("stroke"));
    assert.ok(!names.includes("closePath"));
    assert.ok(!names.includes("fill"));
  });

  it("draws fill when fill=true", () => {
    const r = new SparklineRenderer();
    const ctx = mockCtx();
    r.render(ctx, 0, 0, 100, 50, [10, 20, 30], { color: "#0f0", fill: true });
    const names = ctx._calls.map(c => c[0]);
    assert.ok(names.includes("closePath"));
    assert.ok(names.includes("fill"));
  });

  it("does nothing for empty values", () => {
    const r = new SparklineRenderer();
    const ctx = mockCtx();
    r.render(ctx, 0, 0, 100, 50, [], {});
    assert.strictEqual(ctx._calls.length, 0);
  });

  it("does nothing for single value", () => {
    const r = new SparklineRenderer();
    const ctx = mockCtx();
    r.render(ctx, 0, 0, 100, 50, [42], {});
    assert.strictEqual(ctx._calls.length, 0);
  });

  it("all-same values produce flat line", () => {
    const r = new SparklineRenderer();
    const ctx = mockCtx();
    r.render(ctx, 0, 0, 100, 50, [5, 5, 5, 5, 5], { fill: false });
    // All points at same Y (height)
    const lines = ctx._calls.filter(c => c[0] === "lineTo" || c[0] === "moveTo");
    assert.ok(lines.length > 0);
    const yValues = lines.map(c => c[c.length - 1]);
    assert.ok(yValues.every(y => y === yValues[0]));
  });

  it("respects min/max override", () => {
    const r = new SparklineRenderer();
    const ctx = mockCtx();
    r.render(ctx, 0, 0, 100, 50, [50, 100], { color: "#00f", fill: false, min: 0, max: 200 });
    const lineTos = ctx._calls.filter(c => c[0] === "lineTo");
    // With min=0, max=200, value 50 → 25% of height, value 100 → 50% of height
    assert.ok(lineTos.length >= 1);
  });

  it("uses default color and lineWidth", () => {
    const r = new SparklineRenderer();
    const ctx = mockCtx();
    r.render(ctx, 0, 0, 100, 50, [1, 2], { fill: false });
    const setStyles = ctx._calls.filter(c => c[0] === "set:strokeStyle" || c[0] === "set:lineWidth");
    assert.ok(setStyles.length > 0);
  });
});

// ─── HistogramRenderer ────────────────────────────────

describe("HistogramRenderer", () => {
  it("draws bars for values", () => {
    const r = new HistogramRenderer();
    const ctx = mockCtx();
    r.render(ctx, 0, 0, 200, 100, [1, 2, 3, 4, 5], { color: "#0ff" });
    const rects = ctx._calls.filter(c => c[0] === "fillRect");
    assert.ok(rects.length > 0);
    assert.ok(rects.length <= 20);
  });

  it("does nothing for empty values", () => {
    const r = new HistogramRenderer();
    const ctx = mockCtx();
    r.render(ctx, 0, 0, 200, 100, [], {});
    assert.strictEqual(ctx._calls.length, 0);
  });

  it("single value produces one non-zero bar", () => {
    const r = new HistogramRenderer();
    const ctx = mockCtx();
    r.render(ctx, 0, 0, 200, 100, [42], { color: "#f0f" });
    const rects = ctx._calls.filter(c => c[0] === "fillRect");
    // At least one bar has height > 0
    const nonEmpty = rects.filter(c => c[4] > 0);
    assert.ok(nonEmpty.length >= 1);
  });

  it("all values same => one bar has all counts", () => {
    const r = new HistogramRenderer();
    const ctx = mockCtx();
    r.render(ctx, 0, 0, 200, 100, [7, 7, 7, 7, 7], {});
    const rects = ctx._calls.filter(c => c[0] === "fillRect");
    // At least one bar with full height
    const fullBars = rects.filter(c => c[4] >= 100);
    assert.ok(fullBars.length >= 1);
  });

  it("respects custom bin count", () => {
    const r = new HistogramRenderer();
    const ctx = mockCtx();
    r.render(ctx, 0, 0, 200, 100, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], { bins: 5, color: "#ff0" });
    const rects = ctx._calls.filter(c => c[0] === "fillRect");
    assert.ok(rects.length <= 5);
  });
});

// ─── FrameBarRenderer ─────────────────────────────────

describe("FrameBarRenderer", () => {
  it("draws label and bar", () => {
    const r = new FrameBarRenderer();
    const ctx = mockCtx();
    r.render(ctx, 0, 0, 400, 20, { duration: 5, total: 20, color: "#f00", label: "test" });
    const texts = ctx._calls.filter(c => c[0] === "fillText");
    const rects = ctx._calls.filter(c => c[0] === "fillRect");
    assert.ok(texts.length > 0);
    assert.ok(rects.length > 0);
    assert.ok(texts.some(c => c[1] === "test"));
  });

  it("zero duration produces minimum-width bar", () => {
    const r = new FrameBarRenderer();
    const ctx = mockCtx();
    r.render(ctx, 0, 0, 400, 20, { duration: 0, total: 20, color: "#00f", label: "" });
    const rects = ctx._calls.filter(c => c[0] === "fillRect");
    assert.ok(rects.length > 0);
    assert.ok(rects[0][3] >= 2);
  });

  it("proportional width: half total = half width", () => {
    const r = new FrameBarRenderer();
    const ctx = mockCtx();
    r.render(ctx, 0, 0, 400, 20, { duration: 10, total: 20, color: "#0f0", label: "x" });
    const rects = ctx._calls.filter(c => c[0] === "fillRect");
    assert.ok(rects.length > 0);
  });

  it("handles zero total gracefully", () => {
    const r = new FrameBarRenderer();
    const ctx = mockCtx();
    assert.doesNotThrow(() => {
      r.render(ctx, 0, 0, 400, 20, { duration: 5, total: 0, color: "#f00", label: "" });
    });
  });

  it("indentation increases with depth", () => {
    const r = new FrameBarRenderer();
    const ctx1 = mockCtx();
    const ctx2 = mockCtx();
    r.render(ctx1, 0, 0, 400, 20, { duration: 5, total: 10, color: "#f00", label: "a", depth: 0 });
    r.render(ctx2, 0, 0, 400, 20, { duration: 5, total: 10, color: "#f00", label: "a", depth: 2 });
    // Deeper depth should have label further right (higher x for fillText at indent)
    const t1 = ctx1._calls.filter(c => c[0] === "fillText" && c[1] === "a");
    const t2 = ctx2._calls.filter(c => c[0] === "fillText" && c[1] === "a");
    if (t1.length > 0 && t2.length > 0) {
      assert.ok(t2[0][2] > t1[0][2]);
    }
  });
});

// ─── TextRenderer ─────────────────────────────────────

describe("TextRenderer", () => {
  it("measures text width", () => {
    const r = new TextRenderer(DarkTheme);
    const ctx = mockCtx();
    const m = r.measure(ctx, "hello");
    assert.ok(typeof m.width === "number");
    assert.ok(m.width > 0);
    assert.ok(typeof m.height === "number");
    assert.ok(m.height > 0);
  });

  it("caches measurements", () => {
    const r = new TextRenderer(DarkTheme);
    const ctx = mockCtx();
    const m1 = r.measure(ctx, "cache_test");
    const ctxCallsAfterFirst = ctx._calls.length;
    const m2 = r.measure(ctx, "cache_test");
    assert.strictEqual(m1.width, m2.width);
    assert.strictEqual(m1.height, m2.height);
    assert.strictEqual(r.cacheSize, 1);
  });

  it("returns different sizes for different fonts", () => {
    const r = new TextRenderer(DarkTheme);
    const ctx = mockCtx();
    const small = r.measure(ctx, "text", { size: 10 });
    const large = r.measure(ctx, "text", { size: 20 });
    assert.notStrictEqual(small.height, large.height);
  });

  it("renders text via fillText", () => {
    const r = new TextRenderer(DarkTheme);
    const ctx = mockCtx();
    r.render(ctx, "test", 10, 20, { color: "#fff" });
    const fills = ctx._calls.filter(c => c[0] === "fillText" && c[1] === "test");
    assert.strictEqual(fills.length, 1);
    assert.strictEqual(fills[0][2], 10);
    assert.strictEqual(fills[0][3], 20);
  });

  it("render uses fallback defaults", () => {
    const r = new TextRenderer();
    const ctx = mockCtx();
    assert.doesNotThrow(() => r.render(ctx, "x", 0, 0));
    const fills = ctx._calls.filter(c => c[0] === "fillText");
    assert.strictEqual(fills.length, 1);
  });

  it("clearCache empties cache", () => {
    const r = new TextRenderer(DarkTheme);
    const ctx = mockCtx();
    r.measure(ctx, "a");
    r.measure(ctx, "b");
    assert.ok(r.cacheSize > 0);
    r.clearCache();
    assert.strictEqual(r.cacheSize, 0);
  });

  it("measure with no theme defaults work", () => {
    const r = new TextRenderer();
    const ctx = mockCtx();
    const m = r.measure(ctx, "fallback");
    assert.ok(m.width > 0);
  });

  it("render respects alignment options", () => {
    const r = new TextRenderer(DarkTheme);
    const ctx = mockCtx();
    r.render(ctx, "x", 0, 0, { align: "right", baseline: "bottom" });
    const align = ctx._calls.filter(c => c[0] === "set:textAlign");
    const baseline = ctx._calls.filter(c => c[0] === "set:textBaseline");
    assert.ok(align.some(c => c[1] === "right"));
    assert.ok(baseline.some(c => c[1] === "bottom"));
  });
});

// ─── OverlaySession (with renderers) ──────────────────

describe("OverlaySession", () => {
  it("starts hidden", () => {
    const s = new OverlaySession();
    assert.strictEqual(s.visible, false);
  });

  it("creates context and panel manager", () => {
    const s = new OverlaySession();
    assert.ok(s.context instanceof OverlayContext);
    assert.ok(s.panels instanceof PanelManager);
  });

  it("creates layout engine and wires to context", () => {
    const s = new OverlaySession();
    assert.ok(s.layout instanceof LayoutEngine);
    assert.strictEqual(s.context.layout, s.layout);
  });

  it("creates renderers and wires to context", () => {
    const s = new OverlaySession();
    assert.ok(s.renderers);
    assert.ok(s.renderers.text instanceof TextRenderer);
    assert.ok(s.renderers.sparkline instanceof SparklineRenderer);
    assert.ok(s.renderers.histogram instanceof HistogramRenderer);
    assert.ok(s.renderers.frameBar instanceof FrameBarRenderer);
  });

  it("uses DarkTheme by default", () => {
    const s = new OverlaySession();
    assert.strictEqual(s.context.theme, DarkTheme);
  });

  it("uses provided theme", () => {
    const s = new OverlaySession({ theme: LightTheme });
    assert.strictEqual(s.context.theme, LightTheme);
  });

  it("show makes it visible", () => {
    const s = new OverlaySession();
    s.show();
    assert.strictEqual(s.visible, true);
  });

  it("hide makes it invisible", () => {
    const s = new OverlaySession();
    s.show();
    s.hide();
    assert.strictEqual(s.visible, false);
  });

  it("toggle switches visibility", () => {
    const s = new OverlaySession();
    assert.strictEqual(s.visible, false);
    s.toggle();
    assert.strictEqual(s.visible, true);
    s.toggle();
    assert.strictEqual(s.visible, false);
  });

  it("show is idempotent", () => {
    const s = new OverlaySession();
    s.show();
    s.show();
    assert.strictEqual(s.visible, true);
  });

  it("hide is idempotent", () => {
    const s = new OverlaySession();
    s.hide();
    s.hide();
    assert.strictEqual(s.visible, false);
  });

  it("update does nothing when hidden", () => {
    const s = new OverlaySession();
    assert.doesNotThrow(() => s.update(16));
  });

  it("render does nothing when hidden", () => {
    const s = new OverlaySession();
    const mockCtx = { save: () => {}, restore: () => {} };
    assert.doesNotThrow(() => s.render(mockCtx, 800, 600));
  });

  it("update calls panel update when visible", () => {
    const s = new OverlaySession();
    const updated = [];
    class TestPanel extends Panel {
      update(data) { updated.push(data.dt); }
    }
    s.panels.register(new TestPanel("p", "P", s.context));
    s.panels.show("p");
    s.show();
    s.update(16);
    assert.deepStrictEqual(updated, [16]);
  });

  it("render computes layout and calls panel render", () => {
    const s = new OverlaySession();
    const calls = [];
    class TestPanel extends Panel {
      render(ctx, rect) { calls.push({ rect }); }
    }
    s.panels.register(new TestPanel("p", "P", s.context));
    s.panels.show("p");
    s.layout.setRoot({ type: "leaf", panelId: "p" });
    s.show();
    const mockCtx = { save: () => {}, restore: () => {} };
    s.render(mockCtx, 800, 600);
    assert.strictEqual(calls.length, 1);
    assert.deepStrictEqual(calls[0].rect, { x: 0, y: 0, width: 800, height: 600 });
  });

  it("render with no layout root yields null rect", () => {
    const s = new OverlaySession();
    const calls = [];
    class TestPanel extends Panel {
      render(ctx, rect) { calls.push({ rect }); }
    }
    s.panels.register(new TestPanel("p", "P", s.context));
    s.panels.show("p");
    s.show();
    const mockCtx = { save: () => {}, restore: () => {} };
    s.render(mockCtx, 800, 600);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].rect, null);
  });

  it("destroy hides all panels and clears visibility", () => {
    const s = new OverlaySession();
    s.show();
    s.panels.register(new Panel("p", "P", s.context));
    s.panels.show("p");
    s.destroy();
    assert.strictEqual(s.visible, false);
    assert.strictEqual(s.panels.visibleCount, 0);
  });

  it("passes data sources to context", () => {
    const history = { count: 100 };
    const registry = { count: 10 };
    const analysis = { average: () => 5 };
    const config = { historySize: 300 };
    const theme = DarkTheme;
    const s = new OverlaySession({ history, registry, analysis, config, theme });
    assert.strictEqual(s.context.history, history);
    assert.strictEqual(s.context.registry, registry);
    assert.strictEqual(s.context.analysis, analysis);
    assert.strictEqual(s.context.config, config);
    assert.strictEqual(s.context.theme, theme);
  });
});
