# Phase 7 — Debug Workspace Architecture

## Overview

The Debug Workspace is a **separate browser tab** opened via Ctrl+F3 from a running jygame application. It provides a full-screen debugging environment styled after Chrome DevTools and VS Code — tabbed panels, a command palette, global search, and a shared selection model — without any DOM coupling in the engine itself.

```
  Game Tab                     Debug Workspace Tab
┌──────────────┐             ┌─────────────────────────┐
│  Game Loop   │             │  Toolbar                │
│  Diagnostics │──transport─▶│  Tab Strip              │
│  Snapshot    │             │  ┌──────────────────┐   │
│  Engine      │             │  │ Current Panel    │   │
└──────────────┘             │  │ (canvas 100%)    │   │
                             └─────────────────────────┘
```

## Design Principles

| Principle | Meaning |
|---|---|
| **Browser-independent** | The workspace communicates via an abstract `DebugBackend`. The engine never touches `BroadcastChannel`, `postMessage`, or any DOM API. |
| **No DOM coupling** | The engine produces snapshots; the workspace renders them. The engine knows nothing about HTML. |
| **Lean on existing infrastructure** | Reuses `Diagnostics`, `FrameStorage`/`FrameSnapshot`, `Panel`/`PanelManager`, `SelectionManager`, `CommandSystem`, `PersistenceManager`, `OverlaySession`, `InputRouter`, themes, renderers, widgets, and 7 existing panels **as-is**. No parallel systems. |
| **All panels are canvas** | Every panel renders via `Panel.render(ctx, rect)`. The workspace provides a `<canvas>` for the active panel. No DOM-only panels. |
| **Allocation-free steady state** | Snapshot objects are pooled via `ActivePool`. No GC pressure during normal frame updates. |
| **Remote-debug ready** | The `DebugBackend` abstraction supports WebSocket or any transport without changing the workspace. |
| **Replay-ready** | Existing `FrameStorage` ring buffer + serialisable `FrameSnapshot` → `ReplayDebugBackend` replays identically. |
| **Recording-ready** | `Diagnostics` + `FrameStorage` already record frame histories. Expose via workspace. |
| **Clean layers** | Transport → State → Panels. Each layer depends only on the layer below. |

## What Already Exists

Before detailing the new architecture, here is everything the existing debug system (`debug/`) already provides. **The workspace builds on ALL of this — nothing is duplicated.**

### Diagnostics Core (`debug/`)

| Export | File | Role |
|---|---|---|
| `Diagnostics` | `Diagnostics.js` | Frame-level metric aggregation: timers, counters, gauges. Budget/warn/crit thresholds. Lockable registry. |
| `DiagnosticsConfig` | `DiagnosticsConfig.js` | Configuration options for diagnostics. |
| `MetricRegistry` | `MetricRegistry.js` | Global registry of typed metrics. |
| `MetricDescriptor` | `MetricDescriptor.js` | Single metric descriptor (name, category, unit, type, budget). |
| `MetricType` | `MetricType.js` | Enum: `TIMER`, `GAUGE`, `COUNTER`. |
| `MetricUnit` | `MetricUnit.js` | Enum: `MILLISECONDS`, `FPS`, `COUNT`, `BYTES`, `PERCENT`. |
| `MetricCategory` | `MetricCategory.js` | Enum: `FRAME`, `ECS`, `RENDER`, `INPUT`, `PHYSICS`, `AUDIO`, `ASSETS`, `STREAMING`, `SCENE`. |
| `CPUTimer` | `CPUTimer.js` | High-resolution timer backed by `performance.now()`. |
| `FrameStorage` | `FrameStorage.js` | Ring buffer of typed-array frame metrics (timers, counters, gauges). Allocation-free at capacity. |
| `FrameSnapshot` | `FrameSnapshot.js` | Immutable snapshot of all metric values at a given frame. `toJSON()`/`fromJSON()` for serialisation. |
| `FrameEvent` | `FrameEvent.js` | Individual frame event with metadata. |
| `FrameHistory` | `FrameHistory.js` | Rolling window of frame data for trend analysis. |
| `TriggerCondition` | `TriggerCondition.js` | Threshold configuration for trigger rules. |
| `TriggerEngine` | `TriggerEngine.js` | Fires callbacks when metrics cross configurable thresholds. |
| `CaptureResult` | `CaptureResult.js` | Snapshot of captured metric data over a range. |
| `Analysis` | `Analysis.js` | Frame analysis utilities: min, max, avg, percentile over a window. |
| `resolveMetricIds` | `resolveMetricIds.js` | Resolves metric name strings to numeric IDs for fast frame-loop scoping. |

