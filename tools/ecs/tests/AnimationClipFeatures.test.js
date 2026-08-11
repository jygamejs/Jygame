import { describe, it } from "node:test";
import * as assert from "node:assert";
import { AnimationClip } from "../../../ecs/animation/AnimationClip.js";

// Frames are asset ids; letters here are only used to make expectations readable.
const A = 100, B = 101, C = 102, D = 103, E = 104;

describe("AnimationClip — sequence", () => {
  it("plays extracted frames in identity order by default", () => {
    const clip = new AnimationClip({ frames: [A, B, C, D], fps: 10 });
    assert.deepStrictEqual(clip.frames, [A, B, C, D]);
    assert.strictEqual(clip.frameCount, 4);
  });

  it("applies an arbitrary sequence against source frames", () => {
    const clip = new AnimationClip({ frames: [A, B, C, D], fps: 10, sequence: [2, 1, 2, 3] });
    assert.deepStrictEqual(clip.frames, [C, B, C, D]);
  });

  it("supports repeated source frames", () => {
    const clip = new AnimationClip({ frames: [A, B, C], fps: 10, sequence: [0, 1, 0] });
    assert.deepStrictEqual(clip.frames, [A, B, A]);
  });

  it("supports a reversed sequence", () => {
    const clip = new AnimationClip({ frames: [A, B, C, D], fps: 10, sequence: [3, 2, 1, 0] });
    assert.deepStrictEqual(clip.frames, [D, C, B, A]);
  });

  it("repeated positions across a longer timeline", () => {
    const clip = new AnimationClip({ frames: [A, B, C, D, E], fps: 10, sequence: [0, 1, 2, 2, 2, 3, 4] });
    assert.deepStrictEqual(clip.frames, [A, B, C, C, C, D, E]);
    assert.strictEqual(clip.frameCount, 7);
  });

  it("frames getter returns the normalized playback list", () => {
    const clip = new AnimationClip({ frames: [A, B, C], fps: 10, sequence: [2, 0, 2] });
    assert.deepStrictEqual(clip.frames, [C, A, C]);
    assert.notDeepStrictEqual(clip.frames, [A, B, C]);
  });

  it("aligns timing to the sequenced playback length", () => {
    const clip = new AnimationClip({
      frames: [A, B, C],
      fps: 10,
      sequence: [0, 1, 0],
      timing: [0.1, 0.2, 0.3],
    });
    assert.strictEqual(clip.frameCount, 3);
    assert.strictEqual(clip.frameDurationAt(0), 0.1);
    assert.strictEqual(clip.frameDurationAt(1), 0.2);
    assert.strictEqual(clip.frameDurationAt(2), 0.3);
  });

  it("explicit sequence takes precedence over pingPong", () => {
    const clip = new AnimationClip({
      frames: [A, B, C],
      fps: 10,
      sequence: [1, 0],
      pingPong: true,
    });
    assert.deepStrictEqual(clip.frames, [B, A]);
  });
});

describe("AnimationClip — pingPong", () => {
  it("one frame stays unchanged", () => {
    const clip = new AnimationClip({ frames: [A], fps: 10, pingPong: true });
    assert.deepStrictEqual(clip.frames, [A]);
  });

  it("two frames produce A B A", () => {
    const clip = new AnimationClip({ frames: [A, B], fps: 10, pingPong: true });
    assert.deepStrictEqual(clip.frames, [A, B, A]);
  });

  it("three frames produce A B C B", () => {
    const clip = new AnimationClip({ frames: [A, B, C], fps: 10, pingPong: true });
    assert.deepStrictEqual(clip.frames, [A, B, C, B]);
  });

  it("four frames produce A B C D C B", () => {
    const clip = new AnimationClip({ frames: [A, B, C, D], fps: 10, pingPong: true });
    assert.deepStrictEqual(clip.frames, [A, B, C, D, C, B]);
  });

  it("pingPong defaults to false (identity playback)", () => {
    const clip = new AnimationClip({ frames: [A, B, C], fps: 10 });
    assert.deepStrictEqual(clip.frames, [A, B, C]);
  });
});

