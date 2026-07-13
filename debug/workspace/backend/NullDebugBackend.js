import { DebugBackend } from "./DebugBackend.js";

export class NullDebugBackend extends DebugBackend {
  get connected() { return false; }
  get latency() { return 0; }
}
