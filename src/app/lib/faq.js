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
  {
    id: "graph-text",
    question: "Come vedo il grafo dei commit in forma testuale, non solo nel pannello?",
    command: "log --graph",
    live: null,
    note: "In Git vero: 'git log --graph --oneline' (qui il prefisso 'git' è opzionale, funziona anche 'log --graph').",
  },
  {
    id: "diff-areas",
    question: "Come vedo le differenze tra due aree senza aprire un pannello?",
    command: "diff",
    live: null,
    note: "'diff' confronta working↔index; 'diff --staged' confronta index↔HEAD — la stessa distinzione di 'git diff' e 'git diff --staged'.",
  },
  {
    id: "merged-branches",
    question: "Quali branch sono già confluiti in quello su cui mi trovo?",
    command: "branch --merged",
    live: (repo) => {
      const cur = currentBranchName(repo);
      return cur ? `Confronto rispetto a: ${cur}` : null;
    },
    note: "In Git vero: 'git branch --merged' (e il contrario, 'git branch --no-merged').",
  },
  {
    id: "git-prefix",
    question: "Posso scrivere i comandi con 'git' davanti, come in un terminale vero?",
    command: "git status",
    live: () => "Sì — il prefisso 'git' viene sempre ignorato, 'git status' e 'status' fanno la stessa cosa.",
    note: "Utile se stai seguendo una guida che scrive sempre i comandi per intero, es. 'git branch', 'git checkout main'.",
  },
  {
    id: "show-commit",
    question: "Come vedo messaggio e differenze di un commit specifico?",
    command: "show HEAD",
    live: null,
    note: "In Git vero: 'git show <hash>' (o 'git show HEAD' per l'ultimo commit).",
  },
  {
    id: "move-branch",
    question: "Ho creato un branch nel punto sbagliato: posso spostarlo senza cancellarlo?",
    command: "branch -f <nome> <nuovo-target>",
    live: null,
    note: "In Git vero: 'git branch -f <nome> <target>' sposta un branch esistente su un altro commit, sovrascrivendo dove puntava prima.",
  },
];
