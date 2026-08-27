// src/lib/tinygit/lessons.js
//
// Ogni lezione è una "stazione" del percorso. `check(repo)` decide quando la
// lezione è completata; `hint` è mostrato su richiesta; i comandi in
// `suggested` sono cliccabili per pre-riempire il mini-terminale.

function branchNames(repo) {
  return Object.keys(repo?.refs || {})
    .filter((k) => k.startsWith("refs/heads/"))
    .map((k) => k.replace("refs/heads/", ""));
}

export const LESSONS = [
  {
    id: "init",
    title: "Il deposito vuoto",
    intro:
      "Un repository Git, all'inizio, non è altro che una scatola vuota con un solo binario: main. Non contiene ancora nessuna fermata (commit).",
    task: "Crea il repository con il comando init.",
    suggested: ["init"],
    hint: "Scrivi semplicemente: init",
    check: (repo) => !!repo?.refs && Object.keys(repo.refs).length > 0,
    explain:
      "Fatto. Ora esiste il ramo main, ma punta ancora al vuoto: nessun commit, nessun file.",
  },
  {
    id: "first-commit",
    title: "Il primo respiro",
    intro:
      "Ogni file che scrivi vive prima nella working tree (la tua cartella di lavoro). Per farlo entrare nella storia del progetto devi metterlo in scena nell'indice (staging area), poi congelarlo in un commit.",
    task: 'Scrivi un file, mettilo in stage e crea il primo commit: write diario.txt "oggi ho iniziato" → add diario.txt → commit -m "primo commit"',
    suggested: [
      'write diario.txt "oggi ho iniziato"',
      "add diario.txt",
      'commit -m "primo commit"',
    ],
    hint: "Tre passi: write per scrivere, add per mettere in stage, commit -m per congelare la fotografia.",
    check: (repo, ctx) => !!ctx?.headOid,
    explain:
      "Hai appena creato un commit: una fotografia dell'intero progetto in quell'istante, identificata da un hash SHA-1. Guarda il grafo: è comparso il primo pallino.",
  },
  {
    id: "working-vs-index",
    title: "Tre stanze, tre verità",
    intro:
      "Uno stesso file può avere tre versioni contemporaneamente: quella nella working tree (dove scrivi), quella nell'indice (ciò che hai messo in stage) e quella nell'HEAD (l'ultimo commit). 'status' ti dice se sono allineate o no.",
    task: 'Modifica il file senza fare subito add: write diario.txt "oggi ho anche capito lo staging", poi guarda status',
    suggested: ['write diario.txt "oggi ho anche capito lo staging"', "status"],
    hint: "Dopo write, lancia status: vedrai work:modified ma index:same (non hai ancora fatto add).",
    check: (repo) => {
      const w = repo?.working?.["diario.txt"];
      return typeof w === "string" && w.includes("staging");
    },
    explain:
      "Esatto: la working tree è cambiata, ma l'indice (e quindi HEAD) ancora no. Sono tre 'fotografie' indipendenti dello stesso file.",
  },
  {
    id: "log",
    title: "Il registro dei viaggi",
    intro:
      "Ogni commit (tranne il primo) ricorda il proprio genitore. Seguendo la catena all'indietro si ottiene la storia del progetto: il log.",
    task: 'Metti in stage la modifica e crea un secondo commit, poi guarda il log: add diario.txt → commit -m "capito lo staging" → log',
    suggested: ['add diario.txt', 'commit -m "capito lo staging"', "log"],
    hint: "add per mettere in stage, commit -m per la seconda fotografia, log per vedere la catena.",
    check: (repo, ctx) => (ctx?.log?.length || 0) >= 2,
    explain:
      "Nel grafo ora vedi due pallini collegati da una linea: ogni commit punta al proprio genitore. La storia è una catena, non un elenco.",
  },
  {
    id: "branch",
    title: "Un'altra strada",
    intro:
      "Un branch non è una copia del progetto: è solo un'etichetta leggera che punta a un commit. Crearne uno costa quasi nulla.",
    task: "Crea un nuovo branch chiamato esperimento.",
    suggested: ["branch esperimento"],
    hint: "branch <nome> crea l'etichetta sul commit attuale, ma non ci sposta sopra.",
    check: (repo) => branchNames(repo).includes("esperimento"),
    explain:
      "Ora ci sono due etichette (main ed esperimento) che puntano allo stesso identico commit. Nel grafo le vedi affiancate, sulla stessa fermata.",
  },
  {
    id: "checkout",
    title: "Cambiare binario",
    intro:
      "checkout sposta HEAD (il tuo 'sei qui') su un altro branch, e aggiorna working tree e indice per farli combaciare con quella fotografia.",
    task: 'Passa al branch esperimento e crea lì un commit: checkout esperimento → write idea.txt "provo qualcosa di rischioso" → add idea.txt → commit -m "idea sperimentale"',
    suggested: [
      "checkout esperimento",
      'write idea.txt "provo qualcosa di rischioso"',
      "add idea.txt",
      'commit -m "idea sperimentale"',
    ],
    hint: "Prima checkout per spostare HEAD, poi il solito trio write/add/commit.",
    check: (repo) => {
      const names = branchNames(repo);
      return names.includes("esperimento") && repo.refs["refs/heads/esperimento"] !== repo.refs["refs/heads/main"];
    },
    explain:
      "Ora i due binari divergono: esperimento è andato avanti, main è rimasto indietro. Nel grafo le linee si separano visibilmente.",
  },
  {
    id: "fast-forward",
    title: "Riunire i binari, senza sforzo",
    intro:
      "Se il branch di destinazione è semplicemente 'più indietro' sulla stessa linea, unirlo è banale: Git sposta solo l'etichetta in avanti. Si chiama fast-forward.",
    task: "Assicurati di essere su main (se non lo sei, checkout main) e uniscici esperimento: merge esperimento",
    suggested: ["checkout main", "merge esperimento"],
    hint: "Poiché main non ha avuto nuovi commit nel frattempo, il merge sarà un fast-forward: nessun nuovo commit di merge creato.",
    check: (repo) => {
      const m = repo.refs["refs/heads/main"];
      const e = repo.refs["refs/heads/esperimento"];
      return !!m && m === e;
    },
    explain:
      "Fast-forward: main ora punta esattamente dove puntava esperimento. Nessuna nuova fermata creata, solo l'etichetta spostata in avanti.",
  },
  {
    id: "diverge-again",
    title: "Quando le strade si scontrano",
    intro:
      "Le cose si complicano quando ENTRAMBI i binari avanzano modificando lo stesso file. Creiamo apposta questa situazione.",
    task:
      'Crea un branch, modifica lo stesso file su entrambi i lati: branch colore → write idea.txt "il rosso è la scelta migliore" → add idea.txt → commit -m "rosso" → checkout colore → write idea.txt "il blu è la scelta migliore" → add idea.txt → commit -m "blu"',
    suggested: [
      "branch colore",
      'write idea.txt "il rosso è la scelta migliore"',
      "add idea.txt",
      'commit -m "rosso"',
      "checkout colore",
      'write idea.txt "il blu è la scelta migliore"',
      "add idea.txt",
      'commit -m "blu"',
    ],
    hint: "Prima un commit su main (che modifica idea.txt), poi passa su colore e fai un commit diverso sullo stesso file.",
    check: (repo) => branchNames(repo).includes("colore") && repo.refs["refs/heads/colore"] !== repo.refs["refs/heads/main"],
    explain:
      "Perfetto terreno di scontro: idea.txt dice 'rosso' su main e 'blu' su colore. Nessuno dei due branch è antenato dell'altro.",
  },
  {
    id: "conflict",
    title: "Il conflitto, e come si risolve",
    intro:
      "Quando due branch modificano la stessa riga in modo diverso, Git non può indovinare chi ha ragione: segna un conflitto e ti lascia decidere.",
    task:
      'Assicurati di essere su main (se non lo sei, checkout main) e prova a unire colore: merge colore. Comparirà qui sotto un riquadro rosso "Conflitto di merge" con idea.txt: modifica il testo direttamente lì dentro (togli i marcatori <<<<<<< ======= >>>>>>> e tieni solo il contenuto che vuoi), poi "Salva e metti in stage", scrivi un messaggio e premi "Completa il merge". Una volta completato, prova anche log --graph nel mini-terminale per vedere lo stesso rombo del grafo in versione testuale.',
    suggested: ["checkout main", "merge colore", "log --graph"],
    hint: 'Dopo "merge colore" guarda subito sotto la scheda della lezione: il riquadro rosso con la casella di testo modificabile è già lì, non serve aprire nient\'altro.',
    check: (repo, ctx) => {
      const hasTwoParentCommit = (ctx?.log || []).some((c) => (c.text.match(/^parent /gm) || []).length >= 2);
      return hasTwoParentCommit;
    },
    explain:
      "Hai risolto il primo conflitto della tua vita da 'Git-ologo'. Il commit di merge ha DUE genitori: guarda nel grafo come le due linee si ricongiungono in un unico pallino.",
  },
  {
    id: "free",
    title: "Ora vola da solo/a",
    intro:
      "Hai visto working tree, index, commit, branch, fast-forward e merge con conflitto: sono i concetti che coprono il 90% dell'uso quotidiano di Git.",
    task: "Passa alla Modalità libera per continuare a sperimentare senza percorso guidato.",
    suggested: [],
    hint: "Usa il selettore in alto per passare a 'Modalità libera'.",
    check: () => true,
    explain: "",
    isFinal: true,
  },
];
