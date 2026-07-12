export class InputRouter {
  constructor(context, panels, layout) {
    this._ctx = context;
    this._panels = panels;
    this._layout = layout;
    this._focusedPanelId = null;
    this._textTarget = null;
  }

  get focusedPanelId() { return this._focusedPanelId; }

  get textTarget() { return this._textTarget; }

  focus(panelId) {
    this._focusedPanelId = panelId;
  }

  setTextTarget(panel) {
    this._textTarget = panel;
    if (panel) this._focusedPanelId = panel.id;
  }

  clearTextTarget() {
    if (this._textTarget && typeof this._textTarget.deactivateSearch === "function") {
      this._textTarget.deactivateSearch();
    }
    this._textTarget = null;
  }

  process(event) {
    if (this._capturePhase(event)) return true;
    if (this._layoutPhase(event)) return true;
    if (this._widgetsPhase(event)) return true;
    if (this._panelsPhase(event)) return true;
    if (this._bubblePhase(event)) return true;
    return false;
  }

  _capturePhase(event) {
    const tooltips = this._ctx.tooltips;
    const animation = this._ctx.animation;
    const commands = this._ctx.commands;

    if (tooltips) tooltips.onInput(event);
    if (animation) animation.onInput(event);

    if (event.type === "keydown") {
      if (event.key === "Escape") {
        if (this._textTarget) {
          this.clearTextTarget();
          return true;
        }
        this._focusedPanelId = null;
        return true;
      }

      if (this._textTarget && typeof this._textTarget.appendQuery === "function") {
        if (event.printable) {
          this._textTarget.appendQuery(event.key);
          return true;
        }
        if (event.key === "Backspace") {
          if (typeof this._textTarget.backspaceQuery === "function") {
            this._textTarget.backspaceQuery();
          }
          return true;
        }
        if (event.key === "Enter") {
          this.clearTextTarget();
          return true;
        }
        return false;
      }

      if (commands) {
        const cmdName = commands.resolveShortcut(event.key);
        if (cmdName) {
          commands.execute(cmdName);
          return true;
        }
      }
    }
    return false;
  }

  _layoutPhase(event) {
    if (event.type === "pointerdown" || event.type === "mousedown" ||
        event.type === "pointermove" || event.type === "mousemove" ||
        event.type === "pointerup" || event.type === "mouseup") {
      if (this._layout.onInput(event)) return true;
    }
    return false;
  }

  _widgetsPhase(event) {
    if (this._focusedPanelId && (event.type === "click" || event.type === "pointerdown")) {
      const panel = this._panels.get(this._focusedPanelId);
      if (panel && typeof panel.handleWidgetInput === "function") {
        return panel.handleWidgetInput(event);
      }
    }
    return false;
  }

  _panelsPhase(event) {
    const isPointer = event.type === "click" || event.type === "pointerdown" ||
                      event.type === "mousedown" || event.type === "pointerup" ||
                      event.type === "mouseup";

    if (isPointer && event.x != null && event.y != null) {
      const result = this._layout.hitTest(event.x, event.y);
      if (result && result.type === "panel") {
        this._focusedPanelId = result.panelId;
        const panel = this._panels.get(result.panelId);
        if (panel && typeof panel.handleInput === "function") {
          return panel.handleInput(event);
        }
      }
    }

    if (event.type === "keydown" && this._focusedPanelId) {
      const panel = this._panels.get(this._focusedPanelId);
      if (panel && typeof panel.handleInput === "function") {
        return panel.handleInput(event);
      }
    }

    return false;
  }

  _bubblePhase(event) {
    if (event.type === "click" || event.type === "pointerdown") {
      if (!this._layout.hitTest(event.x, event.y)) {
        this._focusedPanelId = null;
        this.clearTextTarget();
        return true;
      }
    }
    return false;
  }
}
