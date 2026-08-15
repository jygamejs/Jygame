# JYGame Animation System — Sequence, Timing, and Markers

## Objective

Extend JYGame's animation system with three related capabilities:

1. **`sequence`** — explicitly control the order in which source frames are played.
2. **`timing`** — control how long each frame in the resulting playback sequence remains visible.
3. **`markers`** — give semantic names to important positions in an animation and allow playback to stop at or play until those positions.

These features should be designed as one coherent system rather than three unrelated additions.

The most important requirement is that **markers must affect playback behavior**.

A marker is not merely metadata such as `"airborne": 2`. It represents a meaningful point in the animation timeline that the playback controller can target.

The motivating use case is a character jump animation.

```text
jump animation:

0 → anticipation
1 → takeoff
2 → airborne
3 → descending
4 → landing
```

Gameplay may want:

```text
jump starts
    ↓
play 0 → 1 → 2
            ↓
         STOP HERE
            ↓
player remains airborne
            ↓
player starts falling
            ↓
resume
            ↓
3 → 4
```

The animation must therefore be capable of stopping at `"airborne"` automatically.

The programmer should not need to write:

```js
if (animation.frame === 2) {
    animation.pause();
}
```

and should not need to maintain another `jumping`/`airborne` animation state merely to synchronize the animation.

The intended API should allow:

```js
king.animation.playUntil("airborne");
```

or:

```js
king.animation.pauseAt("airborne");
```

followed later by:

```js
king.animation.resume();
```

The animation controller owns the playback position and knows exactly where the marker occurs.

---

# 1. `sequence`

Add an optional `sequence` property to animation definitions.

Its purpose is to control **frame order**, independently from how source frames are discovered.

Example:

```js
slash: {
    frames: 3,
    sequence: [1, 0, 1, 2],
}
```

This means:

```text
source frames:
0  1  2

playback:
1  0  1  2
```

This is useful for animation choreography such as:

> "SLASH: frames 11, 12, 13 — you might use them in the order 12, 11, 12, 13 if you want an extra preparation frame."

The important distinction is:

* `frames` / source extraction determines **which source frames exist**
* `sequence` determines **which frame is displayed at each playback position**

Do not make `sequence` contain global sprite-sheet coordinates.

Use indices relative to the animation's extracted frame list.

For example:

```js
{
    row: 1,
    from: 10,
    to: 12,
    sequence: [1, 0, 1, 2],
}
```

means:

```text
extracted:
index 0 → sheet frame 10
index 1 → sheet frame 11
index 2 → sheet frame 12

sequence:
1 → 0 → 1 → 2
```

This keeps `sequence` independent of the asset source.

It must work consistently with:

* individual image files
* sprite sheets
* atlas regions
* explicit atlas frame arrays
* JSON/TexturePacker atlases

---

# 2. `sequence` and `pingPong`

Keep `pingPong` as a convenience feature.

It should remain useful for common patterns:

```js
hit: {
    frames: 2,
    pingPong: true,
}
```

For a two-frame animation this produces:

```text
0 → 1 → 0
```

For three frames:

```text
0 → 1 → 2 → 1
```

`sequence` is the general mechanism.

`pingPong` is the convenient shorthand for a common sequence.

Internally, it is acceptable for the implementation to normalize both into the same playback representation.

Define precedence clearly.

Recommended rule:

```text
explicit sequence > pingPong > default sequential order
```

If both are supplied, `sequence` wins.

Alternatively, reject the combination as ambiguous. Pick one behavior and document it clearly. Do not silently create surprising behavior.

---

# 3. `timing`

Add an optional per-frame timing mechanism.

This is a separate concept from `sequence`.

`sequence` answers:

> Which frame comes next?

`timing` answers:

> How long does each playback frame remain visible?

Do not force users to duplicate frames to express duration.

This:

```js
sequence: [0, 1, 2, 2, 2, 2, 2, 3, 4]
```

