import { describe, it, beforeEach } from "node:test";
import * as assert from "node:assert";

// These run with no DOM globals defined at all. If anything in the engine
// reaches for `document` or `window` directly again, this file fails loudly
// rather than silently depending on another test's mock.
import { Host, BrowserHost, HeadlessHost, HeadlessElement, createHeadlessContext2D }
  from "../../../core/Host.js";
import { Game } from "../../../core/Game.js";
import { Scene } from "../../../core/Scene.js";
import { Sprite } from "../../../display/Sprite.js";
import { CanvasRenderer } from "../../../renderer/CanvasRenderer.js";

describe("the test environment really is headless", () => {
  it("has no DOM globals", () => {
    assert.strictEqual(typeof document, "undefined");
    assert.strictEqual(typeof window, "undefined");
  });
});

describe("Host contract", () => {
  it("the base class refuses to guess", () => {
    const h = new Host();
    assert.throws(() => h.createElement("div"), /not implemented/);
    assert.throws(() => h.defaultParent, /not implemented/);
    assert.throws(() => h.requestFrame(() => {}), /not implemented/);
  });

  it("BrowserHost and HeadlessHost implement the same surface", () => {
    const methods = [
      "createElement", "querySelector", "computedStyle", "requestFrame",
      "cancelFrame", "now", "onWindow", "offWindow", "onDocument", "offDocument",
      "observeResize", "openWindow", "createObjectURL",
    ];
    for (const m of methods) {
      assert.strictEqual(typeof BrowserHost.prototype[m], "function", `BrowserHost.${m}`);
      assert.strictEqual(typeof HeadlessHost.prototype[m], "function", `HeadlessHost.${m}`);
    }
  });
});

describe("HeadlessElement", () => {
  it("tracks parentage through append and remove", () => {
    const parent = new HeadlessElement("div");
    const child = new HeadlessElement("span");
    parent.appendChild(child);
    assert.strictEqual(child.parentNode, parent);
    assert.deepStrictEqual(parent.children, [child]);

    child.remove();
    assert.strictEqual(child.parentNode, null);
    assert.deepStrictEqual(parent.children, []);
  });

  it("reparents rather than duplicating", () => {
    const a = new HeadlessElement("div");
    const b = new HeadlessElement("div");
    const child = new HeadlessElement("span");
    a.appendChild(child);
    b.appendChild(child);
    assert.deepStrictEqual(a.children, []);
    assert.deepStrictEqual(b.children, [child]);
  });

  it("replaceChild swaps in place", () => {
    const parent = new HeadlessElement("div");
    const first = new HeadlessElement("span");
    const second = new HeadlessElement("span");
    parent.appendChild(first);
    parent.replaceChild(second, first);
    assert.deepStrictEqual(parent.children, [second]);
    assert.strictEqual(first.parentNode, null);
  });

  it("dispatches to listeners and honours removal", () => {
    const el = new HeadlessElement("div");
    let n = 0;
    const fn = () => n++;
    el.addEventListener("click", fn);
    el.dispatch("click");
    assert.strictEqual(n, 1);
    el.removeEventListener("click", fn);
    el.dispatch("click");
    assert.strictEqual(n, 1);
  });

  it("only canvases return a context", () => {
    const host = new HeadlessHost();
    assert.ok(host.createElement("canvas").getContext("2d"));
    assert.strictEqual(host.createElement("div").getContext("2d"), null);
    assert.strictEqual(host.createElement("canvas").getContext("webgl2"), null);
  });
});

describe("HeadlessHost", () => {
  let host;
  beforeEach(() => { host = new HeadlessHost({ width: 320, height: 240 }); });

  it("drives frames on demand instead of a real rAF", () => {
    let calls = 0;
    const tick = () => { calls++; host.requestFrame(tick); };
    host.requestFrame(tick);

    host.advance(16);
    assert.strictEqual(calls, 1, "one pass runs exactly one frame");
    host.flushFrames(9);
    assert.strictEqual(calls, 10);
  });

  it("advances its own clock", () => {
    assert.strictEqual(host.now(), 0);
    host.advance(100);
    assert.strictEqual(host.now(), 100);
  });

  it("cancelFrame drops a pending callback", () => {
    let calls = 0;
    const handle = host.requestFrame(() => calls++);
    host.cancelFrame(handle);
    host.advance(16);
    assert.strictEqual(calls, 0);
  });

  it("routes window and document events separately", () => {
    let win = 0, doc = 0;
    host.onWindow("focus", () => win++);
    host.onDocument("visibilitychange", () => doc++);

    host.emitWindow("focus");
    assert.strictEqual(win, 1);
    assert.strictEqual(doc, 0);

    host.emitDocument("visibilitychange");
    assert.strictEqual(doc, 1);
  });

  it("resolves registered selectors", () => {
    const el = new HeadlessElement("div");
    host.registerSelector("#stage", el);
    assert.strictEqual(host.querySelector("#stage"), el);
    assert.strictEqual(host.querySelector("#missing"), null);
  });

  it("records opened windows and object URLs", () => {
    const url = host.createObjectURL("<html></html>", "text/html");
    host.openWindow(url, "target");
    assert.strictEqual(host.createdObjectURLs.length, 1);
    assert.strictEqual(host.createdObjectURLs[0].type, "text/html");
    assert.strictEqual(host.openedWindows[0].name, "target");
  });
});

