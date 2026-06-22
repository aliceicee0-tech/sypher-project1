import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import Composer from '../components/chat/Composer.jsx';
import TrackMessage from '../components/chat/TrackMessage.jsx';
import QuotaBadge from '../components/QuotaBadge.jsx';
import { useUsage } from '../auth/UsageContext.jsx';
import { SUGGESTIONS, randomPrompt } from '../data/prompts.js';

let mid = 0;
const newId = () => `m_${Date.now()}_${mid++}`;

export default function Chat() {
  const [messages, setMessages] = useState([]);
  const scroller = useRef(null);
  // Shared prompt value so suggestion chips / "surprise me" can fill the
  // composer from outside it.
  const [promptValue, setPromptValue] = useState('');
  // Freemium quota — centralised in UsageContext so the sidebar badge, the
  // composer gate and the account page all stay in sync.
  const { quota, setQuota, limited } = useUsage();

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  function patch(id, data) {
    setMessages((m) => m.map((msg) => (msg.id === id ? { ...msg, ...data } : msg)));
  }

  function pick(text) {
    setPromptValue(text);
  }

  function surprise() {
    const current = promptValue;
    setPromptValue(randomPrompt(current));
  }

  async function handleSend({ prompt, lyrics, tags, instrumental, model, duration }) {
    // 1) user message
    const userMsg = {
      id: newId(),
      role: 'user',
      prompt,
      tags,
      lyrics,
      instrumental,
      duration,
    };
    // 2) assistant placeholder (generating) — carry the prompt so a saved
    //    track keeps the text that produced it.
    const botId = newId();
    setMessages((m) => [
      ...m,
      userMsg,
      {
        id: botId,
        role: 'assistant',
        status: 'generating',
        audioUrl: '',
        streamUrl: '',
        prompt: prompt,
        tags,
        duration,
      },
    ]);
    setPromptValue('');

    try {
      const enableStreaming = model === 'v3';
      const result = await api.startGeneration({
        prompt,
        lyrics,
        style_tags: tags,
        instrumental,
        model,
        duration,
        enableStreaming,
      });
      const { jobId } = result;

      // Update quota from the response if the backend included it.
      if (result.quota) setQuota(result.quota);

      // NOTE: do NOT consume `result.streamUrl` here. Treblo only guarantees
      // the live stream is serving audio once status flips to
      // GENERATING_STREAMING_READY; before that, GET /stream/{taskId} returns
      // HTTP 400 with a JSON error body that the <audio> element can't decode
      // — which is exactly what caused "no sound after generation". The poll
      // loop below receives a confirmed streamUrl only when it's safe to play.

      // Poll until the final file is ready. Intermediate ticks may flip the
      // card to 'streaming' (early playback) once Treblo confirms the stream.
      const finalUrl = await api.pollUntilReady(jobId, {
        onTick: (r) => {
          if (r.status === 'streaming' && r.streamUrl) {
            patch(botId, { streamUrl: r.streamUrl, status: 'streaming' });
          } else if (r.status === 'generating') {
            patch(botId, { status: 'generating' });
          }
        },
      });
      patch(botId, { status: 'ready', audioUrl: finalUrl });
    } catch (e) {
      patch(botId, { status: 'error', error: e.message });
    }
  }

  const empty = messages.length === 0;

  return (
    <div className={`chat${empty ? ' chat--empty' : ''}`}>
      {/* Light page header (brand lives in the activity rail now). */}
      <header className="chat__bar">
        <div className="chat__title">Create</div>
        <QuotaBadge />
      </header>

      <div className="chat__scroll" ref={scroller}>
        <div className="chat__thread">
          {empty && (
            <div className="chat__empty fade-in">
              <div className="chat__empty-wave hero-grad" aria-hidden="true">
                <span /><span /><span /><span /><span />
              </div>
              <h1>What should we create?</h1>
              <p className="muted">
                Describe a style, add your own lyrics and tags. Hit send to generate.
              </p>
              <div className="chat__suggestions stagger">
                {SUGGESTIONS.slice(0, 6).map((s) => (
                  <button key={s} className="chip" onClick={() => pick(s)} disabled={limited}>
                    {s}
                  </button>
                ))}
                <button className="chip chip--dice" onClick={surprise} title="Surprise me" disabled={limited}>
                  Surprise me
                </button>
              </div>
            </div>
          )}

          {messages.map((m) =>
            m.role === 'user' ? (
              <div key={m.id} className="msg msg--user fade-in">
                <div className="bubble">
                  {m.prompt && <p className="bubble__prompt">{m.prompt}</p>}
                  {m.tags?.length > 0 && (
                    <div className="bubble__tags">
                      {m.tags.map((t) => (
                        <span key={t} className="tag">{t}</span>
                      ))}
                    </div>
                  )}
                  {m.lyrics && <pre className="bubble__lyrics">{m.lyrics}</pre>}
                  {m.instrumental && <span className="muted small">instrumental</span>}
                </div>
              </div>
            ) : (
              <TrackMessage key={m.id} message={m} />
            )
          )}
        </div>
      </div>

      <Composer
        onSend={handleSend}
        promptValue={promptValue}
        onPromptChange={setPromptValue}
        limited={limited}
        quota={quota}
      />
    </div>
  );
}
