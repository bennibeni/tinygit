# TinyGit — v2 (percorso guidato + motore esteso)

Ripensamento radicale di TinyGit: stesso motore Git-giocattolo (oggetti
content-addressed SHA-1, staging area, branch), ma con:

1. **Percorso guidato** (`components/StoryMode.js`) — 10 "fermate" narrate in
   italiano che accompagnano dal repository vuoto fino al primo conflitto di
   merge risolto a mano. Ogni fermata ha un obiettivo, comandi suggeribili
   con un click, un mini-terminale, e uno "sblocco" automatico quando lo
   stato del repository soddisfa la lezione.
2. **Modalità libera** (`components/FreeMode.js`) — gli stessi pannelli
   SourceTree-like di prima (branch/status/changes/file/viewer), restyled,
   più il grafo dei commit e il risolutore di conflitti.
3. **Grafo dei commit** (`components/CommitGraph.js`) — SVG animabile che
   disegna branch e merge come binari che si separano e si ricongiungono:
   l'elemento visivo che prima mancava del tutto.
4. **Motore esteso** (`lib/merge.js`, `lib/graph.js`) — merge reale a 3 vie
   con `mergeBase`/`isAncestor`, fast-forward automatico quando possibile,
   rilevamento conflitti file-per-file con marcatori
   `<<<<<<< ======= >>>>>>>`, e commit di merge a due genitori.

## Dove mettere questi file
Route: `src/app/R48/page.js` → apri `/R48`

```
src/app/R48/
  page.js
  hooks/useTinyGit.js
  lib/{sha1,codec,store,readers,plumbing,porcelain,merge,graph,lessons,cli}.js
  components/{CommandBar,InlineDiff,RepoIoPanel,HelpTodoPanel,
              CommitGraph,ConflictResolver,StoryMode,FreeMode}.js
```

## Requisiti
- Browser con WebCrypto (`crypto.subtle`) — https o `http://localhost`
- LocalStorage abilitato

## Novità nella CLI
- `merge <branch>` — fast-forward se possibile, altrimenti merge a 3 vie;
  in caso di conflitto lo stato resta "a metà" finché non risolvi (a mano o
  dal pannello Conflitto) e fai `add` + `commit`.
- `merge --abort` — annulla un merge in conflitto e torna allo stato precedente.
- `checkout` è bloccato mentre un merge è in conflitto (va prima risolto o
  abortito), per evitare stati incoerenti.
- Prefisso `git` opzionale e ignorato: `git status` funziona esattamente come `status`.
- Hash abbreviati (4+ caratteri) accettati ovunque un oid è richiesto (`checkout b09af71`),
  risolti per prefisso univoco.
- `branch -f <nome> [target]` / `branch -d <nome>` per spostare o eliminare un branch.
- Comandi plumbing reali, oltre alle scorciatoie native `cat`/`ls`: `rev-parse`,
  `cat-file -p|-t`, `ls-tree`, `diff [--staged]`, `show [ref]` — pensati per
  seguire guide Git che insegnano gli internals con la sintassi vera (es. i
  capitoli su Git Internals di libri/tutorial pubblici), senza dover tradurre
  ogni comando nella sintassi propria di TinyGit.

## Note
- Storage: `localStorage`, chiave `tinygit_repo@1` (repo) e
  `tinygit_story_progress@1` (avanzamento del percorso guidato).
- Il merge a 3 vie è file-level (non un vero diff3 riga-per-riga): se un
  file cambia diversamente sui due branch, l'intero file va in conflitto.
  È una scelta didattica: il concetto è identico a Git vero, la granularità
  è più semplice da seguire per chi impara.
- `lib/graph.js` fa un'assegnazione di "corsie" (lane) semplificata, non
  l'algoritmo esatto di `git log --graph`, ma è leggibile e corretta per i
  casi che il percorso guidato costruisce.

Se vuoi aggiungere altre fermate al percorso (es. rebase, tag, stash),
modifica solo `lib/lessons.js`: ogni voce è `{ id, title, intro, task,
suggested, hint, check(repo, ctx), explain }`.