### Overlay Infrastructure (`debug/overlay/`)

| Export | File | Role |
|---|---|---|
| `OverlaySession` | `OverlaySession.js` | Orchestrates panels, layout, selection, commands, input routing, persistence, themes, renderers. |
| `OverlayContext` | `OverlayContext.js` | Shared context injected into every panel. Exposes history, registry, analysis, config, theme, selection, commands, input, tooltips, animation, renderers, layout. |
| `Panel` | `Panel.js` | Base class with lifecycle: `onRegister()`, `onShow()`, `onHide()`, `update(data)`, `render(ctx, rect)`, `onDestroy()`. |
| `PanelManager` | `PanelManager.js` | Register/unregister/get/show/hide/toggle panels. Iterates visible panels for update/render. |
| `LayoutEngine` | `LayoutEngine.js` | Panel positioning for overlay. Not used by workspace. |
| `SelectionManager` | `SelectionManager.js` | Single selection model: `selectedMetricId`, `selectedFrameIndex`, `selectedCaptureId`, `selectedPanelId`, `hoveredMetricId`. Event-based. |
| `CommandSystem` | `CommandSystem.js` | Command registry with keyboard shortcuts. `register(name, fn, shortcut)`, `execute(name)`. |
| `InputRouter` | `InputRouter.js` | Routes keyboard/pointer events to panels and selection. |
| `TooltipManager` | `TooltipManager.js` | Hover tooltips for metrics and panels. |
| `AnimationSystem` | `AnimationSystem.js` | Tween/animation tick for smooth overlay transitions. |
| `PersistenceManager` | `PersistenceManager.js` | localStorage persistence for settings, layout, favorites. |

### Renderers, Widgets, and Themes

All reused as-is — `SparklineRenderer`, `HistogramRenderer`, `FrameBarRenderer`, `TextRenderer`; 13 widgets (`Checkbox`, `Slider`, `TreeView`, `SearchBox`, `TabBar`, `Badge`, `MetricRow`, `ProgressBar`, `SplitPane`, `Table`, `Inspector`, `Dropdown`, `Toolbar`); and `DarkTheme`/`LightTheme`.

### Existing Panels (`debug/overlay/panels/`)

| Panel | `id` | `title` | Description |
|---|---|---|---|
| `PerformancePanel` | `performance` | Performance | FPS, frame timings, budget bars |
| `FrameGraphPanel` | `framegraph` | Frame Graph | Per-frame breakdown as stacked bar chart |
| `TimelinePanel` | `timeline` | Timeline | System-level timeline view |
| `MetricBrowserPanel` | `metrics` | Metrics | Browse/search all registered metrics |
| `EventViewerPanel` | `events` | Events | Entity-component event log |
| `CaptureBrowserPanel` | `captures` | Captures | Browse saved metric captures |
| `SettingsPanel` | `settings` | Settings | Theme, refresh rate, font size, opacity |

All render via `Panel.render(ctx, rect)` to canvas. The workspace gives them a canvas context — **no changes needed**.

## What's New

| Component | Purpose |
|---|---|
| `DebugBackend` (abstract) | Transport abstraction. `open()`, `close()`, `send(snapshot)`, `onMessage(handler)`. |
| `BrowserDebugBackend` | `BroadcastChannel('jygame-debug')` transport — same-origin, same-browser. |
| `RemoteDebugBackend` | WebSocket transport — remote debugging. |
| `ReplayDebugBackend` | Loads serialised `FrameSnapshot` files — offline analysis. |
| `TestDebugBackend` | In-memory queue — integration tests. |
| `NullDebugBackend` | No-op — production (debugging disabled). |
| `SnapshotBuilder` | Shared infrastructure (`debug/snapshots/`): collects diagnostics + ECS state into snapshots each frame. Used by workspace, replay, and future tools. |
| `WorkspaceSession` | Workspace controller: owns the tab strip, toolbar, and panel canvas. Wraps an `OverlaySession` for shared state. |
| `Toolbar` | Top bar: pause/resume/step, screenshot, theme toggle, connection status, FPS counter. |
| `TabStrip` | VS Code–style tabs: open, close, pin, reorder, scroll, persist. Driven by panel metadata. |
| `CommandPalette` | Ctrl+Shift+P fuzzy-searchable command list. Backed by existing `CommandSystem`. |
| `SearchService` | Global search (Ctrl+P panels/files, Ctrl+F in-panel). Panel-registered providers. |
| Snapshot types | `EntitySnapshot`, `ComponentSnapshot`, `WorldSnapshot` — pooled types for streaming ECS state alongside existing `FrameSnapshot`. |
| Panel metadata | Static descriptor on each panel class: `id`, `title`, `icon`, `pinned`, `searchable`. |

