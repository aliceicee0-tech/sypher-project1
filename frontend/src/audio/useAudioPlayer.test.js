import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { formatTime, useAudioPlayer } from './useAudioPlayer.js';

describe('formatTime', () => {
  it('formats whole seconds as m:ss', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(5)).toBe('0:05');
    expect(formatTime(65)).toBe('1:05');
    expect(formatTime(599)).toBe('9:59');
    expect(formatTime(3600)).toBe('60:00');
  });

  it('floors fractional seconds', () => {
    expect(formatTime(5.9)).toBe('0:05');
    expect(formatTime(63.99)).toBe('1:03');
  });

  it('handles non-finite / negative inputs', () => {
    expect(formatTime(NaN)).toBe('0:00');
    expect(formatTime(Infinity)).toBe('0:00');
    expect(formatTime(-1)).toBe('0:00');
  });
});

describe('useAudioPlayer', () => {
  it('exposes the expected state shape', () => {
    const { result } = renderHook(() => useAudioPlayer('https://cdn/x.mp3'));
    expect(result.current.playing).toBe(false);
    expect(result.current.currentTime).toBe(0);
    expect(result.current.duration).toBe(0);
    expect(typeof result.current.toggle).toBe('function');
    expect(typeof result.current.seekToFraction).toBe('function');
    expect(result.current.audioRef).toBeDefined();
  });

  it('toggle + seekToFraction are safe no-ops without a loaded element', () => {
    const { result } = renderHook(() => useAudioPlayer(null));
    expect(() => act(() => result.current.toggle())).not.toThrow();
    expect(() => act(() => result.current.seekToFraction(0.5))).not.toThrow();
  });
});
