export class TimelineRenderer {
  constructor(context, interaction) {
    this.ctx = context;
    this._interaction = interaction;
  }

  render(ctx, rect, model, frameNumber) {
    const theme = this.ctx.theme;
    if (!theme) return;

    const tr = this.ctx.renderers?.text;
    const fbr = this.ctx.renderers?.frameBar;

    if (tr) {
      tr.render(ctx, `Frame ${frameNumber ?? ""}`, rect.x + 4, rect.y + 4, {
        size: theme.fontSizeSmall,
        color: theme.textDim,
      });
    }

    let y = rect.y + 20;
    for (const row of this._walkVisible(model.tree, model)) {
      if (y > rect.y + rect.height) break;

      if (row.children.length > 0) {
        ctx.fillStyle = theme.text;
        ctx.font = `${theme.fontSize}px ${theme.fontFamily}`;
        ctx.fillText(model.isExpanded(row.id) ? "▾" : "▸", rect.x + 4, y + 9);
      }

      const barX = rect.x + 20;
      if (fbr) {
        fbr.render(ctx, barX, y, rect.x + rect.width - barX, 18, {
          duration: row.value,
          total: model.tree[0]?.value || 1,
          color: row.color || theme.categoryFrame,
          label: row.displayName,
          depth: row.depth,
        }, theme);
      }

      if (this._interaction) {
        this._interaction.trackRow(row.id, y, 20);
      }

      y += 20;
    }
  }

  *_walkVisible(tree, model, depth = 0) {
    for (const node of tree) {
      yield { ...node, depth };
      if (node.children.length > 0 && model.isExpanded(node.id)) {
        yield* this._walkVisible(node.children, model, depth + 1);
      }
    }
  }
}
