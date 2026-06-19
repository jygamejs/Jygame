import { ModifierCompiler } from "./ModifierCompiler.js";
import { GpuProgramDescriptor } from "./GpuProgramDescriptor.js";
import { ParticleBackendCapabilities } from "./ParticleBackendCapabilities.js";

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error("FAIL:", msg);
  }
}

function assertEqual(a, b, msg) {
  const ok = a === b || JSON.stringify(a) === JSON.stringify(b);
  if (ok) {
    passed++;
  } else {
    failed++;
    console.error("FAIL:", msg, "- expected", JSON.stringify(b), "got", JSON.stringify(a));
  }
}

function assertThrows(fn, expectedMsg, msg) {
  try {
    fn();
    failed++;
    console.error("FAIL:", msg, "- expected throw");
  } catch (e) {
    if (typeof expectedMsg === "string" && !e.message.includes(expectedMsg)) {
      failed++;
      console.error("FAIL:", msg, "- expected message containing", expectedMsg, "got", e.message);
    } else {
      passed++;
    }
  }
}

// ── Descriptor compilation ──────────────────────────────────

const compiler = new ModifierCompiler();

const fade = { type: "fade", mode: "out", easing: "linear" };
const scale = { type: "scale", mode: null, from: 1, to: 0, easing: "linear" };
const velocity = { type: "velocity", drag: 0 };
const rotation = { type: "rotation", mode: "velocity", speed: 1 };
const force = { type: "force", strength: 100, x: 0, y: 0 };
const attraction = { type: "attraction", strength: 100, x: 0, y: 0 };
const orbit = { type: "orbit", strength: 50, radius: 100 };
const wind = { type: "wind", x: 10, y: 0 };
const turbulence = { type: "turbulence", strength: 50, frequency: 1 };
const color = { type: "color", from: "#ffffff", to: "#000000" };
const animation = { type: "animation", property: "size", keyframes: [[0, 1], [1, 2]] };

// 1: compile basic descriptors
const prog = compiler.compile([fade, scale, velocity]);
assert(prog instanceof GpuProgramDescriptor, "compile returns GpuProgramDescriptor");
assertEqual(prog.totalModifiers, 3, "totalModifiers = 3");
assertEqual(prog.passCount, 2, "passCount = 2 (integration + visual)");

// 2: pass classification
assertEqual(prog.integrationPass.length, 1, "integration pass has velocity");
assertEqual(prog.integrationPass[0].type, "velocity", "integration pass = velocity");
assertEqual(prog.visualPass.length, 2, "visual pass has fade + scale");
assertEqual(prog.forcePass.length, 0, "force pass empty");

// 3: all 3 passes non-empty
const full = compiler.compile([velocity, wind, fade]);
assertEqual(full.integrationPass.length, 1, "full: integration");
assertEqual(full.forcePass.length, 1, "full: force");
assertEqual(full.visualPass.length, 1, "full: visual");
assertEqual(full.passCount, 3, "full: 3 passes");

// 4: hasPass
assert(full.hasPass("integration"), "hasPass integration");
assert(full.hasPass("force"), "hasPass force");
assert(full.hasPass("visual"), "hasPass visual");
assert(!full.hasPass("spawn"), "!hasPass spawn");

// ── State layout generation ─────────────────────────────────

// 5: no state
const noState = compiler.compile([fade, scale]);
assertEqual(noState.stateLayout, null, "no state layout for stateless modifiers");

// 6: single stateful
const withTurb = compiler.compile([turbulence]);
const sl = withTurb.stateLayout;
assert(sl !== null, "state layout exists for turbulence");
assertEqual(sl.fields.length, 1, "1 field in layout");
assertEqual(sl.fields[0].name, "seed", "field = seed");
assertEqual(sl.fields[0].offset, 0, "seed offset = 0");
assertEqual(sl.fields[0].size, 4, "seed size = 4");
assertEqual(sl.stride, 4, "stride = 4 for turbulence");

// 7: multiple stateful, dedup segment
const withColorAndAnim = compiler.compile([color, animation]);
const sl2 = withColorAndAnim.stateLayout;
assertEqual(sl2.fields.length, 1, "color + animation share 1 field (segment)");
assertEqual(sl2.fields[0].name, "segment", "shared field = segment");
assertEqual(sl2.stride, 4, "stride = 4");

// 8: two different stateful
const withColorAndTurb = compiler.compile([color, turbulence]);
const sl3 = withColorAndTurb.stateLayout;
assertEqual(sl3.fields.length, 2, "2 fields: segment + seed");
assertEqual(sl3.stride, 8, "stride = 8");
assertEqual(sl3.fields[0].name, "segment", "first field = segment");
assertEqual(sl3.fields[1].name, "seed", "second field = seed");

// ── Unsupported modifier rejection ──────────────────────────

// 9: trail rejected
assertThrows(
  () => compiler.compile([{ type: "trail", every: 1 }]),
  "TrailModifier is not GPU compatible",
  "trail modifier rejected"
);

// 10: spawn rejected
assertThrows(
  () => compiler.compile([{ type: "spawn", mode: "interval", every: 1 }]),
  "SpawnModifier is not GPU compatible",
  "spawn modifier rejected"
);

// 11: collision rejected
assertThrows(
  () => compiler.compile([{ type: "collision", frequency: 1 }]),
  "CollisionModifier is not GPU compatible",
  "collision modifier rejected"
);

// 12: animatedSprite rejected
assertThrows(
  () => compiler.compile([{ type: "animatedSprite", frames: [{ x: 0, y: 0, width: 10, height: 10 }] }]),
  "AnimatedSpriteModifier is not GPU compatible",
  "animatedSprite modifier rejected"
);