## Architecture Layers

```
┌──────────────────────────────────────────────────────────────┐
│  Workspace UI                                                │
│  Toolbar │ TabStrip │ CommandPalette │ SearchService         │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  Panel Canvas (fills panel area)                     │    │
│  │  Panel.render(ctx, rect) — same as in-game overlay   │    │
│  └──────────────────────────────────────────────────────┘    │
├──────────────────────────────────────────────────────────────┤
│  Workspace Kernel (wraps OverlaySession)                     │
│  WorkspaceSession                                            │
│  ├── OverlaySession (from debug/overlay/)                    │
│  │   ├── PanelManager       (register/show/hide/toggle)      │
│  │   ├── SelectionManager   (selection + events)             │
│  │   ├── CommandSystem      (commands + shortcuts)           │
│  │   ├── PersistenceManager (localStorage)                   │
│  │   ├── InputRouter        (input routing)                  │
│  │   └── OverlayContext     (shared context)                 │
│  ├── WorkspaceState         (tabs, UI state)                 │
│  └── SearchService          (global search)                  │
├──────────────────────────────────────────────────────────────┤
│  DebugBackend (Transport Layer)                              │
│  BrowserDebugBackend │ RemoteDebugBackend │ Replay | Test     │
├──────────────────────────────────────────────────────────────┤
│  Engine (Snapshot Producer)                                  │
│  Diagnostics │ FrameStorage │ SnapshotBuilder                │
└──────────────────────────────────────────────────────────────┘
```

### Layer 1 — Engine (Snapshot Producer)

The engine collects `Diagnostics` data and builds snapshots once per frame, then pushes them through the transport.

```
Game._frame()
  │
  ├─ doInput()                  ← existing
  ├─ doUpdate()                 ← existing
  ├─ buildSnapshots()           ← NEW
  ├─ transport.send(snapshot)   ← NEW
  ├─ doCanvas()                 ← existing
  └─ doRender()                 ← existing
```

**The engine never waits for the workspace.** If the transport is blocked, the snapshot is dropped. Frame timing is unaffected by workspace latency.

### Layer 2 — DebugBackend (Transport)

An abstract interface with concrete implementations for each transport:

```js
class DebugBackend {
  open() {}           // Connect / start listening
  close() {}          // Disconnect
  send(snapshot) {}   // Push FrameSnapshot + ECS data to workspace
  onMessage(handler) {} // Receive commands from workspace
  get connected() {}  // boolean
  get latency() {}    // approximate round-trip ms
}
```

| Backend | Transport | Use Case |
|---|---|---|
| `BrowserDebugBackend` | `BroadcastChannel('jygame-debug')` | Same-origin, same-browser. Default. |
| `RemoteDebugBackend` | WebSocket | Debug a game on another device. |
| `ReplayDebugBackend` | Loads JSON via fetch | Offline analysis of recorded frames. |
| `TestDebugBackend` | In-memory queue | Integration tests. |
| `NullDebugBackend` | No-op | Production builds (debugging disabled). |

Messages use a standard `{ type, payload }` envelope via `BroadcastChannel.postMessage()`. Types: `snapshot`, `log`, `error`, `commandResult`, `connected`, `command`, `requestSnapshot`.

**Engine wiring:**

```js
class Game {
  enableDebugWorkspace(backend) {
    this._debugBackend = backend || new BrowserDebugBackend();
    this._debugBackend.open();
    this._debugBackend.onMessage(this._handleDebugCommand.bind(this));
  }
}
```

**Ctrl+F3** uses the engine's established Input System — a `ChordBinding` combining `KeyBinding(KeyCode.F3)` with `Modifier.CTRL`:

