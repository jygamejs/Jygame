import { WorkspaceSession } from "./session/WorkspaceSession.js";
import { BrowserDebugBackend } from "./backend/BrowserDebugBackend.js";

const backend = new BrowserDebugBackend();
backend.open();

const session = new WorkspaceSession();
backend.onMessage((msg) => {
  if (msg && msg.type === "snapshot" && msg.payload) {
    session.onSnapshot(msg.payload);
  }
});

const panelArea = document.getElementById("panel-area");
if (panelArea) {
  panelArea.appendChild(session.canvas);
}

let _lastW = 0;
let _lastH = 0;

function frame() {
  const rect = panelArea ? panelArea.getBoundingClientRect() : { width: 800, height: 600 };
  if (rect.width !== _lastW || rect.height !== _lastH) {
    _lastW = rect.width;
    _lastH = rect.height;
  }
  session.renderPanel(_lastW, _lastH);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