// 13: unknown type rejected
assertThrows(
  () => compiler.compile([{ type: "bogus" }]),
  "unknown modifier type",
  "unknown type rejected"
);

// 14: null descriptor
assertThrows(
  () => compiler.compile([null]),
  "not a valid object",
  "null descriptor rejected"
);

// 15: missing type
assertThrows(
  () => compiler.compile([{ foo: "bar" }]),
  'missing a valid "type"',
  "missing type rejected"
);

// 16: non-array input
assertThrows(
  () => compiler.compile("not an array"),
  "descriptors must be an array",
  "non-array input rejected"
);

// ── Deterministic ordering ──────────────────────────────────

const descs = [wind, fade, velocity, scale, rotation, force, attraction, orbit, turbulence, color, animation];
const progA = compiler.compile(descs);
const progB = compiler.compile(descs);

assertEqual(progA.integrationPass.length, progB.integrationPass.length, "integration pass order stable A");
assertEqual(progA.forcePass.length, progB.forcePass.length, "force pass order stable");
assertEqual(progA.visualPass.length, progB.visualPass.length, "visual pass order stable");

for (let i = 0; i < progA.integrationPass.length; i++) {
  assertEqual(progA.integrationPass[i].type, progB.integrationPass[i].type, `integration[${i}] stable`);
}
for (let i = 0; i < progA.forcePass.length; i++) {
  assertEqual(progA.forcePass[i].type, progB.forcePass[i].type, `force[${i}] stable`);
}
for (let i = 0; i < progA.visualPass.length; i++) {
  assertEqual(progA.visualPass[i].type, progB.visualPass[i].type, `visual[${i}] stable`);
}

// ── Identical output for repeated compilation ───────────────

assertEqual(JSON.stringify(progA.toJSON()), JSON.stringify(progB.toJSON()), "identical JSON output");

// ── compileFromModifiers ────────────────────────────────────

import { FadeModifier } from "../../modifiers/FadeModifier.js";
import { ScaleModifier } from "../../modifiers/ScaleModifier.js";
import { VelocityModifier } from "../../modifiers/VelocityModifier.js";
import { ForceModifier } from "../../modifiers/ForceModifier.js";
import { WindModifier } from "../../modifiers/WindModifier.js";
import { TurbulenceModifier } from "../../modifiers/TurbulenceModifier.js";
import { ColorModifier } from "../../modifiers/ColorModifier.js";
import { AnimationModifier } from "../../modifiers/AnimationModifier.js";

const mods = [
  new FadeModifier(),
  new ScaleModifier(),
  new VelocityModifier(),
  new ForceModifier({ x: 0, y: 0, strength: 1 }),
  new WindModifier(),
  new TurbulenceModifier(),
  new ColorModifier(),
  new AnimationModifier({ property: "size", keyframes: [[0, 1], [1, 2]] }),
];

const fromMods = compiler.compileFromModifiers(mods);
assert(fromMods instanceof GpuProgramDescriptor, "compileFromModifiers returns GpuProgramDescriptor");
assertEqual(fromMods.totalModifiers, mods.length, "compileFromModifiers includes all modifiers");
assert(fromMods.hasPass("integration"), "fromMods has integration");
assert(fromMods.hasPass("force"), "fromMods has force");
assert(fromMods.hasPass("visual"), "fromMods has visual");

// ── ParticleBackendCapabilities static canRun ────────────────

import { CollisionModifier } from "../../modifiers/CollisionModifier.js";
import { TrailModifier } from "../../modifiers/TrailModifier.js";
import { SpawnModifier } from "../../modifiers/SpawnModifier.js";

const trail = new TrailModifier({ every: 1, initializer: () => {} });
const spawn = new SpawnModifier({ mode: "interval", every: 1, initializer: () => {} });
const collision = new CollisionModifier();

const cpu = ParticleBackendCapabilities.CPU;
const gpuFull = ParticleBackendCapabilities.GPU_FULL;

assertEqual(ParticleBackendCapabilities.canRun(cpu, trail), true, "static canRun: trail on CPU");
assertEqual(ParticleBackendCapabilities.canRun(gpuFull, trail), false, "static canRun: trail on GPU_FULL");
assertEqual(ParticleBackendCapabilities.canRun(gpuFull, spawn), false, "static canRun: spawn on GPU_FULL");
assertEqual(ParticleBackendCapabilities.canRun(gpuFull, collision), false, "static canRun: collision on GPU_FULL");
assertEqual(ParticleBackendCapabilities.canRun(gpuFull, new FadeModifier()), true, "static canRun: fade on GPU_FULL");

// Static canRun with plain object backend
assertEqual(
  ParticleBackendCapabilities.canRun({ supportsSpawnModifiers: false }, trail),
  false,
  "static canRun: plain backend rejects trail"
);

// ── GpuProgramDescriptor toJSON ─────────────────────────────

const json = full.toJSON();
assertEqual(json.integrationPass.length, 1, "toJSON integration");
assertEqual(json.forcePass.length, 1, "toJSON force");
assertEqual(json.visualPass.length, 1, "toJSON visual");
assert(json.stateLayout === null || typeof json.stateLayout === "object", "toJSON stateLayout");

// ── Empty compile ───────────────────────────────────────────

const empty = compiler.compile([]);
assert(empty instanceof GpuProgramDescriptor, "empty compile");
assertEqual(empty.totalModifiers, 0, "empty totalModifiers");
assertEqual(empty.passCount, 0, "empty passCount");

// ── Summary ─────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
