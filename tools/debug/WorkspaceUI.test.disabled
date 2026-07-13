import { describe, it } from "node:test";
import * as assert from "node:assert";
import { TabStrip } from "../../debug/workspace/ui/TabStrip.js";
import { Toolbar } from "../../debug/workspace/ui/Toolbar.js";
import { CommandPalette } from "../../debug/workspace/ui/CommandPalette.js";
import { SearchService } from "../../debug/workspace/ui/SearchService.js";

describe("TabStrip", () => {
  function mockPanel(id, title, overrides = {}) {
    return {
      id,
      title,
      constructor: {
        metadata: {
          id,
          title,
          icon: overrides.icon || "\u26A1",
          pinned: overrides.pinned === true,
          searchable: overrides.searchable !== false,
          group: overrides.group || "Test",
        },
      },
    };
  }

  function makePanels() {
    return {
      _order: ["perf", "framegraph", "timeline"],
      _panels: new Map([
        ["perf", mockPanel("perf", "Performance", { pinned: true })],
        ["framegraph", mockPanel("framegraph", "Frame Graph")],
        ["timeline", mockPanel("timeline", "Timeline")],
      ]),
      forEach(fn) {
        this._order.forEach(id => fn(this._panels.get(id), id));
      },
    };
  }

  it("buildTabs reads metadata from panels", () => {
    const ts = new TabStrip();
    const tabs = ts.buildTabs(makePanels());
    assert.strictEqual(tabs.length, 3);
    assert.strictEqual(tabs[0].id, "perf");
    assert.strictEqual(tabs[0].title, "Performance");
    assert.strictEqual(tabs[0].pinned, true);
    assert.strictEqual(tabs[1].id, "framegraph");
    assert.strictEqual(tabs[1].pinned, false);
  });

  it("buildTabs returns the tabs array", () => {
    const ts = new TabStrip();
    const tabs = ts.buildTabs(makePanels());
    assert.strictEqual(tabs, ts.getTabs());
  });

  it("getActive returns null initially", () => {
    const ts = new TabStrip();
    assert.strictEqual(ts.getActive(), null);
  });

  it("setActive switches active tab", () => {
    const ts = new TabStrip();
    ts.buildTabs(makePanels());
    ts.setActive("framegraph");
    assert.strictEqual(ts.getActive(), "framegraph");
  });

  it("setActive fires onSwitch callback", () => {
    const ts = new TabStrip();
    ts.buildTabs(makePanels());
    const calls = [];
    ts.onSwitch(id => calls.push(id));
    ts.setActive("perf");
    assert.deepStrictEqual(calls, ["perf"]);
  });

  it("setActive is idempotent for same id", () => {
    const ts = new TabStrip();
    ts.buildTabs(makePanels());
    const calls = [];
    ts.onSwitch(id => calls.push(id));
    ts.setActive("perf");
    ts.setActive("perf");
    assert.deepStrictEqual(calls, ["perf"]);
  });

  it("closeTab removes unpinned tab", () => {
    const ts = new TabStrip();
    ts.buildTabs(makePanels());
    ts.setActive("timeline");
    assert.ok(ts.closeTab("framegraph"));
    assert.strictEqual(ts.getTabs().length, 2);
  });

  it("closeTab returns false for pinned tab", () => {
    const ts = new TabStrip();
    ts.buildTabs(makePanels());
    assert.strictEqual(ts.closeTab("perf"), false);
  });

  it("closeTab fires onClose callback", () => {
    const ts = new TabStrip();
    ts.buildTabs(makePanels());
    const calls = [];
    ts.onClose(id => calls.push(id));
    ts.closeTab("framegraph");
    assert.deepStrictEqual(calls, ["framegraph"]);
  });

  it("closeTab switches to first tab when active tab is removed", () => {
    const ts = new TabStrip();
    ts.buildTabs(makePanels());
    ts.setActive("framegraph");
    ts.closeTab("framegraph");
    assert.strictEqual(ts.getActive(), "perf");
  });

  it("closeTab clears active when last tab removed", () => {
    const ts = new TabStrip();
    ts.buildTabs({
      _order: ["only"],
      _panels: new Map([["only", mockPanel("only", "Only")]]),
      forEach(fn) { fn(this._panels.get("only"), "only"); },
    });
    ts.setActive("only");
    ts.closeTab("only");
    assert.strictEqual(ts.getActive(), null);
  });

  it("reorder changes tab order", () => {
    const ts = new TabStrip();
    ts.buildTabs(makePanels());
    ts.reorder(0, 2);
    assert.strictEqual(ts.getTabs()[0].id, "framegraph");
    assert.strictEqual(ts.getTabs()[2].id, "perf");
  });

  it("reorder fires onReorder callback", () => {
    const ts = new TabStrip();
    ts.buildTabs(makePanels());
    const calls = [];
    ts.onReorder(order => calls.push(order));
    ts.reorder(0, 2);
    assert.deepStrictEqual(calls, [["framegraph", "timeline", "perf"]]);
  });

  it("reorder returns false for invalid indices", () => {
    const ts = new TabStrip();
    ts.buildTabs(makePanels());
    assert.strictEqual(ts.reorder(-1, 0), false);
    assert.strictEqual(ts.reorder(0, 99), false);
    assert.strictEqual(ts.getTabs().length, 3);
  });
});

