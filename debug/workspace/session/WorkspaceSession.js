import { OverlaySession } from "../../overlay/OverlaySession.js";
import { WorkspaceState } from "./WorkspaceState.js";

export class WorkspaceSession {
  constructor({ history, registry, analysis, config, theme } = {}) {
    this._session = new OverlaySession({ history, registry, analysis, config, theme });
    this._session.setupDefaultPanels();
    this._state = new WorkspaceState();
    this._lastSnapshot = null;
    this._panelCanvas = document.createElement("canvas");
    this._panelCtx = this._panelCanvas.getContext("2d");
  }

  get panels() { return this._session.panels; }
  get selection() { return this._session.selection; }
  get commands() { return this._session.commands; }
  get context() { return this._session.context; }
  get state() { return this._state; }
  get lastSnapshot() { return this._lastSnapshot; }
  get canvas() { return this._panelCanvas; }

  activatePanel(panelId) {
    const panel = this._session.panels.get(panelId);
    if (!panel) return;
    this._session.panels.hideAll();
    this._session.panels.show(panelId);
    this._state.activePanelId = panelId;
  }

  onSnapshot(snapshot) {
    this._lastSnapshot = snapshot;
    this._session.panels.update({ snapshot });
  }

  renderPanel(width, height) {
    const dpr = window.devicePixelRatio || 1;
    const bw = Math.round(width * dpr);
    const bh = Math.round(height * dpr);
    if (this._panelCanvas.width !== bw || this._panelCanvas.height !== bh) {
      this._panelCanvas.width = bw;
      this._panelCanvas.height = bh;
      this._panelCanvas.style.width = width + "px";
      this._panelCanvas.style.height = height + "px";
    }
    this._panelCtx.save();
    this._panelCtx.scale(dpr, dpr);
    this._panelCtx.clearRect(0, 0, width, height);
    this._session.panels.forEachVisible((panel) => {
      panel.render(this._panelCtx, { x: 0, y: 0, width, height });
    });
    this._panelCtx.restore();
  }

  destroy() {
    this._session.destroy();
    this._lastSnapshot = null;
  }
}
