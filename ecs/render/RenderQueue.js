// A command's position is stored in three slots per axis:
//
//   _curX/_curY   authoritative tick position, written by RenderSystem
//   _prevX/_prevY previous tick position, written by RenderSystem
//   x/y           what renderers read, written by applyAlpha()
//
// Keeping the output slot separate from the authoritative one is what makes
// applyAlpha() idempotent: it can be re-run every frame with a fresh alpha
// without repopulating the queue, so a frame that produces no simulation
// ticks costs one pass over pooled objects and no ECS work at all.
export class RenderQueue {
  constructor() {
    this._commands = [];
    this._count = 0;
    this._order = [];
    this.imagesDrawn = 0;
    this.primitivesDrawn = 0;

    // When interpolation is disabled there is no reason to carry the extra
    // endpoints, so push() skips those writes entirely and the queue behaves
    // exactly as it did before interpolation moved here.
    this.interpolation = true;

    // Hoisted so sorting does not allocate a comparator per frame. It closes
    // over the array directly rather than reading this._commands, which would
    // add a property load to every one of the ~n log n comparisons;
    // _commands is grown in place and never reassigned, so this stays valid.
    const cmds = this._commands;
    this._compare = (a, b) => {
      const ca = cmds[a];
      const cb = cmds[b];
      if (ca.layer !== cb.layer) return ca.layer - cb.layer;
      if (ca.depth !== cb.depth) return ca.depth - cb.depth;
      return a - b;
    };
  }

  get count() {
    return this._count;
  }

  clear() {
    const cmds = this._commands;
    for (let i = this._count - 1; i >= 0; i--) {
      cmds[i].sourceImage = null;
      cmds[i].sx = 0;
      cmds[i].sy = 0;
      cmds[i].sw = 0;
      cmds[i].sh = 0;
      cmds[i].depth = 0;
    }
    this._count = 0;
    this.imagesDrawn = 0;
    this.primitivesDrawn = 0;
  }

  push(sourceImage, sx, sy, sw, sh, x, y, rotation, scaleX, scaleY, width, height, fillColor, shape, layer, imageSmoothing, depth, prevX, prevY, interpolate) {
    let cmd = this._commands[this._count];
    if (!cmd) {
      cmd = { sourceImage: null, sx: 0, sy: 0, sw: 0, sh: 0, x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, width: 0, height: 0, fillColor: 0, shape: 0, layer: 0, depth: 0, imageSmoothing: true, _curX: 0, _curY: 0, _prevX: 0, _prevY: 0, _interp: 0 };
      this._commands[this._count] = cmd;
    }
    cmd.sourceImage = sourceImage;
    cmd.sx = sx;
    cmd.sy = sy;
    cmd.sw = sw;
    cmd.sh = sh;
    // x/y are always written so the queue is readable even if applyAlpha is
    // never called; applyAlpha overwrites them when interpolation is active.
    cmd.x = x;
    cmd.y = y;
    if (this.interpolation) {
      cmd._curX = x;
      cmd._curY = y;
      cmd._prevX = prevX !== undefined ? prevX : x;
      cmd._prevY = prevY !== undefined ? prevY : y;
      cmd._interp = interpolate ? 1 : 0;
    }
    cmd.rotation = rotation;
    cmd.scaleX = scaleX;
    cmd.scaleY = scaleY;
    cmd.width = width;
    cmd.height = height;
    cmd.fillColor = fillColor;
    cmd.shape = shape;
    cmd.layer = layer;
    cmd.imageSmoothing = imageSmoothing !== undefined ? imageSmoothing : true;
    cmd.depth = depth || 0;
    this._count++;
  }

