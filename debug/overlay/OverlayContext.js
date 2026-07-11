import { OffscreenCache } from "./OffscreenCache.js";

export class OverlayContext {
  constructor({ history, registry, analysis, config, theme, captures, renderers } = {}) {
    this.history = history || null;
    this.registry = registry || null;
    this.analysis = analysis || null;
    this.config = config || null;
    this.theme = theme || null;
    this.captures = captures || [];

    this.layout = null;
    this.input = null;
    this.selection = null;
    this.commands = null;
    this.tooltips = null;
    this.renderers = renderers || null;
    this.animation = null;
    this.cache = new OffscreenCache();
  }
}
