import { describe, it } from "node:test";
import * as assert from "node:assert";

function mockCanvas() {
  let _w = 0, _h = 0;
  const ctx = {
    save: () => {},
    scale: () => {},
    clearRect: () => {},
    restore: () => {},
  };
  const el = {
    getContext: () => ctx,
    get width() { return _w; },
    set width(v) { _w = v; },
    get height() { return _h; },
    set height(v) { _h = v; },
    style: {},
  };
  return el;
}

const _origDoc = globalThis.document;
const _origWin = globalThis.window;
const _origDPR = globalThis.devicePixelRatio;

function setupDoc() {
  const canvas = mockCanvas();
  globalThis.window = { devicePixelRatio: 1 };
  globalThis.document = {
    createElement: (tag) => {
      if (tag === "canvas") return canvas;
      return {};
    },
  };
  globalThis.devicePixelRatio = 1;
  return canvas;
}

function restoreDoc() {
  globalThis.document = _origDoc;
  globalThis.window = _origWin;
  globalThis.devicePixelRatio = _origDPR;
}

// Check metadata directly from imported classes (no DOM needed)
import { PerformancePanel } from "../../debug/overlay/panels/PerformancePanel.js";
import { FrameGraphPanel } from "../../debug/overlay/panels/FrameGraphPanel.js";
import { TimelinePanel } from "../../debug/overlay/panels/TimelinePanel.js";
import { MetricBrowserPanel } from "../../debug/overlay/panels/MetricBrowserPanel.js";
import { EventViewerPanel } from "../../debug/overlay/panels/EventViewerPanel.js";
import { CaptureBrowserPanel } from "../../debug/overlay/panels/CaptureBrowserPanel.js";
import { SettingsPanel } from "../../debug/overlay/panels/SettingsPanel.js";

describe("Panel metadata", () => {
  it("PerformancePanel has correct metadata", () => {
    const m = PerformancePanel.metadata;
    assert.strictEqual(m.id, "performance");
    assert.strictEqual(m.title, "Performance");
    assert.strictEqual(m.group, "Analysis");
    assert.strictEqual(m.pinned, true);
    assert.strictEqual(m.searchable, true);
  });

  it("FrameGraphPanel has correct metadata", () => {
    const m = FrameGraphPanel.metadata;
    assert.strictEqual(m.id, "framegraph");
    assert.strictEqual(m.title, "Frame Graph");
    assert.strictEqual(m.pinned, false);
    assert.strictEqual(m.searchable, true);
  });

  it("TimelinePanel has correct metadata", () => {
    const m = TimelinePanel.metadata;
    assert.strictEqual(m.id, "timeline");
    assert.strictEqual(m.title, "Timeline");
    assert.strictEqual(m.pinned, false);
    assert.strictEqual(m.searchable, true);
  });

  it("MetricBrowserPanel has correct metadata", () => {
    const m = MetricBrowserPanel.metadata;
    assert.strictEqual(m.id, "metrics");
    assert.strictEqual(m.title, "Metrics");
    assert.strictEqual(m.pinned, false);
    assert.strictEqual(m.searchable, true);
  });

  it("EventViewerPanel has correct metadata", () => {
    const m = EventViewerPanel.metadata;
    assert.strictEqual(m.id, "events");
    assert.strictEqual(m.title, "Events");
    assert.strictEqual(m.pinned, false);
    assert.strictEqual(m.searchable, true);
  });

  it("CaptureBrowserPanel has correct metadata", () => {
    const m = CaptureBrowserPanel.metadata;
    assert.strictEqual(m.id, "captures");
    assert.strictEqual(m.title, "Captures");
    assert.strictEqual(m.pinned, false);
    assert.strictEqual(m.searchable, true);
  });

  it("SettingsPanel has correct metadata", () => {
    const m = SettingsPanel.metadata;
    assert.strictEqual(m.id, "settings");
    assert.strictEqual(m.title, "Settings");
    assert.strictEqual(m.group, "Tools");
    assert.strictEqual(m.pinned, true);
    assert.strictEqual(m.searchable, false);
  });

  it("all metadata has required fields", () => {
    for (const Cls of [PerformancePanel, FrameGraphPanel, TimelinePanel, MetricBrowserPanel, EventViewerPanel, CaptureBrowserPanel, SettingsPanel]) {
      const m = Cls.metadata;
      assert.ok(m.id, `${Cls.name} missing id`);
      assert.ok(m.title, `${Cls.name} missing title`);
      assert.ok(m.icon !== undefined, `${Cls.name} missing icon`);
      assert.ok(typeof m.pinned === "boolean", `${Cls.name} pinned must be boolean`);
      assert.ok(typeof m.searchable === "boolean", `${Cls.name} searchable must be boolean`);
    }
  });

  it("Panel base class provides default metadata", async () => {
    const { Panel } = await import("../../debug/overlay/Panel.js");
    const m = Panel.metadata;
    assert.strictEqual(m.id, null);
    assert.strictEqual(m.title, null);
    assert.strictEqual(m.icon, null);
    assert.strictEqual(m.pinned, false);
    assert.strictEqual(m.searchable, true);
  });
});

