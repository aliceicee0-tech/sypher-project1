// Minimal HTML5 Audio engine. Treblo returns complete files, so no Tone.js.
class AudioEngine {
  constructor() {
    this.elements = new Map(); // nodeId -> HTMLAudioElement
  }

  load(nodeId, url, volume = 1.0) {
    if (!url) return;
    let el = this.elements.get(nodeId);
    if (!el) {
      el = new Audio();
      this.elements.set(nodeId, el);
    }
    if (el.src !== url) el.src = url;
    el.volume = Math.min(1, Math.max(0, volume));
  }

  setVolume(nodeId, volume) {
    const el = this.elements.get(nodeId);
    if (el) el.volume = Math.min(1, Math.max(0, volume));
  }

  play(nodeId) {
    const el = this.elements.get(nodeId);
    if (el) el.play().catch(() => {});
  }

  pause(nodeId) {
    const el = this.elements.get(nodeId);
    if (el) el.pause();
  }

  toggle(nodeId) {
    const el = this.elements.get(nodeId);
    if (!el) return false;
    if (el.paused) {
      el.play().catch(() => {});
      return true;
    }
    el.pause();
    return false;
  }

  stopAll() {
    for (const el of this.elements.values()) {
      el.pause();
      el.currentTime = 0;
    }
  }

  // Play a list of node ids one after another (sequential chaining).
  async playSequence(nodeIds) {
    for (const id of nodeIds) {
      const el = this.elements.get(id);
      if (!el || !el.src) continue;
      el.currentTime = 0;
      await new Promise((resolve) => {
        const onEnd = () => {
          el.removeEventListener('ended', onEnd);
          resolve();
        };
        el.addEventListener('ended', onEnd);
        el.play().catch(resolve);
      });
    }
  }
}

export const audioEngine = new AudioEngine();
