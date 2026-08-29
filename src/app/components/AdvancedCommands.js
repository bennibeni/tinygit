"use client";

import React, { useCallback, useRef, useState } from "react";
import { ADVANCED_TOPICS } from "../lib/advancedTopics";
import CommitGraph from "./CommitGraph";
import ConflictResolver from "./ConflictResolver";
import ThreeStageInspector from "./ThreeStageInspector";
import MiniTerminal from "./MiniTerminal";

function BranchStrip({ repo, branches, onExec }) {
  const current = repo?.head?.kind === "ref" ? repo.head.value.replace("refs/heads/", "") : null;
  if (!branches?.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {branches.map((b) => {
        const isCurrent = b.name === current;
        return (
          <button
            key={b.name}
            onClick={() => !isCurrent && onExec(`checkout ${b.name}`)}
            className={
              "text-xs font-mono px-3 py-1.5 rounded-xl border transition " +
              (isCurrent
                ? "border-teal-400/60 bg-teal-400/10 text-teal-200 font-bold cursor-default"
                : "border-white/15 text-white/60 hover:border-white/30 hover:text-white/85")
            }
            title={b.oid ? b.oid.slice(0, 7) : "(vuoto)"}
          >
            {isCurrent && "● "}
            {b.name}
          </button>
        );
      })}
    </div>
  );
}

function TopicCard({ topic, onRun }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-white/10 bg-[#12161B] overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-white/5"
      >
        <span className="text-sm font-semibold text-white/85">{topic.title}</span>
        <span className="text-white/30 text-xs shrink-0">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          <p className="text-xs text-white/60 leading-relaxed">{topic.explain}</p>
          <div className="space-y-1.5">
            {topic.commands.map((c, i) => (
              <div key={i} className="flex items-start gap-2">
                <button
                  onClick={() => onRun(c.cmd)}
                  className="font-mono text-[11px] px-2 py-1 rounded-lg border border-white/15 text-white/70 hover:border-teal-400/60 hover:text-teal-300 shrink-0"
                  title={`Esegui: ${c.cmd}`}
                >
                  {c.cmd}
                </button>
                {c.note && <span className="text-[11px] text-white/35 pt-1">{c.note}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdvancedCommands({ git }) {
  const terminalRef = useRef(null);

  const runCmd = useCallback(
    (cmd) => {
      if (terminalRef.current?.run) return terminalRef.current.run(cmd);
      return git.exec(cmd);
    },
    [git],
  );

  function resetRepo() {
    if (!confirm("Svuotare completamente il repository e ripartire da zero?")) return;
    git.reset();
  }

  async function seedExample() {
    await runCmd("init");
    await runCmd('write a.txt "versione 1"');
    await runCmd("add a.txt");
    await runCmd('commit -m "primo commit"');
    await runCmd('write a.txt "versione 2"');
    await runCmd("add a.txt");
    await runCmd('commit -m "secondo commit"');
    await runCmd('write a.txt "versione 3"');
    await runCmd("add a.txt");
    await runCmd('commit -m "terzo commit"');
  }

  if (!git.repo) return null;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-[#12161B] p-4 space-y-2">
        <div className="text-sm font-bold text-white">Comandi avanzati</div>
        <p className="text-xs text-white/50 leading-relaxed">
          Qui non c'è un percorso da seguire: apri l'argomento che ti interessa,
          clicca i comandi suggeriti o scrivili tu — anche presi da un'altra
          guida. Il grafo e l'ispettore sotto restano sempre sincronizzati con
          quello che scrivi nel mini-terminale.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            onClick={seedExample}
            className="text-xs px-3 py-1.5 rounded-xl bg-teal-500/90 text-[#0F1216] font-semibold hover:bg-teal-400"
          >
            Prepara un repository di esempio (3 commit)
          </button>
          <button
            onClick={resetRepo}
            className="text-xs px-3 py-1.5 rounded-xl border border-white/10 text-white/40 hover:text-rose-300 hover:border-rose-300/40"
          >
            Nuovo repository (reset)
          </button>
        </div>
      </div>

      <BranchStrip repo={git.repo} branches={git.branches} onExec={runCmd} />

      {git.mergeState?.conflicts?.length > 0 && (
        <ConflictResolver repo={git.repo} mergeState={git.mergeState} exec={git.exec} writeFile={git.writeFile} />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-5 space-y-3">
          <div className="text-xs uppercase tracking-widest text-white/40 px-1">Argomenti</div>
          {ADVANCED_TOPICS.map((t) => (
            <TopicCard key={t.id} topic={t} onRun={runCmd} />
          ))}
        </div>

        <div className="lg:col-span-7 space-y-4">
          <CommitGraph repo={git.repo} selected={git.selectedCommit} onSelect={git.setSelectedCommit} />
          <MiniTerminal ref={terminalRef} exec={git.exec} placeholder="scrivi qui un comando (anche da un'altra guida)…" />
          <ThreeStageInspector
            repo={git.repo}
            headFiles={git.headFiles}
            collapsedByDefault={false}
            selectedPath={git.selectedPath}
            onSelectPath={git.setSelectedPath}
            onExec={runCmd}
            writeFile={git.writeFile}
          />
        </div>
      </div>
    </div>
  );
}
