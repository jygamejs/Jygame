import { Device } from "./Device.js";
import { EventType } from "./EventType.js";

export class TextInput extends Device {
  constructor() {
    super();
    this._compositionActive = false;
    this._compositionString = "";
    this._characters = [];
  }

  get type() { return TextInput; }

  get compositionActive() {
    return this._compositionActive;
  }

  get compositionString() {
    return this._compositionString;
  }

  consumeCharacters() {
    const chars = this._characters.slice();
    this._characters.length = 0;
    return chars;
  }

  update(queue) {
    this._characters.length = 0;

    queue.each(event => {
      switch (event.type) {
        case EventType.COMPOSITION_START:
          this._compositionActive = true;
          this._compositionString = event.data?.data ?? "";
          break;

        case EventType.COMPOSITION_UPDATE:
          this._compositionString = event.data?.data ?? "";
          break;

        case EventType.COMPOSITION_END:
          this._compositionActive = false;
          if (event.data?.data) {
            this._characters.push(event.data.data);
          }
          this._compositionString = "";
          break;

        case EventType.KEY_DOWN:
          if (event.data?.printable && !this._compositionActive) {
            const key = event.data.key;
            if (key && key.length === 1) {
              this._characters.push(key);
            }
          }
          break;
      }
    });
  }
}
