import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * React hook that drives a single HTMLAudioElement with the state we need for
 * a real waveform player: play/pause toggle, current time, duration, and seek.
 *
 * The audio element is created lazily and reused across renders, so swapping
 * the `src` (e.g. from a live stream URL to the final file) is seamless.
 */
export function useAudioPlayer(src) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Lazily create the element once, then keep its src in sync.
  if (audioRef.current === null && typeof Audio !== 'undefined') {
    audioRef.current = new Audio();
    audioRef.current.preload = 'metadata';
  }

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (src && el.src !== src) {
      el.src = src;
      // Reset progress when the source changes.
      setCurrentTime(0);
      setDuration(0);
    }
  }, [src]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    const onTime = () => setCurrentTime(el.currentTime || 0);
    const onMeta = () => setDuration(el.duration || 0);
    const onEnd = () => setPlaying(false);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);

    el.addEventListener('timeupdate', onTime);
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('durationchange', onMeta);
    el.addEventListener('ended', onEnd);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);

    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('durationchange', onMeta);
      el.removeEventListener('ended', onEnd);
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
    };
  }, []);

  const toggle = useCallback(() => {
    const el = audioRef.current;
    if (!el || !el.src) return;
    if (el.paused) el.play().catch(() => {});
    else el.pause();
  }, []);

  // Seek to a fractional position (0..1) of the total duration.
  const seekToFraction = useCallback((fraction) => {
    const el = audioRef.current;
    if (!el || !el.duration) return;
    el.currentTime = Math.min(el.duration, Math.max(0, fraction * el.duration));
    setCurrentTime(el.currentTime);
  }, []);

  return { audioRef, playing, currentTime, duration, toggle, seekToFraction };
}

export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