can technically create a longer airborne section, but it is semantically poor because it represents time by repeatedly inserting the same frame.

Instead support something conceptually like:

```js
jump: {
    frames: 5,

    sequence: [0, 1, 2, 3, 4],

    timing: [
        0.08,
        0.08,
        0.50,
        0.10,
        0.12,
    ],
}
```

Meaning:

```text
frame 0 → 0.08s
frame 1 → 0.08s
frame 2 → 0.50s
frame 3 → 0.10s
frame 4 → 0.12s
```

The timing array applies to the **playback sequence**, not necessarily the raw source frame list.

For example:

```js
sequence: [1, 0, 1, 2],

timing: [
    0.05, // playback position 0 → frame 1
    0.10, // playback position 1 → frame 0
    0.05, // playback position 2 → frame 1
    0.15, // playback position 3 → frame 2
]
```

This allows the same source frame to appear multiple times with different durations.

That is important.

Do not model timing as:

```js
frameDurations[rawFrameIndex]
```

because a sequence can reference the same source frame multiple times.

Timing belongs to the resulting playback positions.

---

# 4. Relationship between `fps` and `timing`

Preserve the existing simple API:

```js
run: 8
```

and:

```js
run: {
    frames: 8,
    fps: 12,
}
```

`fps` remains the default uniform timing model.

When `timing` is supplied, it provides explicit timing for the sequence.

Recommended semantics:

```text
no timing → use fps
timing supplied → use timing
```

Do not require users to specify both.

For example:

```js
run: {
    frames: 8,
    fps: 12,
}
```

is uniform.

While:

```js
run: {
    frames: 8,
    timing: [0.05, 0.05, 0.10, 0.05, 0.05, 0.20, 0.10, 0.10],
}
```

is explicit.

If useful, retain `fps` as the fallback for missing timing values only if that behavior is unambiguous. Otherwise require the timing array to match the playback sequence length exactly.

Prefer strict validation over implicit behavior.

---

# 5. Markers

Add semantic markers to animation definitions.

Example:

```js
jump: {
    frames: 5,

    sequence: [0, 1, 2, 3, 4],

    markers: {
        airborne: 2,
        landing: 4,
    },
}
```

But do not think of markers simply as frame indices.

They are **positions on the animation timeline**.

This distinction matters because `sequence` and `timing` can change the relationship between source frames and playback time.

For example:

```js
sequence: [0, 1, 2, 2, 2, 3, 4]
```

contains several playback positions displaying source frame `2`.

A marker should identify a specific playback position, not ambiguously identify every occurrence of source frame `2`.

Therefore the implementation should define markers against the normalized animation timeline / playback sequence.

A useful representation would be conceptually:

```js
markers: {
    airborne: 2,
    landing: 6,
}
```

where these refer to playback positions.

The exact internal representation is up to the implementation, but the semantics must remain stable after `sequence` and `timing` are normalized.

---

# 6. `playUntil(marker)`

Add:

```js
animation.playUntil("airborne");
```

This is one of the primary reasons markers exist.

It means:

> Start/resume the current animation and automatically stop when the specified marker is reached.

Example:

```js
if (Input.pressed("jump")) {
    king.animation.playUntil("airborne");
}
```

The controller should:

1. Start the requested/current animation.
2. Advance normally.
3. Respect its frame timing.
4. Detect the marker during playback.
5. Stop exactly at the marker.
6. Preserve that playback position.
7. Remain paused until explicitly resumed or otherwise instructed.

It must **not continue playing to the end**.

This is the critical behavior.

For the jump:

```text
playUntil("airborne")

0 → 1 → 2
        ↑
      STOP
```

Then:

```js
if (player.isFalling) {
    king.animation.resume();
}
```

should continue from the marker:

```text
2 → 3 → 4
```

not restart the animation and not skip frame 2.

---

# 7. `pauseAt(marker)`

Also support:

```js
animation.pauseAt("airborne");
```

This represents a slightly different semantic intent:

