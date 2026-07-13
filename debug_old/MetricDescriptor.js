export class MetricDescriptor {
  #id;
  #name;
  #displayName;
  #category;
  #group;
  #unit;
  #type;
  #priority;
  #tags;
  #description;
  #budget;
  #warnAt;
  #critAt;
  #format;
  #color;

  constructor(descriptor) {
    this.#id = descriptor.id;
    this.#name = descriptor.name;
    this.#displayName = descriptor.displayName ?? descriptor.name;
    this.#category = descriptor.category;
    this.#group = descriptor.group ?? "";
    this.#unit = descriptor.unit;
    this.#type = descriptor.type;
    this.#priority = descriptor.priority ?? 0;
    this.#tags = descriptor.tags ? Object.freeze([...descriptor.tags]) : Object.freeze([]);
    this.#description = descriptor.description ?? "";
    this.#budget = descriptor.budget;
    this.#warnAt = descriptor.warnAt;
    this.#critAt = descriptor.critAt;
    this.#format = descriptor.format;
    this.#color = descriptor.color;
    Object.freeze(this);
  }

  get id()           { return this.#id; }
  get name()         { return this.#name; }
  get displayName()  { return this.#displayName; }
  get category()     { return this.#category; }
  get group()        { return this.#group; }
  get unit()         { return this.#unit; }
  get type()         { return this.#type; }
  get priority()     { return this.#priority; }
  get tags()         { return this.#tags; }
  get description()  { return this.#description; }
  get budget()       { return this.#budget; }
  get warnAt()       { return this.#warnAt; }
  get critAt()       { return this.#critAt; }
  get format()       { return this.#format; }
  get color()        { return this.#color; }
}