describe("the headless 2D context accepts the full render path", () => {
  it("implements what CanvasRenderer calls", () => {
    const ctx = createHeadlessContext2D();
    for (const m of ["save", "restore", "clearRect", "setTransform", "drawImage",
                     "fillRect", "beginPath", "arc", "fill", "getTransform"]) {
      assert.strictEqual(typeof ctx[m], "function", `context.${m}`);
    }
    const mat = ctx.getTransform();
    assert.strictEqual(mat.a, 1);
    assert.strictEqual(mat.f, 0);
  });
});

describe("Scene needs no DOM", () => {
  it("constructs without a host or a document", () => {
    const scene = new Scene();
    assert.ok(scene);
    // root is lazy: with no game and no document there is simply nothing to make.
    assert.strictEqual(scene._root, null);
    assert.strictEqual(scene.root, null);
  });

  it("gets its root from the game's host once mounted", () => {
    const host = new HeadlessHost();
    const game = new Game({ width: 100, height: 100, host });
    const scene = new Scene();
    game.run(scene);

    assert.ok(scene.root, "a mounted scene has a root element");
    assert.strictEqual(scene.root.tagName, "DIV");
    assert.strictEqual(scene.root.style.position, "absolute");
    game.destroy();
  });
});

describe("Game runs headless", () => {
  let host;
  let game;

  beforeEach(() => { host = new HeadlessHost({ width: 200, height: 150 }); });

  it("constructs and picks the canvas renderer", () => {
    game = new Game({ width: 200, height: 150, host });
    assert.ok(game.renderer instanceof CanvasRenderer);
    assert.ok(game.canvas);
    assert.ok(game.ctx, "the headless canvas still yields a 2D context");
    game.destroy();
  });

  it("runs the real frame loop through the host's frame pump", async () => {
    game = new Game({ width: 200, height: 150, host });

    class S extends Scene {
      async onEnter() {
        this.sprite = new Sprite(0, 0, 8, 8);
        this.sprite.velocity.x = 60; // px/sec
      }
    }
    const scene = new S();
    game.run(scene);
    await scene.whenReady();

    const startX = scene.sprite.x;
    assert.strictEqual(host.pendingFrameCount, 1, "run() armed a frame");

    host.flushFrames(60, 1000 / 60); // one simulated second

    assert.ok(
      scene.sprite.x - startX > 50,
      `expected ~60px of movement, got ${(scene.sprite.x - startX).toFixed(2)}`,
    );
    assert.ok(game._frameCount > 0, "frames were counted");
    game.destroy();
  });

  it("auto-pauses when the host reports hidden, and resumes", async () => {
    game = new Game({ width: 200, height: 150, host, autoPause: true });
    const scene = new Scene();
    game.run(scene);
    await scene.whenReady();

    assert.strictEqual(game.isPaused, false);
    host.setHidden(true);
    assert.strictEqual(game.isPaused, true, "hidden document should pause");
    host.setHidden(false);
    assert.strictEqual(game.isPaused, false, "becoming visible should resume");
    game.destroy();
  });

  it("releases every host listener on destroy", () => {
    const before = host.windowListenerCount + host.documentListenerCount;
    game = new Game({ width: 200, height: 150, host, scaleToFit: true });
    assert.ok(
      host.windowListenerCount + host.documentListenerCount > before,
      "constructing a game subscribes to host events",
    );

    game.destroy();
    assert.strictEqual(
      host.windowListenerCount + host.documentListenerCount, before,
      "destroy() must unsubscribe everything it subscribed",
    );
  });

  it("cancels its pending frame on destroy", () => {
    game = new Game({ width: 200, height: 150, host });
    game.run(new Scene());
    assert.strictEqual(host.pendingFrameCount, 1);
    game.destroy();
    assert.strictEqual(host.pendingFrameCount, 0, "no frame should survive destroy");
  });

  it("scaleToFit observes resize through the host", () => {
    game = new Game({ width: 200, height: 150, host, scaleToFit: true });
    assert.ok(game._viewport);
    assert.doesNotThrow(() => host.emitResize());
    game.destroy();
  });

  it("opens the debug workspace through the host", () => {
    game = new Game({ width: 200, height: 150, host, debug: true });
    game._openDebugWorkspace();
    assert.strictEqual(host.openedWindows.length, 1);
    assert.strictEqual(host.openedWindows[0].name, "jygame-debug-workspace");
    assert.strictEqual(host.createdObjectURLs[0].type, "text/html");
    game.destroy();
  });
});