> Configure the currently playing animation to pause automatically when it reaches this marker.

The exact interaction between `pauseAt()` and `playUntil()` should be intentionally designed.

A reasonable model is:

```js
playUntil("airborne")
```

is an immediate playback command.

Whereas:

```js
pauseAt("airborne")
```

sets a playback stopping point for the current playback.

If the existing controller architecture makes those two concepts unnecessarily redundant, it is acceptable to unify their internal implementation while preserving the clearer public API.

The important thing is that both express:

```text
play normally
    ↓
reach semantic marker
    ↓
pause automatically
```

---

# 8. Marker lookup must be animation-relative

Markers belong to an animation clip.

For example:

```js
jump: {
    markers: {
        airborne: 2,
        landing: 4,
    },
}

attack: {
    markers: {
        windup: 1,
        impact: 3,
    },
}
```

The programmer should be able to use:

```js
king.animation.playUntil("airborne");
```

when `jump` is active.

And:

```js
king.animation.playUntil("impact");
```

when `attack` is active.

Do not create one giant global marker namespace.

Markers describe positions inside their clip.

---

# 9. Marker behavior with `sequence`

Markers must refer to playback positions, not source frame IDs.

Example:

```js
jump: {
    frames: 5,

    sequence: [
        0,
        1,
        2,
        2,
        2,
        3,
        4,
    ],

    markers: {
        airborne: 2,
        landing: 6,
    },
}
```

Here:

```text
playback position:
0  1  2  3  4  5  6
↓  ↓  ↓  ↓  ↓  ↓  ↓
0  1  2  2  2  3  4
      ↑           ↑
   airborne     landing
```

`airborne` must refer to the first occurrence of the relevant playback position, not every occurrence of source frame `2`.

This is why marker semantics need to be based on the normalized playback sequence.

---

# 10. Marker behavior with `timing`

Timing makes markers even more important.

Suppose:

```js
jump: {
    sequence: [0, 1, 2, 3, 4],

    timing: [
        0.08,
        0.08,
        0.50,
        0.10,
        0.12,
    ],

    markers: {
        airborne: 2,
        landing: 4,
    },
}
```

The animation timeline becomes approximately:

```text
0       .08      .16                    .66       .76        .88
|---------|--------|----------------------|----------|----------|
    0         1              2                3          4
                           airborne                     landing
```

The marker is therefore not just a frame label.

It identifies a meaningful point in the animation's playback timeline.

The implementation must ensure that advancing by `dt` cannot accidentally skip a marker without processing it.

For example, if one update receives a large `dt` and playback advances across several frames, marker crossing must still be detected.

Do not rely on:

```js
if (currentFrame === markerFrame)
```

alone.

Detect crossing of the marker in playback time / normalized playback position.

---

# 11. Overshoot handling

This is important for variable frame timing and large `dt`.

Suppose:

```text
current position = 1
marker = 2
dt causes playback to advance from position 1 to position 3
```

The controller must still detect that marker `2` was crossed.

It should stop at the marker rather than silently jumping past it.

Conceptually:

```text
before:
frame 1

advance:
1 → 2 → 3

marker:
      ↑

result:
frame 2
paused
```

Any remaining accumulated time after the marker should be handled deliberately.

Do not accidentally consume time belonging to the portion after the marker.

If the controller uses an accumulator internally, preserve enough state so that `resume()` produces deterministic behavior.

---

# 12. `resume()` semantics

`resume()` already exists and should remain the mechanism for continuing paused playback.

After:

```js
king.animation.playUntil("airborne");
```

the following:

```js
king.animation.resume();
```

must continue from the exact paused position.

Example:

```text
playUntil("airborne")

0 → 1 → 2
        STOP

resume()

2 → 3 → 4
```

Do not restart from frame `0`.

Do not restart frame `2` unless the frame had not actually completed.

Preserve the playback cursor and timing state.

---

# 13. Interaction with `playOnce()`

