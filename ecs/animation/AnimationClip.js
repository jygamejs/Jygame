export class AnimationClip {
  constructor({ frames, fps, loop = true, sequence, timing, pingPong, markers } = {}) {
    if (!Array.isArray(frames) || frames.length === 0) {
      throw new TypeError(
        `AnimationClip constructor failed: frames must be a non-empty array, got ${JSON.stringify(frames)}.`
      );
    }
    if (typeof fps !== "number" || !Number.isFinite(fps) || fps <= 0) {
      throw new TypeError(
        `AnimationClip constructor failed: fps must be a positive finite number, got ${fps}.`
      );
    }
    if (typeof loop !== "boolean") {
      throw new TypeError(
        `AnimationClip constructor failed: loop must be a boolean, got ${typeof loop}.`
      );
    }
    if (pingPong !== undefined && pingPong !== null && typeof pingPong !== "boolean") {
      throw new TypeError(
        `AnimationClip constructor failed: pingPong must be a boolean, got ${typeof pingPong}.`
      );
    }

    // Playback order normalization. `sequence` indexes the extracted source
    // frame list; when absent, `pingPong` is a convenience shorthand. Explicit
    // sequence always wins.
    let playback = frames;
    if (sequence !== undefined && sequence !== null) {
      if (!Array.isArray(sequence) || sequence.length === 0) {
        throw new TypeError(
          `AnimationClip constructor failed: sequence must be a non-empty array, got ${JSON.stringify(sequence)}.`
        );
      }
      for (let i = 0; i < sequence.length; i++) {
        const index = sequence[i];
        if (!Number.isInteger(index) || index < 0 || index >= frames.length) {
          throw new RangeError(
            `AnimationClip constructor failed: sequence[${i}] = ${index} is out of range; ` +
            `it must be an integer in [0, ${frames.length - 1}] referencing a source frame.`
          );
        }
      }
      playback = sequence.map((i) => frames[i]);
    } else if (pingPong) {
      const n = frames.length;
      if (n > 2) {
        playback = [...frames, ...frames.slice(1, -1).reverse()];
      } else if (n === 2) {
        playback = [frames[0], frames[1], frames[0]];
      }
    }

    const frameCount = playback.length;

    // Per-playback-position durations. `timing` is optional; without it every
    // position uses the uniform `1 / fps` model. The array must match the
    // normalized playback length exactly.
    let durations = null;
    if (timing !== undefined && timing !== null) {
      if (!Array.isArray(timing)) {
        throw new TypeError(
          `AnimationClip constructor failed: timing must be an array, got ${typeof timing}.`
        );
      }
      if (timing.length !== frameCount) {
        throw new RangeError(
          `AnimationClip constructor failed: timing length ${timing.length} does not match ` +
          `the normalized playback length ${frameCount}.`
        );
      }
      const copy = timing.slice();
      for (let i = 0; i < copy.length; i++) {
        const value = copy[i];
        if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
          throw new RangeError(
            `AnimationClip constructor failed: timing[${i}] = ${value} must be a finite positive number.`
          );
        }
      }
      durations = Object.freeze(copy);
    }

    // Markers name positions on the normalized playback timeline.
    let markersObj = null;
    if (markers !== undefined && markers !== null) {
      if (typeof markers !== "object" || markers === null || Array.isArray(markers)) {
        throw new TypeError(
          `AnimationClip constructor failed: markers must be an object, got ${JSON.stringify(markers)}.`
        );
      }
      const normalized = {};
      for (const name of Object.keys(markers)) {
        if (name.length === 0) {
          throw new TypeError(
            "AnimationClip constructor failed: marker names must be non-empty strings."
          );
        }
        const position = markers[name];
        if (!Number.isInteger(position) || position < 0 || position >= frameCount) {
          throw new RangeError(
            `AnimationClip constructor failed: marker "${name}" position ${position} is out of range; ` +
            `it must be an integer in [0, ${frameCount - 1}] referencing a playback position.`
          );
        }
        normalized[name] = position;
      }
      markersObj = Object.freeze(normalized);
    }

    // Prefix-sum timeline used to locate playback positions in time and to
    // compute the total duration. Only allocated for custom-timing clips.
    let timeAt = null;
    if (durations !== null) {
      timeAt = new Float64Array(frameCount + 1);
      let acc = 0;
      for (let i = 0; i < frameCount; i++) {
        acc += durations[i];
        timeAt[i + 1] = acc;
      }
    }

    this._frames = Object.freeze(playback.slice());
    this._fps = fps;
    this._loop = loop;
    this._durations = durations;
    this._timeAt = timeAt;
    this._markers = markersObj;
    Object.freeze(this);
  }

  get frames() {
    return this._frames;
  }

  get fps() {
    return this._fps;
  }

  get loop() {
    return this._loop;
  }

  get frameCount() {
    return this._frames.length;
  }

  get frameDuration() {
    return 1 / this._fps;
  }

  // Normalized per-playback-position durations, or null for uniform FPS.
  get timing() {
    return this._durations;
  }

  // Normalized marker map (name → playback position), or null.
  get markers() {
    return this._markers;
  }

  get duration() {
    if (this._durations !== null) {
      return this._timeAt[this._timeAt.length - 1];
    }
    return this.frameCount / this._fps;
  }

  // How long playback position `index` stays visible.
  frameDurationAt(index) {
    return this._durations !== null ? this._durations[index] : this.frameDuration;
  }

  // Time at which playback position `position` begins (cumulative timeline).
  timeAt(position) {
    if (this._durations !== null) {
      return this._timeAt[position];
    }
    return position * this.frameDuration;
  }

  // Decode cumulative elapsed playback time into a playback position index.
  // `wrap` applies the looping wrap; without it the result may equal
  // `frameCount`, meaning "past the end". Negative elapsed is clamped to 0.
  frameAt(elapsed, wrap = false) {
    if (elapsed < 0) elapsed = 0;

    if (this._durations === null) {
      const frame = Math.floor(elapsed / this.frameDuration);
      return wrap ? frame % this.frameCount : frame;
    }

    const t = wrap ? elapsed % this.duration : elapsed;
    const timeAt = this._timeAt;
    const n = this.frameCount;
    let frame = 0;
    while (frame < n && timeAt[frame + 1] <= t) {
      frame++;
    }
    return frame;
  }
}
