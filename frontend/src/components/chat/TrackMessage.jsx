import { useState } from 'react';
import { formatTime } from '../../audio/useAudioPlayer.js';
import { usePlayer } from '../../audio/PlayerContext.jsx';
import { api } from '../../api.js';
import { useToast } from '../ui/Overlay.jsx';
import Waveform from '../Waveform.jsx';
import Equalizer from '../Equalizer.jsx';

/**
 * Renders an assistant message: a generating state, a live stream, or the
 * final track. Playback routes through the global PlayerContext (single audio
 * element) so the MiniPlayer tracks it and only one song plays at a time.
 *
 * When the track is ready, actions let the user download, share, copy the
 * prompt, or save it into one of their collections (creating one on the fly
 * if they have none).
 */
export default function TrackMessage({ message }) {
  const { status, audioUrl, streamUrl, error } = message;
  const prompt = message.prompt || '';
  const tags = message.tags || [];
  const duration = message.duration || 0;

  const player = usePlayer();
  const toast = useToast();

  // Prefer the final file once ready; otherwise use the live stream so playback
  // can begin almost instantly for v3 generations.
  const src = status === 'error' ? '' : audioUrl || streamUrl || '';

  // The id we use to match this card against the player's current track.
  const trackId = src || `msg_${message.id}`;
  const isCurrent = player.current?.id === trackId;
  const playing = isCurrent && player.playing;
  const progress = isCurrent ? player.progress : 0;
  const currentTime = isCurrent ? player.currentTime : 0;
  const trackDuration = isCurrent ? player.duration || duration : duration;

  function handlePlay() {
    if (!src) return;
    player.play({ id: trackId, title: prompt || 'Untitled', style_tags: tags, audio_url: src });
  }

  // --- Copy prompt ---
  const [copied, setCopied] = useState(false);
  async function copyPrompt() {
    if (!prompt) return;
    try {
      await navigator.clipboard?.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard unavailable */ }
  }

  // --- Save-to-collection flow ---
  const [saving, setSaving] = useState(false);
  const [savedTo, setSavedTo] = useState(null);
  const [collections, setCollections] = useState(null);

  async function openSave() {
    setSaving(true);
    try {
      const list = await api.listCollections();
      if (list.length === 0) {
        const c = await api.createCollection({ title: 'My favorites' });
        setCollections([c]);
      } else {
        setCollections(list);
      }
    } catch {
      setCollections([]);
    }
  }

  async function saveInto(collectionId, collectionTitle) {
    try {
      await api.addTrackToCollection(collectionId, {
        title: prompt ? prompt.slice(0, 50) : 'Untitled',
        prompt,
        style_tags: tags,
        duration,
        audio_url: audioUrl,
      });
      setSavedTo(collectionTitle);
      setSaving(false);
    } catch {
      setSaving(false);
      toast('Could not save track', { type: 'error' });
    }
  }

  async function shareTrack() {
    try {
      const link = await api.shareTrack({
        title: prompt ? prompt.slice(0, 50) : 'Untitled',
        prompt,
        style_tags: tags,
        duration,
        audio_url: audioUrl,
      });
      const url = `${window.location.origin}/share/${link.id}`;
      await navigator.clipboard?.writeText(url);
      toast('Share link copied to clipboard', { type: 'success' });
    } catch {
      toast('Could not create share link', { type: 'error' });
    }
  }

  return (
    <div className="msg msg--bot fade-in">
      <div className="bubble bubble--bot">
        {status === 'generating' && (
          <div className="gen-hero">
            <Equalizer bars={6} />
            <span className="pulse">generating…</span>
          </div>
        )}
        {status === 'streaming' && !audioUrl && (
          <div className="gen-hero">
            <Equalizer bars={6} />
            <span className="small">streaming live · tap play</span>
          </div>
        )}
        {status === 'error' && (
          <div className="muted">Something went wrong{error ? `: ${error}` : ''}. Try again.</div>
        )}

        {src && status !== 'error' && (
          <div className="track">
            <button
              className={`play-btn${playing ? ' play-btn--active' : ''}`}
              onClick={isCurrent ? player.toggle : handlePlay}
              aria-label={playing ? 'Pause' : 'Play'}
            >
              <span className={playing ? 'play-btn__pause' : 'play-btn__tri'} />
            </button>
            <div className="track__main">
              <Waveform src={src} playing={playing} progress={progress} onSeek={player.seekToFraction} bars={48} />
              <div className="track__time">
                <span>{formatTime(currentTime)}</span>
                <span className="muted">{formatTime(trackDuration)}</span>
              </div>
            </div>
          </div>
        )}

        {status === 'ready' && audioUrl && (
          <div className="track__actions">
            <a className="track__dl" href={audioUrl} download>
              Download
            </a>
            <button className="card-action" onClick={shareTrack} title="Copy a public share link">
              Share
            </button>
            {prompt && (
              <button className="card-action" onClick={copyPrompt} title="Copy this prompt">
                {copied ? '✓ Copied' : 'Copy prompt'}
              </button>
            )}

            {savedTo ? (
              <span className="track__saved">Saved to "{savedTo}"</span>
            ) : saving ? (
              <div className="save-picker">
                {collections?.length ? (
                  collections.map((c) => (
                    <button
                      key={c.collection_id}
                      className="card-action"
                      onClick={() => saveInto(c.collection_id, c.title)}
                    >
                      {c.title}
                    </button>
                  ))
                ) : (
                  <span className="muted small">No collections available.</span>
                )}
                <button className="card-action card-action--ghost" onClick={() => setSaving(false)}>
                  Cancel
                </button>
              </div>
            ) : (
              <button className="card-action" onClick={openSave}>
                Save to collection
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
