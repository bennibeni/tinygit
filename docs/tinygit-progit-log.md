# TinyGit — log commentato della sessione guidata

**Guida seguita:** [Pro Git](https://git-scm.com/book/en/v2), di Scott Chacon e Ben Straub
(licenza Creative Commons, disponibile gratuitamente anche in italiano).
Capitoli percorsi: **2 — Git Basics**, **3 — Git Branching**, **10 — Git Internals**.

Ogni comando qui sotto è stato eseguito davvero nel mini-terminale di TinyGit
(Modalità libera). Il commento in corsivo spiega cosa fa e perché, con
riferimento alla sezione del libro corrispondente.

---

## Capitolo 2 — Git Basics

### Getting a Git Repository

```
$ git init
repo initialized
```
*Trasforma una scatola vuota in un repository: crea la struttura interna
(oggetti, riferimenti, HEAD) ma non traccia ancora nulla.*

### Recording Changes to the Repository

```
$ write README.md "Questo è il mio primo file tracciato da Git."
wrote work:README.md (44 chars)
$ git add README.md
staged README.md
$ git commit -m "commit iniziale"
commit dc3a13e tree 2a90d18
```
*`write` sostituisce "apri un editor" (TinyGit non ha un filesystem reale).
`add` mette in stage (indice), `commit` congela quella scena in modo
permanente — due passi distinti, non uno scorciatoia dell'altro.*

```
$ write README.md "Questo è il mio primo file tracciato da Git.\nAggiungo una seconda riga."
wrote work:README.md (71 chars)
$ git diff
diff --git a/README.md b/README.md
-Questo è il mio primo file tracciato da Git.
+Questo è il mio primo file tracciato da Git.nAggiungo una seconda riga.
$ git add README.md
staged README.md
$ git diff --staged
(stessa differenza di cui sopra)
$ git commit -m "aggiunta seconda riga"
commit da18e0e tree 4a95567
```
*`git diff` confronta working↔index; `git diff --staged` confronta index↔HEAD
— la distinzione su cui il libro insiste per evitare di confondersi su
"cosa entrerebbe davvero nel prossimo commit".*

### Viewing the Commit History

```
$ git log
(due commit, formato grezzo: hash/tree/parent/author/committer/messaggio)
$ git log --graph
*  da18e0e (HEAD, main) aggiunta seconda riga
*  dc3a13e commit iniziale
```
*`log` per i dettagli grezzi, `log --graph` per la vista a corsie.*

### Undoing Things

```
$ write README.md "una modifica per sbaglio"
wrote work:README.md (24 chars)
$ git add README.md
staged README.md
$ git status
On branch main
README.md  work:modified  index:staged
$ git restore --staged README.md
unstaged README.md
$ git status
On branch main
README.md  work:modified  index:same
$ git restore README.md
restored README.md
$ git status
On branch main
README.md  work:same  index:same
```
*`restore --staged` toglie dallo stage senza toccare la working tree;
`restore` (senza `--staged`) scarta le modifiche nella working tree
riportandola al contenuto dell'indice.*

---

## Capitolo 3 — Git Branching

### Creating a New Branch

```
$ git branch testing
created testing
$ git log --graph
*  da18e0e (HEAD, main, testing) aggiunta seconda riga
*  dc3a13e commit iniziale
```
*Un branch è solo un'etichetta leggera — crearlo non copia nulla, non tocca
la storia. `main` e `testing` restano sullo stesso identico commit.*

### Switching Branches

```
$ git checkout testing
checked out testing
$ write test.txt "un file solo sul branch testing"
wrote work:test.txt (31 chars)
$ git add test.txt
staged test.txt
$ git commit -m "avanzo su testing"
commit 185fbd4 tree c3534bd
$ git log --graph
 *  185fbd4 (HEAD, testing) avanzo su testing
*   da18e0e (main) aggiunta seconda riga
*   dc3a13e commit iniziale
```
*`checkout` sposta HEAD e aggiorna working tree/indice. Le corsie si
separano visibilmente: `testing` avanza, `main` resta fermo.*

### Basic Merging

```
$ git checkout main
checked out main
$ git merge testing
fast-forward -> testing (185fbd4)
$ git log --graph
*  185fbd4 (HEAD, main, testing) avanzo su testing
*  da18e0e aggiunta seconda riga
*  dc3a13e commit iniziale
```
*Nessuna divergenza reale da conciliare → fast-forward: Git sposta solo
l'etichetta `main` in avanti, nessun nuovo commit di merge creato.*

### Branch Management (pulizia)

```
$ git branch -d testing
deleted testing
$ git branch
* main
```
*`testing` puntava allo stesso commit di `main`: cancellarlo non fa perdere
nessuna informazione, tutti i commit restano raggiungibili da `main`.*

### Basic Merge Conflicts

```
$ git branch iss53
created iss53
$ git checkout iss53
checked out iss53
$ write index.html "versione con il font Comic Sans"
wrote work:index.html (31 chars)
$ git add index.html
staged index.html
$ git commit -m "font in stile Comic Sans, l'ho sempre adorato"
commit b79992e tree 202a211
$ git checkout main
checked out main
$ write index.html "versione con font serio e professionale"
wrote work:index.html (39 chars)
$ git add index.html
staged index.html
$ git commit -m "font professionale per il lancio"
commit b1a294f tree 1b82c41
$ git merge iss53
CONFLITTO: merge automatico fallito per 1 file
  - index.html
$ git status
On branch main
You have unmerged paths (1 both modified) — 'add' the resolved files, then 'commit'.
index.html  work:conflict  index:unmerged
```
*Entrambi i branch hanno modificato `index.html` in modo diverso dallo stesso
antenato comune: Git non può scegliere da solo, si ferma e segnala il
conflitto esplicitamente in `status` ("both modified").*

```
(risolto index.html a mano nel pannello "Conflitto di merge": rimossi i
marcatori <<<<<<< ======= >>>>>>>, scelto/riscritto il contenuto finale)
$ git commit -m "merge branch 'iss53': risolto conflitto sul font"
merge commit 4ae044b (2 genitori) tree 1c904d7
$ git log --graph
*   4ae044b (HEAD, main) merge branch 'iss53': risolto conflitto sul font
*   b1a294f font professionale per il lancio
 *  b79992e (iss53) font in stile Comic Sans, l'ho sempre adorato
 *  185fbd4 avanzo su testing
 *  da18e0e aggiunta seconda riga
 *  dc3a13e commit iniziale
```
*Il commit di merge ha due genitori — la forma a rombo nel grafo è la firma
visiva di "due strade divergenti che si ricongiungono".*

```
$ git branch --merged
* main
  iss53
$ git branch --no-merged
(none)
```
*`iss53` è antenato di `main` (confluito), quindi appare in `--merged` e non
in `--no-merged`.*

---

## Capitolo 10 — Git Internals

*(ripartito da un repository pulito con un nuovo `git init`, per non
mescolare la storia dei capitoli precedenti)*

### Git Objects — costruire una storia a mano, senza `add`/`commit`

```
$ git hash-object -w --stdin "version 1"
e32092a83f837140c08e85a60ef16a6b2a208986
$ git cat-file -p e32092a83f837140c08e85a60ef16a6b2a208986
version 1
$ git cat-file -t e32092a83f837140c08e85a60ef16a6b2a208986
blob
```
*Un blob è puro contenuto, identificato solo dal suo hash SHA-1 — non sa
ancora di essere "un file", non ha un nome.*

```
$ git update-index --add --cacheinfo 100644 e32092a83f837140c08e85a60ef16a6b2a208986 test.txt
added test.txt to the index (staged, without touching the working tree)
$ git status
On branch main
test.txt  work:—  index:added
```
*`update-index` collega finalmente il blob a un nome di file — direttamente
nell'indice, bypassando `add` e la working tree.*

```
$ git write-tree
ffe9ce5421c3a1cbd84a858f8f5696029574abdc
$ git ls-tree ffe9ce5421c3a1cbd84a858f8f5696029574abdc
100644 blob e32092a83f837140c08e85a60ef16a6b2a208986	test.txt
```
*`write-tree` congela lo stato attuale dell'indice in un oggetto tree
permanente — la struttura che rappresenta "una cartella" in Git.*

```
$ git commit-tree ffe9ce5421c3a1cbd84a858f8f5696029574abdc -m "first commit"
3148ae3c6dc0f1f144bf104254fa23c75661740c
$ git cat-file -p 3148ae3c6dc0f1f144bf104254fa23c75661740c
tree ffe9ce5421c3a1cbd84a858f8f5696029574abdc
author You <you@example.com> 0 +0000
committer You <you@example.com> 0 +0000

first commit
```
*Un commit è: un tree + zero o più genitori + autore/messaggio. Questo è il
primo della catena, quindi nessuna riga `parent`. `commit-tree` non tocca
nessun ref — è un oggetto valido ma per ora irraggiungibile.*

```
$ git hash-object -w --stdin "version 2"
55af8e5b36d666efb8281535bd98fe0f84275347
$ git update-index --add --cacheinfo 100644 55af8e5b36d666efb8281535bd98fe0f84275347 test.txt
added test.txt to the index (staged, without touching the working tree)
$ git write-tree
a6e487621b526f75d4ed72fffa4113a635e3c147
$ git commit-tree a6e487621b526f75d4ed72fffa4113a635e3c147 -p 3148ae3c6dc0f1f144bf104254fa23c75661740c -m "second commit"
e1b02673e2f7a142e6be050aef2e17d1b202a836
$ git cat-file -p e1b02673e2f7a142e6be050aef2e17d1b202a836
tree a6e487621b526f75d4ed72fffa4113a635e3c147
parent 3148ae3c6dc0f1f144bf104254fa23c75661740c
author You <you@example.com> 0 +0000
committer You <you@example.com> 0 +0000

second commit
```
*Stessa sequenza, ma questa volta `-p` collega esplicitamente il nuovo
commit al primo — è quel singolo puntatore a formare la catena.*

```
$ git update-ref refs/heads/master e1b02673e2f7a142e6be050aef2e17d1b202a836
refs/heads/master -> e1b0267
$ git checkout master
checked out master
$ git log --graph
*  e1b0267 (HEAD, master) second commit
*  3148ae3 first commit
```
*`update-ref` crea/sposta un branch scrivendo direttamente il ref —
esattamente quello che `git commit` fa in automatico ogni volta. Il branch
`master` non è mai stato creato con `git branch`, eppure `checkout` e
`log --graph` lo trattano come una storia del tutto normale: sotto la
superficie di `add`/`commit`/`branch` non c'è altro che questi pochi
mattoni.*

---

## Note tecniche emerse durante la sessione

Seguendo la guida comando per comando sono stati trovati e corretti alcuni
bug reali di TinyGit (non della guida):

- `restore --staged <path>` non riconosceva l'opzione `--staged` e la
  trattava come nome di file — ora è un alias corretto di `unstage`.
- `status` non segnalava esplicitamente i file in conflitto durante un
  merge — ora mostra "You have unmerged paths" e li etichetta `conflict`.
- `ls-tree` falliva se gli si passava l'hash di un tree scritto da poco con
  `write-tree` — presumeva sempre che l'hash fosse di un commit.
- `resolveTargetToCommitOid` non riconosceva la parola chiave `HEAD` in
  alcuni comandi (`ls-tree`, `show`), corretto alla radice.
- Aggiunti da zero: `rev-parse`, `cat-file`, `ls-tree`, `diff`, `show`,
  `hash-object`, `update-index`, `write-tree`, `commit-tree`, `update-ref`,
  `branch -v` / `--merged` / `--no-merged` — nessuno di questi esisteva
  prima di questa sessione.
