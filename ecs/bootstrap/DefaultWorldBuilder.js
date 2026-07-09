import { World } from "../core/World.js";

import {
  Transform, Velocity, Collider, Renderable, RenderBounds,
  Animation, Visible, Trail,
  EnemyTag, PlayerTag, ProjectileTag, StaticTag,
} from "../components/index.js";

import {
  MovementSystem, AnimationSystem, CollisionSystem, RenderSystem, TrailSystem,
} from "../systems/index.js";

import { RenderQueue } from "../render/RenderQueue.js";
import { AnimationClipRegistry } from "../animation/AnimationClipRegistry.js";
import { TrailManager } from "../trails/TrailManager.js";
import { SpatialHash } from "../../collision/SpatialHash.js";
import {
  Diagnostics, MetricCategory, MetricUnit, MetricType,
} from "../../debug/index.js";

const _ECS_COMPONENTS = [
  Transform, Velocity, Collider,
  Renderable, RenderBounds,
  Animation, Visible, Trail,
  EnemyTag, PlayerTag, ProjectileTag, StaticTag,
];

const _ECS_SYSTEMS = [
  MovementSystem, AnimationSystem, CollisionSystem, RenderSystem, TrailSystem,
];

function _registerStandardMetrics(diag) {
  diag.registerMetric({ name:"frame.delta",         displayName:"Frame Delta",     category:MetricCategory.FRAME, group:"Frame",  unit:MetricUnit.MILLISECONDS, type:MetricType.GAUGE,   tags:Object.freeze(["frame"]), format:"ms",           description:"Real time between consecutive frames" });
  diag.registerMetric({ name:"frame.fps",           displayName:"FPS",             category:MetricCategory.FRAME, group:"Frame",  unit:MetricUnit.FPS,          type:MetricType.GAUGE,   tags:Object.freeze(["frame"]), format:"fps",          description:"Frames per second" });
  diag.registerMetric({ name:"frame.update",        displayName:"ECS Update",      category:MetricCategory.FRAME, group:"Frame",  unit:MetricUnit.MILLISECONDS, type:MetricType.TIMER,   tags:Object.freeze(["frame","ecs"]), budget:16.67, warnAt:10, critAt:16.67, format:"ms", description:"ECS + scene update time" });
  diag.registerMetric({ name:"frame.total",         displayName:"Frame Total",     category:MetricCategory.FRAME, group:"Frame",  unit:MetricUnit.MILLISECONDS, type:MetricType.TIMER,   tags:Object.freeze(["frame"]), budget:16.67, warnAt:12, critAt:16.67, format:"ms", description:"Wall clock duration of an entire frame" });
  diag.registerMetric({ name:"frame.input",         displayName:"Frame Input",     category:MetricCategory.FRAME, group:"Frame",  unit:MetricUnit.MILLISECONDS, type:MetricType.TIMER,   tags:Object.freeze(["frame","input"]), budget:1, warnAt:0.5, critAt:1, format:"ms", description:"Input processing time" });
  diag.registerMetric({ name:"frame.render",        displayName:"Frame Render",    category:MetricCategory.FRAME, group:"Frame",  unit:MetricUnit.MILLISECONDS, type:MetricType.TIMER,   tags:Object.freeze(["frame","render"]), budget:8, warnAt:5, critAt:8, format:"ms", description:"Render pass time" });
  diag.registerMetric({ name:"frame.canvas",        displayName:"Frame Canvas",    category:MetricCategory.FRAME, group:"Frame",  unit:MetricUnit.MILLISECONDS, type:MetricType.TIMER,   tags:Object.freeze(["frame","canvas"]), budget:1, warnAt:0.5, critAt:1, format:"ms", description:"Canvas clearing time" });

  diag.registerMetric({ name:"ecs.world.entities",  displayName:"Alive Entities",  category:MetricCategory.ECS,   group:"World", unit:MetricUnit.COUNT,         type:MetricType.GAUGE,   tags:Object.freeze(["ecs","world"]), format:"integer", description:"Number of alive entities" });
  diag.registerMetric({ name:"ecs.world.archetypes",displayName:"Archetypes",      category:MetricCategory.ECS,   group:"World", unit:MetricUnit.COUNT,         type:MetricType.GAUGE,   tags:Object.freeze(["ecs","world"]), format:"integer", description:"Number of active archetypes" });
  diag.registerMetric({ name:"ecs.world.systems",   displayName:"Systems",         category:MetricCategory.ECS,   group:"World", unit:MetricUnit.COUNT,         type:MetricType.GAUGE,   tags:Object.freeze(["ecs","world"]), format:"integer", description:"Number of registered ECS systems" });
  diag.registerMetric({ name:"ecs.entitiesCreated", displayName:"Entities Created",category:MetricCategory.ECS,   group:"World", unit:MetricUnit.COUNT,         type:MetricType.COUNTER, tags:Object.freeze(["ecs"]), format:"integer" });
  diag.registerMetric({ name:"ecs.entitiesDestroyed",displayName:"Entities Destroyed",category:MetricCategory.ECS,group:"World", unit:MetricUnit.COUNT,         type:MetricType.COUNTER, tags:Object.freeze(["ecs"]), format:"integer" });
  diag.registerMetric({ name:"ecs.componentsAdded",  displayName:"Components Added", category:MetricCategory.ECS,   group:"Changes", unit:MetricUnit.COUNT, type:MetricType.COUNTER, tags:Object.freeze(["ecs"]), format:"integer" });
  diag.registerMetric({ name:"ecs.componentsRemoved",displayName:"Components Removed",category:MetricCategory.ECS, group:"Changes", unit:MetricUnit.COUNT, type:MetricType.COUNTER, tags:Object.freeze(["ecs"]), format:"integer" });
  diag.registerMetric({ name:"ecs.entitiesMigrated", displayName:"Entities Migrated",category:MetricCategory.ECS,  group:"Changes", unit:MetricUnit.COUNT, type:MetricType.COUNTER, tags:Object.freeze(["ecs"]), format:"integer" });
  diag.registerMetric({ name:"ecs.archetypesCreated",displayName:"Archetypes Created",category:MetricCategory.ECS, group:"Changes", unit:MetricUnit.COUNT, type:MetricType.COUNTER, tags:Object.freeze(["ecs"]), format:"integer" });
  diag.registerMetric({ name:"ecs.world.components", displayName:"Components",       category:MetricCategory.ECS,   group:"World", unit:MetricUnit.COUNT, type:MetricType.GAUGE,   tags:Object.freeze(["ecs","world"]), format:"integer" });
  diag.registerMetric({ name:"ecs.world.tables",     displayName:"Tables",           category:MetricCategory.ECS,   group:"World", unit:MetricUnit.COUNT, type:MetricType.GAUGE,   tags:Object.freeze(["ecs","world"]), format:"integer" });
  diag.registerMetric({ name:"ecs.world.capacity",   displayName:"Entity Capacity",  category:MetricCategory.ECS,   group:"World", unit:MetricUnit.COUNT, type:MetricType.GAUGE,   tags:Object.freeze(["ecs","world"]), format:"integer" });
  diag.registerMetric({ name:"ecs.systems.total",    displayName:"Systems Total",    category:MetricCategory.ECS,   group:"Scheduler", unit:MetricUnit.MILLISECONDS, type:MetricType.TIMER,  tags:Object.freeze(["ecs","scheduler"]), budget:16, format:"ms", description:"Total time spent running all ECS systems" });
  diag.registerMetric({ name:"ecs.query.scans",      displayName:"Query Rescans",    category:MetricCategory.ECS,   group:"Queries", unit:MetricUnit.COUNT,         type:MetricType.COUNTER, tags:Object.freeze(["ecs","query"]), format:"integer" });
  diag.registerMetric({ name:"ecs.query.scanTime",   displayName:"Query Rescan Time",category:MetricCategory.ECS,   group:"Queries", unit:MetricUnit.MILLISECONDS, type:MetricType.TIMER,  tags:Object.freeze(["ecs","query"]), format:"ms" });

  diag.registerMetric({ name:"render.draw",          displayName:"Render Draw",      category:MetricCategory.RENDER, group:"Render", unit:MetricUnit.MILLISECONDS, type:MetricType.TIMER,   tags:Object.freeze(["render"]), budget:8, format:"ms" });
  diag.registerMetric({ name:"render.commands",      displayName:"Draw Commands",    category:MetricCategory.RENDER, group:"Render", unit:MetricUnit.COUNT,         type:MetricType.COUNTER, tags:Object.freeze(["render"]), format:"integer" });
  diag.registerMetric({ name:"render.populate",      displayName:"Populate Queue",   category:MetricCategory.RENDER, group:"Render", unit:MetricUnit.MILLISECONDS, type:MetricType.TIMER,   tags:Object.freeze(["render"]), format:"ms" });
  diag.registerMetric({ name:"render.batch",         displayName:"Batch Draw",       category:MetricCategory.RENDER, group:"Render", unit:MetricUnit.MILLISECONDS, type:MetricType.TIMER,   tags:Object.freeze(["render"]), format:"ms" });
  diag.registerMetric({ name:"render.images",        displayName:"Images Drawn",     category:MetricCategory.RENDER, group:"Render", unit:MetricUnit.COUNT,         type:MetricType.COUNTER, tags:Object.freeze(["render"]), format:"integer" });
  diag.registerMetric({ name:"render.primitives",    displayName:"Primitives Drawn", category:MetricCategory.RENDER, group:"Render", unit:MetricUnit.COUNT,         type:MetricType.COUNTER, tags:Object.freeze(["render"]), format:"integer" });
  diag.registerMetric({ name:"render.trails",         displayName:"Trails",           category:MetricCategory.RENDER, group:"Render", unit:MetricUnit.MILLISECONDS, type:MetricType.TIMER,   tags:Object.freeze(["render"]), format:"ms" });
  diag.registerMetric({ name:"render.trails.segments",displayName:"Trail Segments",   category:MetricCategory.RENDER, group:"Render", unit:MetricUnit.COUNT,         type:MetricType.COUNTER, tags:Object.freeze(["render"]), format:"integer" });
  diag.registerMetric({ name:"render.trails.lines",   displayName:"Trail Lines",      category:MetricCategory.RENDER, group:"Render", unit:MetricUnit.COUNT,         type:MetricType.COUNTER, tags:Object.freeze(["render"]), format:"integer" });
  diag.registerMetric({ name:"render.trails.ribbons", displayName:"Trail Ribbons",    category:MetricCategory.RENDER, group:"Render", unit:MetricUnit.COUNT,         type:MetricType.COUNTER, tags:Object.freeze(["render"]), format:"integer" });
  diag.registerMetric({ name:"render.particles.sprites",    displayName:"Particle Sprites",   category:MetricCategory.RENDER, group:"Render", unit:MetricUnit.COUNT, type:MetricType.COUNTER, tags:Object.freeze(["render"]), format:"integer" });
  diag.registerMetric({ name:"render.particles.primitives", displayName:"Particle Primitives",category:MetricCategory.RENDER, group:"Render", unit:MetricUnit.COUNT, type:MetricType.COUNTER, tags:Object.freeze(["render"]), format:"integer" });

  diag.registerMetric({ name:"audio.update",      displayName:"Audio Update",      category:MetricCategory.AUDIO, group:"Audio", unit:MetricUnit.MILLISECONDS, type:MetricType.TIMER,   tags:Object.freeze(["audio"]), format:"ms" });
  diag.registerMetric({ name:"audio.active",      displayName:"Active Sounds",     category:MetricCategory.AUDIO, group:"Audio", unit:MetricUnit.COUNT,         type:MetricType.GAUGE,   tags:Object.freeze(["audio"]), format:"integer" });
  diag.registerMetric({ name:"audio.pooled",      displayName:"Pooled Instances",  category:MetricCategory.AUDIO, group:"Audio", unit:MetricUnit.COUNT,         type:MetricType.GAUGE,   tags:Object.freeze(["audio"]), format:"integer" });
  diag.registerMetric({ name:"audio.channels",    displayName:"Audio Channels",    category:MetricCategory.AUDIO, group:"Audio", unit:MetricUnit.COUNT,         type:MetricType.GAUGE,   tags:Object.freeze(["audio"]), format:"integer" });
  diag.registerMetric({ name:"audio.sfxPlayed",   displayName:"SFX Played",        category:MetricCategory.AUDIO, group:"Audio", unit:MetricUnit.COUNT,         type:MetricType.COUNTER, tags:Object.freeze(["audio"]), format:"integer" });
  diag.registerMetric({ name:"audio.musicPlayed", displayName:"Music Played",      category:MetricCategory.AUDIO, group:"Audio", unit:MetricUnit.COUNT,         type:MetricType.COUNTER, tags:Object.freeze(["audio"]), format:"integer" });
  diag.registerMetric({ name:"audio.sfxFinished", displayName:"SFX Finished",      category:MetricCategory.AUDIO, group:"Audio", unit:MetricUnit.COUNT,         type:MetricType.COUNTER, tags:Object.freeze(["audio"]), format:"integer" });

  diag.registerMetric({ name:"assets.loaded",   displayName:"Assets Loaded",   category:MetricCategory.ASSETS, group:"Assets", unit:MetricUnit.COUNT, type:MetricType.COUNTER, tags:Object.freeze(["assets"]), format:"integer" });
  diag.registerMetric({ name:"assets.pending",  displayName:"Pending Loads",   category:MetricCategory.ASSETS, group:"Assets", unit:MetricUnit.COUNT, type:MetricType.GAUGE,   tags:Object.freeze(["assets"]), format:"integer" });
  diag.registerMetric({ name:"assets.loadErrors", displayName:"Load Errors",   category:MetricCategory.ASSETS, group:"Assets", unit:MetricUnit.COUNT, type:MetricType.COUNTER, tags:Object.freeze(["assets"]), format:"integer" });

  diag.registerMetric({ name:"physics.broadphase",        displayName:"Broadphase",        category:MetricCategory.PHYSICS, group:"Physics", unit:MetricUnit.MILLISECONDS, type:MetricType.TIMER,   tags:Object.freeze(["physics"]), format:"ms" });
  diag.registerMetric({ name:"physics.bodies",             displayName:"Collision Bodies",  category:MetricCategory.PHYSICS, group:"Physics", unit:MetricUnit.COUNT,         type:MetricType.GAUGE,   tags:Object.freeze(["physics"]), format:"integer" });
  diag.registerMetric({ name:"physics.narrowphase",        displayName:"Narrowphase",        category:MetricCategory.PHYSICS, group:"Physics", unit:MetricUnit.MILLISECONDS, type:MetricType.TIMER,   tags:Object.freeze(["physics"]), format:"ms" });
  diag.registerMetric({ name:"physics.queries",            displayName:"Spatial Queries",    category:MetricCategory.PHYSICS, group:"Physics", unit:MetricUnit.COUNT,         type:MetricType.COUNTER, tags:Object.freeze(["physics"]), format:"integer" });
  diag.registerMetric({ name:"physics.broadphase.inserts", displayName:"Spatial Inserts",    category:MetricCategory.PHYSICS, group:"Physics", unit:MetricUnit.COUNT,         type:MetricType.COUNTER, tags:Object.freeze(["physics"]), format:"integer" });

  diag.registerMetric({ name:"streaming.loadedCells",   displayName:"Loaded Cells",     category:MetricCategory.STREAMING, group:"Streaming", unit:MetricUnit.COUNT,         type:MetricType.GAUGE,   tags:Object.freeze(["streaming"]), format:"integer" });
  diag.registerMetric({ name:"streaming.pending",       displayName:"Pending Loads",    category:MetricCategory.STREAMING, group:"Streaming", unit:MetricUnit.COUNT,         type:MetricType.GAUGE,   tags:Object.freeze(["streaming"]), format:"integer" });
  diag.registerMetric({ name:"streaming.entities",      displayName:"Streaming Entities",category:MetricCategory.STREAMING, group:"Streaming", unit:MetricUnit.COUNT,         type:MetricType.GAUGE,   tags:Object.freeze(["streaming"]), format:"integer" });
  diag.registerMetric({ name:"streaming.cellsLoaded",   displayName:"Cells Loaded",     category:MetricCategory.STREAMING, group:"Streaming", unit:MetricUnit.COUNT,         type:MetricType.COUNTER, tags:Object.freeze(["streaming"]), format:"integer" });
  diag.registerMetric({ name:"streaming.cellsUnloaded", displayName:"Cells Unloaded",   category:MetricCategory.STREAMING, group:"Streaming", unit:MetricUnit.COUNT,         type:MetricType.COUNTER, tags:Object.freeze(["streaming"]), format:"integer" });
  diag.registerMetric({ name:"streaming.cells",         displayName:"Total Cells",      category:MetricCategory.STREAMING, group:"Streaming", unit:MetricUnit.COUNT,         type:MetricType.GAUGE,   tags:Object.freeze(["streaming"]), format:"integer" });
  diag.registerMetric({ name:"streaming.loadTime",      displayName:"Load Time",        category:MetricCategory.STREAMING, group:"Streaming", unit:MetricUnit.MILLISECONDS, type:MetricType.TIMER,   tags:Object.freeze(["streaming"]), format:"ms" });

  diag.registerMetric({ name:"scene.transitions",  displayName:"Scene Transitions", category:MetricCategory.SCENE, group:"Scene", unit:MetricUnit.COUNT, type:MetricType.COUNTER, tags:Object.freeze(["scene"]), format:"integer" });
  diag.registerMetric({ name:"scene.activeScenes", displayName:"Active Scenes",     category:MetricCategory.SCENE, group:"Scene", unit:MetricUnit.COUNT, type:MetricType.GAUGE,   tags:Object.freeze(["scene"]), format:"integer" });

  diag.registerMetric({ name:"input.actionQueries", displayName:"Action Queries",    category:MetricCategory.INPUT, group:"Input", unit:MetricUnit.COUNT, type:MetricType.COUNTER, tags:Object.freeze(["input"]), format:"integer" });
  diag.registerMetric({ name:"input.pointerEvents", displayName:"Pointer Events",     category:MetricCategory.INPUT, group:"Input", unit:MetricUnit.COUNT, type:MetricType.COUNTER, tags:Object.freeze(["input"]), format:"integer" });
  diag.registerMetric({ name:"input.keyEvents",     displayName:"Key Events",         category:MetricCategory.INPUT, group:"Input", unit:MetricUnit.COUNT, type:MetricType.COUNTER, tags:Object.freeze(["input"]), format:"integer" });
  diag.registerMetric({ name:"input.activePointers",displayName:"Active Pointers",    category:MetricCategory.INPUT, group:"Input", unit:MetricUnit.COUNT, type:MetricType.GAUGE,   tags:Object.freeze(["input"]), format:"integer" });
}

export class DefaultWorldBuilder {
  static createDefault() {
    const world = new World();

    for (let i = 0; i < _ECS_COMPONENTS.length; i++) {
      world.register(_ECS_COMPONENTS[i]);
    }

    const diag = new Diagnostics();
    _registerStandardMetrics(diag);
    world.setResource(Diagnostics, diag);

    world.setResource(SpatialHash, new SpatialHash());
    world.setResource(TrailManager, new TrailManager());
    world.setResource(RenderQueue, new RenderQueue());
    world.setResource(AnimationClipRegistry, new AnimationClipRegistry());

    for (let i = 0; i < _ECS_SYSTEMS.length; i++) {
      world.addSystem(new _ECS_SYSTEMS[i]());
    }
    diag.lockRegistry();

    return world;
  }
}