describe("WorkspaceSession", () => {
  it("activatePanel shows the selected panel", async () => {
    const canvas = setupDoc();
    try {
      const { WorkspaceSession } = await import("../../debug/workspace/session/WorkspaceSession.js");
      const session = new WorkspaceSession();
      session.activatePanel("performance");
      assert.strictEqual(session.state.activePanelId, "performance");
      assert.ok(session.panels.isVisible("performance"));
      assert.ok(!session.panels.isVisible("framegraph"));
      assert.ok(!session.panels.isVisible("timeline"));
    } finally {
      restoreDoc();
    }
  });

  it("activatePanel is a no-op for unknown panel", async () => {
    const canvas = setupDoc();
    try {
      const { WorkspaceSession } = await import("../../debug/workspace/session/WorkspaceSession.js");
      const session = new WorkspaceSession();
      session.activatePanel("nonexistent");
      assert.strictEqual(session.state.activePanelId, null);
    } finally {
      restoreDoc();
    }
  });

  it("activatePanel switches panels", async () => {
    const canvas = setupDoc();
    try {
      const { WorkspaceSession } = await import("../../debug/workspace/session/WorkspaceSession.js");
      const session = new WorkspaceSession();
      session.activatePanel("performance");
      assert.ok(session.panels.isVisible("performance"));
      session.activatePanel("framegraph");
      assert.ok(!session.panels.isVisible("performance"));
      assert.ok(session.panels.isVisible("framegraph"));
    } finally {
      restoreDoc();
    }
  });

  it("onSnapshot stores the snapshot and forwards to panels", async () => {
    const canvas = setupDoc();
    try {
      const { WorkspaceSession } = await import("../../debug/workspace/session/WorkspaceSession.js");
      const session = new WorkspaceSession();
      const snap = { frameNumber: 42, timestamp: 1000, worlds: [] };
      session.onSnapshot(snap);
      assert.strictEqual(session.lastSnapshot, snap);
    } finally {
      restoreDoc();
    }
  });

  it("onSnapshot updates visible panels", async () => {
    const canvas = setupDoc();
    try {
      const { WorkspaceSession } = await import("../../debug/workspace/session/WorkspaceSession.js");
      const session = new WorkspaceSession();
      const calls = [];
      session.panels.get("performance").update = (data) => { calls.push(data); };
      session.activatePanel("performance");
      session.onSnapshot({ frameNumber: 1 });
      assert.strictEqual(calls.length, 1);
      assert.strictEqual(calls[0].snapshot.frameNumber, 1);
    } finally {
      restoreDoc();
    }
  });

  it("renderPanel sets canvas size at devicePixelRatio", async () => {
    const canvas = setupDoc();
    try {
      globalThis.window.devicePixelRatio = 2;
      const { WorkspaceSession } = await import("../../debug/workspace/session/WorkspaceSession.js");
      const session = new WorkspaceSession();
      session.renderPanel(800, 600);
      assert.strictEqual(canvas.width, 1600);
      assert.strictEqual(canvas.height, 1200);
      assert.strictEqual(canvas.style.width, "800px");
      assert.strictEqual(canvas.style.height, "600px");
    } finally {
      restoreDoc();
    }
  });

  it("renderPanel does not resize when dimensions unchanged", async () => {
    const canvas = setupDoc();
    try {
      const { WorkspaceSession } = await import("../../debug/workspace/session/WorkspaceSession.js");
      const session = new WorkspaceSession();
      session.renderPanel(800, 600);
      const w = canvas.width, h = canvas.height;
      session.renderPanel(800, 600);
      assert.strictEqual(canvas.width, w);
      assert.strictEqual(canvas.height, h);
    } finally {
      restoreDoc();
    }
  });

  it("canvas is exposed via getter", async () => {
    const canvas = setupDoc();
    try {
      const { WorkspaceSession } = await import("../../debug/workspace/session/WorkspaceSession.js");
      const session = new WorkspaceSession();
      assert.strictEqual(session.canvas, canvas);
    } finally {
      restoreDoc();
    }
  });

  it("destroy cleans up session and clears last snapshot", async () => {
    const canvas = setupDoc();
    try {
      const { WorkspaceSession } = await import("../../debug/workspace/session/WorkspaceSession.js");
      const session = new WorkspaceSession();
      session.onSnapshot({ frameNumber: 1 });
      session.destroy();
      assert.strictEqual(session.lastSnapshot, null);
    } finally {
      restoreDoc();
    }
  });
});