describe("AnimationClip — timing", () => {
  it("uses uniform FPS when no timing is supplied", () => {
    const clip = new AnimationClip({ frames: [A, B, C, D], fps: 8 });
    assert.strictEqual(clip.timing, null);
    assert.strictEqual(clip.frameDurationAt(0), 0.125);
    assert.strictEqual(clip.frameDurationAt(3), 0.125);
  });

  it("exposes per-position durations and the summed duration", () => {
    const clip = new AnimationClip({ frames: [A, B, C], fps: 10, timing: [0.125, 0.25, 0.5] });
    assert.deepStrictEqual(clip.timing, [0.125, 0.25, 0.5]);
    assert.strictEqual(clip.frameDurationAt(0), 0.125);
    assert.strictEqual(clip.frameDurationAt(1), 0.25);
    assert.strictEqual(clip.frameDurationAt(2), 0.5);
    assert.strictEqual(clip.duration, 0.875);
  });

  it("keeps duration as frameCount / fps for uniform clips", () => {
    const clip = new AnimationClip({ frames: [A, B, C], fps: 10 });
    assert.strictEqual(clip.duration, 0.3);
  });

  it("allows the same source frame to appear with different durations", () => {
    const clip = new AnimationClip({
      frames: [A, B, C],
      fps: 10,
      sequence: [0, 1, 0],
      timing: [0.1, 0.2, 0.3],
    });
    assert.strictEqual(clip.frames[0], A);
    assert.strictEqual(clip.frames[2], A);
    assert.strictEqual(clip.frameDurationAt(0), 0.1);
    assert.strictEqual(clip.frameDurationAt(2), 0.3);
  });
});

describe("AnimationClip — frameAt / timeAt", () => {
  function closeTo(actual, expected, eps = 1e-9) {
    assert.ok(Math.abs(actual - expected) < eps, `${actual} ~= ${expected}`);
  }

  it("decodes uniform cumulative time", () => {
    const clip = new AnimationClip({ frames: [A, B, C], fps: 10 });
    assert.strictEqual(clip.frameAt(0), 0);
    assert.strictEqual(clip.frameAt(0.05), 0);
    assert.strictEqual(clip.frameAt(0.1), 1);
    assert.strictEqual(clip.frameAt(0.25), 2);
    assert.strictEqual(clip.frameAt(0.4), 4); // past the end of a 3-frame clip
  });

  it("decodes uniform time with loop wrap", () => {
    const clip = new AnimationClip({ frames: [A, B, C], fps: 10 });
    assert.strictEqual(clip.frameAt(0.2, true), 2); // 2 % 3
    assert.strictEqual(clip.frameAt(0.4, true), 1); // 4 % 3
    assert.strictEqual(clip.frameAt(0.5, true), 2); // 5 % 3
  });

  it("decodes uniform time for very large elapsed values", () => {
    const clip = new AnimationClip({ frames: [A, B], fps: 10 });
    assert.strictEqual(clip.frameAt(100000, true), 0); // 1e6 % 2
  });

  it("decodes custom-timing cumulative time", () => {
    const clip = new AnimationClip({ frames: [A, B, C], fps: 10, timing: [0.125, 0.25, 0.5] });
    assert.strictEqual(clip.frameAt(0), 0);
    assert.strictEqual(clip.frameAt(0.05), 0);
    assert.strictEqual(clip.frameAt(0.125), 1);
    assert.strictEqual(clip.frameAt(0.2), 1);
    assert.strictEqual(clip.frameAt(0.375), 2);
    assert.strictEqual(clip.frameAt(0.5), 2);
    assert.strictEqual(clip.frameAt(0.874), 2);
    assert.strictEqual(clip.frameAt(0.875), 3); // past the end
    assert.strictEqual(clip.frameAt(1.0), 3);   // past the end
  });

  it("decodes custom-timing time with loop wrap", () => {
    const clip = new AnimationClip({ frames: [A, B, C], fps: 10, timing: [0.125, 0.25, 0.5] });
    assert.strictEqual(clip.frameAt(1.0, true), 1);  // 1.0 % 0.875 = 0.125
    assert.strictEqual(clip.frameAt(1.75, true), 0); // 1.75 % 0.875 = 0
    assert.strictEqual(clip.frameAt(0.875, true), 0); // exact boundary wraps
  });

  it("clamps negative elapsed to position 0", () => {
    const uniform = new AnimationClip({ frames: [A, B, C], fps: 10 });
    const timed = new AnimationClip({ frames: [A, B, C], fps: 10, timing: [0.1, 0.2, 0.5] });
    assert.strictEqual(uniform.frameAt(-0.5), 0);
    assert.strictEqual(timed.frameAt(-0.5), 0);
  });

  it("timeAt locates position start times on the uniform timeline", () => {
    const clip = new AnimationClip({ frames: [A, B, C], fps: 10 });
    assert.strictEqual(clip.timeAt(0), 0);
    assert.strictEqual(clip.timeAt(1), 0.1);
    assert.strictEqual(clip.timeAt(2), 0.2);
    closeTo(clip.timeAt(3), 0.3);
  });

  it("timeAt locates position start times on a custom timeline", () => {
    const clip = new AnimationClip({ frames: [A, B, C], fps: 10, timing: [0.125, 0.25, 0.5] });
    assert.strictEqual(clip.timeAt(0), 0);
    assert.strictEqual(clip.timeAt(1), 0.125);
    assert.strictEqual(clip.timeAt(2), 0.375);
    assert.strictEqual(clip.timeAt(3), 0.875);
  });
});