This feature must integrate with the existing animation controller architecture.

Current API:

```js
animation.play(name)
animation.playOnce(name)
animation.play(name, { force: true })
animation.queue(name)
animation.clearQueue()
animation.pause()
animation.resume()
animation.onComplete(cb)
```

Do not create a separate animation system for markers.

Markers must operate inside the existing playback controller.

The important distinction is:

```js
playOnce("jump")
```

means:

> Play the entire one-shot.

While:

```js
playUntil("airborne")
```

means:

> Play until this semantic point, then pause.

If you decide that a more explicit API is needed for one-shot + marker behavior, it may be reasonable to support:

```js
animation.playOnce("jump", { until: "airborne" });
```

but do not add this unless it naturally fits the existing API.

Prefer the smallest API that remains clear.

---

# 14. Queues and markers

Markers must not break the existing queue system.

For example:

```js
animation.playOnce("attack1");
animation.queue("attack2");
```

should continue to work exactly as before.

If an animation is stopped by:

```js
playUntil("marker")
```

or:

```js
pauseAt("marker")
```

the queue must remain in a well-defined state.

Do not silently advance queued animations while the current animation is paused at a marker.

A paused animation means playback is paused.

When resumed, it should continue and eventually transition normally according to the existing queue/completion rules.

---

# 15. Completion semantics

A marker pause is **not animation completion**.

This distinction is critical.

If:

```js
king.animation.playUntil("airborne");
```

stops at `"airborne"`:

* `onComplete()` must NOT fire.
* The one-shot must NOT be considered finished.
* The persistent animation must NOT resume.
* Queued animations must NOT advance.
* Playback state must remain paused.

Only when the animation genuinely reaches its terminal end should completion occur.

For example:

```text
playUntil("airborne")
        ↓
marker reached
        ↓
PAUSED
        ↓
resume()
        ↓
continue
        ↓
animation reaches end
        ↓
onComplete()
        ↓
normal queue/resume behavior
```

---

# 16. Validation

Fail early when configuration is invalid.

Validate:

### `sequence`

* Must be an array.
* Every value must be an integer.
* Every value must refer to an existing extracted source frame.
* Empty sequences should be rejected unless the engine explicitly supports them.

### `timing`

* Must be an array if supplied.
* Timing values must be finite positive numbers.
* The length must match the normalized playback sequence length.
* Do not silently ignore extra values.
* Do not silently invent missing values.

### `markers`

* Marker names must be valid strings.
* Marker positions must refer to valid playback positions.
* Duplicate marker names are invalid.
* Invalid marker positions should fail during animation construction, not at runtime.

### Playback methods

If:

```js
animation.playUntil("unknown");
```

is called, produce a useful error identifying:

* the animation
* the missing marker
* the available markers if practical

Avoid silent failure.

---

# 17. Normalization architecture

Prefer normalizing animation definitions during construction.

Conceptually:

```text
raw configuration
       ↓
source frame extraction
       ↓
sequence normalization
       ↓
timing normalization
       ↓
marker normalization
       ↓
AnimationClip
       ↓
AnimationController
```

The runtime controller should not repeatedly interpret:

```js
sequence
timing
markers
```

every frame.

Convert them into an efficient representation once.

This is especially important because animation playback runs in a hot path.

The controller should ideally operate on compact normalized arrays / numeric indices.

Avoid allocations during:

```js
animation.update(dt)
```

or while advancing frames.

---

# 18. Preserve existing simple API

Do not make simple animations more complicated.

This must remain valid:

```js
run: 8
```

and:

```js
idle: {
    frames: 4,
    fps: 6,
}
```

Advanced functionality should be progressive.

Simple:

```js
run: 8
```

Custom sequence:

```js
slash: {
    frames: 3,
    sequence: [1, 0, 1, 2],
}
```

Custom timing:

```js
jump: {
    frames: 5,
    timing: [0.08, 0.08, 0.50, 0.10, 0.12],
}
```

