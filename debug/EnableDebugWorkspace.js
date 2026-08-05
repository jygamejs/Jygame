import { BrowserDebugBackend } from "./workspace/backend/BrowserDebugBackend.js";
import {
  DebugSession,
  DEBUG_SUBSCRIBE,
  DEBUG_UNSUBSCRIBE,
  DEBUG_SUBSCRIPTION_TIMEOUT_MS,
} from "./DebugSession.js";

export { DEBUG_SUBSCRIBE, DEBUG_UNSUBSCRIBE, DEBUG_SUBSCRIPTION_TIMEOUT_MS };

// Building and serializing a whole-world snapshot every frame is by far the
// most expensive thing the engine can do (~11 ms/frame with 1,000 entities,
// roughly 40x a normal frame). It used to run unconditionally whenever debug
// was on, because the backend opens a BroadcastChannel successfully whether or
// not anything is listening on the other end.
//
// Streaming is opt-in: the workspace announces itself, and the game only pays
// the cost while a workspace is actually subscribed.

function _commandName(payload) {
  if (typeof payload === "string") return payload;
  if (payload && typeof payload.name === "string") return payload.name;
  return null;
}

// How long a subscription survives without a heartbeat. The workspace
// re-announces on an interval, so if its window is closed or crashes the game
// stops streaming on its own — no unsubscribe message required.
export const DEBUG_SUBSCRIPTION_TIMEOUT_MS = 3000;

// Building and serializing a whole-world snapshot every frame is by far the
// most expensive thing the engine can do (measured at ~11 ms/frame with 1,000
// entities — roughly 40x a normal frame). It used to run unconditionally
// whenever debug was on, because the backend opens a BroadcastChannel
// successfully whether or not anything is listening on the other end.
//
// Streaming is now opt-in: the workspace announces itself, and the game only
// pays the cost while a workspace is actually subscribed.
export const DEBUG_SUBSCRIBE = "debug:subscribe";
export const DEBUG_UNSUBSCRIBE = "debug:unsubscribe";

function _commandName(payload) {
  if (typeof payload === "string") return payload;
  if (payload && typeof payload.name === "string") return payload.name;
  return null;
}

export function enableDebugWorkspace(game, backend) {
<<<<<<< HEAD
  if (game._debugBackend) return;
  const bk = backend || new BrowserDebugBackend();
  const builder = new SnapshotBuilder();
  game._debugBackend = bk;
  game._snapshotBuilder = builder;
  game._debugSubscribedAt = 0;
  bk.open();
  bk.onMessage((msg) => {
    if (!msg || msg.type !== "command") return;
    const cmd = _commandName(msg.payload);
    if (cmd === null) return;
    if (cmd === DEBUG_SUBSCRIBE) game._debugSubscribedAt = _now();
    else if (cmd === DEBUG_UNSUBSCRIBE) game._debugSubscribedAt = 0;
    else if (cmd === "debug:pause") game.pause();
    else if (cmd === "debug:resume") game.resume();
    else if (cmd === "debug:stepFrame") game.stepFrame();
    else if (cmd === "debug:togglePause") game.togglePause();
  });
}

function _now() {
  return typeof performance !== "undefined" && performance.now
    ? performance.now()
    : Date.now();
}

// True only while a workspace has announced itself recently. Game._frame
// checks this before doing any snapshot work.
export function isDebugStreaming(game) {
  if (!game || !game._debugSubscribedAt) return false;
  return (_now() - game._debugSubscribedAt) < DEBUG_SUBSCRIPTION_TIMEOUT_MS;
}

export function takeDebugSnapshot(game) {
  const builder = game._snapshotBuilder;
  const backend = game._debugBackend;
  if (!builder || !backend) return;
  if (!isDebugStreaming(game)) return;

  const top = game.scene;
  if (top && top.world && !builder._worlds.has("main")) {
    builder.registerWorld("main", top.world);
  }
  const diag = typeof game._getDiag === "function" ? game._getDiag() : null;
  if (diag && diag.metrics) {
    builder.setupMetricDescriptors(diag.metrics);
  }
  const diagSnap = diag ? diag.lastSnapshot : null;
  const snap = builder.build(game._frameCount, performance.now(), diagSnap);
  backend.send(snap.toJSON());
  builder.release(snap);
=======
  if (game.debugSession) return;

  const session = new DebugSession(backend || new BrowserDebugBackend());
  game.debugSession = session;
  session.open();

  const controls = game.debugControls;
  session.backend.onMessage((msg) => {
    if (!msg || msg.type !== "command") return;
    const cmd = _commandName(msg.payload);
    if (cmd === null) return;
    if (cmd === DEBUG_SUBSCRIBE) session.subscribe();
    else if (cmd === DEBUG_UNSUBSCRIBE) session.unsubscribe();
    else if (cmd === "debug:pause") controls.pause();
    else if (cmd === "debug:resume") controls.resume();
    else if (cmd === "debug:stepFrame") controls.stepFrame();
    else if (cmd === "debug:togglePause") controls.togglePause();
  });
}

// True only while a workspace has announced itself recently. Game checks this
// before doing any snapshot work.
export function isDebugStreaming(game) {
  return !!(game && game.debugSession && game.debugSession.shouldStream());
}

export function takeDebugSnapshot(game) {
  const session = game.debugSession;
  if (!session) return;
  session.capture(game.debugControls);
>>>>>>> 07d6ec7 (refactor: add host abstraction, scene stack/context and renderer host; make debug streaming opt-in)
}
