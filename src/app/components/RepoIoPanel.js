// src/app/R45/components/RepoIoPanel.js
"use client";

import React, { useRef, useState } from "react";

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function isPlainObject(x) {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

// very light validation (toy repo)
function validateRepoShape(repo) {
  if (!isPlainObject(repo)) return "Not an object";
  if (!isPlainObject(repo.objects)) return "Missing/invalid: objects";
  if (!isPlainObject(repo.refs)) return "Missing/invalid: refs";
  if (!isPlainObject(repo.head)) return "Missing/invalid: head";
  if (!isPlainObject(repo.index)) return "Missing/invalid: index";
  if (!isPlainObject(repo.working)) return "Missing/invalid: working";
  return null;
}

async function safeCopy(text) {
  const s = String(text || "");
  if (navigator?.clipboard?.writeText) return navigator.clipboard.writeText(s);

  // fallback (older browsers)
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

export default function RepoIoPanel({ repo, onImport }) {
  const fileRef = useRef(null);
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  function onDownload() {
    try {
      const json = JSON.stringify(repo, null, 2);
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      downloadText(`tinygit-repo-${stamp}.json`, json);
      setMsg("Repository scaricato.");
    } catch (e) {
      setMsg(`Download fallito: ${e?.message || String(e)}`);
    }
  }

  async function onCopyToClipboard() {
    try {
      const json = JSON.stringify(repo, null, 2);
      await safeCopy(json);
      setCopied(true);
      setMsg("Copiato negli appunti.");
      setTimeout(() => setCopied(false), 900);
    } catch (e) {
      setMsg(`Copia fallita: ${e?.message || String(e)}`);
    }
  }

  async function onPickFile(e) {
    const f = e.target.files?.[0];
    e.target.value = ""; // allow re-upload same file
    if (!f) return;

    try {
      const text = await f.text();
      const parsed = JSON.parse(text);
      const err = validateRepoShape(parsed);
      if (err) {
        setMsg(`Import rifiutato: ${err}`);
        return;
      }
      setMsg("Repository importato, ricarico…");
      onImport?.(parsed);
    } catch (ex) {
      setMsg(`Import fallito: ${ex?.message || String(ex)}`);
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-[#12161B] overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/5"
      >
        <div className="text-xs uppercase tracking-widest text-white/50">
          Esporta / importa repository (JSON)
        </div>
        <span className="text-white/40 text-xs">{open ? "▾ nascondi" : "▸ mostra"}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-2">
          <div className="text-[11px] text-white/40">
            Salva o carica l'intero stato del repository (oggetti, refs, HEAD, index, working) — utile per backup o per condividerlo.
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="px-3 py-1.5 rounded-xl border border-white/15 text-xs text-white/70 hover:bg-white/5"
              onClick={onDownload}
            >
              Scarica JSON
            </button>
            <button
              className="px-3 py-1.5 rounded-xl bg-teal-500/90 text-[#0F1216] text-xs font-semibold hover:bg-teal-400"
              onClick={onCopyToClipboard}
            >
              {copied ? "Copiato" : "Copia negli appunti"}
            </button>
            <button
              className="px-3 py-1.5 rounded-xl border border-white/15 text-xs text-white/70 hover:bg-white/5"
              onClick={() => fileRef.current?.click()}
            >
              Carica JSON
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={onPickFile}
            />
          </div>
          <div className="text-[11px] text-white/40">{msg || "—"}</div>
        </div>
      )}
    </div>
  );
}
