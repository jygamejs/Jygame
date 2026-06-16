export class AudioScene {
  constructor(manager) {
    this._manager = manager;
    this._snapshot = null;
  }

  save() {
    const manager = this._manager;
    const snapshot = {
      master: {
        volume: manager.masterVolume,
        muted: manager.masterMuted,
      },
      groups: {},
      music: this._captureMusicState(manager),
      sounds: [],
    };

    manager.forEachGroup((group, name) => {
      snapshot.groups[name] = {
        volume: group.volume,
        muted: group.muted,
      };
    });

    this._captureSounds(manager, snapshot.sounds);

    this._snapshot = snapshot;
    return snapshot;
  }

  _captureMusicState(manager) {
    const musicStates = [];
    manager.forEachMusic((music, key) => {
      if (music._playback) {
        musicStates.push({
          key,
          playing: !music._playback.paused && !music._playback.ended,
          currentTime: music._playback.currentTime,
          volume: music._volume,
          loop: music._loop,
        });
      }
    });
    return musicStates;
  }

  _captureSounds(manager, target) {
    manager.forEachSound((sound, key) => {
      if (!sound._persistent) return;
      const instances = sound._activeInstances;
      if (instances.length > 0) {
        for (let i = 0; i < instances.length; i++) {
          const inst = instances[i];
          target.push({
            key,
            soundVolume: sound._volume,
            group: sound._groupName,
            playing: !inst.paused && !inst.ended,
            instanceVolume: inst._volume,
            currentTime: inst.currentTime,
            loop: inst.loop,
            overrideGroup: inst._overrideGroup,
            spatial: inst._spatial,
            x: inst._x,
            y: inst._y,
            minDistance: inst._minDistance,
            maxDistance: inst._maxDistance,
          });
        }
      } else {
        target.push({
          key,
          soundVolume: sound._volume,
          group: sound._groupName,
          playing: false,
          instanceVolume: 1,
          currentTime: 0,
          loop: false,
          overrideGroup: null,
          spatial: false,
          x: 0,
          y: 0,
          minDistance: 32,
          maxDistance: 512,
        });
      }
    });
  }

  restore() {
    if (!this._snapshot) return;
    const manager = this._manager;
    const snapshot = this._snapshot;

    manager.masterMuted = snapshot.master.muted;
    manager.masterVolume = snapshot.master.volume;

    for (const [name, state] of Object.entries(snapshot.groups)) {
      const group = manager.group(name);
      group.volume = state.volume;
      group.muted = state.muted;
    }

    this._restoreMusic(snapshot.music);
    this._restoreSounds(snapshot.sounds);

    manager._notifyAllSoundsVolumeChange();
  }

  _restoreMusic(musicStates) {
    const manager = this._manager;
    manager.forEachMusic((music) => music.stop());

    for (const state of musicStates) {
      const music = manager.getMusic(state.key);
      if (!music) continue;
      music.volume = state.volume;
      music.loop = state.loop;
      if (state.playing) {
        music.play();
        music.currentTime = state.currentTime;
      }
    }
  }

  _restoreSounds(soundStates) {
    const manager = this._manager;
    for (const data of soundStates) {
      const sound = manager.getSound(data.key);
      if (!sound) continue;

      sound._volume = data.soundVolume;
      sound._groupName = data.group;
      sound._stopAll();

      if (data.playing) {
        const options = {};
        if (data.overrideGroup) options.group = data.overrideGroup;
        if (data.spatial) {
          options.x = data.x;
          options.y = data.y;
          options.spatial = true;
          options.minDistance = data.minDistance;
          options.maxDistance = data.maxDistance;
        }

        const instance = sound.play(options);
        if (instance) {
          instance._volume = data.instanceVolume;
          instance.currentTime = data.currentTime;
          instance.loop = data.loop;
          instance._applyVolume();
        }
      }
    }
  }

  forEachSound(fn) {
    if (!this._snapshot) return;
    const manager = this._manager;
    for (const data of this._snapshot.sounds) {
      const sound = manager.getSound(data.key);
      if (sound) fn(data, sound);
    }
  }
}
