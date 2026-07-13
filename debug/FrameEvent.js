export class FrameEvent {
  constructor(frame, timestamp, category, name, metadata) {
    this.frame = frame;
    this.timestamp = timestamp;
    this.category = category;
    this.name = name;
    this.metadata = metadata || null;
  }
}
