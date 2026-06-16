import { useState } from 'react';

export default function Composer({ onSend }) {
  const [prompt, setPrompt] = useState('');
  const [open, setOpen] = useState(false);
  const [lyrics, setLyrics] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [instrumental, setInstrumental] = useState(false);
  const [model, setModel] = useState('v3');

  function submit(e) {
    e?.preventDefault();
    const tags = tagsText.split(',').map((t) => t.trim()).filter(Boolean);
    if (!prompt.trim() && !tags.length && !lyrics.trim()) return;
    onSend({ prompt: prompt.trim(), lyrics: lyrics.trim(), tags, instrumental, model });
    setPrompt('');
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <form className="composer" onSubmit={submit}>
      {open && (
        <div className="composer__advanced fade-in">
          <label className="field">
            <span>Tags</span>
            <input
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="ambient, piano, lo-fi"
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
          title="Lyrics, tags, options"
        >
          {open ? '−' : '+'}
        </button>
        <textarea
          className="composer__input"
          rows={1}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Describe the music you want…"
        />
        <button className="composer__send" type="submit" aria-label="Generate">
          <span className="composer__send-icon" />
        </button>
      </div>
    </form>
  );
}
