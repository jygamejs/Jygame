import { SnapshotBuilder } from "./snapshots/SnapshotBuilder.js";

// How long a subscription survives without a heartbeat. The workspace
// re-announces on an interval, so if its window is closed or crashes the game
// stops streaming on its own — no unsubscribe message required.
export const DEBUG_SUBSCRIPTION_TIMEOUT_MS = 3000;

export const DEBUG_SUBSCRIBE = "debug:subscribe";
export const DEBUG_UNSUBSCRIBE = "debug:unsubscribe";

function _now() {
  return typeof performance !== "undefined" && performance.now
    ? performance.now()
    : Date.now();
}

// Owns everything the debug workspace connection needs: the transport, the
// snapshot builder, and whether anyone is currently listening.
//
// This used to live as four loose private fields on Game (_debugBackend,
// _snapshotBuilder, _debugSubscribedAt, plus _getDiag), which the debug layer
// reached into directly. That made Game's private surface part of the debug
// contract — every refactor of Game risked silently breaking debug. The
// session is now the contract, and Game holds one reference to it.
export class DebugSession {
  constructor(backend, { builder = null, now = _now } = {}) {
    this.backend = backend;
    this.builder = builder || new SnapshotBuilder();
    this._subscribedAt = 0;
    this._now = now;
  }

  open() {
    if (this.backend) this.backend.open();
  }

  close() {
    if (this.backend) this.backend.close();
    this._subscribedAt = 0;
  }

  subscribe() {
    this._subscribedAt = this._now();
  }

  unsubscribe() {
    this._subscribedAt = 0;
  }

  // True only while a workspace has announced itself recently. Checked every
  // frame, so it stays a timestamp comparison.
  shouldStream() {
    if (!this._subscribedAt) return false;
    return (this._now() - this._subscribedAt) < DEBUG_SUBSCRIPTION_TIMEOUT_MS;
  }

  get subscribedAt() { return this._subscribedAt; }
  set subscribedAt(v) { this._subscribedAt = v; }

  // Builds and sends one snapshot. `controls` is the small surface the debug
  // layer needs from the game: see Game's `debugControls`.
  capture(controls) {
    if (!this.builder || !this.backend) return false;
    if (!this.shouldStream()) return false;

    const scene = controls.scene;
    if (scene && scene.world && !this.builder._worlds.has("main")) {
      this.builder.registerWorld("main", scene.world);
    }

    const diag = controls.diagnostics;
    if (diag && diag.metrics) {
      this.builder.setupMetricDescriptors(diag.metrics);
    }

    const snap = this.builder.build(
      controls.frameNumber,
      _now(),
      diag ? diag.lastSnapshot : null,
    );
    this.backend.send(snap.toJSON());
    this.builder.release(snap);
    return true;
  }
}
