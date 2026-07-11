import { describe, it } from "node:test";
import * as assert from "node:assert";
import {
  OverlayContext,
  Panel,
  PanelManager,
  OverlaySession,
} from "../../../debug/overlay/index.js";

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
    assert.doesNotThrow(() => p.render(null));
    assert.doesNotThrow(() => p.onShow());
    assert.doesNotThrow(() => p.onHide());
    assert.doesNotThrow(() => p.onDestroy());
    assert.doesNotThrow(() => p.onRegister());
  });

  it("onShow and onHide update _visible", () => {
    const p = new Panel("id", "Title", new OverlayContext());
    p.onShow();
    p.onHide();
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

  it("render calls render on visible panels in order", () => {
    const pm = new PanelManager(new OverlayContext());
    const rendered = [];
    class TestPanel extends Panel {
      render(ctx) { rendered.push(this.id); }
    }
    pm.register(new TestPanel("a", "A", new OverlayContext()));
    pm.register(new TestPanel("b", "B", new OverlayContext()));
    pm.showAll();
    pm.render(null);
    assert.deepStrictEqual(rendered, ["a", "b"]);
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

  it("render calls panel render when visible", () => {
    const s = new OverlaySession();
    const rendered = [];
    class TestPanel extends Panel {
      render(ctx) { rendered.push("called"); }
    }
    s.panels.register(new TestPanel("p", "P", s.context));
    s.panels.show("p");
    s.show();
    const mockCtx = { save: () => {}, restore: () => {} };
    s.render(mockCtx, 800, 600);
    assert.deepStrictEqual(rendered, ["called"]);
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
    const theme = { text: "#fff" };
    const s = new OverlaySession({ history, registry, analysis, config, theme });
    assert.strictEqual(s.context.history, history);
    assert.strictEqual(s.context.registry, registry);
    assert.strictEqual(s.context.analysis, analysis);
    assert.strictEqual(s.context.config, config);
    assert.strictEqual(s.context.theme, theme);
  });
});
