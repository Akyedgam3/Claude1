import { useEffect, useRef, useState } from 'react';
import { money, today, useCompany } from '../api';
import { Icon } from '../components/icons';
import { ask, STARTERS, type Reply } from './answer';

// نافذة المساعد: زر عايم بيفتح محادثة. كل شي محلي (بدون إنترنت): الجواب من دليل البرنامج ومن بيانات الشركة.

interface Msg {
  me?: boolean;
  text: string;
  reply?: Reply;
}

const WELCOME: Msg = {
  text: 'أهلين 👋 أنا مساعد وزن. اسألني أي شي بالبرنامج بالطريقة اللي بتحبها: «كيف بسجل مصروف؟»، «وين الديون؟»، «شقد بعت اليوم؟»، «كم باقي من الرز؟»، «شو عليه محمد؟»… وبعطيك الجواب وزر يفتحلك القسم على طول.',
  reply: { text: '', links: [], suggest: STARTERS },
};

/** فتح المساعد من أي مكان (زر القائمة، الشريط العلوي بالجوال). */
export const openAssistant = () => window.dispatchEvent(new Event('wazn:assistant'));

export function Assistant({ screens }: { screens: { key: string }[] }) {
  const { state, can, navigate } = useCompany();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([WELCOME]);
  const [text, setText] = useState('');
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' });
  }, [msgs, open]);
  useEffect(() => {
    if (open) setTimeout(() => input.current?.focus(), 50);
  }, [open]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === 'Escape') setOpen(false);
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('wazn:assistant', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('wazn:assistant', onOpen);
    };
  }, []);

  const send = (q: string) => {
    const question = q.trim();
    if (!question) return;
    const reply = ask(question, {
      state,
      can: can as (p: string) => boolean,
      screens: new Set(screens.map((s) => s.key)),
      today: today(),
      fmt: (v, c) => money(state, v, c),
    });
    setMsgs((m) => [...m.slice(-40), { me: true, text: question }, { text: reply.text, reply }]);
    setText('');
  };

  return (
    <>
      {open && (
        <div className="assistant-panel" role="dialog" aria-label="المساعد">
          <header>
            <div>
              <Icon name="sparkles" size={18} /> <strong>مساعد وزن</strong>
              <small>بيشتغل بدون إنترنت</small>
            </div>
            <button className="icon" onClick={() => setOpen(false)} aria-label="إغلاق">
              ✕
            </button>
          </header>
          <div className="assistant-msgs" ref={list}>
            {msgs.map((m, i) => (
              <div key={i} className={`assistant-msg ${m.me ? 'me' : 'bot'}`}>
                {m.text && <div className="bubble">{m.text}</div>}
                {m.reply && m.reply.links.length > 0 && (
                  <div className="assistant-links">
                    {m.reply.links.map((l) => (
                      <button
                        key={l.screen + (l.param ?? '')}
                        className="primary"
                        onClick={() => {
                          navigate(l.screen, l.param);
                          if (window.innerWidth < 700) setOpen(false);
                        }}
                      >
                        ← {l.label}
                      </button>
                    ))}
                  </div>
                )}
                {m.reply && m.reply.suggest.length > 0 && (
                  <div className="assistant-suggest">
                    {m.reply.suggest.map((s) => (
                      <button key={s} onClick={() => send(s)}>
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          <form
            className="assistant-input"
            onSubmit={(e) => {
              e.preventDefault();
              send(text);
            }}
          >
            <input ref={input} value={text} onChange={(e) => setText(e.target.value)} placeholder="اكتب سؤالك…" enterKeyHint="send" />
            <button className="primary" disabled={!text.trim()} aria-label="إرسال">
              إرسال
            </button>
          </form>
        </div>
      )}
    </>
  );
}
