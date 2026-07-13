export class CaptureResult {
  constructor({ name, timestamp, preFrames, postFrames, snapshots, registry }) {
    this.name = name;
    this.timestamp = timestamp;
    this.preFrames = preFrames;
    this.postFrames = postFrames;
    this.snapshots = snapshots;
    this.metrics = registry;
  }

  toJSON() {
    return {
      name: this.name,
      timestamp: this.timestamp,
      preFrames: this.preFrames,
      postFrames: this.postFrames,
      frameCount: this.snapshots.length,
      snapshots: this.snapshots.map(s => ({
        frame: s.frame,
        timestamp: s.timestamp,
        delta: s.delta,
      })),
    };
  }
}
