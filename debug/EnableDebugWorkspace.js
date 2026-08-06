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

export function enableDebugWorkspace(game, backend) {
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
}