Semantic timeline:

```js
jump: {
    frames: 5,
    timing: [0.08, 0.08, 0.50, 0.10, 0.12],

    markers: {
        airborne: 2,
        landing: 4,
    },
}
```

This progressive complexity is intentional.

---

# 19. Target gameplay API

The resulting system should make the motivating jump behavior straightforward.

For example:

```js
const animations = await Image.animate({
    image: "player.png",
    sliceX: 5,
    sliceY: 1,

    jump: {
        frames: 5,

        timing: [
            0.08,
            0.08,
            0.50,
            0.10,
            0.12,
        ],

        markers: {
            airborne: 2,
            landing: 4,
        },
    },
});
```

Then gameplay can express the intent:

```js
if (Input.pressed("jump")) {
    king.animation.playUntil("airborne");
}

if (player.isFalling) {
    king.animation.resume();
}
```

The important thing is that the animation system itself guarantees:

```text
jump
 ↓
0
 ↓
1
 ↓
airborne marker
 ↓
PAUSED
 ↓
player falls
 ↓
resume()
 ↓
3
 ↓
4
 ↓
complete
```

No:

```js
this.jumping = true;
this.airborne = true;
this.jumpAnimationFrame = 2;
```

should be required merely to synchronize the animation.

Gameplay state still belongs to gameplay.

The animation controller simply provides a clean semantic playback primitive.

---

# 20. Tests

Add comprehensive tests before considering the implementation complete.

At minimum test:

### Sequence

* default sequential playback
* custom sequence
* repeated source frame
* reversed sequence
* sequence with arbitrary ordering
* sequence with individual-file animations
* sequence with sprite sheets
* sequence with atlas regions
* invalid indices

### Timing

* uniform FPS playback
* custom timing
* repeated source frame with different durations
* timing matching sequence length
* invalid timing values
* invalid timing length
* large `dt`

### Markers

* marker exists
* marker lookup
* marker at first playback position
* marker at final playback position
* multiple markers
* marker after repeated source frames
* invalid marker
* marker crossing with large `dt`

### `playUntil`

* starts playback
* stops exactly at marker
* preserves frame
* preserves timing state
* does not trigger completion
* does not advance queue
* `resume()` continues from marker
* eventually completes normally after resume

### `pauseAt`

* pauses at marker
* preserves playback position
* resumes correctly
* behaves correctly with timing

### Integration

* `playOnce()` + marker
* forced animations + marker
* queues + marker
* `onComplete()` after marker pause/resume
* persistent animation requests while a marker-paused animation is active
* multiple marker pauses/resumes

---

# 21. Do not over-engineer this into a cinematic timeline system

The goal is not to build a general-purpose cutscene editor.

Keep the model focused:

```text
sequence
    ↓
which frames

timing
    ↓
how long each playback frame lasts

markers
    ↓
meaningful positions in the playback timeline

play / playOnce / playUntil / pause / resume
    ↓
how gameplay controls playback
```

These four concepts are enough to express a surprisingly large amount of real game animation behavior without forcing gameplay code to maintain animation-specific state.

Do not add tracks, arbitrary callbacks embedded in clips, conditions, state machines, or scripting languages as part of this task.

---

# Final architectural goal

The animation system should evolve from:

```js
play("jump")
```

being merely:

> Start displaying this clip.

into a richer but still simple model:

```js
play("run")
```

> Make this the persistent animation.

```js
playOnce("attack")
```

> Temporarily play this animation to completion.

```js
playUntil("airborne")
```

> Play until this semantic point, then pause.

```js
pause()
```

> Stop at the current playback position.

```js
resume()
```

> Continue exactly where playback stopped.

```js
sequence
```

> Define the choreography.

```js
timing
```

> Define the temporal pacing.

```js
markers
```

> Name meaningful positions in that choreography.

The final system should make animation code describe **intent**, rather than forcing the programmer to manually synchronize animation frames with gameplay state.
