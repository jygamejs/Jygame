import { WorkspaceSession } from "./session/WorkspaceSession.js";
import { BrowserDebugBackend } from "./backend/BrowserDebugBackend.js";
import { TabStrip } from "./ui/TabStrip.js";
import { Toolbar } from "./ui/Toolbar.js";
import { CommandPalette } from "./ui/CommandPalette.js";

// --- Transport ---
const backend = new BrowserDebugBackend();
backend.open();

// --- Session ---
const session = new WorkspaceSession();

// --- UI components ---
const tabStrip = new TabStrip();
const toolbar = new Toolbar();
toolbar.setConnected(backend.connected);
const commandPalette = new CommandPalette(session.commands);

// --- Toolbar actions ---
toolbar.registerAction({ id: "pause", label: "\u23F8", handler: () => { backend.send({ type: "command", payload: "debug:pause" }); toolbar.setPaused(true); } });
toolbar.registerAction({ id: "resume", label: "\u25B6", handler: () => { backend.send({ type: "command", payload: "debug:resume" }); toolbar.setPaused(false); } });
toolbar.registerAction({ id: "step", label: "\u23ED", handler: () => { backend.send({ type: "command", payload: "debug:stepFrame" }); } });
toolbar.registerAction({ id: "theme", label: "\uD83C\uDF19", handler: () => { const next = toolbar.theme === "dark" ? "light" : "dark"; toolbar.setTheme(next); } });

// --- Toolbar DOM ---
const toolbarEl = document.getElementById("toolbar");
if (toolbarEl) {
  toolbar.getActions().forEach(action => {
    const btn = document.createElement("button");
    btn.textContent = action.label;
    btn.title = action.id;
    btn.addEventListener("click", () => toolbar.trigger(action.id));
    toolbarEl.appendChild(btn);
  });
  const sep = document.createElement("span");
  sep.className = "sep";
  toolbarEl.appendChild(sep);
  const status = document.createElement("div");
  status.className = "status";
  status.id = "toolbar-status";
  toolbarEl.appendChild(status);
}

function updateStatus() {
  const el = document.getElementById("toolbar-status");
  if (!el) return;
  const dotClass = toolbar.connected ? "green" : "red";
  const dotLabel = toolbar.connected ? "Connected" : "Disconnected";
  el.innerHTML = `<span><span class="dot ${dotClass}"></span>${dotLabel}</span><span>FPS: ${toolbar.fps}</span><span>Frame: ${toolbar.frame}</span>`;
}

// --- TabStrip ---
tabStrip.buildTabs(session.panels);
tabStrip.onSwitch(id => {
  session.activatePanel(id);
  renderTabStrip();
});

// --- TabStrip DOM ---
const tabStripEl = document.getElementById("tabstrip");

function renderTabStrip() {
  if (!tabStripEl) return;
  tabStripEl.innerHTML = "";
  tabStrip.getTabs().forEach(tab => {
    const div = document.createElement("div");
    div.className = "tab" + (tab.id === tabStrip.getActive() ? " active" : "");
    div.textContent = tab.icon ? tab.icon + " " + tab.title : tab.title;
    div.addEventListener("click", () => tabStrip.setActive(tab.id));
    if (!tab.pinned) {
      const close = document.createElement("span");
      close.className = "close";
      close.textContent = "\u2715";
      close.addEventListener("click", (e) => {
        e.stopPropagation();
        tabStrip.closeTab(tab.id);
        renderTabStrip();
      });
      div.appendChild(close);
    }
    tabStripEl.appendChild(div);
  });
}

// Activate default panel
const firstTab = tabStrip.getTabs()[0];
if (firstTab) tabStrip.setActive(firstTab.id);
renderTabStrip();

// --- Snapshot handling ---
backend.onMessage((msg) => {
  if (msg && msg.type === "snapshot" && msg.payload) {
    session.onSnapshot(msg.payload);
    toolbar.setConnected(true);
  }
});

// --- Command Palette ---
const paletteEl = document.getElementById("command-palette");
const inputEl = document.getElementById("command-input");
const resultsEl = document.getElementById("command-results");

document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "p") {
    e.preventDefault();
    commandPalette.toggle();
    if (commandPalette.isOpen) {
      paletteEl.classList.add("open");
      inputEl.value = "";
      inputEl.focus();
      renderPalette();
    } else {
      paletteEl.classList.remove("open");
    }
  }
  if (commandPalette.isOpen) {
    if (e.key === "Escape") {
      commandPalette.close();
      paletteEl.classList.remove("open");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      commandPalette.selectNext();
      renderPalette();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      commandPalette.selectPrev();
      renderPalette();
    } else if (e.key === "Enter") {
      e.preventDefault();
      commandPalette.executeSelected();
      paletteEl.classList.remove("open");
    }
  }
});

if (inputEl) {
  inputEl.addEventListener("input", () => {
    commandPalette.updateQuery(inputEl.value);
    renderPalette();
  });
}

function renderPalette() {
  if (!resultsEl) return;
  resultsEl.innerHTML = "";
  commandPalette.results.forEach((cmd, i) => {
    const div = document.createElement("div");
    div.className = "result" + (i === commandPalette.selectedIndex ? " selected" : "");
    div.textContent = cmd;
    div.addEventListener("click", () => {
      commandPalette._query = cmd;
      commandPalette._selectedIndex = i;
      commandPalette.executeSelected();
      paletteEl.classList.remove("open");
    });
    resultsEl.appendChild(div);
  });
}

// --- Render loop ---
const panelArea = document.getElementById("panel-area");
if (panelArea) {
  panelArea.appendChild(session.canvas);
}

let _lastW = 0;
let _lastH = 0;
let _frameCount = 0;
let _lastFpsTime = 0;

function frame(time) {
  const rect = panelArea ? panelArea.getBoundingClientRect() : { width: 800, height: 600 };
  if (rect.width !== _lastW || rect.height !== _lastH) {
    _lastW = rect.width;
    _lastH = rect.height;
  }
  session.renderPanel(_lastW, _lastH);

  _frameCount++;
  if (time - _lastFpsTime >= 1000) {
    toolbar.setFps(_frameCount);
    toolbar.setFrame(session.lastSnapshot ? session.lastSnapshot.frameNumber : 0);
    _frameCount = 0;
    _lastFpsTime = time;
  }
  updateStatus();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
