"use client";

import React, { useEffect, useMemo, useState } from "react";
import { readBlobText, readCommit, listTreeRecursive } from "../lib/readers";
import { diffLines } from "../lib/diff";

function allKnownPaths(repo, headFiles) {
  const s = new Set();
  for (const p of Object.keys(repo?.working || {})) s.add(p);
  for (const p of Object.keys(repo?.index || {})) s.add(p);
  for (const f of headFiles || []) if (f.kind === "blob") s.add(f.path);
  return [...s].sort();
}

// Reads a file's content at the tip commit of ANY branch — this doesn't
// require checkout, since a branch's committed content is just data sitting
// in a commit's tree, unlike working/index which only exist for whichever
// branch you're currently on.
function readFileAtBranchTip(repo, branchOid, path) {
  if (!branchOid) return null;
  const commit = readCommit(repo, branchOid);
  if (!commit?.tree) return null;
  const files = listTreeRecursive(repo, commit.tree);
  const hit = files.find((f) => f.kind === "blob" && f.path === path);
  return hit ? readBlobText(repo, hit.oid) ?? "" : null;
}

// Reads the three raw texts for one path (null = "absent in that area").
function getAreas(repo, headFiles, path) {
  const workText = Object.prototype.hasOwnProperty.call(repo?.working || {}, path)
    ? String(repo.working[path] ?? "")
    : null;

  const indexOid = repo?.index?.[path]?.oid || null;
  const indexText = indexOid ? readBlobText(repo, indexOid) ?? "" : null;

  const headHit = (headFiles || []).find((f) => f.kind === "blob" && f.path === path);
  const headText = headHit ? readBlobText(repo, headHit.oid) ?? "" : null;

  return { workText, indexText, headText };
}

// Classifies a path so the overview can show, at a glance, whether it's
// synced across the three areas, only local, or actually different somewhere.
function classifyAreas({ workText, indexText, headText }, isConflicted) {
  if (isConflicted) return { symbol: "⚠", color: "#E879F9", label: "conflitto di merge" };

  const inHead = headText !== null;
  const inIndex = indexText !== null;
  const inWork = workText !== null;

  if (!inHead && !inIndex) return { symbol: "＋", color: "#F4B942", label: "nuovo, non in stage" };
  if (inHead && !inWork && !inIndex) return { symbol: "－", color: "#FB7185", label: "eliminato" };
  if (inHead && inIndex && inWork && headText === indexText && indexText === workText) {
    return { symbol: "✓", color: "#2DD4BF", label: "sincronizzato" };
  }
  return { symbol: "±", color: "#F4B942", label: "modificato da qualche parte" };
}

function preview(text) {
  if (text === null || text === undefined) return null;
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (!oneLine) return "(vuoto)";
  return oneLine.length > 26 ? oneLine.slice(0, 26) + "…" : oneLine;
}

function StageColumn({ label, text, accent }) {
  const present = text !== null && text !== undefined;
  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-2 min-w-0">
      <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: accent }}>
        {label}
      </div>
      <div className="font-mono text-[11px] whitespace-pre-wrap break-words max-h-40 overflow-auto text-white/80">
        {present ? (text || <span className="text-white/30">(vuoto)</span>) : <span className="text-white/25">(assente)</span>}
      </div>
    </div>
  );
}