```js
import { ChordBinding, KeyBinding, KeyCode, Modifier } from "jygame";

this._actionMap.bind("openDebugWorkspace",
  new ChordBinding([new KeyBinding(KeyCode.F3)], [Modifier.CTRL]));
```

When the action is triggered, `window.open('/debug-workspace.html')` loads the workspace tab, which connects via its own `BrowserDebugBackend`. All workspace keyboard shortcuts follow the same pattern — bound through the Input System, not raw DOM listeners.

### Layer 3 — Workspace Kernel

The workspace kernel wraps the **existing `OverlaySession`** and adds workspace-specific concerns. Note that `LayoutEngine` is NOT used — the workspace shows one panel at a time and passes the full canvas rect directly.

```
WorkspaceSession
├── OverlaySession            ← reused whole — no changes
│   ├── PanelManager          ← reused
│   ├── SelectionManager      ← reused
│   ├── CommandSystem         ← reused
│   ├── PersistenceManager    ← reused
│   ├── InputRouter           ← reused
│   └── OverlayContext        ← reused
├── WorkspaceState            ← NEW
└── SearchService             ← NEW
```

#### WorkspaceSession

```js
class WorkspaceSession {
  constructor() {
    this._session = new OverlaySession({ ... });
    this._session.setupDefaultPanels();

    this._search = new SearchService();
    this._commandPalette = new CommandPalette(this._session.commands);
    this._state = new WorkspaceState();

    this._panelCanvas = document.createElement("canvas");
    this._panelCtx = this._panelCanvas.getContext("2d");
  }

  get panels()      { return this._session.panels; }
  get selection()   { return this._session.selection; }
  get commands()    { return this._session.commands; }
  get context()     { return this._session.context; }

  onSnapshot(snapshot) {
    this._session.panels.update({ snapshot });
    this._state.lastFrame = snapshot;
  }

  activatePanel(panelId) {
    this._session.panels.hideAll();
    this._session.panels.show(panelId);
    this._session.selection.selectPanel(panelId);
  }

  renderPanel(width, height) {
    const dpr = window.devicePixelRatio || 1;
    this._panelCanvas.width = width * dpr;
    this._panelCanvas.height = height * dpr;
    this._panelCanvas.style.width = width + "px";
    this._panelCanvas.style.height = height + "px";
    this._panelCtx.scale(dpr, dpr);

    // Render the single active panel — no LayoutEngine needed
    for (const panel of this._session.panels.active) {
      panel.render(this._panelCtx, { x: 0, y: 0, width, height });
    }
  }
}
```

**Panel rendering** is identical to the in-game overlay — `Panel.render(ctx, rect)`. The only difference is the `ctx` comes from the workspace's panel canvas instead of the game's main canvas. The workspace passes `{x: 0, y: 0, width, height}` as the rect since the single panel fills the entire panel area.

### Selection Model

The **existing `SelectionManager`** is reused directly. The workspace adds entity/component selection types on top of its existing `metric`, `frame`, `capture`, and `panel` event types:

```js
// A panel selects an entity:
selection.selectMetric("entity:42");

// Another panel subscribes:
selection.on("change:metric", (id) => {
  this._inspectEntity(id);
});
```

### Command Palette

Triggered by Ctrl+Shift+P. Backed by the existing `CommandSystem`:

```js
class CommandPalette {
  constructor(commandSystem) { this._commands = commandSystem; }

  search(query)  { /* fuzzy-match against registered commands */ }
  execute(name)  { this._commands.execute(name); }
}
```

Built-in commands:
- `debug:pause` / `debug:resume` / `debug:stepFrame` — control game execution
- `workspace:openPanel` — open a panel by name (driven by panel metadata)
- `workspace:toggleTheme` — toggle light/dark
- `panel:refresh` — force-refresh active panel

### Panel Metadata

Every panel exposes static metadata for the workspace to use in `TabStrip`, `SearchService`, and `CommandPalette`:

```js
class PerformancePanel extends Panel {
  static metadata = {
    id: "performance",
    title: "Performance",
    icon: "chart",          // Icon identifier for the tab
    group: "Analysis",      // Optional — reserved for future grouped panel picker
    pinned: true,           // Always visible, cannot be closed
    searchable: true,       // Included in global search
  };

  // ... existing render / update ...
}
```

