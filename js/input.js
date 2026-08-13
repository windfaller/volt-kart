const BLOCK = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "Spacebar", "Shift", "Control"]);

export class Input {
  constructor() {
    this.accel = false;
    this.brake = false;
    this.left = false;
    this.right = false;
    this.drift = false;
    this.item = false;
    this._itemPressed = false;
    this._driftPressed = false;
    this.itemJustPressed = false;
    this.driftJustPressed = false;

    this._onDown = (e) => this.#fromKey(e, true);
    this._onUp = (e) => this.#fromKey(e, false);
    window.addEventListener("keydown", this._onDown, { passive: false });
    window.addEventListener("keyup", this._onUp);
    window.addEventListener("blur", () => this.reset());

    this.#bindTouch();
  }

  #fromKey(e, down) {
    const k = e.key;
    if (BLOCK.has(k) || e.code === "Space") e.preventDefault();
    switch (k) {
      case "w":
      case "W":
      case "ArrowUp":
        this.accel = down;
        break;
      case "s":
      case "S":
      case "ArrowDown":
        this.brake = down;
        break;
      case "a":
      case "A":
      case "ArrowLeft":
        this.left = down;
        break;
      case "d":
      case "D":
      case "ArrowRight":
        this.right = down;
        break;
      case " ":
      case "Spacebar":
      case "Shift":
        this.drift = down;
        if (down) this._driftPressed = true;
        break;
      case "e":
      case "E":
      case "Control":
        this.item = down;
        if (down) this._itemPressed = true;
        break;
      default:
        if (e.code === "Space") {
          this.drift = down;
          if (down) this._driftPressed = true;
        }
    }
  }

  #bindTouch() {
    const root = document.getElementById("touch-controls");
    if (!root) return;
    const map = {
      accel: "accel",
      brake: "brake",
      left: "left",
      right: "right",
      drift: "drift",
      item: "item",
    };
    const setBtn = (key, down, el) => {
      if (!(key in map)) return;
      this[map[key]] = down;
      if (down && key === "item") this._itemPressed = true;
      if (down && key === "drift") this._driftPressed = true;
      el.classList.toggle("active", down);
    };
    root.querySelectorAll("button[data-key]").forEach((el) => {
      const key = el.dataset.key;
      const start = (ev) => {
        ev.preventDefault();
        setBtn(key, true, el);
      };
      const end = (ev) => {
        ev.preventDefault();
        setBtn(key, false, el);
      };
      el.addEventListener("pointerdown", start);
      el.addEventListener("pointerup", end);
      el.addEventListener("pointercancel", end);
      el.addEventListener("pointerleave", end);
      el.addEventListener("contextmenu", (e) => e.preventDefault());
    });
  }

  steer() {
    return (this.right ? 1 : 0) - (this.left ? 1 : 0);
  }

  beginFrame() {
    this.itemJustPressed = this._itemPressed;
    this.driftJustPressed = this._driftPressed;
    this._itemPressed = false;
    this._driftPressed = false;
  }

  reset() {
    this.accel = this.brake = this.left = this.right = this.drift = this.item = false;
    this._itemPressed = this._driftPressed = false;
    this.itemJustPressed = this.driftJustPressed = false;
  }
}
