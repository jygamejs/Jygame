export class RenderQueue {
  constructor() {
    this._commands = [];
    this._count = 0;
  }

  get count() {
    return this._count;
  }

  clear() {
    const cmds = this._commands;
    for (let i = this._count - 1; i >= 0; i--) cmds[i].image = 0;
    this._count = 0;
  }

  push(image, x, y, rotation, scaleX, scaleY, width, height, fillColor, shape, layer) {
    let cmd = this._commands[this._count];
    if (!cmd) {
      cmd = { image: 0, x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, width: 0, height: 0, fillColor: 0, shape: 0, layer: 0 };
      this._commands[this._count] = cmd;
    }
    cmd.image = image;
    cmd.x = x;
    cmd.y = y;
    cmd.rotation = rotation;
    cmd.scaleX = scaleX;
    cmd.scaleY = scaleY;
    cmd.width = width;
    cmd.height = height;
    cmd.fillColor = fillColor;
    cmd.shape = shape;
    cmd.layer = layer;
    this._count++;
  }

  execute(ctx, camera) {
    ctx.save();
    if (camera) camera.apply(ctx);
    const mat = ctx.getTransform();
    const cache = this._fillStyleCache || (this._fillStyleCache = new Map());
    let lastColor = -1;
    for (let i = 0; i < this._count; i++) {
      const cmd = this._commands[i];
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
      if (cmd.image) {
        ctx.drawImage(cmd.image, -cmd.width / 2, -cmd.height / 2, cmd.width, cmd.height);
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
      }
    }
    ctx.restore();
  }
}
