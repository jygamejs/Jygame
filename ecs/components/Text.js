export class Text {
  static schema = {
    fontHandle: "u16",
    contentHandle: "u32",
    align: "u8",
    letterSpacing: "f32",
    version: "u32",
    colorEnabled: "u8",
    surfaceVersion: "u32",
    renderMode: "u8",
    fontSize: "f32",
  };
}