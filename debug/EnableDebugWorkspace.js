import { SnapshotBuilder } from "./snapshots/SnapshotBuilder.js";
import { BrowserDebugBackend } from "./workspace/backend/BrowserDebugBackend.js";

export function enableDebugWorkspace(game, backend) {
  if (game._debugBackend) return;
  const bk = backend || new BrowserDebugBackend();
  const builder = new SnapshotBuilder();
  game._debugBackend = bk;
  game._snapshotBuilder = builder;
  bk.open();
  bk.onMessage((msg) => {
    if (!msg || msg.type !== "command") return;
    const cmd = msg.payload;
    if (cmd === "debug:pause") game.pause();
    else if (cmd === "debug:resume") game.resume();
    else if (cmd === "debug:stepFrame") game.stepFrame();
    else if (cmd === "debug:togglePause") game.togglePause();
  });
}

export function takeDebugSnapshot(game) {
  const builder = game._snapshotBuilder;
  const backend = game._debugBackend;
  if (!builder || !backend) return;

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
}
