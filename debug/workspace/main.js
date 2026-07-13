import { WorkspaceHost } from "./WorkspaceHost.js";
import { BrowserDebugBackend } from "./backend/BrowserDebugBackend.js";

const canvas = document.getElementById("workspace-canvas");

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resize);
resize();

const backend = new BrowserDebugBackend();
backend.open();

const host = new WorkspaceHost(canvas, backend);

function frame() {
  const rect = canvas.getBoundingClientRect();
  if (canvas.width !== Math.round(rect.width * devicePixelRatio) ||
      canvas.height !== Math.round(rect.height * devicePixelRatio)) {
    canvas.width = Math.round(rect.width * devicePixelRatio);
    canvas.height = Math.round(rect.height * devicePixelRatio);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
