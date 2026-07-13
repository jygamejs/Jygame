import { WorkspaceHost } from "./WorkspaceHost.js";
import { BrowserDebugBackend } from "./backend/BrowserDebugBackend.js";

const canvas = document.getElementById("workspace-canvas");

function resize() {
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.round(rect.width * devicePixelRatio);
  canvas.height = Math.round(rect.height * devicePixelRatio);
}
window.addEventListener("resize", resize);
resize();

const backend = new BrowserDebugBackend();
backend.open();

const host = new WorkspaceHost(canvas, backend);

let lastTime = performance.now();
function frame(time) {
  const dt = Math.min((time - lastTime) / 1000, 0.05);
  lastTime = time;

  const rect = canvas.getBoundingClientRect();
  const cw = Math.round(rect.width * devicePixelRatio);
  const ch = Math.round(rect.height * devicePixelRatio);
  if (canvas.width !== cw || canvas.height !== ch) {
    canvas.width = cw;
    canvas.height = ch;
  }

  host.update(dt);
  host._render();

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