describe("Toolbar", () => {
  it("has default values", () => {
    const tb = new Toolbar();
    assert.strictEqual(tb.fps, 0);
    assert.strictEqual(tb.frame, 0);
    assert.strictEqual(tb.connected, false);
    assert.strictEqual(tb.paused, false);
    assert.strictEqual(tb.theme, "dark");
  });

  it("setters update state", () => {
    const tb = new Toolbar();
    tb.setFps(60);
    tb.setFrame(1423);
    tb.setConnected(true);
    tb.setPaused(true);
    tb.setTheme("light");
    assert.strictEqual(tb.fps, 60);
    assert.strictEqual(tb.frame, 1423);
    assert.strictEqual(tb.connected, true);
    assert.strictEqual(tb.paused, true);
    assert.strictEqual(tb.theme, "light");
  });

  it("registerAction adds action", () => {
    const tb = new Toolbar();
    tb.registerAction({ id: "pause", label: "Pause", handler: () => {} });
    assert.strictEqual(tb.getActions().length, 1);
    assert.strictEqual(tb.getActions()[0].id, "pause");
  });

  it("trigger invokes action handler", () => {
    const tb = new Toolbar();
    let called = false;
    tb.registerAction({ id: "pause", label: "Pause", handler: () => { called = true; } });
    tb.trigger("pause");
    assert.ok(called);
  });

  it("trigger fires onAction callback", () => {
    const tb = new Toolbar();
    const calls = [];
    tb.onAction(id => calls.push(id));
    tb.registerAction({ id: "step", label: "Step", handler: () => {} });
    tb.trigger("step");
    assert.deepStrictEqual(calls, ["step"]);
  });

  it("trigger is no-op for unknown action", () => {
    const tb = new Toolbar();
    tb.trigger("nonexistent");
  });

  it("getActions returns registered actions", () => {
    const tb = new Toolbar();
    tb.registerAction({ id: "a", label: "A" });
    tb.registerAction({ id: "b", label: "B" });
    assert.strictEqual(tb.getActions().length, 2);
  });
});

