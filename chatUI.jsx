import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * Modern AI Chat UI – Flat White, Smart Stadium Composer (React + Tailwind)
 * 2025‑08‑23 • v13 (black send button)
 * --------------------------------------------------
 * • 发送按钮改为黑底白色图标。
 * --------------------------------------------------
 */

const cx = (...xs) => xs.filter(Boolean).join(" ");
const useAutoScroll = (dep) => {
  const end = useRef(null);
  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth", block: "end" }), [dep]);
  return end;
};
const useId = () => {
  const r = useRef(0);
  return () => ++r.current;
};

const Bubble = ({ role, children }) => {
  const me = role === "user";
  return (
    <div className={cx("flex w-full", me ? "justify-end" : "justify-start")}>      
      <div
        className={cx(
          "max-w-[80%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed shadow-sm",
          me ? "bg-gray-100 text-gray-900" : "bg-gray-50 text-gray-900 border border-gray-200"
        )}
      >
        {children}
      </div>
    </div>
  );
};

function InputBar({ value, onChange, onSend, placeholder, autoFocus }) {
  const ta = useRef(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!ta.current) return;
    ta.current.style.height = "auto";
    const max = 240;
    const next = Math.min(ta.current.scrollHeight, max);
    ta.current.style.height = `${next}px`;
    ta.current.style.overflowY = ta.current.scrollHeight > max ? "auto" : "hidden";
    setExpanded(next > 64);
  }, [value]);

  const fire = async () => {
    const txt = value.trim();
    if (!txt || busy) return;
    setBusy(true);
    try {
      await onSend();
    } finally {
      setBusy(false);
    }
  };

  const radius = expanded ? "rounded-3xl" : "rounded-full";
  const minH = expanded ? "min-h-[44px]" : "min-h-[32px]";

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div
        className={cx(
          "bg-white border border-gray-300 shadow-sm p-1.5 grid [grid-template-areas:'primary_trailing'] grid-cols-[1fr_auto] gap-2 items-center",
          radius
        )}
        aria-label="composer"
      >
        <div className={cx(minH, "max-h-60 overflow-hidden [grid-area:primary] flex flex-1 items-center")}>          
          <textarea
            ref={ta}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            rows={1}
            autoFocus={autoFocus}
            aria-label="chat input"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                fire();
              }
            }}
            className={cx(
              "w-full resize-none bg-transparent px-3 py-0.5 text-[15px] text-gray-900 outline-none",
              "placeholder:text-gray-400 focus:ring-0"
            )}
          />
        </div>

        {/* black send button */}
        <button
          id="composer-submit-button"
          aria-label="Send prompt"
          data-testid="send-button"
          onClick={fire}
          disabled={busy || !value.trim()}
          title="发送 (Enter)\n换行 (Shift+Enter)"
          className={cx(
            "h-9 w-9 flex items-center justify-center rounded-full bg-black text-white",
            "hover:bg-black/80 disabled:opacity-40 disabled:cursor-not-allowed"
          )}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" className="icon">
            <path d="M8.99992 16V6.41407L5.70696 9.70704C5.31643 10.0976 4.68342 10.0976 4.29289 9.70704C3.90237 9.31652 3.90237 8.6835 4.29289 8.29298L9.29289 3.29298L9.36907 3.22462C9.76184 2.90427 10.3408 2.92686 10.707 3.29298L15.707 8.29298L15.7753 8.36915C16.0957 8.76192 16.0731 9.34092 15.707 9.70704C15.3408 10.0732 14.7618 10.0958 14.3691 9.7754L14.2929 9.70704L10.9999 6.41407V16C10.9999 16.5523 10.5522 17 9.99992 17C9.44764 17 8.99992 16.5523 8.99992 16Z" />
          </svg>
        </button>
      </div>
      <p className="mt-2 text-center text-xs text-gray-400">Enter 发送 · Shift+Enter 换行</p>
    </div>
  );
}

export default function ChatModern() {
  const [msgs, setMsgs] = useState([]);
  const [inp, setInp] = useState("");
  const first = msgs.length === 0;
  const genId = useId();
  const endRef = useAutoScroll(msgs);

  const push = (role, content) => setMsgs((s) => [...s, { id: genId(), role, content }]);
  const handleSend = () => {
    const txt = inp.trim();
    if (!txt) return;
    push("user", txt);
    setInp("");
    setTimeout(() => push("assistant", `已收到：${txt}\n(此处为占位回复)`), 400);
  };
  const clear = () => setMsgs([]);
  const PAD = "pb-40";

  const Header = useMemo(() => (
    <header className="sticky top-0 z-20 w-full border-b border-gray-200 bg-white">
      <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <div className="h-6 w-6 rounded-full bg-indigo-500" />
          <span>AI Chat</span>
        </div>
        <button onClick={clear} className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 shadow-sm hover:bg-gray-50">清空</button>
      </div>
    </header>
  ), []);

  return (
    <div className="relative flex min-h-screen flex-col bg-white text-gray-900">
      {first ? (
        <main className="grid flex-1 place-items-center p-6">
          <section className="w-full max-w-3xl space-y-8">
            <h1 className="text-center text-3xl font-semibold">准备好开始聊天</h1>
            <InputBar value={inp} onChange={setInp} onSend={handleSend} placeholder="问我任何问题…" autoFocus />
          </section>
        </main>
      ) : (
        <>
          {Header}
          <main className={cx("flex-1 overflow-y-auto", PAD)}>
            <div className="mx-auto w-full max-w-4xl px-4 pt-6">
              <div className="mx-auto flex max-w-3xl flex-col gap-4">
                {msgs.map((m) => (
                  <Bubble key={m.id} role={m.role}>{m.content}</Bubble>
                ))}
                <div ref={endRef} />
              </div>
            </div>
          </main>
          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white">
            <div className="mx-auto max-w-4xl px-4 py-4">
              <InputBar value={inp} onChange={setInp} onSend={handleSend} placeholder="继续提问…" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
