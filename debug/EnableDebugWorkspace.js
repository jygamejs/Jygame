import { SnapshotBuilder } from "./snapshots/SnapshotBuilder.js";
import { BrowserDebugBackend } from "./workspace/backend/BrowserDebugBackend.js";

export function enableDebugWorkspace(game, backend) {
  const bk = backend || new BrowserDebugBackend();
  const builder = new SnapshotBuilder();
  game._debugBackend = bk;
  game._snapshotBuilder = builder;
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
  const diagSnap = diag ? diag.lastSnapshot : null;
  const snap = builder.build(game._frameCount, performance.now(), diagSnap);
  backend.send(snap.toJSON());
  builder.release(snap);
}
