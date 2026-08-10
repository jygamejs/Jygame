export class Animation {
  static schema = {
    clipId: "u16",
    frameIndex: "u32",
    elapsed: "f32",
    isPlaying: "u8",
    speed: "f32",
    mode: "u8",
    loop: "u8",
  };
}
