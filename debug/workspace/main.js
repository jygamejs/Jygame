import { WorkspaceHost } from "./WorkspaceHost.js";
import { BrowserDebugBackend } from "./backend/BrowserDebugBackend.js";
import {
  DEBUG_SUBSCRIBE,
  DEBUG_UNSUBSCRIBE,
  DEBUG_SUBSCRIPTION_TIMEOUT_MS,
} from "../EnableDebugWorkspace.js";

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

// The game only streams snapshots while a workspace is subscribed, so
// announce immediately and then keep re-announcing. Re-announcing (rather
// than subscribing once) means the order the two windows open in does not
// matter: if the game starts later, it picks us up on the next heartbeat.
// It also means the game stops streaming on its own if this window dies
// without getting a chance to unsubscribe.
const HEARTBEAT_MS = Math.max(250, Math.floor(DEBUG_SUBSCRIPTION_TIMEOUT_MS / 3));

function announce() {
  backend.sendCommand(DEBUG_SUBSCRIBE);
}

announce();
const heartbeat = setInterval(announce, HEARTBEAT_MS);

function unsubscribe() {
  clearInterval(heartbeat);
  backend.sendCommand(DEBUG_UNSUBSCRIBE);
}

// pagehide covers the cases beforeunload misses (bfcache, mobile Safari).
window.addEventListener("pagehide", unsubscribe);
window.addEventListener("beforeunload", unsubscribe);

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
