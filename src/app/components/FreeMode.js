"use client";

import React, { useCallback, useRef, useState } from "react";
import RepoIoPanel from "./RepoIoPanel";
import CommitGraph from "./CommitGraph";
import ConflictResolver from "./ConflictResolver";
import ThreeStageInspector from "./ThreeStageInspector";
import MiniTerminal from "./MiniTerminal";

const LS_KEY = "tinygit_repo@1";

function BranchStrip({ repo, branches, onExec }) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const current = repo?.head?.kind === "ref" ? repo.head.value.replace("refs/heads/", "") : null;

  async function submitCreate(e) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    await onExec(`branch ${n}`);
    await onExec(`checkout ${n}`);
    setName("");
    setCreating(false);
  }

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

      {creating ? (
        <form onSubmit={submitCreate} className="flex items-center gap-1">
          <input
            autoFocus
            className="text-xs font-mono px-2 py-1.5 rounded-xl bg-black/40 border border-white/15 text-white/85 focus:outline-none focus:ring-1 focus:ring-teal-400 w-32"
            placeholder="nome-branch"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => !name && setCreating(false)}
            spellCheck={false}
          />
          <button type="submit" className="text-xs px-2 py-1.5 rounded-xl bg-teal-500/90 text-[#0F1216] font-semibold hover:bg-teal-400">
            crea
          </button>
        </form>
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="text-xs px-3 py-1.5 rounded-xl border border-dashed border-white/20 text-white/40 hover:text-white/70 hover:border-white/40"
        >
          + nuovo branch
        </button>
      )}
    </div>
  );
}

export default function FreeMode({ git }) {
  const terminalRef = useRef(null);

  const runCmd = useCallback(
    (cmd) => {
      if (terminalRef.current?.run) return terminalRef.current.run(cmd);
      return git.exec(cmd);
    },
    [git],
  );

  const importRepo = useCallback((repoObj) => {
    localStorage.setItem(LS_KEY, JSON.stringify(repoObj));
    window.location.reload();
  }, []);

  function resetRepo() {
    if (!confirm("Svuotare completamente il repository e ripartire da zero?")) return;
    git.reset();
  }

  if (!git.repo) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <BranchStrip repo={git.repo} branches={git.branches} onExec={runCmd} />
        <button
          onClick={resetRepo}
          className="text-xs px-3 py-1.5 rounded-xl border border-white/10 text-white/40 hover:text-rose-300 hover:border-rose-300/40"
        >
          Nuovo repository (reset)
        </button>
      </div>

      {git.mergeState?.conflicts?.length > 0 && (
        <ConflictResolver repo={git.repo} mergeState={git.mergeState} exec={git.exec} writeFile={git.writeFile} />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 space-y-4">
          <CommitGraph repo={git.repo} selected={git.selectedCommit} onSelect={git.setSelectedCommit} />
          <MiniTerminal ref={terminalRef} exec={git.exec} />
        </div>

        <div className="lg:col-span-5">
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

      <RepoIoPanel repo={git.repo} onImport={importRepo} />
    </div>
  );
}
