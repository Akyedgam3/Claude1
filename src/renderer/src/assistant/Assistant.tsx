import { useEffect, useRef, useState } from 'react';
import { money, today, useCompany } from '../api';
import { Icon } from '../components/icons';
import { askInContext, STARTERS, type AskContext, type Reply } from './answer';

// نافذة المساعد: زر عايم بيفتح محادثة. كل شي محلي (بدون إنترنت): الجواب من دليل البرنامج ومن بيانات الشركة.

interface Msg {
  me?: boolean;
  text: string;
  reply?: Reply;
  at?: number;
}

/**
 * المحادثة بتنحفظ على هالجهاز لكل شركة ومستخدم. منحفظ الأسئلة بس (مش الأرقام، لأن بيانات الشركة مشفّرة
 * وما منطلّعها لبرّا)، ولما ترجع تفتح البرنامج منعيد الجواب عليها من البيانات الحالية فبتكون الأرقام محدّثة.
 */
const MAX_SAVED = 30;
const keyFor = (company: string, user: string) => `wazn.assistant.${company}.${user}`;
function loadQuestions(key: string): { q: string; at: number }[] {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? '[]') as unknown;
    return Array.isArray(raw) ? raw.filter((x): x is { q: string; at: number } => typeof x?.q === 'string').slice(-MAX_SAVED) : [];
  } catch {
    return [];
  }
}
function saveQuestions(key: string, qs: { q: string; at: number }[]) {
  try {
    if (qs.length) localStorage.setItem(key, JSON.stringify(qs.slice(-MAX_SAVED)));
    else localStorage.removeItem(key);
  } catch {
    /* ما في تخزين */
  }
}

/** جواب كل سؤال مع تذكّر اللي قبله. */
function replay(questions: { q: string; at: number }[], ctx: AskContext): Msg[] {
  const out: Msg[] = [];
  let prev: string | undefined;
  for (const { q, at } of questions) {
    const reply = askInContext(q, ctx, prev);
    out.push({ me: true, text: q, at }, { text: reply.text, reply });
    prev = reply.asked ?? q;
  }
  return out;
}

const WELCOME: Msg = {
  text: 'أهلين 👋 أنا مساعد وزن. اسألني أي شي بالبرنامج بالطريقة اللي بتحبها: «كيف بسجل مصروف؟»، «وين الديون؟»، «شقد بعت اليوم؟»، «كم باقي من الرز؟»، «شو عليه محمد؟»… وبعطيك الجواب وزر يفتحلك القسم على طول.',
  reply: { text: '', links: [], suggest: STARTERS },
};

/** فتح المساعد من أي مكان (زر القائمة، الشريط العلوي بالجوال). */
export const openAssistant = () => window.dispatchEvent(new Event('wazn:assistant'));

export function Assistant({ screens }: { screens: { key: string }[] }) {
  const { state, can, navigate, user } = useCompany();
  const [open, setOpen] = useState(false);
  const storeKey = keyFor(state.info?.name ?? '', user.username);
  const [questions, setQuestions] = useState(() => loadQuestions(storeKey));
  const ctx = (): AskContext => ({
    state,
    can: can as (p: string) => boolean,
    screens: new Set(screens.map((s) => s.key)),
    today: today(),
    fmt: (v, c) => money(state, v, c),
  });
  // المحادثة المحفوظة بتنعرض مع أجوبة محدّثة أول ما تنفتح النافذة
  const [msgs, setMsgs] = useState<Msg[]>([WELCOME]);
  const restored = useRef(false);
  // آخر سؤال «مفهوم» (بعد الدمج) — بيتذكره المساعد للسؤال التكميلي الجاي
  const lastAsked = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!open || restored.current) return;
    restored.current = true;
    if (!questions.length) return;
    const old = replay(questions, ctx());
    lastAsked.current = [...old].reverse().find((m) => m.reply)?.reply?.asked;
    setMsgs([WELCOME, ...old, { text: '— هون وقفنا آخر مرة. كمّل اسأل 👇 —' }]);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
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
    const reply = askInContext(question, ctx(), lastAsked.current);
    lastAsked.current = reply.asked ?? question;
    const at = Date.now();
    const next = [...questions, { q: question, at }].slice(-MAX_SAVED);
    setQuestions(next);
    saveQuestions(storeKey, next);
    setMsgs((m) => [...m.slice(-80), { me: true, text: question, at }, { text: reply.text, reply }]);
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
            <span className="assistant-actions">
              {questions.length > 0 && (
                <button
                  className="assistant-clear"
                  title="مسح المحادثة والبدء من جديد"
                  onClick={() => {
                    setQuestions([]);
                    saveQuestions(storeKey, []);
                    lastAsked.current = undefined;
                    setMsgs([WELCOME]);
                  }}
                >
                  محادثة جديدة
                </button>
              )}
              <button className="icon" onClick={() => setOpen(false)} aria-label="إغلاق">
                ✕
              </button>
            </span>
          </header>
          <div className="assistant-msgs" ref={list}>
            {msgs.map((m, i) => (
              <div key={i} className={`assistant-msg ${m.me ? 'me' : 'bot'}`}>
                {m.text && <div className={`bubble ${m.text.startsWith('— ') ? 'divider' : ''}`}>{m.text}</div>}
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
