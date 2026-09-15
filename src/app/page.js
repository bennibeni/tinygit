// src/app/R48/page.js
"use client";

import { useState } from "react";
import AdvancedCommands from "./components/AdvancedCommands";
import FreeMode from "./components/FreeMode";
import HelpModal from "./components/HelpModal";
import StoryMode from "./components/StoryMode";
import useTinyGit from "./hooks/useTinyGit";

export default function TinyGitPage() {
  const git = useTinyGit();
  const [mode, setMode] = useState("story"); // "story" | "free" | "advanced"
  const [helpOpen, setHelpOpen] = useState(false);

  if (!git.repo) return null;

  return (
    <main>
      <div className="min-h-screen bg-[#0B0D10] text-white">
        <div className="max-w-[1400px] mx-auto p-6 space-y-5">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-2xl font-black tracking-tight">TinyGit</div>
              <div className="text-xs text-white/40">
                Un binario per capire i commit, i branch e i merge — davvero,
                sotto il cofano.
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-xs font-mono text-white/40">
                HEAD {git.headOid ? git.headOid.slice(0, 7) : "∅"}
              </div>
              <button
                onClick={() => setHelpOpen(true)}
                className="h-8 w-8 rounded-full border border-white/15 text-white/60 hover:text-teal-300 hover:border-teal-400/50 flex items-center justify-center text-sm font-bold"
                title="Domande frequenti"
              >
                ?
              </button>
              <div className="flex rounded-xl border border-white/10 overflow-hidden">
                <button
                  onClick={() => setMode("story")}
                  className={
                    "px-3 py-1.5 text-sm " +
                    (mode === "story"
                      ? "bg-teal-400 text-[#0B0D10] font-semibold"
                      : "text-white/60 hover:bg-white/5")
                  }
                >
                  Percorso guidato
                </button>
                <button
                  onClick={() => setMode("free")}
                  className={
                    "px-3 py-1.5 text-sm " +
                    (mode === "free"
                      ? "bg-teal-400 text-[#0B0D10] font-semibold"
                      : "text-white/60 hover:bg-white/5")
                  }
                >
                  Modalità libera
                </button>
                <button
                  onClick={() => setMode("advanced")}
                  className={
                    "px-3 py-1.5 text-sm " +
                    (mode === "advanced"
                      ? "bg-teal-400 text-[#0B0D10] font-semibold"
                      : "text-white/60 hover:bg-white/5")
                  }
                >
                  Comandi avanzati
                </button>
              </div>
            </div>
          </header>

          {mode === "story" ? (
            <StoryMode git={git} />
          ) : mode === "free" ? (
            <FreeMode git={git} />
          ) : (
            <AdvancedCommands git={git} />
          )}
        </div>

        <HelpModal
          open={helpOpen}
          onClose={() => setHelpOpen(false)}
          repo={git.repo}
          onExec={git.exec}
        />
      </div>
      <footer className="projects-footer">
        <a href="https://links-page-bennibeni.vercel.app/">
          &larr; All projects
        </a>
      </footer>
    </main>
  );
}
