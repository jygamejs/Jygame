import { Panel } from "../Panel.js";
import { TimelineModel } from "../timeline/TimelineModel.js";
import { TimelineRenderer } from "../timeline/TimelineRenderer.js";
import { TimelineInteraction } from "../timeline/TimelineInteraction.js";

export class TimelinePanel extends Panel {
  static metadata = { id: "timeline", title: "Timeline", icon: "\u231A", group: "Analysis", pinned: false, searchable: true };
  constructor(context) {
    super("timeline", "Timeline", context, {
      icon: "\u231A",
      defaultWidth: 700,
      defaultHeight: 300,
      minWidth: 250,
      minHeight: 120,
    });
    this._model = new TimelineModel(context);
    this._interaction = new TimelineInteraction(context, this._model);
    this._renderer = new TimelineRenderer(context, this._interaction);
  }

  update(data) {
    const history = this.ctx.history;
    if (!history || !history.count) return;
    const idx = this._model.frameIndex >= 0 ? this._model.frameIndex : history.count - 1;
    this._model.frameIndex = idx;
  }

  render(ctx, rect) {
    if (!rect) return;
    const theme = this.ctx.theme;
    ctx.fillStyle = theme?.panelBg || "rgba(30,30,45,0.95)";
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

    this._interaction.reset();
    this._renderer.render(ctx, rect, this._model);
  }

  handleInput(event) {
    return this._interaction.onInput(event);
  }
}
