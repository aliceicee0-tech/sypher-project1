import { useState } from 'react';
import { GENRES } from '../../data/prompts.js';

/**
 * Composer — the prompt input + generation controls.
 *
 * Controlled prompt: the parent owns the prompt text so suggestion chips and
 * "surprise me" can fill it. Advanced controls (tags, lyrics, instrumental,
 * model, duration, genre presets) live behind a toggle.
 *
 * Duration quick-presets let the user pick common lengths with a single click.
 */

const DURATION_PRESETS = [
  { label: '30s', value: 30 },
  { label: '1m', value: 60 },
  { label: '2m', value: 120 },
  { label: '3m', value: 180 },
  { label: '5m', value: 300 },
];

export default function Composer({ onSend, promptValue = '', onPromptChange, quota, limited = false }) {
  const [open, setOpen] = useState(false);
  const [lyrics, setLyrics] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [instrumental, setInstrumental] = useState(false);
  const [model, setModel] = useState('v3');
  const [duration, setDuration] = useState(30);
  const [genres, setGenres] = useState([]);

  function setPrompt(v) {
    onPromptChange?.(v);
  }

  function toggleGenre(g) {
    setGenres((cur) => (cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g]));
  }

  function submit(e) {
    e?.preventDefault();
    const tags = [...genres, ...tagsText.split(',').map((t) => t.trim()).filter(Boolean)];
    const prompt = (promptValue || '').trim();
    if (!prompt && !tags.length && !lyrics.trim()) return;
    onSend({ prompt, lyrics: lyrics.trim(), tags, instrumental, model, duration });
    setPrompt('');
    setLyrics('');
    setTagsText('');
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  const hasContent =
    (promptValue || '').trim() || tagsText.trim() || lyrics.trim() || genres.length;

  const atLimit = limited || (quota && !quota.canGenerate);

  return (
    <form className="composer" onSubmit={submit}>
      {/* Quota indicator */}
      {quota && (
        <div className="composer__quota">
          <span className="muted small">
            {quota.remaining}/{quota.limit} generations remaining this month
          </span>
          <div className="composer__quota-bar">
            <div
              className="composer__quota-fill"
              style={{ width: `${Math.min(100, (quota.count / quota.limit) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {atLimit && (
        <div className="composer__limit-msg">
          You've used all your free generations this month. They reset on{' '}
          {new Date(quota.resetsAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}.
        </div>
      )}

      {open && (
        <div className="composer__advanced fade-in">
          {/* Genre presets */}
          <div className="field">
            <span>Genre presets</span>
            <div className="composer__genres">
              {GENRES.map((g) => (
                <button
                  type="button"
                  key={g}
                  className={`chip${genres.includes(g) ? ' chip--active' : ''}`}
                  onClick={() => toggleGenre(g)}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          <label className="field">
            <span>Tags</span>
            <input
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="extra tags, comma separated"
            />
          </label>
          <label className="field">
            <span>Lyrics</span>
            <textarea
              rows={3}
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              placeholder="Your own lyrics (optional)…"
            />
          </label>

          {/* Duration: quick presets + slider */}
          <div className="field">
            <span className="field__row">
              <span>Duration</span>
              <span className="field__value">{duration}s</span>
            </span>
            <div className="composer__duration-presets">
              {DURATION_PRESETS.map((p) => (
                <button
                  type="button"
                  key={p.value}
                  className={`chip chip--sm${duration === p.value ? ' chip--active' : ''}`}
                  onClick={() => setDuration(p.value)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <input
              type="range"
              min={5}
              max={300}
              step={5}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="composer__duration-range"
            />
          </div>

          <div className="composer__opts">
            <label className="check">
              <input
                type="checkbox"
                checked={instrumental}
                onChange={(e) => setInstrumental(e.target.checked)}
              />
              <span>Instrumental</span>
            </label>
            <label className="check">
              <span>Model</span>
              <select value={model} onChange={(e) => setModel(e.target.value)}>
                <option value="v3">v3 (streamed)</option>
                <option value="v2">v2</option>
              </select>
            </label>
          </div>
        </div>
      )}

      <div className="composer__row">
        <button
          type="button"
          className="composer__toggle"
          onClick={() => setOpen((v) => !v)}
          aria-label="Advanced options"
          title="Lyrics, tags, duration, options"
        >
          {open ? '−' : '+'}
        </button>
        <textarea
          className="composer__input"
          rows={1}
          value={promptValue}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={atLimit ? 'Generation limit reached…' : 'Describe the music you want…'}
          disabled={atLimit}
        />
        <button
          className={`composer__send${hasContent ? ' send-ready' : ''}`}
          type="submit"
          aria-label="Generate"
          disabled={!hasContent || atLimit}
        >
          <span className="composer__send-icon" />
        </button>
      </div>
    </form>
  );
}