// Working column, but editable: lets you change a tracked file's working
// content directly here instead of only through the CLI's `write` command.
function EditableWorkingColumn({ path, text, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text ?? "");

  useEffect(() => {
    if (!editing) setDraft(text ?? "");
  }, [text, editing, path]);

  function save() {
    onSave(path, draft);
    setEditing(false);
  }

  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-2 min-w-0">
      <div className="flex items-center justify-between mb-1">
        <div className="text-[10px] uppercase tracking-wide" style={{ color: "#2DD4BF" }}>
          Working
        </div>
        {!editing ? (
          <button
            className="p-1 rounded border border-white/15 text-white/50 hover:border-teal-400/50 hover:text-teal-300"
            onClick={() => setEditing(true)}
            title="Modifica"
            aria-label="Modifica"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </button>
        ) : (
          <div className="flex gap-1">
            <button
              className="text-[10px] px-1.5 py-0.5 rounded border border-white/15 text-white/50 hover:bg-white/5"
              onClick={() => {
                setDraft(text ?? "");
                setEditing(false);
              }}
            >
              annulla
            </button>
            <button
              className="text-[10px] px-1.5 py-0.5 rounded bg-teal-500/90 text-[#0F1216] font-semibold hover:bg-teal-400"
              onClick={save}
            >
              salva
            </button>
          </div>
        )}
      </div>

      {editing ? (
        <textarea
          autoFocus
          className="w-full h-32 rounded-lg bg-black/40 border border-white/10 p-2 font-mono text-[11px] text-white/90 focus:outline-none focus:ring-1 focus:ring-teal-400"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
        />
      ) : (
        <div className="font-mono text-[11px] whitespace-pre-wrap break-words max-h-40 overflow-auto text-white/80">
          {text !== null && text !== undefined ? (text || <span className="text-white/30">(vuoto)</span>) : <span className="text-white/25">(assente)</span>}
        </div>
      )}
    </div>
  );
}

function DiffView({ oldText, newText, oldLabel, newLabel }) {
  const rows = useMemo(() => diffLines(oldText, newText), [oldText, newText]);
  const changed = rows.some((r) => r.type !== "same");

  if (oldText === null && newText === null) {
    return <div className="text-[11px] text-white/30">Nessuno dei due lati ha questo file.</div>;
  }
  if (!changed) {
    return <div className="text-[11px] text-white/30">Nessuna differenza — contenuto identico.</div>;
  }

  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-2 max-h-56 overflow-auto">
      <div className="text-[10px] text-white/35 mb-1 font-mono">
        <span className="text-rose-300">− {oldLabel}</span>{"   "}
        <span className="text-emerald-300">+ {newLabel}</span>
      </div>
      <div className="font-mono text-[11px] leading-relaxed">
        {rows.map((r, i) => (
          <div
            key={i}
            className={
              "whitespace-pre-wrap break-words px-1 " +
              (r.type === "add"
                ? "bg-emerald-400/10 text-emerald-200"
                : r.type === "del"
                  ? "bg-rose-400/10 text-rose-300"
                  : "text-white/45")
            }
          >
            {r.type === "add" ? "+ " : r.type === "del" ? "− " : "  "}
            {r.line === "" ? "\u00A0" : r.line}
          </div>
        ))}
      </div>
    </div>
  );
}

