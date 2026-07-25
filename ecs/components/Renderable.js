export class Renderable {
  static schema = {
    image:           { type: "u16", default: 0 },
    fillColor:       { type: "u32", default: 0xffffff },
    shape:           { type: "u8",  default: 0 },
    layer:           { type: "i16", default: 1 },
    imageSmoothing:  { type: "u8",  default: 1 },
    nativeWidth:     { type: "u16", default: 0 },
    nativeHeight:    { type: "u16", default: 0 },
  };
}