The `TabStrip` reads `panel.constructor.metadata` to render tabs. `SearchService` indexes `searchable` panels. `CommandPalette` uses `metadata.title` for the "Open Panel" command list.

This is a **static property on the Panel subclass** — no changes to `PanelManager`, `OverlaySession`, or any existing panel code. The 7 existing panels each get a one-line `static metadata = { ... }` addition.

## Snapshot Architecture

**Reused:** `Diagnostics` + `FrameStorage` + `FrameSnapshot` chain (existing — fully reused, no changes).

**Added:** `SnapshotBuilder` lives in `debug/snapshots/` as shared infrastructure:

```
debug/
└── snapshots/
    ├── SnapshotBuilder.js       ← NEW (shared, not workspace-specific)
    ├── EntitySnapshot.js        ← NEW (pooled snapshot type)
    ├── ComponentSnapshot.js     ← NEW (pooled snapshot type)
    └── WorldSnapshot.js         ← NEW (pooled snapshot type)
```

It enriches the existing metric snapshot with ECS world state:

```js
class SnapshotBuilder {
  constructor(game) {
    this._worlds = new Map();
    this._pools = {
      entitySnapshot: new ActivePool(() => new EntitySnapshot()),
      componentSnapshot: new ActivePool(() => new ComponentSnapshot()),
    };
  }

  registerWorld(id, world) { this._worlds.set(id, world); }
  unregisterWorld(id) { this._worlds.delete(id); }

  build(fullSnapshot = false) {
    const diagnosticsSnapshot = this._buildDiagnosticsSnapshot();
    const worldSnapshots = [];
    for (const [id, world] of this._worlds) {
      worldSnapshots.push(this._buildWorldSnapshot(id, world, fullSnapshot));
    }
    return { frameNumber, timestamp, diagnostics: diagnosticsSnapshot, worlds: worldSnapshots };
  }
}
```

**Delta tracking:** Only dirty entities are included between full snapshots. Full snapshots are sent every N frames (default 60). All snapshot objects are pooled via `ActivePool`.

**Why shared:** Replay, remote debugging, and future tools all consume the same snapshots. Placing it in `debug/snapshots/` keeps it accessible to everything without workspace-specific imports.

## Panel Strategy

**All panels render via `Panel.render(ctx, rect)` to a canvas context.** The workspace gives a dedicated `<canvas>` to the active panel. The `PanelManager.render(ctx)` call works identically whether it's the in-game overlay's context or the workspace's panel canvas — **no changes to existing panels**.

```js
// PerformancePanel — unchanged, works in both environments:
class PerformancePanel extends Panel {
  render(ctx, rect) {
    ctx.fillStyle = this._theme.textPrimary;
    ctx.fillText(`FPS: ${this._fps}`, rect.x + 8, rect.y + 20);
  }
}
```

The workspace registers the same 7 existing panels at startup:

```js
const ctx = this._session.context;
this._panels.register(new PerformancePanel(ctx));
this._panels.register(new FrameGraphPanel(ctx));
this._panels.register(new TimelinePanel(ctx));
this._panels.register(new MetricBrowserPanel(ctx));
this._panels.register(new EventViewerPanel(ctx));
this._panels.register(new CaptureBrowserPanel(ctx));
this._panels.register(new SettingsPanel(ctx));
```

### In-Game Overlay and Workspace Coexistence

When the workspace is connected (`DebugBackend` is not `NullDebugBackend`), the in-game `DebugOverlay` hides itself — the workspace replaces it. When disconnected, the in-game overlay reappears.

The overlay and workspace never render the same panel at the same time. `PanelManager` is the single source of truth for both environments.

## Tab Strip

VS Code–style component driven by panel metadata:

```
│ Performance ✕ │ * Frame Graph │ Timeline │ Metrics │ Events │ + │
```

- Built from `Panel.constructor.metadata`.
- Active tab highlighted.
- Close (✕) on non-pinned tabs (where `pinned: false`).
- Drag-to-reorder (pointer events).
- Scrollable overflow with left/right arrows.
- "+" opens dropdown of all registered panels (from `metadata.title`).
- Layout persisted via `PersistenceManager`.

Switching a tab calls `WorkspaceSession.activatePanel(panelId)` which hides all panels, shows the selected one, and renders it to the panel canvas.

## Toolbar