function OverviewTable({ repo, headFiles, paths, activePath, onPick, onExec }) {
  const conflictSet = new Set(repo?.mergeState?.conflicts || []);
  return (
    <div className="rounded-xl border border-white/10 overflow-hidden">
      <div
        className={
          "grid text-[10px] uppercase tracking-wide text-white/40 bg-black/30 px-2 py-1.5 " +
          (onExec ? "grid-cols-[1.1fr_1fr_1fr_1fr_auto]" : "grid-cols-[1.3fr_1fr_1fr_1fr]")
        }
      >
        <div>File</div>
        <div style={{ color: "#2DD4BF" }}>Working</div>
        <div style={{ color: "#F4B942" }}>Index</div>
        <div style={{ color: "#818CF8" }}>HEAD</div>
        {onExec && <div></div>}
      </div>
      <div className="max-h-56 overflow-auto divide-y divide-white/5">
        {paths.map((p) => {
          const areas = getAreas(repo, headFiles, p);
          const conflicted = conflictSet.has(p);
          const c = classifyAreas(areas, conflicted);
          const isActive = p === activePath;
          const isStaged = !!repo?.index?.[p];
          const escaped = /\s/.test(p) ? `"${p}"` : p;

          return (
            <div
              key={p}
              className={
                "grid gap-1 px-2 py-1.5 items-center font-mono text-[11px] " +
                (onExec ? "grid-cols-[1.1fr_1fr_1fr_1fr_auto]" : "grid-cols-[1.3fr_1fr_1fr_1fr]") +
                (isActive ? " bg-teal-400/10" : "")
              }
            >
              <button onClick={() => onPick(p)} className="min-w-0 text-left truncate flex items-center gap-1 hover:underline" style={{ color: c.color }}>
                <span>{c.symbol}</span>
                <span className="text-white/80 truncate">{p}</span>
              </button>
              <button onClick={() => onPick(p)} className="truncate text-white/55 text-left">{preview(areas.workText) ?? <span className="text-white/20">—</span>}</button>
              <button onClick={() => onPick(p)} className="truncate text-white/55 text-left">{preview(areas.indexText) ?? <span className="text-white/20">—</span>}</button>
              <button onClick={() => onPick(p)} className="truncate text-white/55 text-left">{preview(areas.headText) ?? <span className="text-white/20">—</span>}</button>
              {onExec && (
                <div className="flex gap-1 shrink-0">
                  {!conflicted && !isStaged && (
                    <button
                      className="px-1.5 py-0.5 rounded border border-white/15 text-white/60 hover:border-teal-400/50 hover:text-teal-300"
                      onClick={() => onExec(`add ${escaped}`)}
                      title="Metti in stage"
                    >
                      add
                    </button>
                  )}
                  {!conflicted && isStaged && (
                    <button
                      className="px-1.5 py-0.5 rounded border border-white/15 text-white/60 hover:border-amber-400/50 hover:text-amber-300"
                      onClick={() => onExec(`unstage ${escaped}`)}
                      title="Togli dallo stage"
                    >
                      unstage
                    </button>
                  )}
                  {!conflicted && c.symbol === "±" && (
                    <button
                      className="px-1.5 py-0.5 rounded border border-white/15 text-white/60 hover:border-rose-400/50 hover:text-rose-300"
                      onClick={() => onExec(`restore ${escaped}`)}
                      title="Scarta le modifiche non in stage"
                    >
                      restore
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ThreeStageInspector({
  repo,
  headFiles,
  collapsedByDefault = true,
  selectedPath,
  onSelectPath,
  onExec,
  writeFile,
}) {
  const [open, setOpen] = useState(!collapsedByDefault);
  const [showDiff, setShowDiff] = useState(false);
  const paths = useMemo(() => allKnownPaths(repo, headFiles), [repo, headFiles]);
  const [internalPath, setInternalPath] = useState(null);
  const [compareBranch, setCompareBranch] = useState(null);

  const setPath = onSelectPath || setInternalPath;
  const pathValue = onSelectPath !== undefined ? selectedPath : internalPath;

  const activePath = pathValue && paths.includes(pathValue) ? pathValue : paths[0] || null;

  const { workText, indexText, headText } = activePath
    ? getAreas(repo, headFiles, activePath)
    : { workText: null, indexText: null, headText: null };

  const workVsIndex = workText === indexText ? "uguali" : "diversi";
  const indexVsHead = indexText === headText ? "uguali" : "diversi";

  const currentBranch = repo?.head?.kind === "ref" ? repo.head.value.replace("refs/heads/", "") : null;

  const otherBranches = Object.keys(repo?.refs || {})
    .filter((k) => k.startsWith("refs/heads/"))
    .map((k) => k.replace("refs/heads/", ""))
    .filter((n) => n !== currentBranch)
    .sort();

  const compareOid = compareBranch ? repo?.refs?.[`refs/heads/${compareBranch}`] : null;
  const compareText = activePath && compareOid ? readFileAtBranchTip(repo, compareOid, activePath) : null;

  return (
    <div className="rounded-2xl border border-white/10 bg-[#12161B] overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/5"
      >
        <div className="text-xs uppercase tracking-widest text-white/50">
          Ispeziona le tre aree
        </div>
        <span className="text-white/40 text-xs">{open ? "▾ nascondi" : "▸ mostra"}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-white/40">
              Sei su:{" "}
              <span className="font-mono text-teal-300">
                {currentBranch || (repo?.head?.value ? `${repo.head.value.slice(0, 7)} (staccato)` : "∅")}
              </span>
            </span>
            <span className="text-white/25 font-mono" title="Comando equivalente in una shell git vera">
              (git status → prima riga)
            </span>
          </div>

          {paths.length ? (
            <>
              {onExec && (
                <div className="flex items-center justify-between">
                  <div className="text-[10px] uppercase tracking-wide text-white/40">Azioni su tutti i file</div>
                  <div className="flex gap-1">
                    <button
                      className="px-2 py-1 rounded-lg border border-white/15 text-[11px] text-white/70 hover:border-teal-400/50 hover:text-teal-300"
                      onClick={() => onExec("add -A")}
                    >
                      Stage all
                    </button>
                    <button
                      className="px-2 py-1 rounded-lg border border-white/15 text-[11px] text-white/70 hover:border-amber-400/50 hover:text-amber-300"
                      onClick={() => onExec("unstage -A")}
                    >
                      Unstage all
                    </button>
                    <button
                      className="px-2 py-1 rounded-lg border border-white/15 text-[11px] text-white/70 hover:border-rose-400/50 hover:text-rose-300"
                      onClick={() => onExec("restore -A")}
                    >
                      Restore all
                    </button>
                  </div>
                </div>
              )}

              <OverviewTable
                repo={repo}
                headFiles={headFiles}
                paths={paths}
                activePath={activePath}
                onPick={setPath}
                onExec={onExec}
              />
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-white/35">
                <span><span style={{ color: "#2DD4BF" }}>✓</span> sincronizzato</span>
                <span><span style={{ color: "#F4B942" }}>±</span> modificato</span>
                <span><span style={{ color: "#F4B942" }}>＋</span> nuovo</span>
                <span><span style={{ color: "#FB7185" }}>－</span> eliminato</span>
                <span><span style={{ color: "#E879F9" }}>⚠</span> conflitto</span>
              </div>

              <div className="pt-1 border-t border-white/10 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] uppercase tracking-wide text-white/40">
                    Dettaglio: <span className="font-mono text-white/70">{activePath}</span>
                  </div>
                  <div className="flex gap-2 text-[10px]">
                    <span className="px-2 py-0.5 rounded-md border border-white/10 text-white/50">
                      work ↔ index: <span className={workVsIndex === "uguali" ? "text-emerald-300" : "text-amber-300"}>{workVsIndex}</span>
                    </span>
                    <span className="px-2 py-0.5 rounded-md border border-white/10 text-white/50">
                      index ↔ HEAD: <span className={indexVsHead === "uguali" ? "text-emerald-300" : "text-amber-300"}>{indexVsHead}</span>
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {writeFile ? (
                    <EditableWorkingColumn path={activePath} text={workText} onSave={writeFile} />
                  ) : (
                    <StageColumn label="Working" text={workText} accent="#2DD4BF" />
                  )}
                  <StageColumn label="Index (stage)" text={indexText} accent="#F4B942" />
                  <StageColumn label="HEAD (commit)" text={headText} accent="#818CF8" />
                </div>

                <div className="pt-1">
                  <button
                    className="text-[11px] text-white/40 hover:text-white/70 underline underline-offset-2"
                    onClick={() => setShowDiff((v) => !v)}
                  >
                    {showDiff ? "Nascondi diff (Working vs HEAD)" : "Mostra diff (Working vs HEAD)"}
                  </button>
                  {showDiff && (
                    <div className="mt-2">
                      <DiffView oldText={headText} newText={workText} oldLabel="HEAD" newLabel="Working" />
                    </div>
                  )}
                </div>

                {otherBranches.length > 0 && (
                  <div className="pt-2 border-t border-white/10 space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="text-[10px] uppercase tracking-wide text-white/40">
                        Guarda com'è su un altro branch (senza fare checkout)
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {otherBranches.map((name) => (
                          <button
                            key={name}
                            onClick={() => setCompareBranch((b) => (b === name ? null : name))}
                            className={
                              "text-[11px] font-mono px-2 py-0.5 rounded-md border " +
                              (compareBranch === name
                                ? "border-fuchsia-400/60 bg-fuchsia-400/10 text-fuchsia-200"
                                : "border-white/15 text-white/60 hover:border-white/30")
                            }
                          >
                            {name}
                          </button>
                        ))}
                      </div>
                    </div>

                    {compareBranch && (
                      <StageColumn
                        label={`HEAD di ${compareBranch}`}
                        text={compareText}
                        accent="#E879F9"
                      />
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="text-xs text-white/30">Nessun file ancora — scrivine uno con "write".</div>
          )}
        </div>
      )}
    </div>
  );
}

