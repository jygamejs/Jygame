# Input API Reference

## Query Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `Input.down(name)` | `boolean` | Held this frame |
| `Input.pressed(name)` | `boolean` | Just pressed this frame (edge) |
| `Input.released(name)` | `boolean` | Just released this frame (edge) |
| `Input.value(name)` | `number` | Analog strength (0–1 for digital, raw for analog) |
| `Input.axis(name)` | `{x, y}` | 2D directional vector for VECTOR2 actions |

All methods accept action names (e.g. `"move"`, `"jump"`) or raw key/button strings
(e.g. `"W"`, `"SPACE"`, `"MOUSE_LEFT"`). Strings are case-insensitive.

## Binding Methods

| Method | Description |
|--------|-------------|
| `Input.bind(name, binding)` | Bind or replace an action at runtime |
| `Input.unbind(name)` | Remove all bindings for an action |
| `Input.addBinding(name, binding)` | Add an additional binding to an existing action |
| `Input.removeBinding(name, keyString)` | Remove a specific key binding by key name |
| `Input.bindings()` | Get all bindings as a plain object |
| `Input.buffer(name, ms)` | Buffer an action so it stays pressed for `ms` after release |

## Properties

| Property | Type | Description |
|----------|------|-------------|
| `Input.pointer` | `PointerFacade` | Primary pointer (mouse + stylus + touch unified) |
| `Input.touch` | `TouchFacade` | Touch-specific contacts |
| `Input.wheel` | `number` | Scroll wheel delta this frame |
| `Input.wheelX` | `number` | Horizontal scroll wheel delta |
| `Input.raw` | `object|null` | Direct access to engine internals (`devices`, `contextStack`, `events`, `backend`, `coordinateSystem`) |

## PointerFacade (`Input.pointer`)

| Property | Type | Description |
|----------|------|-------------|
| `.x` | `number` | Screen-space X |
| `.y` | `number` | Screen-space Y |
| `.worldX` | `number` | World-space X (via CoordinateSystem) |
| `.worldY` | `number` | World-space Y |
| `.down` | `boolean` | Primary pointer button held |
| `.justPressed` | `boolean` | Primary pointer just pressed |
| `.justReleased` | `boolean` | Primary pointer just released |
| `.deltaX` | `number` | Movement delta X this frame |
| `.deltaY` | `number` | Movement delta Y this frame |
| `.pressure` | `number` | Pointer pressure (0–1) |

## TouchFacade (`Input.touch`)

| Property | Type | Description |
|----------|------|-------------|
| `.count` | `number` | Number of active touch contacts |
| `.contacts` | `array` | All touch contacts with `{id, x, y, down, justPressed, justReleased, pressure}` |
| `.primary` | `object|null` | First touch contact (same shape as contact), or `null` |

## Event Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `Input.onSwipe(cb)` | `function` (teardown) | Register a swipe callback |
| `Input.onTap(cb)` | `function` (teardown) | Register a tap callback |
| `Input.removeSwipe(cb)` | — | Remove a swipe callback |
| `Input.removeTap(cb)` | — | Remove a tap callback |

## Internal / Engine Methods

Used by the engine; not typically called in user code.

| Method | Description |
|--------|-------------|
| `Input.setDefault(ctx)` | Set the fallback InputContext |
| `Input.getDefault()` | Get the fallback InputContext |
| `Input.setSystem(system)` | Wire the InputSystem (called by Game constructor) |
| `Input.destroy()` | Cleanup |
| `Input.updateFrame()` | Advance frame (called by engine loop) |
| `Input.clearJustPressed()` | Reset edge state |
| `Input.consumeBuffer()` | Drain buffered events |
| `Input.peekBuffer()` | Peek at buffered events |
| `Input.buffer` | `array` — event buffer |

## Deprecated (removed in next major)

These emit a one-time console warning.

| Old API | Replacement |
|---------|-------------|
| `Input.isDown(key)` | `Input.down(name)` |
| `Input.justPressed(key)` | `Input.pressed(name)` |
| `Input.justReleased(key)` | `Input.released(name)` |
| `Input.init(target)` | `new Game(...)` |
| `Input.x` | `Input.pointer.x` |
| `Input.y` | `Input.pointer.y` |
| `Input.isPointerDown` | `Input.pointer.down` |
| `Input.pointerCount` | `Input.touch.count` |
| `Input.getPointer(id)` | `Input.pointer` |
| `Input.getPointers()` | `Input.touch.contacts` |
| `Input.forEachPointer(fn)` | `Input.touch.contacts` |
| `Input.mapKey(raw, alias)` | `Input.bind()` |
| `Input.unmapKey(raw)` | `Input.unbind()` |
| `Input.setKeyMap(map)` | `Input.bind()` |
| `Input.resetKeyMap()` | `Input.unbind()` |
| `Input.getKeyMap()` | `Input.bindings()` |

## Raw Key Strings

Every query method accepts raw key/button strings without any setup:

```
Letters:     "A"–"Z"
Numbers:     "0"–"9"
Arrows:      "UP", "DOWN", "LEFT", "RIGHT"
Modifiers:   "SHIFT", "CTRL", "ALT", "META"
Special:     "SPACE", "ENTER", "TAB", "ESCAPE", "BACKSPACE", "DELETE"
             "HOME", "END", "PAGEUP", "PAGEDOWN", "INSERT"
             "CAPSLOCK", "NUMLOCK", "SCROLLLOCK", "PAUSE"
F-keys:      "F1"–"F24"
Numpad:      "NUMPAD0"–"NUMPAD9"
Mouse:       "MOUSE_LEFT", "MOUSE_RIGHT", "MOUSE_MIDDLE", "MOUSE_BACK", "MOUSE_FORWARD"
```

These work without any setup: `Input.down("W")`, `Input.pressed("SPACE")`, etc.

## Declarative Scene Bindings

Set `input` as a class field on a Scene subclass:

```js
class MyScene extends Scene {
  input = {
    move: { up: "W", down: "S", left: "A", right: "D" },
    jump: "SPACE",
    shoot: "MOUSE_LEFT",
  }
}
```

Suported binding shapes:

| Shape | Result |
|-------|--------|
| `jump: "SPACE"` | Single digital key |
| `shoot: ["MOUSE_LEFT", "SPACE"]` | Multiple keys, same action (OR) |
| `move: { up: "W", down: "S", left: "A", right: "D" }` | VECTOR2 axis |
| `save: { key: "S", ctrl: true }` | Chord (Ctrl+S) |

Dynamic rebinding works by reassigning on the scene:

```js
this.input.jump = "SHIFT";       // recompiles the "jump" action
this.input.newAction = "F";      // recompiles all actions
```