```
[⏸] [▶] [⏭] [⎘] [📷] [↻] [🌙]      FPS: 60  Frame: 1423  🟢 Connected
```

Pause/Resume/Step send commands via `DebugBackend`. Theme toggles `DarkTheme`/`LightTheme`. Connection status shows green/yellow/red dot.

## Plugin API

Plugins register via the same APIs used internally:

```js
// Panel with metadata
class MyPanel extends Panel {
  static metadata = { id: "custom", title: "Custom", icon: "...", pinned: false, searchable: true };
  render(ctx, rect) { /* ... */ }
}
panelManager.register(new MyPanel(ctx));

// Command (reuses CommandSystem)
commands.register("custom.action", () => { ... }, "Ctrl+Shift+M");

// Search provider
searchService.registerProvider({ id: "custom", search: (q) => [...] });

// Toolbar action
toolbar.registerAction({ id: "custom", label: "Action", handler: () => {} });
```

All registrations happen at module import time, same pattern as `Binding`/`Processor` self-registration.

## Performance

| Requirement | Strategy |
|---|---|
| **Panel canvas sizing** | Canvas resized at `devicePixelRatio` for sharp rendering. |
| **Snapshot pooling** | `ActivePool` for all `EntitySnapshot`/`ComponentSnapshot` objects. No `new` in per-frame code. |
| **Frame throttling** | Workspace renders at display refresh. Incoming snapshots queued — only latest rendered. |
| **Lazy inactive tabs** | Panels on non-active tabs receive `update(data)` but `render(ctx, rect)` is not called. |

## Replay

- `FrameStorage` ring buffer already records frame history.
- `FrameSnapshot.toJSON()` serialises to JSON.
- `ReplayDebugBackend` loads a JSON file and replays `onSnapshot` calls at frame-accurate timing.
- Workspace UI gets a timeline scrubber (future) using `FrameHistory` + `Analysis`.

No new storage or serialisation layer needed.

## Multiple Worlds (Future)

- `SnapshotBuilder` supports multiple worlds via `registerWorld(id, world)`.
- `WorkspaceSession` tracks `activeWorldId`.
- Toolbar has a world selector.

## Comparison to What Exists

| Concern | Existing (`debug/`) | New (`debug/workspace/`) |
|---|---|---|
| Metric collection | `Diagnostics` + `MetricRegistry` | Reused directly |
| Frame storage | `FrameStorage` ring buffer | Reused directly |
| Frame snapshots | `FrameSnapshot` with `toJSON()` | Extended by shared `SnapshotBuilder` with ECS state |
| Panel lifecycle | `Panel` + `PanelManager` | Reused directly — no changes |
| Panel rendering | `Panel.render(ctx, rect)` to canvas | Reused directly — workspace provides canvas context |
| Selection | `SelectionManager` | Reused directly |
| Commands | `CommandSystem` | Reused directly |
| Persistence | `PersistenceManager` | Reused directly |
| Layout | `LayoutEngine` (multi-panel) | Not used — single panel, full rect |
| Themes | `DarkTheme` / `LightTheme` | Reused directly |
| Existing panels | 7 canvas panels | Reused as-is — one-line `metadata` addition |
| Transport | None | `DebugBackend` family (new) |
| Shared snapshots | None | `debug/snapshots/` (new, shared) |
| Workspace UI | None | `WorkspaceSession`, `TabStrip`, `Toolbar`, `CommandPalette`, `SearchService` (new) |

## Implementation Plan — Commits

The workspace is built in 5 commits. Each commit is a coherent, tested unit. Dependencies flow downward — later commits rely on earlier ones.

### Commit 1: Backend transport layer

**Dependencies**: none

**Files**:
```
debug/workspace/backend/
    DebugBackend.js           — abstract base: open(), close(), send(), onMessage()
    NullDebugBackend.js       — no-op (production)
    BrowserDebugBackend.js    — BroadcastChannel('jygame-debug')
    TestDebugBackend.js       — in-memory queue for tests
```

**Tests**: each backend: open/close lifecycle, send/receive round-trip, connected/latency getters, NullDebugBackend no-ops. BrowserDebugBackend requires jsdom BroadcastChannel mock.

**Commit message**:
```
feat(debug): add DebugBackend transport layer — abstract base,
NullDebugBackend, BrowserDebugBackend, TestDebugBackend
```

---

