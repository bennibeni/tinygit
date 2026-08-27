"use client";

import React, { useState } from "react";
import { FAQ } from "../lib/faq";

function safeCopy(text) {
  const s = String(text || "");
  if (navigator?.clipboard?.writeText) return navigator.clipboard.writeText(s);
  const ta = document.createElement("textarea");
  ta.value = s;
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
  return Promise.resolve();
}

function FaqRow({ item, repo, onExec }) {
  const [openAnswer, setOpenAnswer] = useState(false);
  const [copied, setCopied] = useState(false);
  const [ranOutput, setRanOutput] = useState(null);

  const liveAnswer = item.live ? item.live(repo) : null;

  async function handleRun() {
    const res = await onExec?.(item.command);
    setRanOutput(res?.out || []);
    setOpenAnswer(true);
  }

  async function handleCopy() {
    await safeCopy(item.command);
    setCopied(true);
    setTimeout(() => setCopied(false), 800);
  }

  return (
    <div className="rounded-xl border border-white/10 bg-black/20 overflow-hidden">
      <button
        onClick={() => setOpenAnswer((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-white/5"
      >
        <span className="text-sm text-white/85">{item.question}</span>
        <span className="text-white/30 text-xs shrink-0">{openAnswer ? "▾" : "▸"}</span>
      </button>

      {openAnswer && (
        <div className="px-3 pb-3 space-y-2">
          {liveAnswer && (
            <div className="rounded-lg bg-teal-400/10 border border-teal-400/25 px-2 py-1.5 text-xs text-teal-200 whitespace-pre-wrap font-mono">
              {liveAnswer}
            </div>
          )}

          <div className="flex items-center gap-2">
            <code className="flex-1 font-mono text-xs text-white/70 bg-black/30 rounded-lg px-2 py-1.5 truncate">
              {item.command}
            </code>
            <button
              onClick={handleRun}
              className="text-xs px-2 py-1.5 rounded-lg bg-teal-500/90 text-[#0F1216] font-semibold hover:bg-teal-400 shrink-0"
              title={`Esegui: ${item.command}`}
            >
              Esegui
            </button>
            <button
              onClick={handleCopy}
              className="text-xs px-2 py-1.5 rounded-lg border border-white/15 text-white/70 hover:bg-white/5 shrink-0"
              title={`Copia: ${item.command}`}
            >
              {copied ? "Copiato" : "Copia"}
            </button>
          </div>

          {ranOutput && (
            <div className="font-mono text-[11px] text-white/60 whitespace-pre-wrap bg-black/30 rounded-lg px-2 py-1.5">
              {ranOutput.join("\n")}
            </div>
          )}

          {item.note && <div className="text-[11px] text-white/35">{item.note}</div>}
        </div>
      )}
    </div>
  );
}

export default function HelpModal({ open, onClose, repo, onExec }) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center p-4 sm:p-8 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl border border-white/10 bg-[#12161B] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div>
            <div className="text-sm font-bold text-white">Domande frequenti</div>
            <div className="text-xs text-white/40">Clicca per vedere la risposta, "Esegui" per farla davvero.</div>
          </div>
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white text-lg leading-none px-2"
            aria-label="Chiudi"
          >
            ×
          </button>
        </div>

        <div className="p-4 space-y-2 max-h-[70vh] overflow-y-auto">
          {FAQ.map((item) => (
            <FaqRow key={item.id} item={item} repo={repo} onExec={onExec} />
          ))}
        </div>
      </div>
    </div>
  );
}
