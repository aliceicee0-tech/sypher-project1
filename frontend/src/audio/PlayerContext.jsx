import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

/**
 * PlayerContext — app-wide audio playback.
 *
 * A single HTMLAudioElement is owned here (not per-component), so playback
 * survives route changes and drives the persistent MiniPlayer. This also fixes
 * the old bug where several per-card <Audio> elements could play at once.
 *
 * Features:
 *   - Single-track play / toggle
 *   - Queue-based playback with auto-advance
 *   - Volume control (persisted to localStorage)
 *   - Loop / repeat toggle
 *   - Global keyboard shortcuts (Space, arrows, etc.)
 *
 * Any component can start a track:
 *
 *   const player = usePlayer()
 *   player.play({ id, title, style_tags, audio_url })   // toggle / switch
 *   player.playList(list, startIndex)                    // play a whole list
 */
const PlayerContext = createContext(null);

const VOLUME_KEY = 'melodia.volume';
const LOOP_KEY = 'melodia.loop';

// Normalize the various track shapes the app produces into one canonical form.
const normalize = (t) => ({
  id: t.id || t.track_id || t.jobId || t.audio_url || t.audioUrl,
  title: t.title || (t.prompt ? t.prompt.slice(0, 60) : 'Untitled'),
  subtitle: Array.isArray(t.style_tags) ? t.style_tags.slice(0, 3).join(' · ') : '',
  audio_url: t.audio_url || t.audioUrl || '',
});

