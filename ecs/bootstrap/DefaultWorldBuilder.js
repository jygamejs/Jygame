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
  diag.registerMetric({ name:"frame.delta",         displayName:"Frame Delta",     category:MetricCategory.FRAME, group:"Frame",  unit:MetricUnit.MILLISECONDS, type:MetricType.GAUGE,   tags:Object.freeze(["frame"]) });
  diag.registerMetric({ name:"frame.fps",           displayName:"FPS",             category:MetricCategory.FRAME, group:"Frame",  unit:MetricUnit.FPS,          type:MetricType.GAUGE,   tags:Object.freeze(["frame"]) });
  diag.registerMetric({ name:"frame.update",        displayName:"ECS Update",      category:MetricCategory.FRAME, group:"Frame",  unit:MetricUnit.MILLISECONDS, type:MetricType.TIMER,   tags:Object.freeze(["frame","ecs"]) });
  diag.registerMetric({ name:"ecs.world.entities",  displayName:"Alive Entities",  category:MetricCategory.ECS,   group:"World", unit:MetricUnit.COUNT,         type:MetricType.GAUGE,   tags:Object.freeze(["ecs","world"]) });
  diag.registerMetric({ name:"ecs.world.archetypes",displayName:"Archetypes",      category:MetricCategory.ECS,   group:"World", unit:MetricUnit.COUNT,         type:MetricType.GAUGE,   tags:Object.freeze(["ecs","world"]) });
  diag.registerMetric({ name:"ecs.world.systems",   displayName:"Systems",         category:MetricCategory.ECS,   group:"World", unit:MetricUnit.COUNT,         type:MetricType.GAUGE,   tags:Object.freeze(["ecs","world"]) });
  diag.registerMetric({ name:"ecs.entitiesCreated", displayName:"Entities Created",category:MetricCategory.ECS,   group:"World", unit:MetricUnit.COUNT,         type:MetricType.COUNTER, tags:Object.freeze(["ecs"]) });
  diag.registerMetric({ name:"ecs.entitiesDestroyed",displayName:"Entities Destroyed",category:MetricCategory.ECS,group:"World", unit:MetricUnit.COUNT,         type:MetricType.COUNTER, tags:Object.freeze(["ecs"]) });
  diag.registerMetric({ name:"ecs.componentsAdded",  displayName:"Components Added", category:MetricCategory.ECS,   group:"Changes", unit:MetricUnit.COUNT, type:MetricType.COUNTER, tags:Object.freeze(["ecs"]) });
  diag.registerMetric({ name:"ecs.componentsRemoved",displayName:"Components Removed",category:MetricCategory.ECS, group:"Changes", unit:MetricUnit.COUNT, type:MetricType.COUNTER, tags:Object.freeze(["ecs"]) });
  diag.registerMetric({ name:"ecs.entitiesMigrated", displayName:"Entities Migrated",category:MetricCategory.ECS,  group:"Changes", unit:MetricUnit.COUNT, type:MetricType.COUNTER, tags:Object.freeze(["ecs"]) });
  diag.registerMetric({ name:"ecs.archetypesCreated",displayName:"Archetypes Created",category:MetricCategory.ECS, group:"Changes", unit:MetricUnit.COUNT, type:MetricType.COUNTER, tags:Object.freeze(["ecs"]) });
  diag.registerMetric({ name:"ecs.world.components", displayName:"Components",       category:MetricCategory.ECS,   group:"World", unit:MetricUnit.COUNT, type:MetricType.GAUGE,   tags:Object.freeze(["ecs","world"]) });
  diag.registerMetric({ name:"ecs.world.tables",     displayName:"Tables",           category:MetricCategory.ECS,   group:"World", unit:MetricUnit.COUNT, type:MetricType.GAUGE,   tags:Object.freeze(["ecs","world"]) });
  diag.registerMetric({ name:"ecs.world.capacity",   displayName:"Entity Capacity",  category:MetricCategory.ECS,   group:"World", unit:MetricUnit.COUNT, type:MetricType.GAUGE,   tags:Object.freeze(["ecs","world"]) });
  diag.registerMetric({ name:"ecs.systems.total",    displayName:"Systems Total",    category:MetricCategory.ECS,   group:"Scheduler", unit:MetricUnit.MILLISECONDS, type:MetricType.TIMER,  tags:Object.freeze(["ecs","scheduler"]) });
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