  // Blends each command's render position between its previous and current
  // tick positions. Allocation-free, and safe to call repeatedly on the same
  // queue contents — it always reads from _prev/_cur and only writes x/y.
  applyAlpha(alpha) {
    if (!this.interpolation) return;
    const cmds = this._commands;
    const count = this._count;
    for (let i = 0; i < count; i++) {
      const cmd = cmds[i];
      if (cmd._interp === 0) {
        cmd.x = cmd._curX;
        cmd.y = cmd._curY;
        continue;
      }
      const px = cmd._prevX;
      const py = cmd._prevY;
      cmd.x = px + (cmd._curX - px) * alpha;
      cmd.y = py + (cmd._curY - py) * alpha;
    }
  }

  forEachCommandSorted(fn) {
    const count = this._count;
    if (count === 0) return;
    const cmds = this._commands;
    if (count === 1) {
      fn(cmds[0], 0);
      return;
    }
    const order = this._order;
    order.length = 0;
    for (let i = 0; i < count; i++) order.push(i);
    order.sort(this._compare);
    for (let n = 0; n < count; n++) {
      fn(cmds[order[n]], order[n]);
    }
  }

  // `baseMatrix`, when supplied, is the current context transform as six
  // scalars. Reading it back via ctx.getTransform() allocates a DOMMatrix on
  // every call — one browser-side allocation per frame, per scene — and the
  // caller already knows the camera transform it just applied.
  execute(ctx, layerMask = 0xFFFFFFFF, baseMatrix = null) {
    ctx.save();
    const mat = baseMatrix || ctx.getTransform();
    const cache = this._fillStyleCache || (this._fillStyleCache = new Map());
    let lastColor = -1;
    let images = 0, primitives = 0;

    const count = this._count;
    const cmds = this._commands;
    let order = null;

    if (count > 1) {
      order = this._order;
      order.length = 0;
      for (let i = 0; i < count; i++) order.push(i);
      order.sort(this._compare);
    }

    for (let n = 0; n < count; n++) {
      const i = order ? order[n] : n;
      const cmd = cmds[i];
      if (!(cmd.layer & layerMask)) continue;
      const rot = cmd.rotation;
      const sx = cmd.scaleX;
      const sy = cmd.scaleY;
      if (rot === 0 && sx === 1 && sy === 1) {
        ctx.setTransform(
          mat.a, mat.b, mat.c, mat.d,
          mat.a * cmd.x + mat.c * cmd.y + mat.e,
          mat.b * cmd.x + mat.d * cmd.y + mat.f
        );
      } else {
        const cos = Math.cos(rot);
        const sin = Math.sin(rot);
        const a = cos * sx;
        const b = sin * sx;
        const c = -sin * sy;
        const d = cos * sy;
        ctx.setTransform(
          mat.a * a + mat.c * b, mat.b * a + mat.d * b,
          mat.a * c + mat.c * d, mat.b * c + mat.d * d,
          mat.a * cmd.x + mat.c * cmd.y + mat.e,
          mat.b * cmd.x + mat.d * cmd.y + mat.f
        );
      }
      if (cmd.sourceImage) {
        ctx.imageSmoothingEnabled = cmd.imageSmoothing;
        ctx.drawImage(cmd.sourceImage, cmd.sx, cmd.sy, cmd.sw, cmd.sh, -cmd.width / 2, -cmd.height / 2, cmd.width, cmd.height);
        images++;
      } else {
        const hw = cmd.width * 0.5;
        const hh = cmd.height * 0.5;
        if (cmd.fillColor !== lastColor) {
          lastColor = cmd.fillColor;
          let fillStyle = cache.get(cmd.fillColor);
          if (fillStyle === undefined) {
            fillStyle = "#" + cmd.fillColor.toString(16).padStart(6, "0");
            cache.set(cmd.fillColor, fillStyle);
          }
          ctx.fillStyle = fillStyle;
        }
        if (cmd.shape === 1) {
          ctx.beginPath();
          ctx.arc(0, 0, hw < hh ? hw : hh, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(-hw, -hh, cmd.width, cmd.height);
        }
        primitives++;
      }
    }
    ctx.restore();
    this.imagesDrawn = images;
    this.primitivesDrawn = primitives;
  }
}
