// src/lib/tinygit/faq.js
//
// Domande frequenti, ciascuna abbinata al comando reale che dà la risposta.
// `live(repo)` calcola una risposta immediata (senza eseguire nulla) quando
// possibile, così l'utente vede sia la scorciatoia visiva sia il comando
// "vero" che userebbe in un terminale Git reale.

function currentBranchName(repo) {
  return repo?.head?.kind === "ref" ? repo.head.value.replace("refs/heads/", "") : null;
}

export const FAQ = [
  {
    id: "current-branch",
    question: "Su quale branch mi trovo?",
    command: "status",
    live: (repo) => {
      const b = currentBranchName(repo);
      return b ? `Sei su: ${b}` : `HEAD è staccato (non su un branch)`;
    },
    note: "In Git vero: la prima riga di 'git status' dice sempre 'On branch <nome>'.",
  },
  {
    id: "list-branches",
    question: "Quali branch esistono, e qual è quello attuale?",
    command: "branch",
    live: (repo) => {
      const names = Object.keys(repo?.refs || {})
        .filter((k) => k.startsWith("refs/heads/"))
        .map((k) => k.replace("refs/heads/", ""));
      const cur = currentBranchName(repo);
      return names.length
        ? names.map((n) => (n === cur ? `* ${n}` : `  ${n}`)).join("\n")
        : "(nessun branch)";
    },
    note: "In Git vero: 'git branch' segna quello attuale con un asterisco.",
  },
  {
    id: "head-hash",
    question: "Qual è l'hash dell'ultimo commit (HEAD)?",
    command: "log 1",
    live: null,
    note: "In Git vero: 'git rev-parse HEAD' dà l'hash completo, 'git log -1' mostra anche il messaggio.",
  },
  {
    id: "unstaged-changes",
    question: "Quali file ho modificato ma non ancora messo in stage?",
    command: "status",
    live: null,
    note: "In Git vero: la sezione 'Changes not staged for commit' di 'git status'.",
  },
  {
    id: "tracked-in-head",
    question: "Quali file sono effettivamente nell'ultimo commit?",
    command: "ls head",
    live: null,
    note: "In Git vero: 'git ls-tree -r HEAD --name-only'.",
  },
  {
    id: "discard-working",
    question: "Come annullo le modifiche non ancora in stage?",
    command: "restore -A",
    live: null,
    note: "In Git vero: 'git restore .' (o 'git checkout -- .' nelle versioni più vecchie).",
  },
  {
    id: "unstage-all",
    question: "Come tolgo tutto dallo stage senza perdere le modifiche?",
    command: "unstage -A",
    live: null,
    note: "In Git vero: 'git restore --staged .' (o 'git reset').",
  },
  {
    id: "conflict-progress",
    question: "C'è un merge in conflitto in questo momento?",
    command: "status",
    live: (repo) => (repo?.mergeState?.conflicts?.length ? `Sì: ${repo.mergeState.conflicts.length} file in conflitto` : "No, nessun merge in corso"),
    note: "In Git vero: 'git status' durante un merge elenca i file 'both modified'.",
  },
  {
    id: "history",
    question: "Come vedo la cronologia dei commit?",
    command: "log 10",
    live: null,
    note: "In Git vero: 'git log --oneline'.",
  },
];
