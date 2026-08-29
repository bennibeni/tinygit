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
    // No cap here on purpose: the person asked to keep track of everything
    // in a session, not just a rolling window of recent commands.
    setTranscript((t) => [...t, { line: trimmed, ok: res.ok, out: res.out || [], ts: Date.now() }]);
    setHistory((h) => [...h, trimmed]);
    setHistIndex(null);
    return res;
  }

  function formatLog() {
    return transcript
      .map((t) => {
        const time = new Date(t.ts).toLocaleTimeString();
        const body = t.out.length ? t.out.join("\n") : "(nessun output)";
        return `[${time}] $ ${t.line}\n${body}`;
      })
      .join("\n\n");
  }

  function downloadLog() {
    const text = formatLog();
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    a.href = url;
    a.download = `tinygit-log-${stamp}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function copyLog() {
    const text = formatLog();
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      document.execCommand("copy");
    } finally {
      document.body.removeChild(ta);
    }
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

  const commandCount = transcript.length;
  const lineCount = transcript.reduce((sum, t) => sum + 1 + (t.out?.length || 0), 0);

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0F1216] p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] uppercase tracking-widest text-white/40">
          Mini-terminale · {commandCount} comandi · {lineCount} righe
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            disabled={commandCount === 0}
            onClick={copyLog}
            className={
              "text-[10px] px-2 py-1 rounded-lg border " +
              (commandCount === 0
                ? "border-white/5 text-white/20 cursor-not-allowed"
                : "border-white/15 text-white/50 hover:border-teal-400/50 hover:text-teal-300")
            }
          >
            Copia log
          </button>
          <button
            type="button"
            disabled={commandCount === 0}
            onClick={downloadLog}
            className={
              "text-[10px] px-2 py-1 rounded-lg border " +
              (commandCount === 0
                ? "border-white/5 text-white/20 cursor-not-allowed"
                : "border-white/15 text-white/50 hover:border-teal-400/50 hover:text-teal-300")
            }
          >
            Scarica log
          </button>
        </div>
      </div>
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