### Commit 2: Shared snapshot types + builder

**Dependencies**: commit 1 (backends)

**Files**:
```
debug/snapshots/
    EntitySnapshot.js         — pooled entity snapshot
    ComponentSnapshot.js      — pooled component snapshot
    WorldSnapshot.js          — pooled world snapshot
    SnapshotBuilder.js        — builds FrameSnapshot + ECS state
```

Snapshot types are `ActivePool`-compatible pooled objects. `SnapshotBuilder` collects diagnostics + ECS world state and pushes the composite snapshot through the backend.

**Tests**: pooling lifecycle (acquire/release/reset), SnapshotBuilder builds correct shape, delta tracking (only dirty entities between full snapshots), full snapshot every N frames (default 60), zero-alloc steady state.

**Commit message**:
```
feat(debug): add shared snapshot types and SnapshotBuilder —
EntitySnapshot, ComponentSnapshot, WorldSnapshot pooled objects
```

---

### Commit 3: Engine integration

**Dependencies**: commits 1–2

**Files** (modified):
```
(create) debug/EnableDebugWorkspace.js   — wiring helper
(modify) core/Game.js                    — snapshot frame-hook in _frame()
(modify) debug/index.js                  — add workspace + snapshot exports
(modify) jygame.js                       — re-export via barrel, if applicable
```

Adds `Game.enableDebugWorkspace(backend?)` which creates a `SnapshotBuilder`, registers worlds, and hooks into `Game._frame()` to call `buildSnapshots()` then `backend.send()` after update but before render.

**Tests**: snapshot fires each frame when enabled, no snapshot when disabled, backend receives correct frame data, backend.send() errors don't crash the frame loop, Ctrl+F3 action binding (ChordBinding test).

**Commit message**:
```
feat(game): integrate debug workspace — enableDebugWorkspace(),
snapshot frame-hook in Game._frame()
```

---

### Commit 4: Workspace kernel + panel metadata

**Dependencies**: commit 3 (active snapshot stream)

**Files**:
```
debug/workspace/
    index.html                — standalone workspace HTML entry (loads main.js)
    main.js                   — bootstrap WorkspaceSession, register panels

debug/workspace/session/
    WorkspaceSession.js       — wraps OverlaySession, owns panel canvas
    WorkspaceState.js          — tabs, toolbar prefs, active world
```

**Files** (modified):
```
(modify) debug/overlay/Panel.js     — static metadata default + getter
(modify) debug/overlay/panels/PerformancePanel.js    — + static metadata
(modify) debug/overlay/panels/FrameGraphPanel.js     — + static metadata
(modify) debug/overlay/panels/TimelinePanel.js       — + static metadata
(modify) debug/overlay/panels/MetricBrowserPanel.js  — + static metadata
(modify) debug/overlay/panels/EventViewerPanel.js    — + static metadata
(modify) debug/overlay/panels/CaptureBrowserPanel.js — + static metadata
(modify) debug/overlay/panels/SettingsPanel.js       — + static metadata
```

`WorkspaceSession` wraps `OverlaySession`, provides `activatePanel(panelId)`, receives snapshots via `onSnapshot(snapshot)`, and renders the active panel to a dedicated `<canvas>`. The 7 existing panels each get a one-line `static metadata` addition — no other changes.

**Tests**: WorkspaceSession activatePanel shows correct panel, hideAll/show lifecycle, panel canvas sizing at devicePixelRatio, snapshot forwarding to panels, all 7 metadata descriptors readable without instantiation.

**Commit message**:
```
feat(debug): add WorkspaceSession, panel metadata — workspace
kernel wraps OverlaySession, 7 panels gain static metadata
```

---

### Commit 5: Workspace UI shell

**Dependencies**: commit 4 (WorkspaceSession)

**Files**:
```
debug/workspace/ui/
    TabStrip.js               — VS Code–style tabs from panel metadata
    Toolbar.js                — pause/resume/step/screenshot/theme/FPS
    CommandPalette.js         — Ctrl+Shift+P fuzzy search over CommandSystem
    SearchService.js          — Ctrl+P global search with panel providers
```

`TabStrip` reads `panel.constructor.metadata` for id/title/icon/pinned/searchable. `Toolbar` sends debug commands over the backend. `CommandPalette` wraps the existing `CommandSystem` with fuzzy matching. `SearchService` delegates to panel-registered search providers.