describe("AnimationClip — markers", () => {
  it("exposes null markers when none are defined", () => {
    const clip = new AnimationClip({ frames: [A, B, C], fps: 10 });
    assert.strictEqual(clip.markers, null);
  });

  it("maps marker names to playback positions", () => {
    const clip = new AnimationClip({ frames: [A, B, C, D, E], fps: 10, markers: { airborne: 2, landing: 4 } });
    assert.strictEqual(clip.markers.airborne, 2);
    assert.strictEqual(clip.markers.landing, 4);
  });

  it("supports markers at the first and final playback positions", () => {
    const clip = new AnimationClip({ frames: [A, B, C, D], fps: 10, markers: { start: 0, end: 3 } });
    assert.strictEqual(clip.markers.start, 0);
    assert.strictEqual(clip.markers.end, 3);
  });

  it("indexes markers against the playback timeline, not source frames", () => {
    const clip = new AnimationClip({
      frames: [A, B, C, D, E],
      fps: 10,
      sequence: [0, 1, 2, 2, 2, 3, 4],
      markers: { airborne: 2, landing: 6 },
    });
    assert.strictEqual(clip.markers.airborne, 2);
    assert.strictEqual(clip.markers.landing, 6);
    // Both markers may display the same source frame but are distinct positions.
    assert.strictEqual(clip.frames[2], C);
    assert.strictEqual(clip.frames[6], E);
    assert.notStrictEqual(clip.markers.airborne, clip.markers.landing);
  });

  it("is a frozen, non-mutating map", () => {
    const clip = new AnimationClip({ frames: [A, B, C], fps: 10, markers: { hit: 1 } });
    assert.ok(Object.isFrozen(clip.markers));
    assert.throws(() => { "use strict"; clip.markers.hit = 9; }, TypeError);
  });
});

