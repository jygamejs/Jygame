export class AudioListener {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.target = null;
  }

  follow(entity) {
    this.target = entity;
  }

  unfollow() {
    this.target = null;
  }

  _syncTarget() {
    if (this.target) {
      this.x = this.target.x;
      this.y = this.target.y;
    }
  }
}
