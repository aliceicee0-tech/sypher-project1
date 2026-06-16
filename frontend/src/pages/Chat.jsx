import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import Composer from '../components/chat/Composer.jsx';
import TrackMessage from '../components/chat/TrackMessage.jsx';

let mid = 0;
const newId = () => `m_${Date.now()}_${mid++}`;

export default function Chat() {
  const [messages, setMessages] = useState([]);
  const scroller = useRef(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  function patch(id, data) {
    setMessages((m) => m.map((msg) => (msg.id === id ? { ...msg, ...data } : msg)));
  }

  async function handleSend({ prompt, lyrics, tags, instrumental, model }) {
    // 1) user message
    const userMsg = {
      id: newId(),
      role: 'user',
      prompt,
      tags,
      lyrics,
      instrumental,
    };
    // 2) assistant placeholder (generating)
    const botId = newId();
    setMessages((m) => [
      ...m,
      userMsg,
      { id: botId, role: 'assistant', status: 'generating', audioUrl: '', streamUrl: '' },
    ]);

    try {
      const enableStreaming = model === 'v3';
      const { jobId, streamUrl } = await api.startGeneration({
        prompt,
        lyrics,
        style_tags: tags,
        instrumental,
        model,
        enableStreaming,
      });

      // For v3, expose the live stream immediately so playback can start early.
      if (streamUrl) patch(botId, { streamUrl, status: 'streaming' });

      // Poll until the final file is ready, then swap to the permanent URL.
      const finalUrl = await api.pollUntilReady(jobId, {
        onTick: (r) => {
          if (r.status === 'generating' && !streamUrl) patch(botId, { status: 'generating' });
        },
      });
      patch(botId, { status: 'ready', audioUrl: finalUrl });
    } catch (e) {
      patch(botId, { status: 'error', error: e.message });
    }
  }

  return (
    <div className="chat">
      <header class="chat__bar">
        <div className="brand">MusiBlock</div>
        <a className="chat__link" href="/projects">Projects</a>
      </header>

      <div className="chat__scroll" ref={scroller}>
        <div className="chat__thread">
          {messages.length === 0 && (
            <div className="chat__empty fade-in">
              <h1>What should we create?</h1>
              <p className="muted">
                Describe a style, add your own lyrics and tags. Hit send to generate.
              </p>
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

      <Composer onSend={handleSend} />
    </div>
  );
}
