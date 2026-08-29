// src/lib/tinygit/advancedTopics.js
//
// Contenuto di riferimento per la pagina "Comandi avanzati": a differenza
// delle lezioni del Percorso guidato, qui non c'è progressione né verifica
// di completamento — è un pannello di consultazione libera, pensato anche
// per riprodurre esempi presi da altre guide, non solo i nostri.

export const ADVANCED_TOPICS = [
  {
    id: "relative-refs",
    title: "Riferimenti relativi: HEAD~2, main^, ...",
    explain:
      "Ovunque serva un hash, puoi usare anche riferimenti relativi: ~N risale N generazioni seguendo il primo genitore (utile sulla storia lineare), ^N salta al genitore N-esimo di un commit di merge (^1 = primo genitore, ^2 = secondo). Si possono anche concatenare, es. HEAD~2^.",
    commands: [
      { cmd: "log --graph", note: "guarda la storia attuale prima di orientarti con i riferimenti" },
      { cmd: "rev-parse HEAD~1", note: "il commit prima di HEAD" },
      { cmd: "rev-parse HEAD~2", note: "due commit prima" },
      { cmd: "diff --staged HEAD~1", note: "funziona anche qui — ma nota: 'diff' non accetta un secondo riferimento arbitrario, solo --staged; per confrontare due commit specifici usa 'show'" },
    ],
  },
  {
    id: "reset",
    title: "reset — spostare indietro un branch",
    explain:
      "reset sposta il branch corrente (o HEAD, se staccato) su un altro commit. --soft lascia intatti indice e working tree (utile per 'disfare l'ultimo commit ma tenere tutto in stage'), --mixed (default) riporta l'indice al commit di destinazione ma non tocca la working tree, --hard riporta tutto — attenzione, le modifiche non committate vanno perse.",
    commands: [
      { cmd: "log --graph", note: "vedi dove sei ora" },
      { cmd: "reset --soft HEAD~1", note: "torna indietro di un commit, ma tieni tutto in stage" },
      { cmd: "status", note: "nota: il file del commit 'disfatto' è di nuovo in stage" },
      { cmd: "reset --hard HEAD", note: "annulla anche questo: torna pulito al commit corrente" },
    ],
  },
  {
    id: "tag",
    title: "tag — etichette fisse su un commit",
    explain:
      "A differenza di un branch, un tag non si sposta mai una volta creato — è pensato per segnare un punto preciso della storia (es. una versione pubblicata). Compare nel grafo e in log --graph con lo stesso trattamento visivo dei branch, ma con un colore diverso.",
    commands: [
      { cmd: "tag v1.0", note: "etichetta il commit attuale (HEAD)" },
      { cmd: "tag", note: "elenca tutti i tag" },
      { cmd: "log --graph", note: "il tag compare tra parentesi accanto al commit" },
      { cmd: "tag -d v1.0", note: "elimina il tag (i commit restano, ovviamente)" },
    ],
  },
  {
    id: "stash",
    title: "stash — mettere da parte senza commitare",
    explain:
      "Quando hai modifiche a metà e devi cambiare branch al volo, 'stash' le mette da parte e riporta la working tree pulita a HEAD. 'stash pop' le riapplica e le rimuove dall'elenco. Semplificazione onesta: qui non c'è rilevamento di conflitti quando riapplichi — sovrascrive direttamente.",
    commands: [
      { cmd: 'write nota.txt "lavoro in corso, non ancora pronto"', note: "" },
      { cmd: 'stash -m "wip: nota"', note: "salva e pulisce la working tree" },
      { cmd: "status", note: "tutto pulito, il file 'sparito' per ora" },
      { cmd: "stash list", note: "ma è ancora lì, in elenco" },
      { cmd: "stash pop", note: "torna nella working tree" },
    ],
  },
  {
    id: "revert",
    title: "revert — annullare un commit in sicurezza",
    explain:
      "revert non cancella né riscrive nulla: crea un NUOVO commit che applica l'esatto contrario delle modifiche di quello indicato. È il modo sicuro di 'disfare' qualcosa che magari è già stato condiviso con altri — la storia resta intatta e onesta su cosa è successo.",
    commands: [
      { cmd: 'write cambiamento.txt "una modifica che poi vuoi annullare"', note: "" },
      { cmd: "add cambiamento.txt", note: "" },
      { cmd: 'commit -m "modifica da annullare"', note: "" },
      { cmd: "revert HEAD", note: "crea un nuovo commit che la disfa" },
      { cmd: "log --graph", note: "nota: due commit nuovi, non uno cancellato" },
    ],
  },
  {
    id: "cherry-pick",
    title: "cherry-pick — un commit solo, da un altro branch",
    explain:
      "A differenza di merge (che unisce tutta la storia divergente), cherry-pick prende UN commit specifico da un altro branch e lo applica qui, creando una copia con lo stesso contenuto ma un genitore diverso. Utile quando ti serve solo una correzione precisa, non tutto il branch.",
    commands: [
      { cmd: "branch correzione", note: "" },
      { cmd: "checkout correzione", note: "" },
      { cmd: 'write bugfix.txt "il fix di un bug urgente"', note: "" },
      { cmd: "add bugfix.txt", note: "" },
      { cmd: 'commit -m "fix: bug urgente"', note: "" },
      { cmd: "checkout main", note: "" },
      { cmd: "cherry-pick correzione", note: "prende solo quel commit, non tutto il branch" },
    ],
  },
  {
    id: "mv",
    title: "mv — rinominare un file tracciato",
    explain:
      "mv fa in un solo comando quello che altrimenti servirebbero due passi separati (spostare il file e aggiornare l'indice) — working tree e stage restano coerenti in un colpo solo.",
    commands: [
      { cmd: 'write vecchio-nome.txt "contenuto"', note: "" },
      { cmd: "add vecchio-nome.txt", note: "" },
      { cmd: 'commit -m "aggiungi file"', note: "" },
      { cmd: "mv vecchio-nome.txt nuovo-nome.txt", note: "" },
      { cmd: "status", note: "" },
    ],
  },
  {
    id: "clean",
    title: "clean — rimuovere file non tracciati",
    explain:
      "Un file 'non tracciato' è presente nella working tree ma non è mai stato messo in stage né committato — Git non lo segue ancora. clean -n mostra cosa verrebbe rimosso (anteprima sicura), clean -f lo rimuove davvero.",
    commands: [
      { cmd: 'write temporaneo.txt "file mai tracciato"', note: "" },
      { cmd: "clean -n", note: "anteprima, non rimuove nulla" },
      { cmd: "clean -f", note: "questa volta rimuove davvero" },
    ],
  },
  {
    id: "config",
    title: "config — la tua identità nei commit",
    explain:
      "Finché non lo imposti, ogni commit riporta l'autore generico 'You <you@example.com>'. config user.name/user.email personalizzano l'identità usata da quel momento in poi — proprio come nel Git vero.",
    commands: [
      { cmd: "config user.name Ada", note: "" },
      { cmd: "config user.email ada@example.com", note: "" },
      { cmd: 'write firma.txt "un commit con la mia identità"', note: "" },
      { cmd: "add firma.txt", note: "" },
      { cmd: 'commit -m "primo commit firmato"', note: "" },
      { cmd: "show HEAD", note: "controlla la riga author" },
    ],
  },
];