describe("AnimationClip — validation", () => {
  it("rejects a non-array sequence", () => {
    assert.throws(() => new AnimationClip({ frames: [A, B], fps: 10, sequence: 5 }), TypeError);
  });

  it("rejects an empty sequence", () => {
    assert.throws(() => new AnimationClip({ frames: [A, B], fps: 10, sequence: [] }), /non-empty array/);
  });

  it("rejects non-integer sequence values", () => {
    assert.throws(() => new AnimationClip({ frames: [A, B, C], fps: 10, sequence: [0, 1.5] }), RangeError);
    assert.throws(() => new AnimationClip({ frames: [A, B, C], fps: 10, sequence: ["1"] }), RangeError);
  });

  it("rejects sequence indices out of source range", () => {
    assert.throws(() => new AnimationClip({ frames: [A, B, C], fps: 10, sequence: [0, 99] }), RangeError);
    assert.throws(() => new AnimationClip({ frames: [A, B, C], fps: 10, sequence: [-1, 0] }), RangeError);
  });

  it("rejects a non-boolean pingPong", () => {
    assert.throws(() => new AnimationClip({ frames: [A, B], fps: 10, pingPong: 1 }), TypeError);
  });

  it("rejects a non-array timing", () => {
    assert.throws(() => new AnimationClip({ frames: [A, B, C], fps: 10, timing: 0.1 }), TypeError);
  });

  it("rejects a timing length that does not match the playback length", () => {
    assert.throws(() => new AnimationClip({ frames: [A, B, C], fps: 10, timing: [] }), /length/);
    assert.throws(() => new AnimationClip({ frames: [A, B, C], fps: 10, timing: [0.1] }), /length/);
    assert.throws(() => new AnimationClip({ frames: [A, B, C], fps: 10, timing: [0.1, 0.1, 0.1, 0.1] }), /length/);
  });

  it("rejects non-positive timing values", () => {
    assert.throws(() => new AnimationClip({ frames: [A, B, C], fps: 10, timing: [0, 0.2, 0.3] }), RangeError);
    assert.throws(() => new AnimationClip({ frames: [A, B, C], fps: 10, timing: [-1, 0.2, 0.3] }), RangeError);
  });

  it("rejects non-finite timing values", () => {
    assert.throws(() => new AnimationClip({ frames: [A, B, C], fps: 10, timing: [Infinity, 0.2, 0.3] }), RangeError);
    assert.throws(() => new AnimationClip({ frames: [A, B, C], fps: 10, timing: [NaN, 0.2, 0.3] }), RangeError);
    assert.throws(() => new AnimationClip({ frames: [A, B, C], fps: 10, timing: ["0.1", 0.2, 0.3] }), RangeError);
  });

  it("rejects markers that are not an object", () => {
    assert.throws(() => new AnimationClip({ frames: [A, B], fps: 10, markers: 5 }), TypeError);
    assert.throws(() => new AnimationClip({ frames: [A, B], fps: 10, markers: [] }), TypeError);
  });

  it("rejects empty marker names", () => {
    assert.throws(() => new AnimationClip({ frames: [A, B], fps: 10, markers: { "": 0 } }), /non-empty string/);
  });

  it("rejects marker positions out of playback range", () => {
    assert.throws(() => new AnimationClip({ frames: [A, B, C], fps: 10, markers: { airborne: 99 } }), RangeError);
    assert.throws(() => new AnimationClip({ frames: [A, B, C], fps: 10, markers: { airborne: -1 } }), RangeError);
    assert.throws(() => new AnimationClip({ frames: [A, B, C], fps: 10, markers: { airborne: 2.5 } }), RangeError);
  });
});

describe("AnimationClip — immutability", () => {
  it("frames getter returns the frozen normalized playback list", () => {
    const clip = new AnimationClip({ frames: [A, B, C], fps: 10, sequence: [2, 0, 1] });
    assert.ok(Object.isFrozen(clip.frames));
    assert.deepStrictEqual(clip.frames, [C, A, B]);
  });

  it("clip remains frozen", () => {
    const clip = new AnimationClip({ frames: [A], fps: 10 });
    assert.ok(Object.isFrozen(clip));
  });

  it("preserves fps and loop", () => {
    const clip = new AnimationClip({ frames: [A, B], fps: 12, loop: false });
    assert.strictEqual(clip.fps, 12);
    assert.strictEqual(clip.loop, false);
  });
});
