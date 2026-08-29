"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { LESSONS } from "../lib/lessons";
import CommitGraph from "./CommitGraph";
import ConflictResolver from "./ConflictResolver";
import ThreeStageInspector from "./ThreeStageInspector";

function loadProgress() {
  try {
    const raw = localStorage.getItem("tinygit_story_progress@1");
    return raw ? JSON.parse(raw) : { index: 0, completed: [] };
  } catch {
    return { index: 0, completed: [] };
  }
}
function saveProgress(p) {
  try {
    localStorage.setItem("tinygit_story_progress@1", JSON.stringify(p));
  } catch {}
}

export default function StoryMode({ git }) {
  const [progress, setProgress] = useState(() => loadProgress());
  const [input, setInput] = useState("");
  const [transcript, setTranscript] = useState([]);
  const [showHint, setShowHint] = useState(false);
  const [executedCmds, setExecutedCmds] = useState(() => new Set());
  const [cmdHistory, setCmdHistory] = useState([]);
  const [histIndex, setHistIndex] = useState(null);
  const [inputDraft, setInputDraft] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => saveProgress(progress), [progress]);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [transcript]);

  const lessonIndex = Math.min(progress.index, LESSONS.length - 1);
  const lesson = LESSONS[lessonIndex];

  const ctx = { headOid: git.headOid, log: git.log };
  const isDone = lesson.check(git.repo, ctx);
  const alreadyMarked = progress.completed.includes(lesson.id);

  // The sidebar checkmark should reflect real completion the moment it
  // happens, not only once the person clicks "Fermata successiva" — that
  // button only navigates forward, it shouldn't be required just to get credit.
  useEffect(() => {
    if (isDone && !alreadyMarked) {
      setProgress((p) => (p.completed.includes(lesson.id) ? p : { ...p, completed: [...p.completed, lesson.id] }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDone, lesson.id]);

  async function runLine(line, markIndex) {
    const trimmed = line.trim();
    if (!trimmed) return;
    const res = await git.exec(trimmed);
    // No cap: keep the full session log so it can be reviewed/downloaded.
    setTranscript((t) => [...t, { line: trimmed, ok: res.ok, out: res.out || [], ts: Date.now() }]);
    if (markIndex !== undefined) setExecutedCmds((prev) => new Set(prev).add(markIndex));
    setCmdHistory((h) => [...h, trimmed]);
    setHistIndex(null);
  }

  function formatTerminalLog() {
    return transcript
      .map((t) => {
        const time = new Date(t.ts).toLocaleTimeString();
        const body = t.out.length ? t.out.join("\n") : "(nessun output)";
        return `[${time}] $ ${t.line}\n${body}`;
      })
      .join("\n\n");
  }

  function downloadTerminalLog() {
    const text = formatTerminalLog();
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

  async function copyTerminalLog() {
    const text = formatTerminalLog();
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

  async function onSubmit(e) {
    e.preventDefault();
    await runLine(input);
    setInput("");
  }

  function onTerminalKeyDown(e) {
    if (e.key === "ArrowUp") {
      if (!cmdHistory.length) return;
      e.preventDefault();
      setHistIndex((idx) => {
        const next = idx === null ? cmdHistory.length - 1 : Math.max(0, idx - 1);
        if (idx === null) setInputDraft(input);
        setInput(cmdHistory[next]);
        return next;
      });
    } else if (e.key === "ArrowDown") {
      if (histIndex === null) return;
      e.preventDefault();
      setHistIndex((idx) => {
        const next = idx + 1;
        if (next >= cmdHistory.length) {
          setInput(inputDraft);
          return null;
        }
        setInput(cmdHistory[next]);
        return next;
      });
    }
  }

  function goNext() {
    setShowHint(false);
    setTranscript([]);
    setCmdHistory([]);
    setHistIndex(null);
    setExecutedCmds(new Set());
    setProgress((p) => ({
      index: Math.min(p.index + 1, LESSONS.length - 1),
      completed: p.completed.includes(lesson.id) ? p.completed : [...p.completed, lesson.id],
    }));
  }

  function goTo(i) {
    setShowHint(false);
    setTranscript([]);
    setCmdHistory([]);
    setHistIndex(null);
    setExecutedCmds(new Set());
    setProgress((p) => ({ ...p, index: i }));
  }

  function restartStory() {
    if (!confirm("Ricominciare il percorso da zero? Il repository verrà svuotato.")) return;
    git.reset();
    setTranscript([]);
    setCmdHistory([]);
    setHistIndex(null);
    setShowHint(false);
    setExecutedCmds(new Set());
    setProgress({ index: 0, completed: [] });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      {/* Progress rail */}
      <div className="lg:col-span-3 space-y-2">
        <div className="text-xs uppercase tracking-widest text-white/40 px-1">Percorso</div>
        <div className="space-y-1">
          {LESSONS.map((l, i) => {
            const done = progress.completed.includes(l.id);
            const active = i === lessonIndex;
            return (
              <button
                key={l.id}
                onClick={() => goTo(i)}
                className={
                  "w-full text-left px-3 py-2 rounded-xl border text-xs flex items-center gap-2 transition " +
                  (active
                    ? "border-teal-400/60 bg-teal-400/10 text-white"
                    : done
                      ? "border-white/10 bg-white/5 text-white/60"
                      : "border-white/5 text-white/30 hover:text-white/60")
                }
              >
                <span
                  className={
                    "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] " +
                    (done ? "bg-emerald-400 text-[#0F1216]" : active ? "bg-teal-400 text-[#0F1216]" : "bg-white/10")
                  }
                >
                  {done ? "✓" : i + 1}
                </span>
                <span className="truncate">{l.title}</span>
              </button>
            );
          })}
        </div>
        <button
          onClick={restartStory}
          className="w-full mt-2 text-[11px] px-3 py-2 rounded-xl border border-white/10 text-white/40 hover:text-rose-300 hover:border-rose-300/40"
        >
          Ricomincia da zero
        </button>
      </div>

      {/* Lesson card + terminal */}
      <div className="lg:col-span-5 space-y-4">
        <div className="rounded-2xl border border-white/10 bg-[#12161B] p-5 space-y-3">
          <div className="text-[11px] uppercase tracking-widest text-teal-300/80">
            Fermata {lessonIndex + 1} di {LESSONS.length}
          </div>
          <h2 className="text-lg font-bold text-white">{lesson.title}</h2>
          <p className="text-sm text-white/70 leading-relaxed">{lesson.intro}</p>

          <div className="rounded-xl bg-black/30 border border-white/10 p-3">
            <div className="text-[11px] uppercase tracking-wide text-white/40 mb-1">Da fare</div>
            <p className="text-sm text-white/85">{lesson.task}</p>
          </div>

          {lesson.suggested?.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {lesson.suggested.map((cmd, i) => {
                const done = executedCmds.has(i);
                return (
                  <button
                    key={`${i}-${cmd}`}
                    onClick={() => runLine(cmd, i)}
                    className={
                      "font-mono text-[11px] px-2 py-1 rounded-lg border transition " +
                      (done
                        ? "border-white/10 text-white/35 line-through decoration-white/40"
                        : "border-white/15 text-white/70 hover:border-teal-400/60 hover:text-teal-300")
                    }
                    title={`Esegui: ${cmd}`}
                  >
                    {cmd}
                  </button>
                );
              })}
            </div>
          )}

          <div>
            <button
              className="text-[11px] text-white/40 hover:text-white/70 underline underline-offset-2"
              onClick={() => setShowHint((v) => !v)}
            >
              {showHint ? "Nascondi suggerimento" : "Mostra suggerimento"}
            </button>
            {showHint && <p className="text-xs text-amber-200/80 mt-1">{lesson.hint}</p>}
          </div>

          {isDone && !lesson.isFinal && (
            <div className="rounded-xl border border-emerald-400/40 bg-emerald-400/10 p-3 space-y-2">
              <p className="text-sm text-emerald-200">{lesson.explain}</p>
              <button
                onClick={goNext}
                className="text-xs px-3 py-1.5 rounded-lg bg-emerald-400 text-[#0F1216] font-semibold hover:bg-emerald-300"
              >
                Fermata successiva ▸
              </button>
            </div>
          )}

          {lesson.isFinal && (
            <div className="rounded-xl border border-teal-400/40 bg-teal-400/10 p-3">
              <p className="text-sm text-teal-100">
                Percorso completato. Passa alla Modalità libera qui sopra per continuare a
                esplorare senza guida.
              </p>
            </div>
          )}
        </div>

        {git.mergeState?.conflicts?.length > 0 && (
          <ConflictResolver
            repo={git.repo}
            mergeState={git.mergeState}
            exec={git.exec}
            writeFile={git.writeFile}
          />
        )}

        {/* Mini terminal */}
        <div className="rounded-2xl border border-white/10 bg-[#0F1216] p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] uppercase tracking-widest text-white/40">
              Mini-terminale · {transcript.length} comandi · {transcript.reduce((s, t) => s + 1 + (t.out?.length || 0), 0)} righe
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                disabled={transcript.length === 0}
                onClick={copyTerminalLog}
                className={
                  "text-[10px] px-2 py-1 rounded-lg border " +
                  (transcript.length === 0
                    ? "border-white/5 text-white/20 cursor-not-allowed"
                    : "border-white/15 text-white/50 hover:border-teal-400/50 hover:text-teal-300")
                }
              >
                Copia log
              </button>
              <button
                type="button"
                disabled={transcript.length === 0}
                onClick={downloadTerminalLog}
                className={
                  "text-[10px] px-2 py-1 rounded-lg border " +
                  (transcript.length === 0
                    ? "border-white/5 text-white/20 cursor-not-allowed"
                    : "border-white/15 text-white/50 hover:border-teal-400/50 hover:text-teal-300")
                }
              >
                Scarica log
              </button>
            </div>
          </div>
          <div className="max-h-40 overflow-auto space-y-1 mb-2 font-mono text-[11px]">
            {transcript.map((t, i) => (
              <div key={i}>
                <div className="text-white/50">$ {t.line}</div>
                {t.out.map((o, j) => (
                  <div key={j} className={t.ok ? "text-white/70 pl-2" : "text-rose-300 pl-2"}>
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
              placeholder="scrivi un comando… (help per la lista)"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onTerminalKeyDown}
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
      </div>

      {/* Live graph */}
      <div className="lg:col-span-4">
        <div className="sticky top-4 space-y-4">
          <CommitGraph repo={git.repo} selected={git.selectedCommit} onSelect={git.setSelectedCommit} />
          <BranchLegend git={git} />
          <ThreeStageInspector repo={git.repo} headFiles={git.headFiles} collapsedByDefault={false} />
        </div>
      </div>
    </div>
  );
}

function BranchLegend({ git }) {
  const headRef = git.repo?.head?.kind === "ref" ? git.repo.head.value.replace("refs/heads/", "") : null;
  return (
    <div className="rounded-2xl border border-white/10 bg-[#12161B] p-4 text-xs text-white/60 space-y-1">
      <div className="flex justify-between">
        <span className="text-white/40">HEAD</span>
        <span className="font-mono text-white/80">
          {headRef ? `${headRef} (branch)` : git.headOid ? `${git.headOid.slice(0, 7)} (detached)` : "∅"}
        </span>
      </div>
      <div className="flex justify-between">
        <span className="text-white/40">Branch</span>
        <span className="font-mono text-white/80">{git.branches.length}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-white/40">Commit</span>
        <span className="font-mono text-white/80">{git.log.length}</span>
      </div>
    </div>
  );
}
