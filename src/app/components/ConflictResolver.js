"use client";

import React, { useState } from "react";

export default function ConflictResolver({ repo, mergeState, exec, writeFile }) {
  const [drafts, setDrafts] = useState({});
  const [message, setMessage] = useState("");

  if (!mergeState?.conflicts?.length) return null;

  const remaining = mergeState.conflicts.filter((p) => !repo.index?.[p]);
  const resolved = mergeState.conflicts.length - remaining.length;
  const allResolved = remaining.length === 0;

  function currentText(path) {
    return drafts[path] ?? repo.working?.[path] ?? "";
  }

  function save(path) {
    writeFile(path, currentText(path));
  }

  async function stage(path) {
    save(path);
    await exec(`add ${path}`);
  }

  async function commit() {
    const msg = message.trim() || `Merge risolto (${mergeState.theirsLabel})`;
    await exec(`commit -m "${msg.replace(/"/g, "'")}"`);
    setMessage("");
    setDrafts({});
  }

  return (
    <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-bold text-rose-200">
          Conflitto di merge — {resolved}/{mergeState.conflicts.length} file risolti
        </div>
        <button
          className="text-xs px-2 py-1 rounded-lg border border-rose-300/40 text-rose-200 hover:bg-rose-400/10"
          onClick={() => exec("merge --abort")}
        >
          Annulla merge
        </button>
      </div>

      {mergeState.conflicts.map((path) => {
        const isResolved = !!repo.index?.[path];
        return (
          <div key={path} className="rounded-xl border border-white/10 bg-[#0F1216] p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="font-mono text-xs text-white/80">{path}</div>
              <span
                className={
                  "text-[11px] px-2 py-0.5 rounded-md border " +
                  (isResolved
                    ? "border-emerald-400/40 text-emerald-300"
                    : "border-amber-400/40 text-amber-300")
                }
              >
                {isResolved ? "risolto" : "da risolvere"}
              </span>
            </div>

            <textarea
              className="w-full h-40 rounded-lg bg-black/40 border border-white/10 p-2 font-mono text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-teal-400"
              value={currentText(path)}
              onChange={(e) => setDrafts((d) => ({ ...d, [path]: e.target.value }))}
              spellCheck={false}
            />
            <div className="text-[11px] text-white/40">
              Rimuovi i marcatori <code>&lt;&lt;&lt;&lt;&lt;&lt;&lt;</code>,{" "}
              <code>=======</code>, <code>&gt;&gt;&gt;&gt;&gt;&gt;&gt;</code> e tieni solo il
              contenuto che vuoi mantenere.
            </div>

            <div className="flex gap-2">
              <button
                className="text-xs px-3 py-1.5 rounded-lg border border-white/15 text-white/80 hover:bg-white/5"
                onClick={() => save(path)}
              >
                Salva bozza
              </button>
              <button
                className="text-xs px-3 py-1.5 rounded-lg bg-teal-500/90 text-[#0F1216] font-semibold hover:bg-teal-400"
                onClick={() => stage(path)}
              >
                Salva e metti in stage (add)
              </button>
            </div>
          </div>
        );
      })}

      <div className="flex items-center gap-2 pt-2 border-t border-white/10">
        <input
          className="flex-1 rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-xs font-mono text-white/90 focus:outline-none focus:ring-1 focus:ring-teal-400"
          placeholder='messaggio di commit (es. "risolto conflitto: scelto blu")'
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={!allResolved}
        />
        <button
          className={
            "text-xs px-3 py-2 rounded-lg font-semibold " +
            (allResolved
              ? "bg-emerald-500/90 text-[#0F1216] hover:bg-emerald-400"
              : "bg-white/5 text-white/30 cursor-not-allowed")
          }
          disabled={!allResolved}
          onClick={commit}
        >
          Completa il merge (commit)
        </button>
      </div>
    </div>
  );
}
