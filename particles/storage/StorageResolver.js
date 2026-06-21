import { SoAParticleStorage } from "./SoAParticleStorage.js";
import { ObjectParticleStorage } from "./ObjectParticleStorage.js";
import { SoAParticleAccessor } from "../accessors/SoAParticleAccessor.js";
import { ObjectParticleAccessor } from "../accessors/ObjectParticleAccessor.js";

export class StorageResolver {
  static get DEFAULT_STORAGE() {
    return SoAParticleStorage;
  }

  static get SUPPORTED_TYPES() {
    return [SoAParticleStorage, ObjectParticleStorage];
  }

  static createDefault(capacity) {
    return new SoAParticleStorage({ capacity });
  }

  static isSoA(storage) {
    return storage instanceof SoAParticleStorage;
  }

  static isObject(storage) {
    return storage instanceof ObjectParticleStorage;
  }

  static isValid(storage) {
    return storage == null || this.isSoA(storage) || this.isObject(storage);
  }

  static createAccessor(storage) {
    if (this.isSoA(storage)) {
      return new SoAParticleAccessor(storage, 0);
    }
    return new ObjectParticleAccessor();
  }

  static describe(storage) {
    if (this.isSoA(storage)) return "SoA";
    if (this.isObject(storage)) return "Object";
    return "Unknown";
  }
}