export function PlayerProvider({ children }) {
  const audioRef = useRef(null);
  if (audioRef.current === null && typeof Audio !== 'undefined') {
    audioRef.current = new Audio();
    audioRef.current.preload = 'metadata';
  }

  const [current, setCurrent] = useState(null); // the playing track record
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Volume: persisted to localStorage, default 0.8
  const [volume, setVolumeState] = useState(() => {
    const saved = Number(localStorage.getItem(VOLUME_KEY));
    return Number.isFinite(saved) && saved >= 0 && saved <= 1 ? saved : 0.8;
  });

  // Loop mode: off / one / all
  const [loop, setLoopState] = useState(() => {
    return localStorage.getItem(LOOP_KEY) || 'off';
  });

  // Apply volume to the audio element whenever it changes
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
    localStorage.setItem(VOLUME_KEY, String(volume));
  }, [volume]);

  useEffect(() => {
    localStorage.setItem(LOOP_KEY, loop);
  }, [loop]);

  const setVolume = useCallback((v) => {
    const clamped = Math.min(1, Math.max(0, v));
    setVolumeState(clamped);
  }, []);

  const cycleLoop = useCallback(() => {
    setLoopState((prev) => {
      if (prev === 'off') return 'one';
      if (prev === 'one') return 'all';
      return 'off';
    });
  }, []);

  // Queue lives in a ref so mutation + immediate read stays consistent; we bump
  // queueVersion to make consumers re-render.
  const queueRef = useRef([]);
  const [queueVersion, setQueueVersion] = useState(0);
  const indexRef = useRef(-1);
  const [index, setIndex] = useState(-1);
  const loopRef = useRef(loop);
  loopRef.current = loop;

  const loadAt = useCallback((i) => {
    const el = audioRef.current;
    const track = queueRef.current[i];
    if (!el || !track) return;
    indexRef.current = i;
    setIndex(i);
    setCurrent(track);
    el.src = track.audio_url;
    el.currentTime = 0;
    setCurrentTime(0);
    el.play().catch(() => {});
  }, []);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onTime = () => setCurrentTime(el.currentTime || 0);
    const onMeta = () => setDuration(el.duration || 0);
    const onEnd = () => {
      setPlaying(false);
      const currentLoop = loopRef.current;
      if (currentLoop === 'one') {
        // Repeat the same track
        el.currentTime = 0;
        el.play().catch(() => {});
        return;
      }
      // Auto-advance to the next track when one finishes.
      const nextIndex = indexRef.current + 1;
      if (nextIndex < queueRef.current.length) {
        loadAt(nextIndex);
      } else if (currentLoop === 'all' && queueRef.current.length > 0) {
        // Wrap around to the beginning
        loadAt(0);
      }
    };
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
  }, [loadAt]);

  // Global keyboard shortcuts
  useEffect(() => {
    function onKey(e) {
      // Don't intercept when the user is typing in an input/textarea
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.target.isContentEditable) return;

      switch (e.key) {
        case ' ': // Space = play/pause
          e.preventDefault();
          if (audioRef.current?.src) {
            if (audioRef.current.paused) audioRef.current.play().catch(() => {});
            else audioRef.current.pause();
          }
          break;
        case 'ArrowRight': // Right = seek forward 5s
          if (audioRef.current?.duration) {
            audioRef.current.currentTime = Math.min(
              audioRef.current.duration,
              audioRef.current.currentTime + 5
            );
          }
          break;
        case 'ArrowLeft': // Left = seek backward 5s
          if (audioRef.current) {
            audioRef.current.currentTime = Math.max(
              0,
              audioRef.current.currentTime - 5
            );
          }
          break;
        case 'n': // N = next track
        case 'N':
          if (indexRef.current < queueRef.current.length - 1) loadAt(indexRef.current + 1);
          break;
        case 'p': // P = previous track
        case 'P':
          if (indexRef.current > 0) loadAt(indexRef.current - 1);
          break;
        case 'm': // M = mute/unmute
        case 'M':
          if (audioRef.current) {
            audioRef.current.muted = !audioRef.current.muted;
          }
          break;
        default:
          break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [loadAt]);

  // Replace the queue with a list and start at `start`.
  const playList = useCallback(
    (list, start = 0) => {
      const tracks = (list || [])
        .filter((t) => t && (t.audio_url || t.audioUrl))
        .map(normalize);
      if (!tracks.length) return;
      queueRef.current = tracks;
      setQueueVersion((v) => v + 1);
      loadAt(Math.min(Math.max(0, start), tracks.length - 1));
    },
    [loadAt]
  );

  // Start (or toggle) a single track. If it's already current, play/pause.
  // Otherwise ensure it's in the queue and switch to it.
  const play = useCallback(
    (track) => {
      if (!track || (!track.audio_url && !track.audioUrl)) return;
      const t = normalize(track);
      const el = audioRef.current;
      if (current && current.id === t.id) {
        if (el.paused) el.play().catch(() => {});
        else el.pause();
        return;
      }
      const existingIdx = queueRef.current.findIndex((q) => q.id === t.id);
      if (existingIdx >= 0) {
        loadAt(existingIdx);
        return;
      }
      queueRef.current.push(t);
      setQueueVersion((v) => v + 1);
      loadAt(queueRef.current.length - 1);
    },
    [current, loadAt]
  );

  const toggle = useCallback(() => {
    const el = audioRef.current;
    if (!el || !el.src) return;
    if (el.paused) el.play().catch(() => {});
    else el.pause();
  }, []);

  const seekToFraction = useCallback((fraction) => {
    const el = audioRef.current;
    if (!el || !el.duration) return;
    el.currentTime = Math.min(el.duration, Math.max(0, fraction * el.duration));
    setCurrentTime(el.currentTime);
  }, []);

  const next = useCallback(() => {
    if (indexRef.current < queueRef.current.length - 1) loadAt(indexRef.current + 1);
  }, [loadAt]);

  const prev = useCallback(() => {
    const el = audioRef.current;
    if (el && el.currentTime > 3) {
      el.currentTime = 0;
      setCurrentTime(0);
      return;
    }
    if (indexRef.current > 0) loadAt(indexRef.current - 1);
  }, [loadAt]);

  const stop = useCallback(() => {
    const el = audioRef.current;
    if (el) {
      el.pause();
      el.currentTime = 0;
    }
    setCurrent(null);
    setPlaying(false);
    setCurrentTime(0);
  }, []);

  const queue = queueRef.current; // eslint-disable-line react-hooks/exhaustive-deps
  void queueVersion; // re-render trigger

  const value = {
    current,
    playing,
    currentTime,
    duration,
    progress: duration > 0 ? currentTime / duration : 0,
    queue,
    index,
    canNext: index < queue.length - 1,
    canPrev: index > 0,
    // Controls
    play,
    playList,
    toggle,
    seekToFraction,
    next,
    prev,
    stop,
    // Volume
    volume,
    setVolume,
    // Loop
    loop, // 'off' | 'one' | 'all'
    cycleLoop,
  };

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export const usePlayer = () => useContext(PlayerContext);