describe("CommandPalette", () => {
  function makeCommandSystem() {
    const cmds = new Map();
    cmds.set("debug:pause", { fn: () => {}, defaultShortcut: null });
    cmds.set("debug:resume", { fn: () => {}, defaultShortcut: null });
    cmds.set("debug:stepFrame", { fn: () => {}, defaultShortcut: null });
    cmds.set("workspace:openPanel", { fn: () => {}, defaultShortcut: null });
    cmds.set("workspace:toggleTheme", { fn: () => {}, defaultShortcut: null });
    cmds.set("panel:refresh", { fn: () => {}, defaultShortcut: null });
    const executed = [];
    return {
      _commands: cmds,
      _session: null,
      execute(name) { executed.push(name); },
      _executed: executed,
    };
  }

  it("constructor accepts command system", () => {
    const cs = makeCommandSystem();
    const cp = new CommandPalette(cs);
    assert.strictEqual(cp.isOpen, false);
  });

  it("open sets isOpen and populates results", () => {
    const cs = makeCommandSystem();
    const cp = new CommandPalette(cs);
    cp.open();
    assert.ok(cp.isOpen);
    assert.ok(cp.results.length > 0);
    assert.strictEqual(cp.selectedIndex, 0);
  });

  it("close resets state", () => {
    const cs = makeCommandSystem();
    const cp = new CommandPalette(cs);
    cp.open();
    cp.close();
    assert.strictEqual(cp.isOpen, false);
    assert.strictEqual(cp.query, "");
    assert.strictEqual(cp.results.length, 0);
    assert.strictEqual(cp.selectedIndex, -1);
  });

  it("toggle switches between open and closed", () => {
    const cs = makeCommandSystem();
    const cp = new CommandPalette(cs);
    cp.toggle();
    assert.ok(cp.isOpen);
    cp.toggle();
    assert.strictEqual(cp.isOpen, false);
  });

  it("updateQuery filters results", () => {
    const cs = makeCommandSystem();
    const cp = new CommandPalette(cs);
    cp.open();
    cp.updateQuery("pause");
    assert.ok(cp.results.length > 0);
    assert.ok(cp.results.every(r => r.includes("pause")));
  });

  it("updateQuery with no match returns empty", () => {
    const cs = makeCommandSystem();
    const cp = new CommandPalette(cs);
    cp.open();
    cp.updateQuery("zzzzz");
    assert.strictEqual(cp.results.length, 0);
    assert.strictEqual(cp.selectedIndex, -1);
  });

  it("fuzzy matching works", () => {
    const cs = makeCommandSystem();
    const cp = new CommandPalette(cs);
    const f = cp._fuzzyMatch.bind(cp);
    assert.ok(f("thm", "workspace:toggleTheme"));
    assert.ok(f("wsp", "workspace:openPanel"));
    assert.ok(f("dbg", "debug:pause"));
    assert.ok(!f("xyz", "debug:pause"));
    assert.ok(f("", "anything"));
  });

  it("selectNext cycles forward", () => {
    const cs = makeCommandSystem();
    const cp = new CommandPalette(cs);
    cp.open();
    const start = cp.selectedIndex;
    cp.selectNext();
    assert.strictEqual(cp.selectedIndex, (start + 1) % cp.results.length);
  });

  it("selectPrev cycles backward", () => {
    const cs = makeCommandSystem();
    const cp = new CommandPalette(cs);
    cp.open();
    cp.selectNext();
    cp.selectNext();
    const idx = cp.selectedIndex;
    cp.selectPrev();
    assert.strictEqual(cp.selectedIndex, (idx - 1 + cp.results.length) % cp.results.length);
  });

  it("executeSelected runs the command and closes", () => {
    const cs = makeCommandSystem();
    const cp = new CommandPalette(cs);
    cp.open();
    cp.executeSelected();
    assert.ok(cs._executed.length > 0);
    assert.strictEqual(cp.isOpen, false);
  });

  it("executeSelected returns false when no selection", () => {
    const cs = makeCommandSystem();
    const cp = new CommandPalette(cs);
    assert.strictEqual(cp.executeSelected(), false);
  });
});

describe("SearchService", () => {
  it("registerProvider adds provider", () => {
    const ss = new SearchService();
    ss.registerProvider({ id: "panels", search: q => [`panel:${q}`] });
    assert.ok(ss.getProvider("panels"));
  });

  it("registerProvider throws on duplicate id", () => {
    const ss = new SearchService();
    ss.registerProvider({ id: "test", search: () => [] });
    assert.throws(() => ss.registerProvider({ id: "test", search: () => [] }));
  });

  it("unregisterProvider removes provider", () => {
    const ss = new SearchService();
    ss.registerProvider({ id: "panels", search: () => [] });
    ss.unregisterProvider("panels");
    assert.strictEqual(ss.getProvider("panels"), null);
  });

  it("search delegates to providers", () => {
    const ss = new SearchService();
    ss.registerProvider({ id: "p1", search: q => [`p1:${q}`] });
    ss.registerProvider({ id: "p2", search: q => [`p2:${q}`] });
    const results = ss.search("hello");
    assert.strictEqual(results.length, 2);
    assert.ok(results.some(r => r.providerId === "p1"));
    assert.ok(results.some(r => r.providerId === "p2"));
  });

  it("search returns empty for empty query", () => {
    const ss = new SearchService();
    ss.registerProvider({ id: "p1", search: q => [q] });
    assert.strictEqual(ss.search("").length, 0);
    assert.strictEqual(ss.search("   ").length, 0);
  });

  it("search skips providers without search function", () => {
    const ss = new SearchService();
    ss.registerProvider({ id: "bad" });
    assert.strictEqual(ss.search("test").length, 0);
  });

  it("open/close/toggle lifecycle", () => {
    const ss = new SearchService();
    ss.open();
    assert.ok(ss.isOpen);
    ss.close();
    assert.strictEqual(ss.isOpen, false);
    ss.toggle();
    assert.ok(ss.isOpen);
    ss.toggle();
    assert.strictEqual(ss.isOpen, false);
  });
});
