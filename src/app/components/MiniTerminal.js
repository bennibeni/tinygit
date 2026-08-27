"use client";

import React, { useEffect, useRef, useState } from "react";

// Shared mini-terminal: input + scrollback, calling git.exec for every line.
// Exposes an imperative `run(cmd)` via ref so other panels (e.g. quick-action
// buttons) can execute a command as if the person typed it themselves.
const MiniTerminal = React.forwardRef(function MiniTerminal({ exec, placeholder }, ref) {
  const [input, setInput] = useState("");
  const [transcript, setTranscript] = useState([]);
  const [history, setHistory] = useState([]);
  const [histIndex, setHistIndex] = useState(null); // null = not browsing history
  const [draft, setDraft] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [transcript]);

  async function runLine(line) {
    const trimmed = String(line || "").trim();
    if (!trimmed) return;
    const res = await exec(trimmed);
    setTranscript((t) => [...t.slice(-40), { line: trimmed, ok: res.ok, out: res.out || [] }]);
    setHistory((h) => [...h, trimmed]);
    setHistIndex(null);
    return res;
  }

  React.useImperativeHandle(ref, () => ({ run: runLine }));

  async function onSubmit(e) {
    e.preventDefault();
    await runLine(input);
    setInput("");
  }

  function onKeyDown(e) {
    if (e.key === "ArrowUp") {
      if (!history.length) return;
      e.preventDefault();
      setHistIndex((idx) => {
        const next = idx === null ? history.length - 1 : Math.max(0, idx - 1);
        if (idx === null) setDraft(input);
        setInput(history[next]);
        return next;
      });
    } else if (e.key === "ArrowDown") {
      if (histIndex === null) return;
      e.preventDefault();
      setHistIndex((idx) => {
        const next = idx + 1;
        if (next >= history.length) {
          setInput(draft);
          return null;
        }
        setInput(history[next]);
        return next;
      });
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0F1216] p-3">
      <div className="text-[11px] uppercase tracking-widest text-white/40 mb-2">Mini-terminale</div>
      <div className="max-h-48 overflow-auto space-y-1 mb-2 font-mono text-[11px]">
        {transcript.length === 0 && (
          <div className="text-white/25">scrivi "help" per l'elenco comandi…</div>
        )}
        {transcript.map((t, i) => (
          <div key={i}>
            <div className="text-white/50">$ {t.line}</div>
            {t.out.map((o, j) => (
              <div key={j} className={t.ok ? "text-white/70 pl-2 whitespace-pre-wrap" : "text-rose-300 pl-2 whitespace-pre-wrap"}>
                {o}
              </div>
            ))}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          className="flex-1 rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-xs font-mono text-white/90 focus:outline-none focus:ring-1 focus:ring-teal-400"
          placeholder={placeholder || "scrivi un comando… (help per la lista)"}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          spellCheck={false}
        />
        <button
          type="submit"
          className="text-xs px-3 py-2 rounded-lg bg-teal-500/90 text-[#0F1216] font-semibold hover:bg-teal-400"
        >
          Esegui
        </button>
      </form>
    </div>
  );
});

export default MiniTerminal;
