export class ViewContext {
  constructor({ history, registry, analysis, theme, selection, renderers, cache, config, captures, commands } = {}) {
    this.history = history ?? null;
    this.registry = registry ?? null;
    this.analysis = analysis ?? null;
    this.theme = theme ?? null;
    this.selection = selection ?? null;
    this.renderers = renderers ?? null;
    this.cache = cache ?? null;
    this.config = config ?? {};
    this.captures = captures ?? [];
    this.commands = commands ?? null;
  }

  with(overrides) {
    return new ViewContext({
      history: overrides.history ?? this.history,
      registry: overrides.registry ?? this.registry,
      analysis: overrides.analysis ?? this.analysis,
      theme: overrides.theme ?? this.theme,
      selection: overrides.selection ?? this.selection,
      renderers: overrides.renderers ?? this.renderers,
      cache: overrides.cache ?? this.cache,
      config: overrides.config ?? this.config,
      captures: overrides.captures ?? this.captures,
      commands: overrides.commands ?? this.commands,
    });
  }
}
