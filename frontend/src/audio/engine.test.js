import { describe, it, expect, vi, beforeEach } from 'vitest';
import { audioEngine } from './engine.js';

// The AudioEngine wraps HTMLAudioElement and instantiates it with `new Audio()`.
// jsdom has no Audio, so we install a constructable fake. A class works with `new`.
class FakeAudio {
  constructor() {
    this.src = '';
    this.volume = 1;
    this.paused = true;
    this.currentTime = 0;
    this.play = vi.fn(() => Promise.resolve());
    this.pause = vi.fn(() => { this.paused = true; });
    this.addEventListener = vi.fn();
    this.removeEventListener = vi.fn();
  }
}

// Returns a constructor that always yields the SAME pre-made instance object
// (a constructor returning an object literal beats `new`'s default `this`), so
// the engine stores and mutates exactly the instance a test asserts on.
function makeAudioCtor(el) {
  return function AudioCtor() {
    return el;
  };
}

describe('audio/engine', () => {
  beforeEach(() => {
    globalThis.Audio = FakeAudio;
    // Use a unique nodeId per test so the singleton's internal Map never overlaps.
  });

  it('load creates an element and sets src + clamped volume', () => {
    const el = new FakeAudio();
    globalThis.Audio = makeAudioCtor(el);
    audioEngine.load('n_load', 'https://cdn/a.mp3', 5);
    expect(el.src).toBe('https://cdn/a.mp3');
    expect(el.volume).toBe(1); // clamped to 1
  });

  it('load reuses the existing element when called twice with the same id', () => {
    const factory = vi.fn(() => new FakeAudio());
    globalThis.Audio = function AudioMock() { return factory(); };
    audioEngine.load('n_reuse', 'https://cdn/a.mp3');
    audioEngine.load('n_reuse', 'https://cdn/b.mp3');
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('setVolume updates the existing element volume (clamped)', () => {
    const el = new FakeAudio();
    globalThis.Audio = makeAudioCtor(el);
    audioEngine.load('n_vol', 'https://cdn/a.mp3');
    audioEngine.setVolume('n_vol', -1);
    expect(el.volume).toBe(0);
    audioEngine.setVolume('n_vol', 2);
    expect(el.volume).toBe(1);
  });

  it('play / pause / toggle operate on the element', () => {
    const el = new FakeAudio();
    el.paused = false;
    globalThis.Audio = makeAudioCtor(el);
    audioEngine.load('n_pp', 'https://cdn/a.mp3');

    audioEngine.play('n_pp');
    expect(el.play).toHaveBeenCalled();

    audioEngine.pause('n_pp');
    expect(el.pause).toHaveBeenCalled();

    // toggle when paused returns true (starts playback).
    el.paused = true;
    expect(audioEngine.toggle('n_pp')).toBe(true);
    // toggle when playing returns false (pauses).
    el.paused = false;
    expect(audioEngine.toggle('n_pp')).toBe(false);
  });

  it('toggle on an unknown id returns false (no element)', () => {
    expect(audioEngine.toggle('never_loaded')).toBe(false);
  });

  it('stopAll pauses every loaded element and resets currentTime', () => {
    const elA = new FakeAudio();
    const elB = new FakeAudio();
    const queue = [elA, elB];
    globalThis.Audio = function AudioCtor() { return queue.shift(); };
    audioEngine.load('n_s1', 'https://cdn/a.mp3');
    audioEngine.load('n_s2', 'https://cdn/b.mp3');
    audioEngine.stopAll();
    expect(elA.pause).toHaveBeenCalled();
    expect(elA.currentTime).toBe(0);
    expect(elB.pause).toHaveBeenCalled();
    expect(elB.currentTime).toBe(0);
  });
});
