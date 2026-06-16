export class AudioBackend {
  createPlayback(asset, effectChain, groupName) {
    throw new Error("AudioBackend#createPlayback must be overridden");
  }

  setGroupVolume(name, value) {}
  setMasterVolume(value) {}
  setListenerPosition(x, y) {}

  _connectGroupEffectChain(groupName, chain) {}
  _connectMasterEffectChain(chain) {}

  unlock() {}
  suspend() {}
  resume() {}
  destroy() {}

  get supportsGroupGain() { return false; }
}