No changes to existing panels, `PanelManager`, or `OverlaySession`.

**Tests**: TabStrip renders correct tabs from metadata, click switches active panel, close removes unpinned tabs, toolbar pause/resume sends commands, CommandPalette fuzzy matching, SearchService provider registration.

**Commit message**:
```
feat(debug): add workspace UI shell — TabStrip, Toolbar,
CommandPalette, SearchService
```

---

### Future (post-launch)

These are not part of the initial 5-commit plan. They extend the workspace without changing existing infrastructure:

| Commit | What | Why post-launch |
|---|---|---|
| RemoteDebugBackend | WebSocket transport | Requires server infra, auth, protocol design |
| ReplayDebugBackend | JSON file replay | Requires a corpus of recorded frames to test against |
| World selector | Multi-world toolbar dropdown | Only useful when games actually use multiple worlds |

### Dependency Graph

```
Commit 1 (backends) ─────────────────────┐
                                          │
Commit 2 (snapshot types + builder) ──────┤
                                          │
Commit 3 (engine integration) ◄───────────┘
                                          │
Commit 4 (WorkspaceSession + metadata) ◄──┘
                                          │
Commit 5 (workspace UI shell) ◄───────────┘
```

## File Layout

```
debug/
├── Diagnostics.js           ← existing (unchanged)
├── ...                      ← existing (FrameStorage, FrameSnapshot, etc.)
├── index.js                 ← existing (re-exports, add workspace + snapshot exports)
│
├── snapshots/                            ← NEW (shared, not workspace-specific)
│   ├── SnapshotBuilder.js                # Builds FrameSnapshot + ECS state
│   ├── EntitySnapshot.js                 # Pooled entity snapshot
│   ├── ComponentSnapshot.js              # Pooled component snapshot
│   └── WorldSnapshot.js                  # Pooled world snapshot
│
├── workspace/                            ← NEW
│   ├── index.html                        # Standalone workspace HTML entry
│   ├── main.js                           # Bootstrap WorkspaceSession, panels
│   ├── session/
│   │   ├── WorkspaceSession.js           # Wraps OverlaySession, owns panel canvas
│   │   └── WorkspaceState.js             # Tabs, toolbar prefs, active world
│   ├── backend/
│   │   ├── DebugBackend.js               # Abstract interface
│   │   ├── BrowserDebugBackend.js        # BroadcastChannel
│   │   ├── RemoteDebugBackend.js         # WebSocket
│   │   ├── ReplayDebugBackend.js         # JSON file replay
│   │   ├── TestDebugBackend.js           # In-memory test
│   │   └── NullDebugBackend.js           # No-op production
│   ├── ui/
│   │   ├── Toolbar.js                    # Top toolbar
│   │   ├── TabStrip.js                   # VS Code–style tabs
│   │   ├── CommandPalette.js             # Ctrl+Shift+P overlay
│   │   └── SearchService.js              # Global search
│   └── panels/                           # (reserved for future panels)

# All existing panels remain in debug/overlay/panels/ (unchanged, one-line metadata addition):
debug/overlay/panels/
├── PerformancePanel.js             ← reused
├── FrameGraphPanel.js              ← reused
├── TimelinePanel.js                ← reused
├── MetricBrowserPanel.js           ← reused
├── EventViewerPanel.js             ← reused
├── CaptureBrowserPanel.js          ← reused
└── SettingsPanel.js                ← reused
```

## Public API (Additions to `debug/index.js`)

```js
// Backend
export { DebugBackend } from "./workspace/backend/DebugBackend.js";
export { BrowserDebugBackend } from "./workspace/backend/BrowserDebugBackend.js";
export { RemoteDebugBackend } from "./workspace/backend/RemoteDebugBackend.js";
export { NullDebugBackend } from "./workspace/backend/NullDebugBackend.js";

// Session
export { WorkspaceSession } from "./workspace/session/WorkspaceSession.js";

// Shared snapshots
export { SnapshotBuilder } from "./snapshots/SnapshotBuilder.js";
export { EntitySnapshot } from "./snapshots/EntitySnapshot.js";
export { ComponentSnapshot } from "./snapshots/ComponentSnapshot.js";
export { WorldSnapshot } from "./snapshots/WorldSnapshot.js";
```

All existing exports from `debug/index.js` are unchanged.
