import { AudioEffect } from "./AudioEffect.js";

export class DelayEffect extends AudioEffect {
  constructor(options = {}) {
    super();
    this._time = options.time ?? 0.3;
    this._feedback = options.feedback ?? 0.3;
    this._wet = options.wet ?? 0.5;

    this._delayNode = null;
    this._feedbackGain = null;
    this._dryGain = null;
    this._wetGain = null;
    this._output = null;
    this._inputConnected = null;
  }

  connect(inputNode, context) {
    this._inputConnected = inputNode;

    this._dryGain = context.createGain();
    this._dryGain.gain.value = 1;

    this._delayNode = context.createDelay(5);
    this._delayNode.delayTime.value = this._time;

    this._feedbackGain = context.createGain();
    this._feedbackGain.gain.value = this._feedback;

    this._wetGain = context.createGain();
    this._wetGain.gain.value = this._wet;

    this._output = context.createGain();

    inputNode.connect(this._dryGain);
    inputNode.connect(this._delayNode);

    this._delayNode.connect(this._feedbackGain);
    this._feedbackGain.connect(this._delayNode);

    this._delayNode.connect(this._wetGain);

    this._dryGain.connect(this._output);
    this._wetGain.connect(this._output);

    return this._output;
  }

  disconnect() {
    if (this._dryGain) this._dryGain.disconnect();
    if (this._wetGain) this._wetGain.disconnect();
    if (this._delayNode) this._delayNode.disconnect();
    if (this._feedbackGain) this._feedbackGain.disconnect();
    if (this._output) this._output.disconnect();
    this._dryGain = null;
    this._wetGain = null;
    this._delayNode = null;
    this._feedbackGain = null;
    this._output = null;
    this._inputConnected = null;
  }

  _applyParam(key) {
    if (!this._delayNode) return;
    if (key === "time") this._delayNode.delayTime.value = this._time;
    if (key === "feedback" && this._feedbackGain) this._feedbackGain.gain.value = this._feedback;
    if (key === "wet" && this._wetGain) this._wetGain.gain.value = this._wet;
  }
}
