export class ViewContext {
  constructor({ history, registry, analysis, theme, selection, config } = {}) {
    this.history = history ?? null;
    this.registry = registry ?? null;
    this.analysis = analysis ?? null;
    this.theme = theme ?? null;
    this.selection = selection ?? null;
    this.config = Object.freeze({ ...config });
    Object.freeze(this);
  }

  with(overrides) {
    return new ViewContext({
      history: overrides.history ?? this.history,
      registry: overrides.registry ?? this.registry,
      analysis: overrides.analysis ?? this.analysis,
      theme: overrides.theme ?? this.theme,
      selection: overrides.selection ?? this.selection,
      config: overrides.config ?? this.config,
    });
  }
}
